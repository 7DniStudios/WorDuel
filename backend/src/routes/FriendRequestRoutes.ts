import { Router } from 'express';

import { FriendRequestPreprocess } from '../middleware/FriendRequestMiddleware';

import * as FriendRequestController from '../controller/FriendRequestController';

export const friendRequestRouter = Router();



friendRequestRouter.post("/:requestID/accept", FriendRequestPreprocess, FriendRequestController.acceptFriendRequest)

friendRequestRouter.post("/:requestID/reject", FriendRequestPreprocess, FriendRequestController.rejectFriendRequest)

friendRequestRouter.post("/send/:userID", )  //TODO

friendRequestRouter.post("/:requestID/cancel", FriendRequestPreprocess, FriendRequestController.cancelFriendRequest)

//TODO unfriending people 
