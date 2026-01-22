import { NextFunction, Request, Response } from 'express';

import bcrypt from 'bcrypt'
import jwt, { JwtPayload } from 'jsonwebtoken';

import { db } from './db';
import { logger } from './logging/logger';

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

export interface LoginLocalsEnsured {
  logged_in_user: {
    user_id: number;
    username: string;
  }
}

export async function getUser(
  req: Request<{}, {}, LoginInput>,
  res: Response<any, LoginLocalsEnsured>,
  next: NextFunction){
  const { email, password } = req.body;

  if (password === undefined || password.length == 0) {
    next(new Error(`Password is ${typeof password} instead of a string`));
    return;
  }

  try {
    let data = await db.oneOrNone(
      `SELECT user_id, username, password_hash
        FROM users
        WHERE email = $(email);`,
      { email });

    // Check both 'atomically'. Do not differentiate between wrong password and non-existent user.
    const canLogin = data && await bcrypt.compare(password, data.password_hash);
    if (canLogin) {
      res.locals.logged_in_user = {
        user_id: data.user_id,
        username: data.username
      };
      next();
    } else {
      // TODO: Might want to log unsuccessful login attempts
      res.status(401).json({ message: "Invalid credentials" }).end();
    }
  } catch (err) {
    logger.error("Error in getUser:", err);
    return res.status(500).end();
  }
}

export const jwtSecret = (() => {
  if (typeof process.env.JWT_SECRET === 'undefined') {
    throw new Error("Variable ${JWT_SECRET} undefined");
  } else {
    return process.env.JWT_SECRET;
  }
})();

interface UserPayload extends JwtPayload {
  user_id: number;
  username: string;
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
  
  const token = sessionCookie;

  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Invalid token", error: err.message }).end();
    }
    
    if (decoded && typeof decoded !== "string" && (decoded as UserPayload).user_id) {
      const payload = decoded as UserPayload;
      res.locals.logged_in_user = {
        user_id: payload.user_id,
        username: payload.username,
      };
      return next();
    } else {
      return res.status(403).json({ message: "Token does not contain user data" }).end();
    }
  })
}
