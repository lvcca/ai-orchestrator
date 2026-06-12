// filesystem.ts

import fs from 'fs/promises';
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

export const list_directory = async (dirPath: string): Promise<string> => (await fs.readdir(resolvePath(dirPath))).join(',');

export const read_file = (filePath: string): Promise<string> => {
	return fs.readFile(resolvePath(filePath), 'utf8');
};

export const write_file = async (
	filePath: string,
	content: string,
): Promise<string> => {
	let success = 'FAILED'
	try{
		await fs.writeFile(resolvePath(filePath), content, 'utf8');
		success = `write_file: ${resolvePath(filePath)} SUCCESS!`
	}
	catch(_){}

	return success
};

export const append_file = async (
	filePath: string,
	content: string,
): Promise<string> => {
	let success = 'FAILED'

	try{ 
		await fs.appendFile(resolvePath(filePath), content, 'utf8');
		success = `append_file: ${resolvePath(filePath)} SUCCESS!`
	}
	catch(_){}

	return success
};

export const create_directory = async (
	dirPath: string,
): Promise<string> => {

	let success = 'FAILED'

	try{ 
		await fs.mkdir(resolvePath(dirPath), { recursive: true });
		success = `create_directory: ${resolvePath(dirPath)} SUCCESS!`
	}
	catch(_){}

	return success
};

export const move_file = async (src: string, dst: string): Promise<string> => {
	let success = 'FAILED'

	try{ 
		await fs.rename(resolvePath(src), resolvePath(dst));
		success = `move_file: (src: ${resolvePath(src)}, dst: ${resolvePath(dst)}) SUCCESS!`
	}
	catch(_){}

	return success
};

export const copy_file = async (src: string, dst: string): Promise<string> => {
	let success = 'FAILED'

	try{ 
		await fs.copyFile(resolvePath(src), resolvePath(dst));
		success = `copy_file: (src: ${resolvePath(src)}, dst: ${resolvePath(dst)}) SUCCESS!`
	}
	catch(_){}

	return success
};

export const delete_file = async (filePath: string): Promise<string> => {
	let success = 'FAILED'

	try { 
		await fs.unlink(resolvePath(filePath));
		success = `copy_file: (path: ${resolvePath(filePath)}) SUCCESS!`
	}
	catch(_){}

	return success
};

export const file_exists = async (filePath: string): Promise<string> => {
	try {
		const stat = await fs.stat(resolvePath(filePath));
		return String(stat.isFile());
	} catch {
		return String(false);
	}
};

export const currentWorkingDirectory = async (): Promise<string> => process.cwd();

export interface ShellContext {
	input: string;
	output?: string;
	error?: string;
}

export const execute_shell = async (command: string): Promise<string> => {
	const shellContext: ShellContext = {
		input: command,
		output: undefined,
		error: undefined,
	};

	try {
		const { stdout, stderr } = await execAsync(command);
		shellContext.error = stderr;
		shellContext.output = stdout;
	} catch (e) {
		const msg = `something went wrong in executeShell ${JSON.stringify(e, null, 2)} `;
		if (!shellContext.error) shellContext.error = msg;
		logger.error(msg);
	}

	logger.debug(`shellContext: ${JSON.stringify(shellContext)}`);

	return JSON.stringify(shellContext);
};

export const search_files = async (
	directory: string,
	pattern = '*',
): Promise<string> => {
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

	return results.join(',');
};

// -------------------
// REGISTRATION ENTRYPOINT
// -------------------

export function RegisterTools(registry: ToolRegistry): void {
	registry.register(
		'current_working_directory',
		currentWorkingDirectory,
		'filesystem',
	);
	
	registry.register('list_directory', list_directory, 'filesystem');
	registry.register('read_file', read_file, 'filesystem');
	registry.register('write_file', write_file, 'filesystem');
	registry.register('append_file', append_file, 'filesystem');
	registry.register('create_directory', create_directory, 'filesystem');
	registry.register('move_file', move_file, 'filesystem');
	registry.register('copy_file', copy_file, 'filesystem');
	registry.register('delete_file', delete_file, 'filesystem');
	registry.register('file_exists', file_exists, 'filesystem');
	registry.register('search_files', search_files, 'filesystem');
	// registry.register('read_text_chunks', read_text_chunks, 'filesystem');
	registry.register('execute_shell', execute_shell, 'filesystem');
}
