import type { Request, Response } from 'express';
import {
	type Transaction,
	Prompt,
	Related,
	Status,
	TaskType,
} from '../state/types.ts';
import { getLogger } from '../logger/logger.ts';
import { redisExists, redisGet, redisSet } from '../state/state.ts';
import { getExec, setExec, setJob, setTask } from '../state/util.ts';
import crypto, { randomUUID } from 'node:crypto';
import { call_llm_task_validator } from '../llm.ts';
import {
	extractResponseBlock,
	parseJsonSafe,
	summarize,
} from '../worker/util.ts';
import { ValidatorResponse } from '../prompts/types/TaskValidator.ts';
import { RunTask } from '../worker/TaskWorker.ts';
import { RunExec } from '../worker/ExecutionWorker.ts';
import {
	ManageTransaction,
	TransactionManagerResponse,
} from '../service/TransactionManager.ts';

const logger = getLogger('api_util');

export const getHeader = (req: Request, header: string) => {
	const _header = req.headers[header];

	if (!_header || typeof _header !== 'string') throw new Error('no valid id');
	else return _header;
};

export const taskInsert = async ({
	req,
	type,
	//
	_id,
	_task,
}: {
	//
	req?: Request;
	type?: TaskType;
	//
	_id?: string;
	_task?: string;
}) => {
	logger.info(`in task insert`);

	let successful: boolean = false;

	let id = '';
	let task = '';

	// local caller
	if (_id && _task) {
		logger.info(`originated from: local internal call`);
		//
		id = _id;
		task = _task;
	}

	// remote caller
	if (req && type) {
		logger.info(`originated from: http call`);
		//
		id = getHeader(req, 'id') ?? crypto.randomUUID();
		task = getHeader(req, 'task');
	}

	const exists = await redisExists(id);

	logger.info(`exists: ${exists}`);

	// if exists get entry
	let currEntry: Transaction | undefined;
	if (exists) currEntry = await redisGet(id);

	// redis save obj
	let tx: Transaction | undefined;

	// if exists create new task with link to existing task
	if (exists) {
		const newId = crypto.randomUUID();

		const prompt: Prompt = currEntry?.prompt ?? {};

		const llmResponse = prompt.llmResponse ?? [];
		const userRequest = prompt.userRequest ?? [];

		userRequest.push(task);

		const newPrompt = {
			userRequest,
			llmResponse,
		};

		let related: Related = currEntry?.related;

		switch (currEntry?.type) {
			case 'EXECUTION':
				if (related && !related?.exec) related.exec = [] 
				
				related?.exec?.push(id);
				break;

			case 'JOB':
				if (related && !related.job) related.job = []
				
				related?.job?.push(id);
				break;

			case 'TASK':
			case 'TASK_DIRECT':
				if (related && !related.task) related.task = []
				
				related?.task?.push(id);
				break;
		}

		tx = {
			id: newId,
			status: {
				status: Status.QUEUED, 
			},
			type: type,
			prompt: newPrompt,
			related,
		};

		// for return statement to be accurate
		id = newId

		logger.info(`sanity check: ${id === newId}`)

	} else
		tx = {
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

	logger.info(`full saved exists transaction: ${JSON.stringify(tx)}`)
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

	return id;
};

export const resolveRelated = async (related?: Related) => {
	let tasks: Transaction[] = [];
	let execs: Transaction[] = [];
	let jobs: Transaction[] = [];

	const out = {
		tasks,
		execs,
		jobs,
	};

	if (!related) return out;

	const { task, exec, job } = related;

	if (task)
		for (const t of task) {
			const entry = await redisGet(t);
			if (entry) tasks.push(entry);
		}

	if (exec)
		for (const e of exec) {
			const entry = await redisGet(e);
			if (entry) execs.push(entry);
		}

	if (job)
		for (const j of job) {
			const entry = await redisGet(j);
			if (entry) jobs.push(entry);
		}

	return out;
};

export const validate = async (id?: string) => {
	logger.info(`validating transaction: ${id}`);

	if (!id) throw new Error(`validate requires a valid id... id: ${id}`);
	const entry = await redisGet(id);
	if (!entry) throw new Error(`could not find valid entry: id: ${id}`);

	logger.info(`found entry: ${JSON.stringify(entry)}`);

	const { result, prompt, related } = entry;

	const task = entry.prompt?.userRequest;

	let _result: string;

	logger.info(`res: ${result}, prompt: ${JSON.stringify(prompt)}`);

	_result = await call_llm_task_validator(`
You are an Execution agent manager.

Your job is to take results from a task and determine whether or not the task goal was accomplished.

Initial Task(s):
${JSON.stringify(task)}

Task Result:
${JSON.stringify(result)}

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
	`);

	logger.debug(`Task Validator Result: ${_result}`);

	const responseBlock = await extractResponseBlock(_result);
	if (!responseBlock)
		throw new Error(`invalid response from validator: ${responseBlock}`);

	const validatorResponse =
		await parseJsonSafe<ValidatorResponse>(responseBlock);

	logger.debug(`validator response: ${JSON.stringify(validatorResponse)}`);

	await redisSet({ id: id, validatorResponse: validatorResponse });

	return validatorResponse;
};

export const run = async (id: string, type: TaskType) => {
	let result: string = 'FAILED';

	const currentTx = await redisGet(id);

	const taskDirect = currentTx?.type === TaskType.TASK_DIRECT;
	const user_req = currentTx?.prompt?.userRequest;

	if (!user_req || user_req.length < 1)
		throw new Error(`no user req string found for task ${id}`);

	switch (type) {
		case TaskType.TASK_DIRECT:
		case TaskType.TASK:
			result = await RunTask(id, user_req[0], taskDirect);
			break;
		case TaskType.EXECUTION:
			result = await RunExec(id, user_req[0], taskDirect);
			break;
		default:
			logger.warn(`no case for ${type}`);
	}

	logger.info(
		`start result: type: ${type}, task: ${user_req}, result: ${result}`,
	);

	return result;
};

// @ts-ignore
const handleManagerNextAction = async (
	exec_id: string,
	managerResponse: TransactionManagerResponse,
) => {
	let success = false;

	switch (managerResponse.next_action?.type) {
		case 'terminate':
		case 'noop':
			break;
		case 'retry':
			const prompt = managerResponse.next_action.prompt;
			// const newId = randomUUID();
			return await newExec({
				_id: exec_id,
				_task: prompt,
			});
	}

	return success;
};

// @ts-ignore
export const newExec = async ({ req, res, _id, _task,} : 
	{
		req?: Request;
		res?: Response;
		//
		_id?: string;
		_task?: string;
	} ) => {
		try {
			//
			const exec_id = await taskInsert({
				req,
				type: TaskType.EXECUTION,
				//
				_id,
				_task,
			});
			
			const llm_response = await run(exec_id, TaskType.EXECUTION);
			const validatorResponse = await validate(exec_id);
			const currObj = await getExec(exec_id);
			//
			const summary = await summarize(exec_id);
			//
			const ManagerResponse = await ManageTransaction(exec_id);
			//
			if (ManagerResponse.next_action) {
				return await handleManagerNextAction(exec_id, ManagerResponse);
				// return res?.status(200).send(undefined);
			} else
				return res?.status(200).send({
					llm_response,
					validatorResponse,
					currObj,
					summary,
					ManagerResponse,
				});
		} catch (e) {
			logger.error(`something went wrong in newExec: ${e}`);
			return res?.status(500).send(undefined);
		}
};
