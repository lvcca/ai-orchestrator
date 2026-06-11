export type Prompt = {
	req?: string[];
	res?: string[];
};

export const Status = {
	FAILED: -1,
	QUEUED: 0,
	RUNNING: 1,
	COMPLETED: 2,
	HALTED: 3,
} as const;

export type Status = (typeof Status)[keyof typeof Status];

export type _Status = {
	status: Status;
	message?: string;
};

export const TaskType = {
	TASK_DIRECT: -1,
	TASK: 0,
	EXECUTION: 1,
	JOB: 2,
} as const;

export type TaskType = (typeof TaskType)[keyof typeof TaskType];

export type Related = {
	job?: 	string [],
	task?: 	string[],
	exec?: 	string[],
} | undefined

export type Transaction = {
	id: 		string;
	type?: 		TaskType;
	status?: 	_Status;
	prompt?: 	Prompt;
	related?: 	Related
	result?: 	string; // final llm response
};
