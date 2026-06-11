import { app } from '../server/server.ts';
import { randomUUID } from 'node:crypto';
import {getLogger} from '../logger/logger.ts';
import { getHeader, taskInsert } from './api_util.ts';
import { Related, TaskType, Transaction } from '../state/types.ts';
import { getExec, getTask } from '../state/util.ts';
import { redisGet, redisGetAll } from '../state/state.ts';
import { RunTask } from '../worker/TaskWorker.ts';
import { RunExec } from '../worker/ExecutionWorker.ts';
import { call_llm_task_validator, PROMPTS } from '../llm.ts';
import type { ValidatorResponse} from '../prompts/types/TaskValidator.ts'

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

const resolveRelated = async (related?: Related) => {
	logger.info(`in resolveRelated`)

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

const validate = async (id?: string) => {
	logger.info(`in validate`)

	if (!id) throw new Error(`validate requires a valid id... id: ${id}`)	 
	const entry = await redisGet(id);
	if (!entry) throw new Error(`could not find valid entry: id: ${id}`)
	
	const res = entry.result;
	const prompt = entry.prompt
	const related = entry.related

	logger.info(`res: ${res}, prompt: ${JSON.stringify(prompt)}`);
	
	const result = await call_llm_task_validator(`
	You are an Execution agent manager.
	
	Your job is to take results from a task and determine whether or not the task goal was accomplished.
						
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
	
	ONLY ACCEPTABLE OUTPUT FORMAT:
	<LLM_RESPONSE>
	${PROMPTS['task_result_validator_type']}
	</LLM_RESPONSE>
`)
	
	logger.info(`Task Validator Result: ${result}`)
}

const run = async (id: string, type: TaskType) => {
	let result: string = 'FAILED'
	
	const tx = await redisGet(id);
	const taskDirect = tx?.type === TaskType.TASK_DIRECT;
	const user_req = tx?.prompt?.req;

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

	logger.info(`validated response: ${JSON.stringify(validated)}`)

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
