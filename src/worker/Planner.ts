import { getLogger } from '../logger/logger.ts';
import { call_llm_tasks } from '../llm.ts';
import { TaskType } from '../state/types.ts';
import { parseJsonSafe, appendToTransactionLog } from './util.ts';

const logger = getLogger('Planner');

export type PlannerWorkerResultType = {
	approved: boolean;
	steps: string[];
	revise_plan: boolean;
	plan_feedback: string;
};

export const GetPlan = async (task: string) =>
	await call_llm_tasks(`
    You are a planning agent.

    Your job is to decompose tasks into concise executable steps.

    RULES:
    - Return ONLY valid JSON
    - Do not explain reasoning
    - Do not include markdown
    - Use at most 5 steps
    - Steps must be concrete and actionable

    OUTPUT FORMAT:
    {{
    "steps": [
        "step 1",
        "step 2"
    ]
    }}

    TASK:
    ${task}
`);

export const RevisePlan = async (
	task_id: string,
	task: string,
	plan: string,
	depth = 5,
): Promise<PlannerWorkerResultType> => {
	// recursion exit
	if (depth == 0) {
		await appendToTransactionLog({
			_id: task_id,
			type: TaskType.TASK,
			newUserRequest: task,
			newLLMResponse: plan,
		});

		return {
			approved: false,
			revise_plan: false,
			steps: [plan],
		} as PlannerWorkerResultType;
	}

	logger.info(`current task: ${task}`);
	logger.info(`current plan: ${plan}`);

	await appendToTransactionLog({
		_id: task_id,
		type: TaskType.TASK,
		newUserRequest: task,
		newLLMResponse: plan,
	});

	const prompt = `You are a planning critic. You only have ${depth} number of attempts left to get this right.

TASK:
${task}  

PLAN:
${JSON.stringify(plan)}

Evaluate the plan.

Return ONLY JSON:

If 'revise_plan' is Truthy:
    Assume the plan is not acceptable and revise the plan before critic. 
    Always remove the revise_plan flag from the output.

If acceptable return the following data-structure:
${JSON.stringify({
	approved: Boolean,
	steps: [], // <-- populated with real steps
	revise_plan: Boolean,
	plan_feedback: [], //<-- populated with problems with previous steps
})}

If not acceptable return the following data-structure:
${JSON.stringify({
	approved: false,
	steps: [], // <-- populated with real steps
	revise_plan: true,
	plan_feedback: [], // <-- populated with problems with previous steps
})}
`;

	logger.info(`prompt: ${prompt}`);

	const raw = await call_llm_tasks(prompt);

	if (!raw) throw new Error('no response from llm...');

	logger.info(`response: ${raw}`);

	const result = await parseJsonSafe<PlannerWorkerResultType>(raw);

	if (!result) return RevisePlan(task_id, task, plan, depth - 1);

	if (result.approved) return result;
	// if not approved
	else {
		const new_plan = result['steps'].join() ?? plan;
		const plan_feedback = JSON.stringify(result['plan_feedback']);
		let _new_plan = new_plan;

		// combine
		if (plan_feedback)
			_new_plan = `${new_plan}\n\nThe previous plan did not accomplish the following: ${JSON.stringify(plan_feedback)}\n\n`;

		return RevisePlan(task_id, task, _new_plan, depth - 1);
	}
};
