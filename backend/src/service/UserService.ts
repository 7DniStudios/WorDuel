import bcrypt from 'bcrypt'
import jwt, { JwtPayload } from 'jsonwebtoken';

import { db } from '../config/db';
import { logger } from '../logging/logger';

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
