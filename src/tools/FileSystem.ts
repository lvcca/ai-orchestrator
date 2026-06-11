// filesystem.ts

import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getLogger } from '../logger/logger.ts';
import { ToolRegistry } from './ToolRegistry.ts';

const logger = getLogger('FileSystem');

const execAsync = promisify(exec);

export const WORKSPACE_ROOT = '/agent_workspace';

export class PathError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PathError';
	}
}

export const resolvePath = (userPath: string): string => {
	// const full = path.resolve(WORKSPACE_ROOT, userPath);

	// if (!full.startsWith(WORKSPACE_ROOT)) {
	//     throw new PathError(`path: ${userPath} escaped workspace`);
	// }

	// return full;

	return userPath;
};

// -------------------
// TOOL FUNCTIONS 
// -------------------

export const listDirectory = async (dirPath: string): Promise<string[]> => {
	return fs.readdir(resolvePath(dirPath));
};

export const readFile = (filePath: string): Promise<string> => {
	return fs.readFile(resolvePath(filePath), 'utf8');
};

export const writeFile = async (
	filePath: string,
	content: string,
): Promise<void> => {
	return fs.writeFile(resolvePath(filePath), content, 'utf8');
};

export const appendFile = async (
	filePath: string,
	content: string,
): Promise<void> => {
	return fs.appendFile(resolvePath(filePath), content, 'utf8');
};

export const createDirectory = async (
	dirPath: string,
): Promise<string | undefined> => {
	return fs.mkdir(resolvePath(dirPath), { recursive: true });
};

export const moveFile = async (src: string, dst: string): Promise<void> => {
	return await fs.rename(resolvePath(src), resolvePath(dst));
};

export const copyFile = async (src: string, dst: string): Promise<void> => {
	return fs.copyFile(resolvePath(src), resolvePath(dst));
};

export const deleteFile = (filePath: string): Promise<void> => {
	return fs.unlink(resolvePath(filePath));
};

export const fileExists = async (filePath: string): Promise<boolean> => {
	try {
		const stat = await fs.stat(resolvePath(filePath));
		return stat.isFile();
	} catch {
		return false;
	}
};

export const currentWorkingDirectory = async (): Promise<string> => {
	return process.cwd();
};

export interface ShellContext {
	input: string;
	output: string | null;
	error: string | null;
}

export const executeShell = async (command: string): Promise<ShellContext> => {
	const shellContext: ShellContext = {
		input: command,
		output: null,
		error: null,
	};

	try {
		const { stdout, stderr } = await execAsync(command);

		shellContext.error = stderr || null;
		shellContext.output = stdout ?? shellContext.error;

	} catch (e) {
		const msg = `something went wrong in executeShell ${JSON.stringify(e, null, 2)} `;
		if (!shellContext.error) shellContext.error = msg;
		logger.error(msg);
	}

	logger.debug(`shellContext: ${JSON.stringify(shellContext)}`);

	return shellContext;
};

export const searchFiles = async (
	directory: string,
	pattern = '*',
): Promise<string[]> => {
	const resolved = resolvePath(directory);

	const entries = await fs.readdir(resolved);

	const regex = new RegExp(
		'^' +
			pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') +
			'$',
	);

	const results: string[] = [];

	for (const entry of entries) {
		const fullPath = path.join(resolved, entry);

		const stat = await fs.stat(fullPath);

		if (stat.isFile() && regex.test(entry)) {
			results.push(entry);
		}
	}

	return results;
};

export async function* readTextChunks(
	filePath: string,
	chunkSize = 1024,
): AsyncGenerator<string> {
	const stream = createReadStream(resolvePath(filePath), {
		encoding: 'utf8',
		highWaterMark: chunkSize,
	});

	for await (const chunk of stream) {
		yield chunk;
	}
}

// -------------------
// REGISTRATION ENTRYPOINT
// -------------------

export function RegisterTools(registry: ToolRegistry): void {
	registry.register(
		'current_working_directory',
		currentWorkingDirectory,
		'filesystem',
	);

	registry.register('list_directory', listDirectory, 'filesystem');
	registry.register('read_file', readFile, 'filesystem');
	registry.register('write_file', writeFile, 'filesystem');
	registry.register('append_file', appendFile, 'filesystem');
	registry.register('create_directory', createDirectory, 'filesystem');
	registry.register('move_file', moveFile, 'filesystem');
	registry.register('copy_file', copyFile, 'filesystem');
	registry.register('delete_file', deleteFile, 'filesystem');
	registry.register('file_exists', fileExists, 'filesystem');
	registry.register('search_files', searchFiles, 'filesystem');
	registry.register('read_text_chunks', readTextChunks, 'filesystem');
	registry.register('execute_shell', executeShell, 'filesystem');
}
