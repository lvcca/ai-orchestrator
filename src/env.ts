import process from 'process';
import os from 'os';

export const _env = {
	...process.env,
	port: parseInt(process.env['PORT'] ?? String(8080)),
	hostname: process.env['HOSTNAME'] ?? os.hostname(),
	ollama_url: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434/',
};
