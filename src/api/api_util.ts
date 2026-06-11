import type { Request } from 'express';
import { type Transaction, Status, TaskType } from '../state/types.ts';
import {getLogger} from '../logger/logger.ts';
import { redisExists } from '../state/state.ts';
import { setExec, setJob, setTask } from '../state/util.ts';
import crypto from 'node:crypto';

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
				req: [task],
				res: [],
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
