import { redisDelete, redisGet, redisSet } from './state.ts';
import { Transaction, TaskType } from './types.ts';
import { getLogger } from '../logger/logger.ts';

const logger = getLogger('state_util');

export const setTask = async (tx: Transaction) => {
	if (
		tx.type !== undefined &&
		tx.type !== TaskType.TASK &&
		tx.type !== TaskType.TASK_DIRECT
	)
		throw new Error(
			`task type mismatch: requested: ${tx.type}, expected ${TaskType.TASK} || ${TaskType.TASK_DIRECT}`,
		);

	const successful = await redisSet(tx);
	logger.info(`setTask: successful ${successful}`);
	return successful;
};

export const setExec = async (tx: Transaction & { exec?: string }) => {
	if (tx.type && tx.type !== TaskType.EXECUTION)
		throw new Error(
			`task type mismatch: requested: ${tx.type}, expected ${TaskType.EXECUTION}`,
		);
	const successful = await redisSet(tx);
	return successful;
};

export const setJob = async (tx: Transaction & { job?: string }) => {
	if (tx.type && tx.type !== TaskType.JOB)
		throw new Error(
			`task type mismatch: requested: ${tx.type}, expected ${TaskType.JOB}`,
		);
	const successful = await redisSet(tx);
	return successful;
};

export const getTask = async (id: string) => {
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

export const getExec = async (id: string) => {
	const entry = await redisGet(id);
	if (entry && entry?.type !== TaskType.EXECUTION)
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

export const deleteTask = async (id: string) => {
	try {
		const entry = await redisGet(id);

		switch (entry?.type) {
			case TaskType.TASK:
			case TaskType.TASK_DIRECT:
				return await redisDelete(id);

			default:
				throw new Error(
					`task type mismatch: requested ${TaskType.TASK} || ${TaskType.TASK_DIRECT} received: ${entry?.type}`,
				);
		}
	} catch (e) {
		throw new Error(`could not find entry in deleteTask: error: ${e}`);
	}
};

export const deleteExec = async (id: string) => {
	try {
		const entry = await redisGet(id);

		if (!entry || entry?.type !== TaskType.EXECUTION)
			throw new Error(
				`task type mismatch: requested ${TaskType.EXECUTION} received: ${entry?.type}`,
			);

		return await redisDelete(id);
	} catch (e) {
		throw new Error(`could not find entry in deleteExec: error: ${e}`);
	}
};

export const deleteJob = async (id: string) => {
	try {
		const entry = await redisGet(id);

		if (!entry || entry?.type !== TaskType.JOB)
			throw new Error(
				`task type mismatch: requested ${TaskType.JOB} received: ${entry?.type}`,
			);

		return await redisDelete(id);
	} catch (e) {
		throw new Error(`could not find entry in deleteJob: error: ${e}`);
	}
};
