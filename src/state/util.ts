import {
	redisGet,
	redisSet,
} from './state.ts';
import {
	RedisObject,
	TaskType,
} from './types.ts';
import logger from '../logger/logger.ts';

export const setTask = async (
	obj: RedisObject,
) => {
	if (
		obj.type !== undefined &&
		obj.type !== TaskType.TASK &&
		obj.type !== TaskType.TASK_DIRECT
	)
		throw new Error(
			`task type mismatch: requested: ${obj.type}, expected ${TaskType.TASK} || ${TaskType.TASK_DIRECT}`,
		);

	const successful = await redisSet(obj);
	logger.info(
		`setTask: successful ${successful}`,
	);
	return successful;
};

export const setExec = async (
	obj: RedisObject,
) => {
	if (obj.type !== TaskType.EXECUTION)
		throw new Error(
			`task type mismatch: requested: ${obj.type}, expected ${TaskType.EXECUTION}`,
		);
	const successful = await redisSet(obj);
	return successful;
};

export const setJob = async (
	obj: RedisObject,
) => {
	if (obj.type !== TaskType.JOB)
		throw new Error(
			`task type mismatch: requested: ${obj.type}, expected ${TaskType.JOB}`,
		);
	const successful = await redisSet(obj);
	return successful;
};

export const getTask = async (
	id: string,
) => {
	const entry = await redisGet(id);
	if (
		entry &&
		entry?.type !== TaskType.TASK &&
		entry?.type !== TaskType.TASK_DIRECT
	)
		throw new Error(
			`task type mismatch: requested ${TaskType.TASK} || ${TaskType.TASK_DIRECT} received: ${entry?.type}`,
		);
	return entry;
};

export const getExec = async (
	id: string,
) => {
	const entry = await redisGet(id);
	if (
		entry &&
		entry?.type !== TaskType.EXECUTION
	)
		throw new Error(
			`task type mismatch: requested ${TaskType.EXECUTION} received: ${entry?.type}`,
		);
	return entry;
};

export const getJob = async (id: string) => {
	const entry = await redisGet(id);
	if (entry && entry?.type !== TaskType.JOB)
		throw new Error(
			`task type mismatch: requested ${TaskType.JOB} received: ${entry?.type}`,
		);
	return entry;
};
