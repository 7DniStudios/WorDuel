import { Router } from 'express';

import * as AuthController from '../controller/AuthController';
import * as AuthMiddleware from '../middleware/AuthMiddleware';

export const authRouter = Router();

authRouter.post('/register', AuthController.registerUser);
authRouter.get('/register', AuthController.renderRegisterPage);

authRouter.get('/login', AuthController.renderLoginPage);
authRouter.post('/login', AuthMiddleware.getUser, AuthController.loginUser);

authRouter.get('/logout', AuthController.logoutUser);

authRouter.post('/update_data', AuthController.updateData);
