import { app } from '../server/server.ts';
import { randomUUID } from 'node:crypto';
import {getLogger} from '../logger/logger.ts';
import { getHeader, run, taskInsert, validate } from './api_util.ts';
import { Related, TaskType, Transaction } from '../state/types.ts';
import { getExec, getTask } from '../state/util.ts';
import { redisGet, redisGetAll } from '../state/state.ts';
import { RunTask } from '../worker/TaskWorker.ts';
import { RunExec } from '../worker/ExecutionWorker.ts';
import { call_llm_task_validator, PROMPTS } from '../llm.ts';
import type { ValidatorResponse} from '../prompts/types/TaskValidator.ts'
import { extractResponseBlock, parseJsonSafe } from '../worker/util.ts';

const logger = getLogger('api')

// all incoming traffic
app.use((req, res, next) => {
	let id: string = randomUUID();

	try {
		id = getHeader(req, 'id');
	} catch (e) {
		logger.debug(`something went wrong getting id header, error: ${e}`);
	}

	logger.debug(`request: ${id}, target url: ${req.url}`);

	const valid = true; // just until auth is figured out

	if (valid) next();
	else res.status(400).send();
});

// all apis
app.get('/', async (_, res) => {
	return res.status(200).send(`Hello world! ${new Date()}`);
});

app.get('/task/allTasks', async (_, res) => {
	const tasks = await redisGetAll();
	const out = [];

	if (tasks)
		for (const task of tasks) {
			const state = await redisGet(task);
			out.push(state);
	}

	return res.status(200).send(out)
});

app.get('/task/newTaskDirect', async (req, res) => {
	const task_id = await taskInsert(req, TaskType.TASK_DIRECT);
	const llm_response = await run(task_id, TaskType.TASK_DIRECT);

	return res.status(200).send(llm_response);
});

app.get('/task/newTask', async (req, res) => {
	const task_id = await taskInsert(req, TaskType.TASK);
	const llm_response = await run(task_id, TaskType.TASK_DIRECT);

	return res.status(200).send(llm_response);
});

app.get('/task/delete');

app.get('/exec/');
app.get('/exec/allExec', async (_, res) => {
	const execs = await getExec('*');
	return res.status(200).send(execs);
});
app.get('/exec/newExec', async (req, res) => {
	const exec_id = await taskInsert(req, TaskType.EXECUTION);
	const llm_response = await run(exec_id, TaskType.EXECUTION);
	
	const validated = await validate(exec_id);
	return res.status(200).send(llm_response);
});
app.get('/exec/deleteExec');

app.get('/job/');
app.get('/job/allJobs');
app.get('/job/newJob', async (req, res) => {
	const successful = taskInsert(req, TaskType.JOB);
	return res.status(200).send(successful);
});
app.get('/job/deleteJob');
