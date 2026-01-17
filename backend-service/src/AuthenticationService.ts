import { NextFunction, Request, Response } from 'express';

import bcrypt from 'bcrypt'
import jwt, { JwtPayload } from 'jsonwebtoken';

import { db } from './db';

export interface LoginInput {
  email: string;
  password?: string;
}

export interface LoginLocals {
  user_id: number;
  username: string;
}

export async function getUser(
  req: Request<{}, {}, LoginInput>,
  res: Response<any, LoginLocals>,
  next: NextFunction) {
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
      res.locals = {
        user_id: data.user_id,
        username: data.username
      };
      next();
    } else {
      // TODO: Might want to log unsuccessful login attempts
      res.status(401).json({ message: "Invalid credentials" }).end();
    }
  } catch (err) {
    console.log("Error in getUser:", err);
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

export function isAuthenticated(
  req: Request,
  res: Response<any, LoginLocals>,
  next: NextFunction) {
  const authHeader = req.headers.authorization;
  // Apparently this 'Bearer ' thingy is a standard, crazy...
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: "Missing or invalid Authorization header" }).end();
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Invalid token", error: err.message }).end();
    }
    
    if (decoded && typeof decoded !== "string" && (decoded as UserPayload).user_id) {
      const payload = decoded as UserPayload;
      res.locals.user_id = payload.user_id;
      res.locals.username = payload.username;
      return next();
    } else {
      return res.status(403).json({ message: "Token does not contain user data" }).end();
    }
  })
}
