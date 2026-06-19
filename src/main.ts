import { _env } from './env.ts';
import { app, port } from './server/server.ts';
import './api/api.ts';
import { getLogger } from './logger/logger.ts';
import { registry } from './tools/ToolBootstrap.ts';
import './tools/ToolBootstrap.ts';
import { hostname } from 'node:os';

const logger = getLogger('main');

app.listen(port, () => {
	const msg =
		`Found schemas: ${JSON.stringify(registry.listSchemas())}, ` +
		`registered tools: ${JSON.stringify(registry.listTools())}\n.` +
		`Server started on hostname:port: ${hostname()}:${port}, env: ${JSON.stringify(_env)}`;

	logger.info(msg);
});
