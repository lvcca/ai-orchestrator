import { app } from '../server/server.ts';
import { randomUUID } from 'node:crypto';
import logger from '../logger/logger.ts';
import {
	getHeader,
	taskInsert,
} from './api_util.ts';
import { TaskType } from '../state/types.ts';
import {
	getExec,
	getTask,
} from '../state/util.ts';
import {
	redisGet,
	redisGetAll,
} from '../state/state.ts';
import { RunTask } from '../worker/TaskWorker.ts';

// all incoming traffic
app.use((req, res, next) => {
	let id: string = randomUUID();

	try {
		id = getHeader(req, 'id');
	} catch (e) {
		logger.debug(
			`something went wrong getting id header, error: ${e}`,
		);
	}

	logger.debug(
		`request: ${id}, target url: ${req.url}`,
	);

	const valid = true; // just until auth is figured out

	if (valid) next();
	else res.status(400).send();
});

// all apis
app.get('/', async (_, res) => {
	return res
		.status(200)
		.send(`Hello world! ${new Date()}`);
});

app.get('/task/allTasks', async (_, res) => {
	const tasks = await redisGetAll();
	const out = [];
	if (tasks)
		for (const task of tasks) {
			const state = await getTask(task);
			out.push(state);
		}
	return res.status(200).send(out);
});

const taskStart = async (id: string) => {
	const obj = await redisGet(id);

	const user_req = obj?.prompt?.req;

	if (!user_req || user_req.length < 1)
		throw new Error(
			`no user req found for task ${id}`,
		);

	const taskDirect =
		obj.type === TaskType.TASK_DIRECT;

	const result = await RunTask(
		id,
		user_req.join(','),
		taskDirect,
	);

	logger.info(result);

	return result;
};

app.get(
	'/task/newTaskDirect',
	async (req, res) => {
		const task_id = await taskInsert(
			req,
			TaskType.TASK_DIRECT,
		);
		const llm_response =
			await taskStart(task_id);

		return res
			.status(200)
			.send(llm_response);
	},
);

app.get(
	'/task/newTask',
	async (req, res) => {
		const task_id = await taskInsert(
			req,
			TaskType.TASK,
		);
		const llm_response =
			await taskStart(task_id);

		return res
			.status(200)
			.send(llm_response);
	},
);

app.get('/task/delete');

app.get('/exec/');
app.get('/exec/allExec', async (_, res) => {
	const execs = await getExec('*');
	return res.status(200).send(execs);
});
app.get(
	'/exec/newExec',
	async (req, res) => {
		const successful = taskInsert(
			req,
			TaskType.EXECUTION,
		);
		return res.status(200).send(successful);
	},
);
app.get('/exec/deleteExec');

app.get('/job/');
app.get('/job/allJobs');
app.get('/job/newJob', async (req, res) => {
	const successful = taskInsert(
		req,
		TaskType.JOB,
	);
	return res.status(200).send(successful);
});
app.get('/job/deleteJob');
