import { Router } from 'express';

import * as UserController from '../controller/UserController';

export const userRouter = Router();

userRouter.get('/interactive-friend-button/:userID', UserController.interactiveButton)

userRouter.get('/:userID', UserController.renderUserSite);
