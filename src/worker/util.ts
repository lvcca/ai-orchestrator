import {
	call_LLM,
	call_llm_data_narrower,
	call_llm_shell_branch_analyzer,
	call_llm_shell_branch_simplifier,
	call_llm_task_summarizer,
	PROMPTS,
} from '../llm.ts';
import { getLogger } from '../logger/logger.ts';
import {
	Parameter,
	Tool,
	ToolCallPayload,
} from '../prompts/types/ApiToolChain.ts';
import { StandardStreams } from '../prompts/types/ShellExecutor.ts';
import { redisGet } from '../state/state.ts';
import { Related, Status, TaskType, Transaction } from '../state/types.ts';
import {
	getExec,
	getJob,
	getTask,
	setExec,
	setJob,
	setTask,
} from '../state/util.ts';
import { registry } from '../tools/ToolBootstrap.ts';
import { _func, ToolEntry } from '../tools/ToolRegistry.ts';
import crypto from 'node:crypto';

const logger = getLogger('worker_util');

export const parseJsonSafe = async <T>(text: string): Promise<T> => {
	logger.debug(`parseJsonSafe text: ${text}`);

	try {
		return JSON.parse(text) as T;
	} catch (e) {
		throw new Error(`invalid json: ${text}, error: ${getError(e)}`);
	}
};

export const extractResponseBlock = async (text: string) => {
	const pattern = /<LLM_RESPONSE>([\s\S]*?)<\/LLM_RESPONSE>/;

	const match = text.match(pattern);

	logger.info(`extract response block text: ${text}, match: ${match}`);

	if (match) return match[1].trim();
	else {
		let validJson = false;

		try {
			await parseJsonSafe(text);
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

export const updateRelated = async ({
	_id,
	type,
	related,
}: {
	_id: string;
	type: TaskType;
	related: Related;
}) => {
	let success = false;

	try {
		// get current state
		let currEntry: Transaction | undefined;

		switch (type) {
			case 'EXECUTION':
				currEntry = await getExec(_id);
				break;
			case 'JOB':
				currEntry = await getJob(_id);
				break;
			case 'TASK_DIRECT':
			case 'TASK':
				currEntry = await getTask(_id);
				break;
		}

		if (!currEntry) throw new Error(`could not find entry... ${_id}`);

		// update current state
		const newJobs = related?.job;
		if (newJobs)
			for (let i = 0; i < newJobs?.length; i++)
				if (!currEntry.related?.job?.includes(newJobs[i]))
					currEntry.related?.job?.push(newJobs[i]);

		const newExecs = related?.exec;
		if (newExecs)
			for (let i = 0; i < newExecs?.length; i++)
				if (!currEntry.related?.exec?.includes(newExecs[i]))
					currEntry.related?.exec?.push(newExecs[i]);

		const newTask = related?.task;
		if (newTask)
			for (let i = 0; i < newTask?.length; i++)
				if (!currEntry.related?.exec?.includes(newTask[i]))
					currEntry.related?.exec?.push(newTask[i]);

		switch (type) {
			case 'EXECUTION':
				success = await setExec(currEntry);
				break;
			case 'JOB':
				success = await setJob(currEntry);
				break;
			case 'TASK_DIRECT':
			case 'TASK':
				success = await setTask(currEntry);
				break;
		}
	} catch (e) {
		logger.error(`something went wrong in updateRelated ${e}`);
	}

	return success;
};

export const appendToTransactionLog = async ({
	_id,
	type,
	newUserRequest,
	newLLMResponse,
}: {
	_id: string;
	type: TaskType;
	//
	newUserRequest?: string;
	newLLMResponse?: string;
}) => {
	let success = false;
	try {
		let currTx: Transaction | undefined;

		switch (type) {
			case 'TASK':
			case 'TASK_DIRECT':
				currTx = await getTask(_id);
				break;
			case 'EXECUTION':
				currTx = await getExec(_id);
				break;
			case 'JOB':
				currTx = await getJob(_id);
				break;
		}

		if (!currTx) throw new Error(`no tx found!`);

		const currentReq = [...(currTx?.prompt?.userRequest ?? [])];
		const currentRes = [...(currTx?.prompt?.llmResponse ?? [])];

		if (newUserRequest && !currentReq.includes(newUserRequest))
			currentReq.push(newUserRequest);
		if (newLLMResponse && !currentRes.includes(newLLMResponse))
			currentRes.push(newLLMResponse);

		const newPrompt = {
			userRequest: currentReq,
			llmResponse: currentRes,
		};

		switch (type) {
			case 'JOB':
				success = await setJob({
					id: _id,
					status: currTx?.status,
					prompt: newPrompt,
					type: currTx?.type,
				});
				break;
			case 'TASK':
			case 'TASK_DIRECT':
				success = await setTask({
					id: _id,
					status: currTx?.status,
					prompt: newPrompt,
					type: currTx?.type,
				});
				break;
			case 'EXECUTION':
				success = await setExec({
					id: _id,
					status: currTx?.status,
					prompt: newPrompt,
					type: currTx?.type,
				});
				break;
		}
	} catch (e) {
		logger.error(
			`something went wrong in appendToTransactionLog: ${getError(e)}`,
		);
	}

	return success;
};

export const execWrapper = async (func: _func, args: string[]) => {
	let result: string;

	try {
		result = await func(...args);
		if (result === undefined)
			result = `${func.name} call returned undefined, assume successful execution`;
	} catch (e) {
		const msg = `something went wrong in execWrapper: ${getError(e)}`;
		logger.error(msg);
		result = msg;
	}

	return result;
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

		const func = tool.func;
		const params = Params.map((p) => p.value);

		logger.info(`func: ${func.name}, params: ${JSON.stringify(params)}`);

		// result = await func(...params);
		result = await execWrapper(func, params);

		logger.info(`func results: ${JSON.stringify(result)}`);

		switch (true) {
			case result === undefined:
			case result === null:
				throw new Error(`no result returned from func call in SafeExecute`);

			case typeof result === 'string':
				validResult = result;
				break;

			case typeof result === 'object': {
				const _result: StandardStreams = result as StandardStreams;

				if (!_result.input) break;

				logger.info('is a shell result type');

				// get arrays
				const keys = Object.keys(result as any);
				const vals = Object.values(result as any);

				// find keys
				const output = keys.findIndex((k) => k === 'output');
				const error = keys.findIndex((k) => k === 'error');
				const input = keys.findIndex((k) => k === 'input');

				if (output > -1 || error > -1 || input > -1) {
					// map to vals
					const _input = `${vals[input]}` as string;
					const _output = `${vals[output]}` as string;
					const _error = `${vals[error]}` as string;

					validResult =
						_output ||
						_error ||
						_input ||
						'[*] no response from shell, assume exited successfully'; // placeholder failsafe

					logger.warn(`validResult: ${validResult}`);
				}
			}

			default:
				validResult = `${result}`;
				logger.warn(
					`no case found for result ${JSON.stringify(result)}, result type: ${typeof result}`,
				);
		}

		await setJob({
			id: key,
			status: {
				status: Status.COMPLETED,
				message: 'Execution complete!',
			},
		});

		logger.info(
			`[*] SafeExecute result: ${JSON.stringify(result)}, validResult: ${validResult}`,
		);

		return validResult;
	} catch (e) {
		const msg = `something went wrong in SafeExecute: ${JSON.stringify(getError(e))}, tool: ${JSON.stringify(tool)}, Params: ${JSON.stringify(Params)}`;

		await setJob({
			id: key,
			status: {
				status: Status.FAILED,
				message: msg,
			},
		});

		logger.error(msg);
	}

	return validResult;
};

export const getError = (e: unknown) => {
	const error =
		e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e);
	return error;
};

const AddJob = async (id: string, job_id: string) => {
	let saved = false;

	const entry = await getExec(id);
	const related = entry?.related;
	const jobs = related?.job ?? [];

	// save job id in parent
	jobs?.push(job_id);

	switch (entry?.type) {
		case TaskType.EXECUTION:
			saved = await setExec({
				...entry,
				related: {
					...related,
					job: jobs,
				},
			});
			break;
		default:
			logger.warn(`no case found for ${entry?.type} in addJobToTask..`);
	}

	return saved;
};

/**
 *
 * @param exec_id transaction id
 * @param {ToolCallPayload} toolPayload llm generated tool payload in json form
 * @returns
 */

const ExecProcessJob = async (
	exec_id: string,
	toolPayload: ToolCallPayload,
) => {
	let pivotRequired = false;
	let final_results: string = 'FAILED';
	let jobs = new Map<string, string | undefined>();

	try {
		const requiredToolSteps = toolPayload.identified_internal_tools_required; // in order of execution llm decided

		for (const step of requiredToolSteps) {
			// make new transaction for each step
			const job_id = crypto.randomUUID();

			try {
				// prevent unnessary executions if pivot identified
				if (pivotRequired) throw new Error('pivotRequired in branching!');

				/**
				 * insert entry for job 
				*/
				
				// local tracker
				jobs.set(job_id, undefined);

				// redis entry
				await setJob({
					id: job_id,
					type: TaskType.JOB,
					status: {
						status: Status.QUEUED,
					},
					related: {
						exec: [exec_id],
					},
					job: JSON.stringify(step),
				});

				// add link to main task
				await AddJob(exec_id, job_id);

				// always be type safe with llm generated stuffs
				let safeToolName: unknown = step['Tool'];

				// try parse as tool first
				if (typeof safeToolName !== 'string') {
					let _tool = safeToolName as Tool;

					let SafeToolObject: Tool = {
						name: _tool['name'] ?? '',
						description: _tool['description'] ?? '',
						parameters: _tool['parameters'] ?? [],
						return: _tool['return'],
					};

					safeToolName = SafeToolObject.name;
				}

				const params = step.Params ?? [];

				logger.info(
					`identified tool: ${JSON.stringify(safeToolName)}, params: ${JSON.stringify(params)}`,
				);

				const foundToolEntry: ToolEntry | undefined = registry.get(
					safeToolName as string,
				);

				if (!foundToolEntry)
					throw new Error(
						`could not find tool ${JSON.stringify(safeToolName)}`,
					);

				const result = await SafeExecute(job_id, foundToolEntry, params);

				if (!result)
					throw new Error(`no result came back from SafeExecute...`);

				final_results = result;

				await setJob({
					id: job_id,
					type: TaskType.JOB,
					status: {
						status: Status.COMPLETED,
					},
					job: JSON.stringify(step),
					result: final_results,
				});
				
			} catch (e) {
				logger.error(
					`something went wrong in TaskProcessJob step: ${JSON.stringify(getError(e))}`,
				);

				await setJob({
					id: job_id,
					type: TaskType.JOB,
					status: {
						status: Status.FAILED,
					},
					related: {
						exec: [exec_id],
					},
					job: JSON.stringify(step),
					result: final_results,
				});
				continue;
			}
		}
	} catch (e) {
		logger.error(
			`something went wrong in TaskProcessJob: ${JSON.stringify(getError(e))}`,
		);
	}

	logger.info(`final results from process task util: ${final_results}`);

	return final_results;
};

/**
 *
 * @param toolExecId id for tool exec transaction
 * @param task task attempting to be accomplished
 * @param toolExecPayload stringified tool exec payload
 * @returns {Promise<string>}
 */

export const ToolExec = async (
	toolExecId: string,
	task: string,
	toolExecPayload: string,
) => {

	logger.debug(`ToolExec`)

	await setExec({
		id: toolExecId,
		status: {
			status: Status.RUNNING,
			message: 'Tool Exec',
		},
		type: 'EXECUTION',
	});

	await appendToTransactionLog({
		_id: toolExecId,
		type: TaskType.EXECUTION,
		newUserRequest: task,
		newLLMResponse: toolExecPayload,
	});

	let result: string = 'FAILED';

	try {
		const narrowed = await call_llm_data_narrower(
			`sanitize the following output: ${toolExecPayload}`,
		);

		const block = await extractResponseBlock(narrowed);

		if (!block)
			throw new Error(`no block found from narrowed response, block: ${block}`);

		const json_response = await parseJsonSafe<ToolCallPayload>(block);
		const steps = json_response.identified_internal_tools_required;

		// ensure valid array
		if (!Array.isArray(steps) || !steps || (Array.isArray(steps) && steps.length < 1))
			throw new Error(`no steps found: ${steps}`);

		// exec
		result = await ExecProcessJob(toolExecId, json_response);

		await setExec({
			id: toolExecId,
			result,
			status: {
				status: Status.COMPLETED,
			},
		});

		await appendToTransactionLog({
			_id: toolExecId,
			type: TaskType.EXECUTION,
			newLLMResponse: result,
		});
	} catch (e) {
		logger.error(`something went wrong in ToolExec: ${e}`);

		await setExec({
			id: toolExecId,
			status: {
				status: Status.FAILED,
				message: `${JSON.stringify(e)}`,
			},
		});
	}
	return result;
};

const SimplifyOpinion = async (next_step: string) =>
	await call_llm_shell_branch_simplifier(`
You are a quality assurance expert. 

Input:
${next_step}

Expected Output Format:
<LLM_RESPONSE>
    ShellBranchAnalysisSimplified
</LLM_RESPONSE>
`);

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
) =>
	await call_llm_shell_branch_analyzer(`
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

const AnalyzeShellResults = async (
	job_results: string[],
	job_ids: string[],
	task_id: string,
) => {
	const finalResults = await call_llm_shell_branch_analyzer(`
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

	return finalResults;
};

export type SummaryType = {
	status: 'success' | 'failure' | 'partial_success' | 'unknown';
	summary: string;
	result: string;
	error: string;
	steps: string[];
	artifacts: string[];
};

export const SummarizeTask = async (id: string) => {
	const currObj = await redisGet(id);
	const _obj = JSON.stringify(currObj);

	const summarizedTask = await call_llm_task_summarizer(`
You are an ai task result summarizer.

Your job is to parse results and determine a definitive next step is required.

Initial Tasks:
${currObj?.prompt?.userRequest}

Task Results:
${currObj?.result}

Full Task Stringified Object:
${JSON.stringify(JSON.parse(_obj) as Transaction, null, 2)}

RULES:
- Return ONLY valid JSON
- Do not explain reasoning
- Do not include markdown
- Use at most 5 steps
- Steps must be concrete and actionable

OUTPUT FORMAT:
<LLM_RESPONSE>
{
	"status": "success" | "failure" | "partial_success" | "unknown",
	"summary": string,
	"result": string,
	"error": string,
	"steps": string [],
	"artifacts": string []
}
</LLM_RESPONSE>
`);
	const summary = await parseJsonSafe<SummaryType>(
		await extractResponseBlock(summarizedTask),
	);
	return summary;
};
