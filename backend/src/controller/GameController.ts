import { Request, Response } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { v4 as uuidv4 } from 'uuid';

import * as GameService from '../service/GameService';

import { logger } from '../logging/logger';

export const createAndJoinGame = (req: Request, res: Response) => {
  const gameId = uuidv4();
  logger.info(`Creating new game with ID: ${gameId}`);
  GameService.createGame(gameId);
  
  res.set('HX-Redirect', `/game/${gameId}`);
  res.send();
};

interface GameSiteParams extends ParamsDictionary {
  game_id: string
};

export const renderGameRoom = (req: Request<GameSiteParams>, res: Response) => {
  const gameId = req.params.game_id;
  const game = GameService.getGame(gameId);

  if (game === undefined) {
    logger.info(`Game with ID: ${gameId} not found`);
    return res.render('nonexistent_game');
  }
  
  logger.info(`Rendering game room for game ID: ${gameId}`);
  // TODO: Pass general information about the game (word length, language).
  res.render('game_room', { gameId, words: game.guesses });
};
