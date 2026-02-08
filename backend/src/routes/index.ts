import { Router, Request, Response } from 'express';

import { LoginLocals } from '../middleware/AuthMiddleware';

import * as GameService from '../service/GameService';
import { authRouter } from './AuthRoutes';
import { userRouter } from './UserRoutes';
import { gameRouter } from './GameRoutes';
import { friendRequestRouter } from './FriendRequestRoutes';
import { getLeaders, getUserPosition } from '../service/LeaderboardsService';
import { logger } from '../logging/logger';

export const mainRouter = Router();

mainRouter.get('/', async (_, res) => res.render('index', { mockGuesses: await GameService.getMockGuesses() }));
mainRouter.use('/auth', authRouter);
mainRouter.use('/user', userRouter);
mainRouter.use('/game', gameRouter);
mainRouter.use('/friend_request', friendRequestRouter);


mainRouter.get('/leaderboards', async (req: Request, res: Response<any, LoginLocals>) => {
  const user_id = res.locals.logged_in_user?.user_id ?? null

  const leaders = await getLeaders();
  const user_ranking = (user_id !== null) ? await getUserPosition(user_id) : {} ;
  res.render("leaderboards", {leaders: leaders, user_ranking: user_ranking});
})


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

