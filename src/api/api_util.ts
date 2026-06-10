import type { Request } from 'express';
import {
	type Transaction,
	Status,
	TaskType,
} from '../state/types.ts';
import logger from '../logger/logger.ts';
import { redisExists } from '../state/state.ts';
import {
	setExec,
	setJob,
	setTask,
} from '../state/util.ts';

export const getHeader = (
	req: Request,
	header: string,
) => {
	const _header = req.headers[header];

	if (
		!_header ||
		typeof _header !== 'string'
	)
		throw new Error('no valid id');
	else return _header;
};

export const taskInsert = async (
	req: Request,
	type: TaskType,
) => {
	logger.info(`in task insert`);

	let successful: boolean = false;

	const id =
		getHeader(req, 'id') ??
		crypto.randomUUID();
	const task = getHeader(req, 'task');
	const exists = await redisExists(id);

	logger.info(`exists: ${exists}`);

	if (!exists) {
		const obj: Transaction = {
			id,
			status: {
				status: Status.QUEUED,
			},
			type: TaskType.TASK,
			prompt: {
				req: [task],
				res: [],
			},
		};

		logger.info(
			`Incoming newTask: ${id}, type: ${type}`,
		);

		switch (type) {
			case TaskType.EXECUTION:
				successful = await setExec(obj);
				break;
			case TaskType.JOB:
				successful = await setJob(obj);
				break;
			case TaskType.TASK_DIRECT:
			case TaskType.TASK:
				successful = await setTask(obj);
				break;
		}

		logger.info(`successful: ${successful}`);
	}

	return id;
};
