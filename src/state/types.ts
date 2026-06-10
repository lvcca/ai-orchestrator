export type Prompt = {
	req?: string[];
	res?: string[];
};

export const Status = {
	FAILED: -1,
	QUEUED: 0,
	STARTED: 1,
	COMPLETED: 2,
	HALTED: 3,
} as const;

export type Status = (typeof Status)[keyof typeof Status];

export const TaskType = {
	TASK_DIRECT: -1,
	TASK: 0,
	EXECUTION: 1,
	JOB: 2,
} as const;

export type TaskType = (typeof TaskType)[keyof typeof TaskType];

export type RedisObject = {
	id: string;
	type?: TaskType;
	status?: Status;
	prompt?: Prompt;
	result?: string; // final llm response
};
