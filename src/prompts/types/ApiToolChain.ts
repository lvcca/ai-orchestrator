type UUID = string & { __brand: 'uuid' };

type Tool_Output = {
	taskid: UUID;
	identified_internal_tools_required: {
		Tool: Tool;
		Params: Parameter[];
		Justification: string;
		ExecutionTime: Date;
	}[];
	completed_task: boolean;
};

type Parameter = {
	name: string;
	type: string;
	value: string;
	required?: boolean;
};

type Tool = {
	name: string;
	description: string;
	parameters: Parameter[];
	return?: Parameter;
};

const FileSystemSchema: Tool[] = [
	{
		name: 'current_working_directory',
		description:
			'Get current working directory.',
		parameters: [],
		return: {
			name: 'directory name',
			type: 'string',
			value:
				'String of current working directory.',
			required: true,
		},
	},

	{
		name: 'list_directory',
		description:
			'List files and directories inside the workspace.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				value:
					'Relative path inside the workspace root.',
				required: true,
			},
		],
		return: {
			name: 'entries',
			type: 'array<object>',
			value:
				'List of files and directories with name, type, and size.',
			required: true,
		},
	},

	{
		name: 'read_file',
		description:
			'Read a UTF-8 text file inside the workspace.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				value:
					'Relative file path inside the workspace root.',
				required: true,
			},
		],
		return: {
			name: 'content',
			type: 'object',
			value:
				'Contains file path and UTF-8 file content.',
			required: true,
		},
	},

	{
		name: 'write_file',
		description:
			'Write UTF-8 text content to a file inside the workspace.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				value:
					'Relative file path inside the workspace root.',
				required: true,
			},
			{
				name: 'content',
				type: 'string',
				value:
					'UTF-8 text content to write.',
				required: true,
			},
		],
		return: {
			name: 'result',
			type: 'object',
			value:
				'Contains success status and written file path.',
			required: true,
		},
	},

	{
		name: 'append_file',
		description:
			'Append UTF-8 text content to a file inside the workspace.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				value:
					'Relative file path inside the workspace root.',
				required: true,
			},
			{
				name: 'content',
				type: 'string',
				value:
					'UTF-8 text content to append.',
				required: true,
			},
		],
		return: {
			name: 'result',
			type: 'object',
			value:
				'Contains success status and updated file path.',
			required: true,
		},
	},

	{
		name: 'create_directory',
		description:
			'Create a directory inside the workspace.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				value:
					'Relative directory path inside the workspace root.',
				required: true,
			},
		],
		return: {
			name: 'result',
			type: 'object',
			value:
				'Contains success status and created directory path.',
			required: true,
		},
	},

	{
		name: 'move_file',
		description:
			'Move or rename a file inside the workspace.',
		parameters: [
			{
				name: 'src',
				type: 'string',
				value:
					'Source file path inside the workspace.',
				required: true,
			},
			{
				name: 'dst',
				type: 'string',
				value:
					'Destination file path inside the workspace.',
				required: true,
			},
		],
		return: {
			name: 'result',
			type: 'object',
			value:
				'Contains success status, source path, and destination path.',
			required: true,
		},
	},

	{
		name: 'copy_file',
		description:
			'Copy a file inside the workspace.',
		parameters: [
			{
				name: 'src',
				type: 'string',
				value:
					'Source file path inside the workspace.',
				required: true,
			},
			{
				name: 'dst',
				type: 'string',
				value:
					'Destination file path inside the workspace.',
				required: true,
			},
		],
		return: {
			name: 'result',
			type: 'object',
			value:
				'Contains success status, source path, and destination path.',
			required: true,
		},
	},

	{
		name: 'delete_file',
		description:
			'Delete a file inside the workspace.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				value:
					'Relative file path inside the workspace root.',
				required: true,
			},
		],
		return: {
			name: 'result',
			type: 'object',
			value:
				'Contains success status and deleted file path.',
			required: true,
		},
	},

	{
		name: 'file_exists',
		description:
			'Check whether a file or directory exists inside the workspace.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				value:
					'Relative path inside the workspace root.',
				required: true,
			},
		],
		return: {
			name: 'exists',
			type: 'boolean',
			value:
				'Whether the file or directory exists.',
			required: true,
		},
	},

	{
		name: 'execute_shell',
		description:
			'Execute command with system shell.',
		parameters: [
			{
				name: 'command',
				type: 'string',
				value: 'Shell command to execute.',
				required: true,
			},
		],
		return: {
			name: 'result',
			type: 'object',
			value:
				'Contains input, output, and error as string members.',
			required: true,
		},
	},

	{
		name: 'search_files',
		description:
			'Search for files inside the workspace by filename pattern.',
		parameters: [
			{
				name: 'directory',
				type: 'string',
				value:
					'Directory path to search inside.',
				required: true,
			},
			{
				name: 'pattern',
				type: 'string',
				value:
					"Filename pattern such as '*.py'.",
				required: false,
			},
		],
		return: {
			name: 'matches',
			type: 'array<string>',
			value: 'List of matching file paths.',
			required: true,
		},
	},

	{
		name: 'read_text_chunks',
		description:
			'Read a portion of a text file by line range inside the workspace.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				value:
					'Relative text file path inside the workspace root.',
				required: true,
			},
			{
				name: 'start_line',
				type: 'integer',
				value: 'Starting line number.',
				required: true,
			},
			{
				name: 'end_line',
				type: 'integer',
				value: 'Ending line number.',
				required: true,
			},
		],
		return: {
			name: 'chunk',
			type: 'object',
			value:
				'Contains extracted text content and requested line range.',
			required: true,
		},
	},
];
