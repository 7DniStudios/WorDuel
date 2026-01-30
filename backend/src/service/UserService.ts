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

// UserService
export interface FriendData {
  username: string;
  user_id: number;
  friends_since: Date;
}

export interface FriendRequest {
  friends_id: number;
  username: string;
  user_id: number;
}

export async function getFriends(user_id: number): Promise<FriendData[]> {
  try {
    return await db.manyOrNone<FriendData>('SELECT username, user_id, friends_since FROM users JOIN friends_lookup ON (user_id=snd) WHERE fst = $(user_id);', { user_id });
  } catch (err) {
    logger.error("Error in getFriends:", err);
    return [];
  }
}

export async function getSentFriendRequests(user_id: number): Promise<FriendRequest[]> {
  try {
    return await db.manyOrNone<FriendRequest>('SELECT friends_id, username, user_id FROM users JOIN friend_requests ON (user_id=reciever_id) WHERE sender_id = $(user_id);', { user_id });
  } catch (err) {
    logger.error("Error in getSentFriendRequests:", err);
    return [];
  }
}

export async function getReceivedFriendRequests(user_id: number): Promise<FriendRequest[]> {
  try {
    return await db.manyOrNone<FriendRequest>('SELECT friends_id, username, user_id FROM users JOIN friend_requests ON (user_id=sender_id) WHERE reciever_id = $(user_id);', { user_id });
  } catch (err) {
    logger.error("Error in getReceivedFriendRequests:", err);
    return [];
  }
}

export async function isFriendOf(user_id: number, other_user_id: number): Promise<boolean> {
  try {
    return await db.oneOrNone('SELECT 1 FROM friends_lookup WHERE fst=$(user_id) AND snd=$(other_user_id);', { user_id, other_user_id })
      .then(result => result !== null);
  } catch (err) {
    logger.error("Error in isFriendOf:", err);
    return false;
  }
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
