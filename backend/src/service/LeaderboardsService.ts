import { db } from '../config/db';
import { logger } from '../logging/logger';


export interface PlayerData {
  username: string;
  user_id: number;
  games: number;
}

export interface LeadersData {
  games_played: PlayerData[];
  games_won: PlayerData[];
}

export interface UserRanking {
  games_played: number;
  games_won: number;
}

export async function getLeaders(): Promise<LeadersData> {
  try {
    const games_played = await db.manyOrNone<PlayerData>('SELECT username, user_id, games_played AS games FROM users ORDER BY games DESC LIMIT 20;');
    const games_won = await db.manyOrNone<PlayerData>('SELECT username, user_id, games_won AS games FROM users ORDER BY games DESC LIMIT 20;');
    return { games_played: games_played, games_won: games_won };
  } catch (err) {
    logger.error("Error in getFriends:", err);
    return { games_played: [], games_won: [] };
  }
}

export async function getUserPosition(user_id: number): Promise<UserRanking> {
  try {
    return await db.one<UserRanking>('SELECT games_played, games_won FROM users WHERE user_id = $(user_id);', { user_id });
  } catch (err) {
    logger.error("Error in getFriends:", err);
    return { games_played: 0, games_won: 0 };
  }
}