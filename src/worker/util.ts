import { call_llm_data_narrower } from '../llm.ts';
import {getLogger} from '../logger/logger.ts';
import { Parameter, Tool_Output } from '../prompts/types/ApiToolChain.ts';
import { redisGet } from '../state/state.ts';
import { Status, TaskType } from '../state/types.ts';
import { getTask, setJob, setTask } from '../state/util.ts';
import { registry } from '../tools/ToolBootstrap.ts';
import { _func, ToolEntry } from '../tools/ToolRegistry.ts';
import crypto from 'node:crypto'

const logger = getLogger('worker_util')

export const parseJsonSafe = <T> (text: string): T => {
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

	let result: string = 'FAILED'

	await setJob({id: key, status: {status: Status.RUNNING, message: 'In safe Execute'}})

	try {

		await setJob({id: key, status: {status: Status.RUNNING, message: 'Preparing to execute'}})

		const func = tool.func
		const params = Params.map( 
			(p) => {
				return {
					...p
				}.value
			}
		)

		logger.info(`params: ${JSON.stringify(params)}`)

		result = await func(...params)

		await setJob({
			id: key, 
			status: {
				status: Status.COMPLETED, 
				message: 'Execution complete!'
		}})

		logger.info(`[*] SafeExecute result: ${result}`)
		
	} catch (e) {
		const msg = `something went wrong in safe_execute: ${JSON.stringify(e)}, tool: ${JSON.stringify(tool)}, Params: ${JSON.stringify(Params)}`
		
		await setJob({
			id: key, 
			status: {
				status: Status.FAILED, 
				message: msg
		}})

		logger.error(msg)
	}

	return result;
}

const addJobToTask = async (task_id: string, job_id: string) => {
	const entry = await redisGet(task_id);
	const currPrompt = entry?.prompt;
	let saved = false;
	const related = entry?.related
	
	const jobs = related?.job ?? []
	const tasks = related?.task ?? []
	const execs = related?.exec ?? []

	// save job id in parent 
	jobs?.push(job_id)

	switch (entry?.type){
		case TaskType.TASK:
		case TaskType.TASK_DIRECT:
			saved = await setTask({
			id: task_id,
			related: {
				job: jobs,
				task: tasks,
				exec: execs
		}})
		default: 
			logger.warn(`no case found for ${entry?.type} in addJobToTask..`)
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
				await addJobToTask(task_id, job_id)

				// @ts-ignore
				const tool: string = step['Tool'] as string // TODO - fix me 
				const params = step.Params ?? []

				logger.info(`identified tool: ${tool}, params: ${JSON.stringify(params)}`)
	
				const found_tool: ToolEntry | undefined = registry.get(tool)
				
				if (!found_tool) 
					throw new Error(`could not find tool ${tool}`)

				const result = await SafeExecute(job_id, found_tool, params);

				if (!result) throw new Error(`no result came back from SafeExecute...`)					
				
				final_results = result
			}
		}
	} catch (e) {
		logger.error(`something went wrong in TaskProcessJob: ${e}`);
	}

	logger.info(`final results from process task util: ${final_results}`)

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

		const block = extractResponseBlock(narrowed)

		if (!block) throw new Error(`no block found from narrowed response, block: ${block}`)

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
				status: Status.COMPLETED
			}
		});

	} catch (e) {

		logger.error(`something went wrong in ToolExec: ${e}`);
		
		await setTask({
			id: task_id,
			status: {
				status: Status.FAILED, 
				message: `${JSON.stringify(e)}`
			}
		});
	}

	return result;
};
