import winston from 'winston';

const logger: winston.Logger = winston.createLogger({
	level: 'debug',
	format: winston.format.json(),
	transports: [
		new winston.transports.Console({
			format: winston.format.colorize(),
			forceConsole: true,
		})
	],
});

export const getLogger = (filename: string) => logger.child({filename})