// https://stackoverflow.com/questions/51012150/winston-3-0-colorize-whole-output-on-console

import winston, { createLogger, format, transports, addColors } from 'winston';
const { combine, colorize, label, timestamp, json, prettyPrint, printf } = format;

let myCustomFormat = format.combine(
  json({space: 2}),
  colorize({ all: true }),
  label({ label: '[LOGGER]' }),
  timestamp({ format: 'YY-MM-DD HH:MM:SS' }),
  printf(
    (info) =>
      ` ${info.label} ${info.timestamp}  ${info.level} : ${info.message}`
  )
);

addColors({
  info: 'bold blue', // fontStyle color
  warn: 'italic yellow',
  error: 'bold red',
  debug: 'white',
});

const logger = createLogger({
  level: 'debug',
  transports: [new transports.Console({ format: combine(myCustomFormat) })],
});

export const getLogger = (filename: string) => logger.child({ filename });
