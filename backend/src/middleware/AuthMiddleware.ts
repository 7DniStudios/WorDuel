
import { NextFunction, Request, Response } from 'express';

import { logger } from '../logging/logger';
import * as AuthService from '../service/AuthService';

export interface LoginInput {
  email: string;
  password?: string;
}

export interface LoginLocals {
  logged_in_user: null | {
    user_id: number;
    username: string;
  }
}

export async function getUser(
  req: Request<{}, {}, LoginInput>,
  res: Response<any, LoginLocals>,
  next: NextFunction){
  const { email, password } = req.body;

  // TODO: Properly validate email/password.
  if (password === undefined || password.length == 0) {
    next(new Error(`Password is ${typeof password} instead of a string`));
    return;
  }

  const userPayload = await AuthService.verifyCredentials(email, password);
  if (userPayload !== null) {
    res.locals.logged_in_user = {
      user_id: userPayload.user_id,
      username: userPayload.username
    };
    next();
  } else {
    res.status(200).send("Invalid credentials"); // 200 because htmx requires this
  }
}

/*
if session cookie is present then store logged-in user data in res.local.logged_in_user
Otherwise set it to null.
*/
export function readSessionCookies(
  req: Request,
  res: Response<any, LoginLocals>,
  next: NextFunction) {
  // we are using unsigned cookies, because jwt is already secure
  const sessionCookie = req.cookies.worduelSessionCookie  as string; 
  if (!sessionCookie){
    res.locals.logged_in_user = null;
    return next();
  }

  const payload = AuthService.verifyToken(sessionCookie);
  if (payload !== null) {
    res.locals.logged_in_user = {
      user_id: payload.user_id,
      username: payload.username,
    };
  } else {
    // Invalid token? Make it disappear.
    res.locals.logged_in_user = null;
    res.clearCookie("worduelSessionCookie")
  }

  return next();
}
