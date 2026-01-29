import { NextFunction, Request, Response } from 'express';
import { ParamsDictionary } from "express-serve-static-core";

import * as FriendRequestService from '../service/FriendRequestService';
import { LoginLocals } from '../middleware/AuthMiddleware';
import { logger } from '../logging/logger';


interface FriendRequestParams extends ParamsDictionary {
  requestID: string
}

export interface FriendRequestLocals {
  friend_request_data: FriendRequestService.FullFriendRequest
}

export async function FriendRequestPreprocess(
  req: Request<FriendRequestParams>,
  res: Response<any, LoginLocals & FriendRequestLocals>,
  next: NextFunction
) {
  
  const request_id = +req.params.requestID;
  
  if (Number.isNaN(request_id)) {
    logger.debug(`Friend request id is ${req.params.requestID}, but should be an integer`);
    return res.status(404).end();
  }
  if (res.locals.logged_in_user === null) {
    logger.debug("A user that is not logged in cannot interact with friend request");
    return res.status(401).end();
  }
  
  const user_id = res.locals.logged_in_user.user_id;
  const friend_request_data = await FriendRequestService.getFriendRequestById(request_id);
  
  if (friend_request_data === null){
    logger.debug(`Friend request with id ${request_id} does not exist`);
    return res.status(404).send("Friend request with this id does not exist");
  }
  
  res.locals.friend_request_data = friend_request_data;
  next();
}