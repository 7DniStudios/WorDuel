import { db } from '../config/db';
import { logger } from '../logging/logger';


export interface FullFriendRequest {
  id: number;
  sender_id: number;
  reciever_id: number;
  send_time: Date;
}

export interface Result {
  success: Boolean;
}


export async function getFriendRequestById(request_id: number): Promise<FullFriendRequest | null> {
  try {
    const data = await db.oneOrNone<FullFriendRequest>(
      `SELECT id, sender_id, reciever_id, send_time 
        FROM friend_requests
        WHERE id = $(request_id)`,
      { request_id });

    return data;
  } catch (err) {
    logger.error("Error in getFriendRequestById:", err);
    return null;
  }
}

export async function acceptFriendRequest(request_id: number): Promise<Result> {
  try {
    await db.oneOrNone(`SELECT accept_friend_request( $(request_id) )`, { request_id });
    return {success: true};
  } catch (err) {
    logger.error("Error in FriendRequestService.acceptFriendRequest:", err);
    return {success: false};
  }
}

export async function rejectFriendRequest(request_id: number): Promise<Result> {
  try {
    await db.none(`DELETE FROM friend_requests WHERE id = $(request_id)`, {request_id});
    return {success: true};
  } catch (err) {
    logger.error("Error in FriendRequestService.rejectFriendRequest:", err);
    return {success: false};
  }
}