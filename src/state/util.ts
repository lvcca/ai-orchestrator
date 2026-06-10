import { redisGet, redisSet } from './state.ts';
import { Transaction, TaskType } from './types.ts';
import logger from '../logger/logger.ts';

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

type TransactionChild = {
	related?: {
		task_id?: string;
		exec_id?: string;
		job_id?: string;
	};
};

export const setExec = async (
	tx: Transaction & TransactionChild & { exec?: string },
) => {
	if (tx.type !== TaskType.EXECUTION)
		throw new Error(
			`task type mismatch: requested: ${tx.type}, expected ${TaskType.EXECUTION}`,
		);
	const successful = await redisSet(tx);
	return successful;
};

export const setJob = async (
	tx: Transaction & TransactionChild & { job?: string },
) => {
	if (tx.type !== TaskType.JOB)
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
