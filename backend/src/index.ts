import express, { NextFunction, Request, Response } from 'express';
import expressEjsLayouts from 'express-ejs-layouts';

import { createServer } from 'http';
import path from 'path';
import cors from 'cors';

import cookieParser from 'cookie-parser';

import { bootstrapDB } from './config/db';
import { initWebSocket } from './socket';

import { morganMiddleware } from './middleware/morgan';
import { readSessionCookies } from './middleware/AuthMiddleware';

import { mainRouter } from './routes/index';

import { logger } from './logging/logger';

const app = express();

app.set('trust proxy', 1); // We are behind nginx proxy.
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

app.use(morganMiddleware);
app.use(expressEjsLayouts);
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());
app.use(readSessionCookies)

app.use('/', mainRouter);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error(err.message);
  // TODO: Detect HTMX requests and respond with partials.
  res.status(500).render('error', { error: err });
});

const httpServer = createServer(app);
initWebSocket(httpServer);

async function bootstrap() {
  await bootstrapDB();

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to bootstrap application', err);
  process.exit(1);
});
