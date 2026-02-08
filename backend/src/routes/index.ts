import { Router } from 'express';

import * as GameService from '../service/GameService';
import { authRouter } from './AuthRoutes';
import { userRouter } from './UserRoutes';
import { gameRouter } from './GameRoutes';
import { friendRequestRouter } from './FriendRequestRoutes';

export const mainRouter = Router();

mainRouter.get('/', async (_, res) => res.render('index', { mockGuesses: await GameService.getMockGuesses() }));
mainRouter.use('/auth', authRouter);
mainRouter.use('/user', userRouter);
mainRouter.use('/game', gameRouter);
mainRouter.use('/friend_request', friendRequestRouter);

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

