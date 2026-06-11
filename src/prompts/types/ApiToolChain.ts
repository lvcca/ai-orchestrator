type UUID = string & { __brand: 'uuid' };

export type Tool_Output = {
	taskid: UUID;
	identified_internal_tools_required: ToolEntry[];
	completed_task: boolean;
};

export type Parameter = {
	name: string;
	type: string;
	value: string;
	required?: boolean;
};

export type Tool = {
	name: string;
	description: string;
	parameters: Parameter[];
	return?: Parameter;
};

export type ToolEntry = {
	Tool: Tool;
	Params: Parameter[];
	Justification: string;
	ExecutionTime: Date;
};
