import { Router } from 'express';

import * as UserController from '../controller/UserController';

export const userRouter = Router();

userRouter.get('/:userID', UserController.renderOwnSite);
