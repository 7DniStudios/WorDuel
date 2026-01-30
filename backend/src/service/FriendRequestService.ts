import { db } from '../config/db';
import { logger } from '../logging/logger';


export interface FullFriendRequest {
  friends_id: number;
  sender_id: number;
  reciever_id: number;
}

export interface Result {
  success: Boolean;
}


export async function getFriendRequestById(friends_id: number): Promise<FullFriendRequest | null> {
  try {
    const data = await db.oneOrNone<FullFriendRequest>(
      `SELECT friends_id, sender_id, reciever_id 
        FROM friend_requests
        WHERE friends_id = $(friends_id)`,
      { friends_id });

    return data;
  } catch (err) {
    logger.error("Error in getFriendRequestById:", err);
    return null;
  }
}

export async function acceptFriendRequest(friends_id: number): Promise<Result> {
  try {
    await db.oneOrNone(`SELECT accept_friend_request( $(friends_id) )`, { friends_id });
    return {success: true};
  } catch (err) {
    logger.error("Error in FriendRequestService.acceptFriendRequest:", err);
    return {success: false};
  }
}

export async function deleteFriendRequest(friends_id: number): Promise<Result> {
  try {
    await db.none(`DELETE FROM friend_relation WHERE friends_id = $(friends_id)`, {friends_id});
    return {success: true};
  } catch (err) {
    logger.error("Error in FriendRequestService.deleteFriendRequest:", err);
    return {success: false};
  }
}