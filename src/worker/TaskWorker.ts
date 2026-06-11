import { call_llm_chat, call_llm_tasks } from '../llm.ts';
import {getLogger} from '../logger/logger.ts';
import { Status } from '../state/types.ts';
import { setTask } from '../state/util.ts';
import { parseJsonSafe, updatePrompt } from './util.ts';

const logger = getLogger('TaskWorker')

const revise_plan = async (
	task_id: string,
	task: string,
	plan: string,
	depth = 5,
) => {
	if (depth == 0) {
		return {
			approved: false,
			steps: plan,
			revise_plan: false,
		};
	}

	logger.info(`current task: ${task}`);
	logger.info(`current plan: ${plan}`);

	await updatePrompt(task_id, Status.RUNNING, task, plan);

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
${{
	approved: false,
	steps: [], // <-- populated with real steps
	revise_plan: true,
	plan_feedback: [], //<-- populated with problems with previous steps
}}
`;

	logger.info(`prompt: ${prompt}`);

	const raw = await call_llm_tasks(prompt);

	if (!raw) throw new Error('no response from llm...');

	logger.info(`response: ${raw}`);

	const result = parseJsonSafe(raw);

	if (!result) return revise_plan(task_id, task, plan, depth - 1);

	if (result.approved) return result;
	// if not approved
	else {
		const new_plan = result['steps'] ?? plan;
		const plan_feedback = JSON.stringify(result['plan_feedback']);
		let _new_plan = new_plan;

		// combine
		if (plan_feedback)
			_new_plan = `${new_plan}\n\nThe previous plan did not accomplish the following: ${JSON.stringify(plan_feedback)}\n\n`;

		return revise_plan(task_id, task, _new_plan, depth - 1);
	}
};

export const RunTask = async (
	task_id: string,
	task: string,
	LLM_DIRECT: boolean,
) => {
	await setTask({
		id: task_id,
		status: { status: Status.RUNNING },
	});
	let final_output = '';
	let plan = '';
	let revised_plan = '';

	try {
		if (LLM_DIRECT) final_output = await call_llm_chat(`${task}`);

		plan = await call_llm_tasks(`
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

		revised_plan = await revise_plan(task_id, task, plan);

		final_output = await call_llm_tasks(`
You are an execution agent.

Your job is to complete the requested task using the provided plan.

ORIGINAL TASK:
${task}

PLAN:
${revised_plan}

RULES:
- Follow the steps carefully
- Be concise
- Do not explain your reasoning unless necessary
- Return only the completed result

EXECUTION:
                `);

		await updatePrompt(task_id, Status.COMPLETED, task, plan);
	} catch (e) {
		logger.error(`something went wrong in TaskWorker:run_agents: ${e}`);
		await updatePrompt(task_id, Status.FAILED, task, plan);
	}

	await setTask({
		id: task_id,
		status: {
			status: Status.COMPLETED,
		},
		result: final_output,
	});

	return final_output;
};
