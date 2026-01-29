import bcrypt from 'bcrypt'
import jwt, { JwtPayload } from 'jsonwebtoken';

import { db } from '../config/db';
import { logger } from '../logging/logger';

export const jwtSecret = (() => {
  if (typeof process.env.JWT_SECRET === 'undefined') {
    throw new Error("Variable JWT_SECRET undefined");
  } else {
    return process.env.JWT_SECRET;
  }
})();

export async function generateToken(user_id: number, username: string): Promise<string> {
  const payload: UserPayload = {
    user_id,
    username
  };
  return jwt.sign(payload, jwtSecret, { expiresIn: '7d' });
}

// bcrypt setup
const saltRounds = 10;

const UniqueViolation = '23505';
interface PgError extends Error {
  code: string;
  constraint?: string;
}

export type RegisterError = 'EMAIL_TAKEN' | 'USERNAME_TAKEN' | 'SERVER_ERROR';
export type RegisterResult = 
  | { success: true; userPayload: UserPayload }
  | { success: false; error: RegisterError };

export async function registerUser(email: string, passwordPlain: string, username: string): Promise<RegisterResult> {
  let hash = await bcrypt.hash(passwordPlain, saltRounds);

  try {
    await db.none(
      `INSERT INTO users(email, password_hash, username)
        VALUES ($(email), $(hash), $(username))`,
      { email, hash, username }
    );

    return { success: true, userPayload: /* TODO: get the inserted user id! */ { user_id: 0, username } };
  } catch (err) {
    const error = err as PgError;
    if (error.code === UniqueViolation) {
      let message = 'SERVER_ERROR' as RegisterError;

      if (error.constraint === 'unique_username') {
        message = 'USERNAME_TAKEN';
      } else if (error.constraint === 'unique_email') {
        message = 'EMAIL_TAKEN';
      }

      return { success: false, error: message };
    }

    logger.error("Error in registerUser:", err);
    return { success: false, error: 'SERVER_ERROR' };
  }
}


export interface UserPayload extends JwtPayload {
  user_id: number;
  username: string;
}

export async function verifyCredentials(email: string, passwordPlain: string): Promise<UserPayload | null> {
  try {
    const data = await db.oneOrNone(
      `SELECT user_id, username, password_hash
        FROM users
        WHERE email = $(email);`,
      { email });

    const canLogin = data && await bcrypt.compare(passwordPlain, data.password_hash);
    if (canLogin) {
      return {
        user_id: data.user_id,
        username: data.username
      };
    } else {
      return null;
    }
  } catch (err) {
    logger.error("Error in verifyCredentials:", err);
    return null;
  }
}

export function verifyToken(token: string): UserPayload | null {
  try {
    const decoded = jwt.verify(token, jwtSecret);
    if (decoded && typeof decoded !== "string" && (decoded as UserPayload).user_id) {
      return decoded as UserPayload;
    } else {
      logger.error("Invalid token payload structure");
      return null;
    }
  } catch (err) {
    logger.error("Error in verifyToken:", err);
    return null;
  }
}

// Represents all information stored in the Database.
export interface UserData {
  user_id: number;
  email: string;

  password_hash: string;
  username: string;
  created_at: Date;
  games_played: number;
  games_won: number;
  is_public: boolean;
}

export async function getUserDataById(user_id: number): Promise<UserData | null> {
  try {
    const data = await db.oneOrNone(
      `SELECT user_id, email, password_hash, username, created_at, games_played, games_won, is_public
        FROM users
        WHERE user_id = $(user_id);`,
      { user_id });

    return data;
  } catch (err) {
    logger.error("Error in getUserDataById:", err);
    return null;
  }
}

export interface UpdateUserDataInput {
  username: string;
  email: string;
  is_public: boolean;
}

export async function updateUserData(user_id: number, input: UpdateUserDataInput): Promise<RegisterResult> {
  try {
    await db.none(
      `UPDATE users
        SET email = $(email),
          username = $(username),
          is_public = $(is_public)
        WHERE user_id = $(user_id);`,
      {
        user_id,
        email: input.email,
        username: input.username,
        is_public: input.is_public
      }
    );

    return {
      success: true,
      userPayload: {
        user_id,
        username: input.username
      }
    }
  } catch (err) {
    // TODO: DO not duplicate registration validation.
    const error = err as PgError;
    if (error.code === UniqueViolation) {
      let message = 'SERVER_ERROR' as RegisterError;

      if (error.constraint === 'unique_username') {
        message = 'USERNAME_TAKEN';
      } else if (error.constraint === 'unique_email') {
        message = 'EMAIL_TAKEN';
      }

      return { success: false, error: message };
    }

    logger.error("Error in updateUserData:", err);
    return { success: false, error: 'SERVER_ERROR' };
  }
}
