import { _env } from './env.ts';
import { app, port } from './server/server.ts';
import './api/api.ts';
import logger from './logger/logger.ts';

app.listen(port, () => {
	logger.info(`Server started on port ${port}, env: ${_env}`);
});
