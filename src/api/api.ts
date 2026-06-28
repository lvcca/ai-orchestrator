import { app } from '../server/server.ts';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../logger/logger.ts';
import {
	getHeader,
	newExec,
	run,
	GeneralInsert,
	validate,
} from './api_util.ts';
import { TaskType } from '../state/types.ts';
import { deleteExec, deleteJob, deleteTask, getExec } from '../state/util.ts';
import { redisGet, redisGetAll } from '../state/state.ts';
import { parseJsonSafe, summarize } from '../worker/util.ts';
import { ManageTransaction } from '../service/TransactionManager.ts';
import { isValidUUID } from '../util/InputValidation.ts';

const logger = getLogger('api');

// all incoming traffic
app.use((req, res, next) => {
	let id: string = randomUUID();

	try {
		let _id = getHeader(req, 'id');
		if (isValidUUID(_id)) id = _id;
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

	return res.status(200).send(out);
});

app.get('/task/newTaskDirect', async (req, res) => {
	const task_id = await GeneralInsert({ req, type: TaskType.TASK_DIRECT });
	const llm_response = await run(task_id, TaskType.TASK_DIRECT);

	return res.status(200).send(llm_response);
});

app.get('/task/newTask', async (req, res) => {
	const task_id = await GeneralInsert({ req, type: TaskType.TASK });
	const llm_response = await run(task_id, TaskType.TASK_DIRECT);

	return res.status(200).send(llm_response);
});

app.get('/task/delete', async (req, res) => {
	const id = getHeader(req, 'id');
	if (!id) res.status(400).send('invalid request');
	const del = await deleteTask(id);
	return res.status(200).send(`del response: ${del}`);
});

app.get('/exec/');
app.get('/exec/allExec', async (_, res) => {
	const execs = await getExec('*');
	return res.status(200).send(execs);
});

app.get('/exec/newExec', async (req, res) => {
	return await newExec({ req, res });
});
app.get('/exec/deleteExec', async (req, res) => {
	const id = getHeader(req, 'id');
	if (!id) res.status(400).send('invalid request');
	const del = await deleteExec(id);
	return res.status(200).send(`del response: ${del}`);
});

app.get('/job/');
app.get('/job/allJobs');
app.get('/job/newJob', async (req, res) => {
	const successful = await GeneralInsert({ req, type: TaskType.JOB });
	return res.status(200).send(successful);
});
app.get('/job/deleteJob', async (req, res) => {
	const id = getHeader(req, 'id');
	if (!id) res.status(400).send('invalid request');
	const del = await deleteJob(id);
	return res.status(200).send(`del response: ${del}`);
});
