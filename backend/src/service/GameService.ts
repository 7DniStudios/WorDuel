import { checkWordExists, isValidWord } from "./WordService";
import { WebSocket } from 'ws';

import { Mutex } from 'async-mutex';

import { logger } from "../logging/logger";

// TODO: Make the state persistent.
export interface GameState {
  id: string;
  guesses: string[];
  mutex: Mutex;
  word_length: number;
  language: string;
  last_updated: Date;
  clients: Set<WebSocket>;
}

const games = new Map<string, GameState>();

export function createGame(gameId: string) {
  games.set(gameId, {
    id: gameId,
    guesses: [],
    // NOTE: We might prefere a queue here but for two players mutex should be fine.
    mutex: new Mutex(),
    word_length: 8,
    // TODO: Parameterize language selection.
    language: 'PL',
    last_updated: new Date(),
    clients: new Set<WebSocket>(),
  });
};

export type GuessError = 'INVALID_WORD' | 'WORD_NOT_FOUND' | 'WORD_USED' | 'SERVER_ERROR';
export type GuessResult =
  | { success: true; gameState: GameState }
  | { success: false; error: GuessError };

export async function addGuess(gameId: string, word: string): Promise<GuessResult> {
  const game = games.get(gameId);
  if (!game) {
    return { success: false, error: 'SERVER_ERROR' };
  }

  const sanitizedWord = word.trim().toLowerCase();
  if (!isValidWord(sanitizedWord, game.word_length)) {
    return { success: false, error: 'INVALID_WORD' };
  }

  const wordExists = await checkWordExists(game.language, sanitizedWord);
  if (!wordExists.exists) {
    return { success: false, error: 'WORD_NOT_FOUND' };
  }

  return await game.mutex.runExclusive(async () => {
    if (game.guesses.includes(sanitizedWord)) {
      return { success: false, error: 'WORD_USED' };
    }

    game.guesses.push(sanitizedWord);
    game.last_updated = new Date();
    return { success: true, gameState: game };
  });
};

export function getGame(gameId: string): GameState | undefined {
  return games.get(gameId);
}

function minutesToMilliseconds(minutes: number): number {
  return minutes * 60 * 1000;
}

const gcInterval = minutesToMilliseconds(10);

setInterval(() => {
  const now = Date.now();
  const TIMEOUT = minutesToMilliseconds(10);
  
  let deleted = 0;
  games.forEach((game, id) => {
    if (now - game.last_updated.getTime() > TIMEOUT) {
      games.delete(id);
      deleted++;
    }
  });

  if (deleted > 0) {
    logger.info(`GC: Cleaned up ${deleted} abandoned games.`);
  }
}, gcInterval);
