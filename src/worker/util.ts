import {
	call_llm_data_narrower,
	call_llm_shell_branch_analyzer,
	call_llm_shell_branch_simplifier,
	PROMPTS,
} from '../llm.ts';
import { getLogger } from '../logger/logger.ts';
import { Parameter, Tool_Output } from '../prompts/types/ApiToolChain.ts';
import { redisGet } from '../state/state.ts';
import { Status, TaskType } from '../state/types.ts';
import { getTask, setJob, setTask } from '../state/util.ts';
import { registry } from '../tools/ToolBootstrap.ts';
import { _func, ToolEntry } from '../tools/ToolRegistry.ts';
import crypto from 'node:crypto';

const logger = getLogger('worker_util');

export const parseJsonSafe = <T>(text: string): T => {
	logger.debug(`parseJsonSafe text: ${text}`);

	try {
		return JSON.parse(text) as T;
	} catch {
		throw new Error(`invalid json: ${text}`);
	}
};

export const extractResponseBlock = (text: string) => {
	const pattern = /<LLM_RESPONSE>([\s\S]*?)<\/LLM_RESPONSE>/;

	const match = text.match(pattern);

	logger.info(`extract response block text: ${text}, match: ${match}`);

	if (match) return match[1].trim();
	else {
		let validJson = false;

		try {
			parseJsonSafe(text);
			validJson = true;
		} catch (e) {
			logger.error(`extracted text was not valid json`);
		}

		if (validJson) {
			logger.info(`no match found defaulting to text passed in: ${text}`);
			return text;
		} else
			throw new Error(
				`unexpected error in extractResponseBlock: validJson: ${validJson}, text: ${text}`,
			);
	}
};

export const updatePrompt = async (
	task_id: string,
	status: Status,
	task?: string,
	plan?: string,
) => {
	const currentTask = await getTask(task_id);

	const currentReq = currentTask?.prompt?.userRequest ?? [];
	const currentRes = currentTask?.prompt?.llmResponse ?? [];

	if (task) currentReq.push(task);
	if (plan) currentRes.push(plan);

	await setTask({
		id: task_id,
		status: { status },
		prompt: {
			userRequest: currentReq,
			llmResponse: currentRes,
		},
		type: currentTask?.type,
	});
};

const SafeExecute = async (
	key: string,
	tool: ToolEntry,
	Params: Parameter[],
) => {
	if (!tool.func)
		throw new Error(
			`something went wrong in SafeExecute, tool: ${JSON.stringify(tool)} `,
		);

	let validResult: string = 'FAILED';
	let result: unknown = validResult;

	await setJob({
		id: key,
		status: { status: Status.RUNNING, message: 'In safe Execute' },
	});

	try {
		await setJob({
			id: key,
			status: { status: Status.RUNNING, message: 'Preparing to execute' },
		});

		const func = tool.func;
		const params = Params.map((p) => {
			return {
				...p,
			}.value;
		});

		logger.info(`params: ${JSON.stringify(params)}`);

		result = await func(...params);

		switch (true) {
			case typeof result === 'string':
				validResult = result;
				break;
			default: {
				const keys = Object.keys(result as any);
				const vals = Object.values(result as any);
				// type check
				const output = keys.findIndex((k) => k === 'output');
				const error = keys.findIndex((k) => k === 'error');
				const input = keys.findIndex((k) => k === 'input');

				if (output > -1 && error > -1 && input > -1) {
					logger.info('is a shell result type');

					const _input = vals[input] as string;
					const _output = vals[output] as string;
					const _error = vals[error] as string;

					validResult = _output || _error || _input; // placeholder failsafe
				}
			}
		}

		await setJob({
			id: key,
			status: {
				status: Status.COMPLETED,
				message: 'Execution complete!',
			},
		});

		logger.info(`[*] SafeExecute result: ${JSON.stringify(result)}`);

		return validResult;
	} catch (e) {
		const msg = `something went wrong in safe_execute: ${JSON.stringify(e)}, tool: ${JSON.stringify(tool)}, Params: ${JSON.stringify(Params)}`;

		await setJob({
			id: key,
			status: {
				status: Status.FAILED,
				message: msg,
			},
		});

		logger.error(msg);
	}

	return `${result}`;
};

const addJobToTask = async (task_id: string, job_id: string) => {
	const entry = await redisGet(task_id);
	const currPrompt = entry?.prompt;
	let saved = false;
	const related = entry?.related;

	const jobs = related?.job ?? [];
	const tasks = related?.task ?? [];
	const execs = related?.exec ?? [];

	// save job id in parent
	jobs?.push(job_id);

	switch (entry?.type) {
		case TaskType.TASK:
		case TaskType.TASK_DIRECT:
			saved = await setTask({
				id: task_id,
				related: {
					job: jobs,
					task: tasks,
					exec: execs,
				},
			});
		default:
			logger.warn(`no case found for ${entry?.type} in addJobToTask..`);
	}
	return saved;
};

const TaskProcessJob = async (task_id: string, task: Tool_Output) => {
	let pivotRequired = false;
	let final_results: string = 'FAILED';
	let jobs = new Map<string, string | undefined>();

	try {
		const steps = task.identified_internal_tools_required;

		for (const step of steps) {
			if (pivotRequired) throw new Error('pivotRequired in branching!');
			else {
				// save job_id
				const job_id = crypto.randomUUID();
				jobs.set(job_id, undefined);

				await setJob({
					id: job_id,
					type: TaskType.JOB,
					related: {
						task: [task_id],
					},
					job: JSON.stringify(step),
					status: {
						status: Status.QUEUED,
					},
				});

				// add link to main task
				await addJobToTask(task_id, job_id);

				// @ts-ignore
				const tool: string = step['Tool'] as string; // TODO - fix me
				const params = step.Params ?? [];

				logger.info(
					`identified tool: ${tool}, params: ${JSON.stringify(params)}`,
				);

				const found_tool: ToolEntry | undefined = registry.get(tool);

				if (!found_tool) throw new Error(`could not find tool ${tool}`);

				const result = await SafeExecute(job_id, found_tool, params);

				if (!result) throw new Error(`no result came back from SafeExecute...`);

				final_results = result;
			}
		}
	} catch (e) {
		logger.error(`something went wrong in TaskProcessJob: ${e}`);
	}

	logger.info(`final results from process task util: ${final_results}`);

	return final_results;
};

export const ToolExec = async (
	task_id: string,
	task: string,
	initial_exec: string,
) => {
	await setTask({
		id: task_id,
		status: {
			status: Status.RUNNING,
			message: 'In Tool Exec',
		},
	});

	let result: string = 'FAILED';

	try {
		const narrowed = await call_llm_data_narrower(
			`sanitize the following output: ${initial_exec}`,
		);

		const block = extractResponseBlock(narrowed);

		if (!block)
			throw new Error(`no block found from narrowed response, block: ${block}`);

		const json_response = parseJsonSafe<Tool_Output>(block);
		const steps = json_response.identified_internal_tools_required;

		if (!steps || (Array.isArray(steps) && steps.length < 1))
			throw new Error(`no steps found: ${steps}`);

		// exec
		result = await TaskProcessJob(task_id, json_response);

		await setTask({
			id: task_id,
			result,
			status: {
				status: Status.COMPLETED,
			},
		});
	} catch (e) {
		logger.error(`something went wrong in ToolExec: ${e}`);

		await setTask({
			id: task_id,
			status: {
				status: Status.FAILED,
				message: `${JSON.stringify(e)}`,
			},
		});
	}

	return result;
};

const SimplifyOpinion = async (next_step: string) => {
	const final_result = await call_llm_shell_branch_simplifier(`
You are a quality assurance expert. 

Input:
${next_step}

Expected Output Format:
<LLM_RESPONSE>
    ShellBranchAnalysisSimplified
</LLM_RESPONSE>
`);
	return final_result;
};

const FormatStringArray = (results: string[]) => {
	let res = ``;
	for (const result of results) {
		res += result + '\n';
	}
	return res;
};

const GetSecondOpinion = async (
	analysis: string,
	job_results: string[],
	job_ids: string[],
	task_id: string,
) => {
	const final_result = await call_llm_shell_branch_analyzer(`
You are a quality assurance expert.

Your sole purpose is to evaluate the analysis of a job 

Analysis:
${analysis}

Pivot Decision Rule:
If pivot_required=true ALWAYS include a viable "next_step".                                        
Set pivot_required=true ONLY when the current execution trajectory can no longer realistically converge on successful task completion.
                                                   
A pivot is NOT required when:
- The branch is still progressing toward the task goal
- Failures are recoverable within the current execution strategy
- Additional execution within the same branch could still satisfy the task

A pivot IS recommended (pivot_recommended) when:
- original_task_goal has not been accomplished and next_step would change that.

Interpretation Rules:
- Evaluate trajectory viability from observed execution results and existing state.
- If original_task_goal not accomplished, lean towards pivot_required.

Do NOT:
- Expand beyond branch viability assessment

Each job must conform to the ShellResults structure:
${PROMPTS['shell_results_types']}

Job Results:
${FormatStringArray(job_results)}

Job IDs:
${FormatStringArray(job_ids)}

Task Goal as original_task_goal:
${await getTask(task_id)}

Expected Output Format:
<LLM_RESPONSE>
    ShellBranchAnalysis
</LLM_RESPONSE>
`);
	return final_result;
};

const AnalyzeShellResults = async (
	job_results: string[],
	job_ids: string[],
	task_id: string,
) => {
	const final_results = await call_llm_shell_branch_analyzer(`
You are a System Execution Branch Analysis agent.

Your sole responsibility is to evaluate whether the current execution branch remains viable for accomplishing the task goal.

IF pivot_required == falsey:
    You are NOT:
    - a planner
    - a shell command generator
    - a task executor
    - a strategy synthesizer

Do NOT propose commands, execution steps, remediation actions, or next-step plans.

Your only responsibility is branch viability analysis.

Pivot Decision Rule:
If pivot_required=true ALWAYS include a viable "next_step".                                        
Set pivot_required=true ONLY when the current execution trajectory can no longer realistically converge on successful task completion.
                                                   
A pivot is NOT required when:
- The branch is still progressing toward the task goal
- Failures are recoverable within the current execution strategy
- Additional execution within the same branch could still satisfy the task

A pivot IS required when:
- The branch has irreversibly diverged from the task goal
- Continuing execution within the current branch cannot satisfy the task
- The current execution strategy is no longer viable or helpful for resolving the current task.
- No viable continuation exists within the current branch.

Interpretation Rule:
Evaluate trajectory viability only from observed execution results.

Do NOT:
- infer or suggest future commands
- prescribe system actions
- construct next-step shell instructions
- expand beyond branch viability assessment

Each job must conform to the ShellResults structure:
${PROMPTS['shell_results_types']}

Job Results:
${FormatStringArray(job_results)}

Job IDs:
${FormatStringArray(job_ids)}

Task Goal as original_task_goal:
${await getTask(task_id)}

Analysis Instructions:
1. Assess whether observed outputs remain aligned with the task goal
2. Determine whether successful completion is still reachable within this branch
3. Set pivot_required=true only if no viable continuation exists
4. Explain the reasoning strictly in terms of branch viability

Expected Output Format:
<LLM_RESPONSE>
    ShellBranchAnalysis
</LLM_RESPONSE>`);

	return final_results;
};
