import { _env } from './env.ts';
import { app, port } from './server/server.ts';
import './api/api.ts';
import logger from './logger/logger.ts';
import { registry } from './tools/ToolBootstrap.ts';
import './tools/ToolBootstrap.ts'

app.listen(port, () => {
	logger.info(`registered tools: ${JSON.stringify(registry.listTools())}`)
	logger.info(`Server started on port ${port}, env: ${JSON.stringify(_env)}`);
});
	