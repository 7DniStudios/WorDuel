import winston from 'winston';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const level = () => {
  const env = process.env.DEV_ENVIRONMENT || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'info';
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`,
  ),
);

// We may want to use JSON for easier parsing of logs.
// const jsonFormat = winston.format.combine(
//   winston.format.timestamp(),
//   winston.format.json()
// );

export const logger = winston.createLogger({
  level: level(),
  levels,
  transports: [
    new winston.transports.Console({
      format: consoleFormat
    }),
    // Not really useful when running in docker, but when we deploy... (we won't but if we do...)
    // new winston.transports.File({
    //   filename: 'logs/error.log',
    //   level: 'error',
    //   format: jsonFormat
    // })
  ],
});
