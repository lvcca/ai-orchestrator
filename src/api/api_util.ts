import type { Request } from 'express';
import { type Transaction, Related, Status, TaskType } from '../state/types.ts';
import {getLogger} from '../logger/logger.ts';
import { redisExists, redisGet, redisSet } from '../state/state.ts';
import { setExec, setJob, setTask } from '../state/util.ts';
import crypto from 'node:crypto';
import { call_llm_task_validator } from '../llm.ts';
import { extractResponseBlock, parseJsonSafe } from '../worker/util.ts';
import { ValidatorResponse } from '../prompts/types/TaskValidator.ts';
import { RunTask } from '../worker/TaskWorker.ts';
import { RunExec } from '../worker/ExecutionWorker.ts';

const logger = getLogger('api_util')

export const getHeader = (req: Request, header: string) => {
	const _header = req.headers[header];

	if (!_header || typeof _header !== 'string') throw new Error('no valid id');
	else return _header;
};

export const taskInsert = async (req: Request, type: TaskType) => {
	logger.info(`in task insert`);

	let successful: boolean = false;

	const id = getHeader(req, 'id') ?? crypto.randomUUID();
	const task = getHeader(req, 'task');
	const exists = await redisExists(id);

	logger.info(`exists: ${exists}`);

	if (!exists) {
		const tx: Transaction = {
			id,
			status: {
				status: Status.QUEUED,
			},
			type: type,
			prompt: {
				userRequest: [task],
				llmResponse: [],
			},
		};

		logger.info(`Incoming newTask: ${id}, type: ${type}`);

		switch (type) {
			case TaskType.EXECUTION:
				successful = await setExec(tx);
				break;
			case TaskType.JOB:
				successful = await setJob(tx);
				break;
			case TaskType.TASK_DIRECT:
			case TaskType.TASK:
				successful = await setTask(tx);
				break;
		}

		logger.info(`successful: ${successful}`);
	}

	return id;
};


export const resolveRelated = async (related?: Related) => {
	let tasks: Transaction 	[] = []
	let execs: Transaction 	[] = []
	let jobs: Transaction 	[] = []

	const out = {
		tasks,
		execs,
		jobs
	}
	
	if (!related) return out;	
	
	const {task, exec, job} = related

	if (task)
		for (const t of task) {
			const entry = await redisGet(t)
			if (entry) tasks.push(entry)
		}
	
	if (exec)
		for (const e of exec) {
			const entry = await redisGet(e)
			if (entry) execs.push(entry)
		}

	if (job)
		for (const j of job) {
			const entry = await redisGet(j)
			if (entry) jobs.push(entry)
		}
	
	return out
}

export const validate = async (id?: string) => {
	logger.info(`in validate`)

	if (!id) throw new Error(`validate requires a valid id... id: ${id}`)	 
	const entry = await redisGet(id);
	if (!entry) throw new Error(`could not find valid entry: id: ${id}`)
	
	const res = entry.result;
	const prompt = entry.prompt
	const related = entry.related
	const task = entry.prompt?.userRequest

	let result: string;

	logger.info(`res: ${res}, prompt: ${JSON.stringify(prompt)}`);
	
	result = await call_llm_task_validator(`
You are an Execution agent manager.

Your job is to take results from a task and determine whether or not the task goal was accomplished.

Initial Task(s):
${JSON.stringify(task)}

Task Result:
${JSON.stringify(res)}

Related Tasks:
${JSON.stringify(await resolveRelated(related))}

LLM Prompt History:
${JSON.stringify(prompt)}

RULES:
- Use ONLY valid JSON as output 
- Always explain reasoning
- Do NOT include markdown
- There are at most 5 steps
- Steps are concrete and actionable
- Any text not in Javascript notation MUST be prepended with a comment

Output FORMAT:
<LLM_RESPONSE>
{
		"valid": boolean,
		"reason": string | null,
		"confidence": number,
		"issues": string[],
		"evidence": string[]
}
</LLM_RESPONSE>
	`)
	
	logger.debug(`Task Validator Result: ${result}`)

	const responseBlock = extractResponseBlock(result)
	if (!responseBlock) throw new Error(`invalid response from validator: ${responseBlock}`)

	const safeObj = parseJsonSafe<ValidatorResponse>(responseBlock)
	
	logger.debug(`validator response: ${JSON.stringify(safeObj)}`)

	await redisSet({id: id, validatorResponse: safeObj})

	if (safeObj) return safeObj.valid
	else return false
}

export const run = async (id: string, type: TaskType) => {
	let result: string = 'FAILED'
	
	const tx = await redisGet(id);
	const taskDirect = tx?.type === TaskType.TASK_DIRECT;
	const user_req = tx?.prompt?.userRequest;

	if (!user_req || user_req.length < 1)
		throw new Error(`no user req string found for task ${id}`);

	switch (type) {
		case TaskType.TASK_DIRECT:
		case TaskType.TASK:
			result = await RunTask(id, user_req.join(','), taskDirect);
			break;
		case TaskType.EXECUTION:
			result = await RunExec(id, user_req.join(','), taskDirect);
			break;
		default:
			logger.warn(`no case for ${type}`)
	}

	logger.info(`start result: type: ${type}, task: ${user_req}, result: ${result}`);

	return result;
};

