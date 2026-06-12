// https://stackoverflow.com/questions/51012150/winston-3-0-colorize-whole-output-on-console

import { createLogger, format, transports, addColors } from 'winston';
const { combine, colorize, label, timestamp, json, prettyPrint, printf } = format;

let _format = format.combine(
  json({space: 1}),
  colorize({ message: true }),
  timestamp({ format: 'YY-MM-DD HH:MM:SS' }),
  printf(
    (info) =>
      ` ${info.timestamp}  ${String(info.level).toUpperCase()} : ${info.message}`
  )
);

addColors({
  info: 'bold cyan',
  warn: 'bold yellow',
  error: 'bold red',
  debug: 'bold white',
});

const logger = createLogger({
  level: 'debug',
  transports: [new transports.Console()],
  format: combine(_format),
});

export const getLogger = (filename: string) => logger.child({ filename });
