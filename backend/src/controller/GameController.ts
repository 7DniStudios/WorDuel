import { Request, Response } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { v4 as uuidv4 } from 'uuid';

import * as GameService from '../service/GameService';

import { logger } from '../logging/logger';

function getPlayerIdIfExists(req: Request, res: Response): GameService.PlayerGameId | null {
  if (res.locals.logged_in_user) {
    return {
      type: 'USER',
      username: res.locals.logged_in_user.username,
      userId: res.locals.logged_in_user.user_id };
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

  const playerCredentials = getPlayerIdIfExists(req, res);
  if (!playerCredentials) {
    logger.info(`Unauthenticated user tried to access game with ID: ${gameId}`);
    return res.render('nonexistent_game');
  }

  const stateGetter = GameService.isPlayerInGame(game, playerCredentials);
  if (stateGetter === null) {
    logger.info(`Player not part of game with ID: ${gameId}`);
    return res.render('nonexistent_game');
  }

  const { myName, opponentName } = GameService.getPlayerNames(game, stateGetter);

  logger.info(`Rendering game room for game ID: ${gameId} with player ${myName} and opponent ${opponentName}`);

  // If cache is used the game state might desync
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  // TODO: Pass general information about the game (word length, language).
  const gameInfo = {
    gameId,
    myName,
    opponentName,
    secretWord: game.secret_word.word,
    playerWon: stateGetter(game).found_word,
    guesses: stateGetter(game).guesses,
    opponentGuesses: GameService.otherGameState(stateGetter)(game).guesses,
    keyboardMap: GameService.getKeyboardMap(game, stateGetter)
  };

  switch (game.game_state) {
    case 'WAITING_FOR_OPPONENT':
      // TODO: Render waiting screen.
    case 'IN_PROGRESS':
      return res.render('game_room', gameInfo);
    case 'FINISHED':
      return res.render('game_summary', gameInfo);
    default:
      logger.error(`Unknown game state ${game.game_state} for game ID: ${gameId}`);
      return res.render('nonexistent_game');
  }
};
