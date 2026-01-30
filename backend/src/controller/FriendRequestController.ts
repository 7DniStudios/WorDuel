import { Request, Response } from 'express';

import { LoginLocals } from '../middleware/AuthMiddleware';
import { logger } from '../logging/logger';
import * as FriendRequestService from '../service/FriendRequestService';
import { FriendRequestLocals } from '../middleware/FriendRequestMiddleware';


export async function acceptFriendRequest(
  req: Request,
  res: Response<any, LoginLocals & FriendRequestLocals>
) {
  
  const user_id = res.locals.logged_in_user?.user_id;
  if (typeof user_id === 'undefined') {
    /*    This is absurd: this handler  should always be used after FriendRequestPreprocess middleware
    which already ensures that the user is logged in */
    logger.error("absurd -- user not logged-in in acceptFriendRequest")
    throw new Error("Error: absurd -- user not logged-in in acceptFriendRequest")
  }

  const { id: request_id, sender_id, reciever_id } = res.locals.friend_request_data;
  
  if (reciever_id !== user_id) {
    logger.debug("Tried to accept friend request directed at somebody else");
    return res.status(403).send("It's not up to you to accept or decline this request");
  }
  
  const {success} = await FriendRequestService.acceptFriendRequest(request_id);
  if (success){
    return res.status(200).header("HX-Refresh", "true").end()
  } else {
    logger.error("Error in accepting a friend request");
    return res.status(500).send("Internal service error -- friend request not accepted");
  }
}

export async function rejectFriendRequest(
  req: Request,
  res: Response<any, LoginLocals & FriendRequestLocals>
) {
  
  const user_id = res.locals.logged_in_user?.user_id;
  if (typeof user_id === 'undefined') {
    /*    This is absurd: this handler should always be used after FriendRequestPreprocess middleware
    which already ensures that the user is logged in */
    logger.error("absurd -- user not logged-in in rejectFriendRequest")
    throw new Error("Error: absurd -- user not logged-in in rejectFriendRequest")
  }

  const { id: request_id, sender_id, reciever_id } = res.locals.friend_request_data;
  
  if (reciever_id !== user_id) {
    logger.debug("Tried to reject friend request directed at somebody else");
    return res.status(403).send("It's not up to you to accept or decline this request");
  }
  
  const {success} = await FriendRequestService.deleteFriendRequest(request_id);
  if (success){
    return res.status(200).end()
  } else {
    logger.error("Error in rejecting a friend request");
    return res.status(500).send("Internal service error -- friend request not rejected");
  }
}

export async function cancelFriendRequest(
  req: Request,
  res: Response<any, LoginLocals & FriendRequestLocals>
) {
  
  const user_id = res.locals.logged_in_user?.user_id;
  if (typeof user_id === 'undefined') {
    /*    This is absurd: this handler should always be used after FriendRequestPreprocess middleware
    which already ensures that the user is logged in */
    logger.error("absurd -- user not logged-in in cancelFriendRequest")
    throw new Error("Error: absurd -- user not logged-in in cancelFriendRequest")
  }

  const { id: request_id, sender_id, reciever_id } = res.locals.friend_request_data;
  
  if (sender_id !== user_id) {
    logger.debug(` user ${user_id} tried to cancel a friend request that was not send by them`);
    return res.status(403).send("It's not up to you to cancel this request");
  }
  
  const {success} = await FriendRequestService.deleteFriendRequest(request_id);
  if (success){
    return res.status(200).end()
  } else {
    logger.error("Error in cancelling a friend request");
    return res.status(500).send("Internal service error -- friend request not cancelled");
  }
}