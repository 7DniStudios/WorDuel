import morgan, { StreamOptions } from 'morgan';
import { logger } from './logger';

const stream: StreamOptions = {
  write: (message) => logger.http(message.trim()),
};

const skip = () => {
  const env = process.env.DEV_ENVIRONMENT || 'development';
  return env !== 'development';
};

// Middleware for express that will log the HTTP requests when running in a 'development' environment.
export const morganMiddleware = morgan(
  ":method :url :status :res[content-length] - :response-time ms",
  { stream, skip }
);
