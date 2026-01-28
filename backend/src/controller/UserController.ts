import { NextFunction, Request, Response } from 'express';
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
  friends: UserService.FriendData[]
};

interface UserStats extends PublicUserStats {
  email: string,
  sent_friend_requests: UserService.FriendRequest[],
  received_friend_requests: UserService.FriendRequest[]
};

export async function renderUserSite(
    req: Request<UserSiteParams>,
    res: Response<any, LoginLocals>,
    next: NextFunction
) {
  const user_id = +req.params.userID;
  let canShowPage = false;

  // TODO: Use a monad.
  const user_data = await UserService.getUserDataById(user_id);
  canShowPage = canShowPage || (user_data?.is_public === true);

  const isOwn = res.locals.logged_in_user?.user_id === user_id;
  canShowPage = canShowPage || isOwn;

  if (res.locals.logged_in_user !== null) {
    const isFriend = await UserService.isFriendOf(res.locals.logged_in_user!.user_id, user_id);
    canShowPage = canShowPage || isFriend;
  }

  if (!canShowPage || user_data === null) {
    logger.debug(`Attempt to access ${user_id} denied. Reason: canShowPage=${canShowPage}, user_data=${user_data}`);
    return res.status(404).render("nonexistent_user");
  }

  const public_stats: PublicUserStats = {
    user_id: user_data.user_id,
    username: user_data.username,
    created_at: user_data.created_at,
    games_played: user_data.games_played,
    games_won: user_data.games_won,
    is_public: user_data.is_public,
    friends: await UserService.getFriends(user_id)
  };

  if (isOwn) {
    const user_stats: UserStats = {
      ... public_stats,
      email: user_data.email,
      sent_friend_requests: await UserService.getSentFriendRequests(user_id),
      received_friend_requests: await UserService.getReceivedFriendRequests(user_id)
    };
    return res.render("logged_in_user", user_stats);
  } else {
    return res.render("user", public_stats);
  }
}