import { Router } from 'express';

import { FriendRequestPreprocess } from '../middleware/FriendRequestMiddleware';

import * as FriendRequestController from '../controller/FriendRequestController';

export const friendRequestRouter = Router();

friendRequestRouter.use(FriendRequestPreprocess)

friendRequestRouter.post("/friend_request/:requestID/accept", FriendRequestController.acceptFriendRequest)

friendRequestRouter.post("/friend_request/:requestID/reject", FriendRequestController.rejectFriendRequest)

friendRequestRouter.post("/friend_request/:requestID/send", )  //TODO

friendRequestRouter.post("/friend_request/:requestID/cancel", )  //TODO

//TODO unfriending people 
