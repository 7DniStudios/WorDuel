import { NextFunction, Request, Response } from 'express';
import { ParamsDictionary } from "express-serve-static-core";

import * as UserService from '../service/UserService';
import { LoginLocals } from '../middleware/AuthMiddleware';

interface UserSiteParams extends ParamsDictionary {
  userID: string
};

interface PublicUserStats {
  user_id: number,
  username: string,
  created_at: Date,
  games_played: number,
  games_won: number,
  is_public: boolean
};

interface UserStats {
  email: string,
  public_stats: PublicUserStats
};

export async function renderOwnSite(
    req: Request<UserSiteParams>,
    res: Response<any, LoginLocals>,
    next: NextFunction
) {
  const user_id = +req.params.userID;
  const user_data = await UserService.getUserDataById(user_id);

  const isOwn = res.locals.logged_in_user?.user_id === user_id;
  const canShowPage = user_data?.is_public || isOwn;
  if (!canShowPage || user_data === null) {
    return res.render("nonexistent_user");
  }

  const public_stats: PublicUserStats = {
    user_id: user_data.user_id,
    username: user_data.username,
    created_at: user_data.created_at,
    games_played: user_data.games_played,
    games_won: user_data.games_won,
    is_public: user_data.is_public
  };

  if (isOwn) {
    const user_stats: UserStats = {
      email: user_data.email,
      public_stats
    };
    return res.render("logged_in_user", user_stats);
  } else {
    return res.render("user", public_stats);
  }
}
