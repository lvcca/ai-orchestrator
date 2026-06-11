import { ValidatorResponse } from '../prompts/types/TaskValidator.ts';

export type Prompt = {
	userRequest?: string[];
	llmResponse?: string[];
};

export const Status = {
	FAILED: 'FAILED',
	QUEUED: 'QUEUED',
	RUNNING: 'RUNNING',
	COMPLETED: 'COMPLETED',
	HALTED: 'HALTED',
} as const;

export type Status = (typeof Status)[keyof typeof Status];

export type _Status = {
	status: Status;
	message?: string;
};

export const TaskType = {
	TASK_DIRECT: 'TASK_DIRECT',
	TASK: 'TASK',
	EXECUTION: 'EXECUTION',
	JOB: 'JOB',
} as const;

export type TaskType = (typeof TaskType)[keyof typeof TaskType];

export type Related =
	| {
			job?: string[];
			task?: string[];
			exec?: string[];
	  }
	| undefined;

export type Transaction = {
	id: string;
	type?: TaskType;
	status?: _Status;
	prompt?: Prompt;
	related?: Related;
	result?: string; // final llm response
	validatorResponse?: ValidatorResponse;
};
