import { call_llm_data_narrower } from '../llm.ts';
import logger from '../logger/logger.ts';
import { Parameter, Tool, Tool_Output } from '../prompts/types/ApiToolChain.ts';
import { Status, TaskType } from '../state/types.ts';
import { getTask, setExec, setJob, setTask } from '../state/util.ts';
import { registry } from '../tools/ToolBootstrap.ts';
import { _func, ToolEntry } from '../tools/ToolRegistry.ts';
import crypto from 'node:crypto'

export const parseJsonSafe = (text: string) => {
	try {
		logger.info(`parseJsonSafe text: ${text}`);
		return JSON.parse(text);
	} catch {
		return null;
	}
};

export const extractResponseBlock = (text: string) => {
	const pattern = /<LLM_RESPONSE>([\s\S]*?)<\/LLM_RESPONSE>/;

	const match = text.match(pattern);

	if (match) {
		return match[1].trim();
	}

	return undefined;
};

export const updatePrompt = async (
	task_id: string,
	status: Status,
	task?: string,
	plan?: string,
) => {
	const currentTask = await getTask(task_id);

	const currentReq = currentTask?.prompt?.req ?? [];
	const currentRes = currentTask?.prompt?.res ?? [];

	if (task) currentReq.push(task);
	if (plan) currentRes.push(plan);

	await setTask({
		id: task_id,
		status: { status },
		prompt: {
			req: currentReq,
			res: currentRes,
		},
		type: currentTask?.type,
	});
};

const SafeExecute = async (key: string, tool: ToolEntry, Params: Parameter[]) => {
	if (!tool.func) throw new Error(`something went wrong in SafeExecute, tool: ${JSON.stringify(tool)} `)

	try {
		const func = tool.func
		const params = Params.map(
			(p) => {
				return {
					...p
				}.value
			}
		)

		logger.info(`params: ${JSON.stringify(params)}`)

		const result = await func(...params)

		logger.info(`[*] SafeExecute result: ${result}`)
		
		return result;
	} catch (e) {
		logger.error(`something went wrong in safe_execute: ${JSON.stringify(e)}, tool: ${JSON.stringify(tool)}, Params: ${JSON.stringify(Params)}`)
	}
	
}

const ProcessTask = async (task_id: string, task: Tool_Output) => {
	let successful = false;
	let pivotRequired = false;

	let final_results: string | undefined;
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
						task_id: task_id,
					},
					job: JSON.stringify(step),
					status: {
						status: Status.QUEUED,
					},
				});

				// @ts-ignore
				const tool: string = step['Tool'] as string
				
				const params = step.Params ?? []

				logger.info(`identified tool: ${tool}, params: ${JSON.stringify(params)}`)
				
				const found_tool: ToolEntry | undefined = registry.get(tool)

				if (!found_tool) throw new Error(`could not find tool ${tool}`)

				const result: unknown = SafeExecute(job_id, found_tool, params);

				logger.info(`[*] result: ${JSON.stringify(result)}`)

			}
		}
	} catch (e) {
		logger.error(`something went wrong in ProcessTask: ${e}`);
	}

	return '';
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

	let result: string = '';

	try {
		const narrowed = await call_llm_data_narrower(
			`sanitize the following output: ${initial_exec}`,
		);

		const block = extractResponseBlock(narrowed)

		if (!block) throw new Error(`no block found from narrowed response, block: ${block}`)

		const json_response = parseJsonSafe(block) as Tool_Output;
		const steps = json_response.identified_internal_tools_required;

		if (!steps || (Array.isArray(steps) && steps.length < 1))
			throw new Error(`no steps found: ${steps}`);

		// exec
		const result = await ProcessTask(task_id, json_response);

		await setTask({
			id: task_id,
			result,
		});

	} catch (e) {
		logger.error(`something went wrong in ToolExec: ${e}`);
	}
};
