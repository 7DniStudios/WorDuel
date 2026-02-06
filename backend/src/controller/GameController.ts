import { Request, Response } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { v4 as uuidv4 } from 'uuid';

import * as GameService from '../service/GameService';

import { logger } from '../logging/logger';

function getPlayerIdIfExists(req: Request, res: Response): GameService.PlayerGameId | null {
  if (res.locals.logged_in_user) {
    return { type: 'USER', userId: res.locals.logged_in_user.user_id };
  }

  if (req.cookies.worduelGuestId) {
    return { type: 'GUEST', guestId: req.cookies.worduelGuestId };
  }

  return null;
};

function getPlayerId(req: Request, res: Response): GameService.PlayerGameId {
  const existingPlayerId = getPlayerIdIfExists(req, res);
  if (existingPlayerId) {
    return existingPlayerId;
  }

  const newGuestId = uuidv4();
  const yearInMs = 365 * 24 * 60 * 60 * 1000;
  res.cookie('worduelGuestId', newGuestId, { maxAge: yearInMs, httpOnly: true, sameSite: 'lax' });
  return { type: 'GUEST', guestId: newGuestId };
};

export async function createAndJoinGame(req: Request, res: Response) {
  const gameId = await GameService.createGame(getPlayerId(req, res));

  res.set('HX-Redirect', `/game/${gameId}`);
  res.send();
};

export async function createOrJoinGame(req: Request, res: Response) {
  const playerId = getPlayerId(req, res);
  let gameId: string | null = await GameService.joinPublicGame(playerId);
  if (!gameId) {
    gameId = await GameService.createGame(playerId);
  }

  res.set('HX-Redirect', `/game/${gameId}`);
  res.send();
}

interface GameSiteParams extends ParamsDictionary {
  game_id: string
};

export async function renderGameRoom(req: Request<GameSiteParams>, res: Response) {
  const gameId = req.params.game_id;
  const game = GameService.getGame(gameId);

  if (game === undefined) {
    logger.info(`Game with ID: ${gameId} not found`);
    return res.render('nonexistent_game');
  }

  let playerCredentials = getPlayerIdIfExists(req, res);
  if (!playerCredentials || !GameService.isPlayerInGame(game, playerCredentials)) {
    logger.info(`Player not part of game with ID: ${gameId}`);
    // Security: Do not tell the user the game exists if they are not part of it.
    return res.render('nonexistent_game');
  }

  logger.info(`Rendering game room for game ID: ${gameId}`);
  // TODO: Pass general information about the game (word length, language).
  res.render('game_room', { gameId, guesses: game.guesses, keyboardMap: GameService.getKeyboardMap(game) });
};
