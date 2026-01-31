import { Router } from 'express';

import { authRouter } from './AuthRoutes';
import { userRouter } from './UserRoutes';
import { gameRouter } from './GameRoutes';

export const mainRouter = Router();

mainRouter.get('/', (_, res) => res.render('index'));
mainRouter.use('/auth', authRouter);
mainRouter.use('/user', userRouter);
mainRouter.use('/game', gameRouter);

// TODO: Remove this! This is a debug route to test HTMX.
mainRouter.get('/toggle', (req, res) => {
  const currentText = req.query.text as string;
  const nextText = currentText === 'Ping' ? 'Pong' : 'Ping';

  res.render('partials/test_button', { layout: false, label: nextText }, (err, html) => {
    if (err) {
      throw err;
    } else {
      res.send(html);
    }
  });
});

