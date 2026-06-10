import winston from 'winston';

const logger: winston.Logger = winston.createLogger({
	level: 'debug',
	format: winston.format.json(),
	transports: [
		new winston.transports.Console({
			format: winston.format.colorize(),
			forceConsole: true,
		}),
		new winston.transports.File({
			filename: 'error.log',
			level: 'error',
		}),
		new winston.transports.File({
			filename: 'combined.log',
		}),
	],
});

export default logger;
