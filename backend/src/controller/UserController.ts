import { Request, Response } from 'express';
import { ParamsDictionary } from "express-serve-static-core";

import * as UserService from '../service/UserService';
import { LoginLocals } from '../middleware/AuthMiddleware';
import { logger } from '../logging/logger';

interface UserSiteParams extends ParamsDictionary {
  userID: string
};

  // UserController
interface PublicUserStats {
  user_id: number,
  username: string,
  created_at: Date,
  games_played: number,
  games_won: number,
  is_public: boolean,
  friends: UserService.FriendData[],
  friendship_status: UserService.FriendshipStatus,
};

interface UserStats extends PublicUserStats {
  email: string,
  sent_friend_requests: UserService.FriendRequest[],
  received_friend_requests: UserService.FriendRequest[]
};

export async function renderUserSite(
    req: Request<UserSiteParams>,
    res: Response<any, LoginLocals>
) {
  const request_user_id = res.locals.logged_in_user?.user_id ?? null;
  const user_id = +req.params.userID;
  const user = await UserService.getUserDataIfVisible(request_user_id, user_id);

  if (user === null) {
    logger.debug(`Attempt to access ${user_id} denied.`);
    return res.status(404).render("nonexistent_user");
  }
  
  

  const public_stats: PublicUserStats = {
    user_id: user.user_data.user_id,
    username: user.user_data.username,
    created_at: user.user_data.created_at,
    games_played: user.user_data.games_played,
    games_won: user.user_data.games_won,
    is_public: user.user_data.is_public,
    friends: await UserService.getFriends(user_id),
    friendship_status: user.friendship_status
  };

  if (request_user_id === user_id) {
    const user_stats: UserStats = {
      ... public_stats,
      email: user.user_data.email,
      sent_friend_requests: await UserService.getSentFriendRequests(user_id),
      received_friend_requests: await UserService.getReceivedFriendRequests(user_id),
      friendship_status: {status: "none"}
    };
    return res.render("logged_in_user", user_stats);
  } else {
    return res.render("user", public_stats);
  }
}

export async function interactiveButton(
  req: Request<UserSiteParams>,
  res: Response<any, LoginLocals>
) {
  const user_id = +req.params.userID;
  var friendship_status: UserService.FriendshipStatus;
  if (res.locals.logged_in_user !== null) {
    friendship_status = await UserService.getFriendshipStatus(res.locals.logged_in_user.user_id, user_id);
  }else{
    friendship_status = {status: "none"}
  }
  
  return res.render("partials/interactive_friends_button", {layout: false, friendship_status: friendship_status, user_id: user_id })
}
