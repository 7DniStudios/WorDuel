import { checkWordExists, isValidWord } from "./WordService";
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

import { Mutex } from 'async-mutex';

import * as WordService from "./WordService";
import { logger } from "../logging/logger";

export type PlayerGameId = 
  | { type: 'USER'; userId: number }
  | { type: 'GUEST'; guestId: string };

export function playerGameIdToString(playerId: PlayerGameId): string {
  if (playerId.type === 'USER') {
    return `USER_${playerId.userId}`;
  } else {
    return `GUEST_${playerId.guestId}`;
  }
}

export type GuessState = 'CORRECT' | 'PRESENT' | 'ABSENT' | 'UNKNOWN';

export interface Guess {
  word: string;
  letters: {char: string, state: GuessState}[];
}

// TODO: Make the state persistent.
export interface GameState {
  id: string;
  mutex: Mutex;

  secret_word: WordService.WordRecord;
  left_to_guess: boolean[]; // position -> Was this letter guessed?
  used_for_guesses: Set<string>; // For a given char - was it used for a guess?

  guesses: Guess[];

  word_length: number;
  language: string;

  host: PlayerGameId;
  guest: PlayerGameId | null;

  last_updated: Date;
  clients: Set<WebSocket>;
}

const games = new Map<string, GameState>();

// FIFO queue of IDs of public games (joinable by anyone).
const publicGames: string[] = [];

export async function createGame(playerId: PlayerGameId) : Promise<string> {
  const gameId = uuidv4();

  const word = await WordService.drawRandomWord('PL');
  const leftToGuess = new Array(word.word.length).fill(true);

  logger.info(`GameService: Creating game with ID ${gameId} and secret word '${word.word}' for player ${playerGameIdToString(playerId)}`);

  games.set(gameId, {
    id: gameId,
    // NOTE: We might prefere a queue here but for two players mutex should be fine.
    mutex: new Mutex(),

    secret_word: word,
    left_to_guess: leftToGuess,
    used_for_guesses: new Set<string>(),

    guesses: [],
    word_length: 8,
    // TODO: Parameterize language selection.
    language: 'PL',

    host: playerId,
    guest: null,

    last_updated: new Date(),
    clients: new Set<WebSocket>(),
  });

  logger.info(`GameService: Created game with ID ${gameId}`);
  publicGames.push(gameId);

  return gameId;
};

export async function joinPublicGame(playerId: PlayerGameId) : Promise<string | null> {
  while (publicGames.length > 0) {
    const gameId = publicGames.shift() as string;
    const game = games.get(gameId);
    if (!game) {
      continue;
    }

    const result = await game.mutex.runExclusive(() => {
      if (game.host === playerId) {
        logger.info(`GameService: Host re-joined public game with ID ${gameId}`);
        publicGames.unshift(gameId);
        return gameId;
      }

      if (game.guest === null) {
        game.guest = playerId;
        logger.info(`GameService: Guest joined public game with ID ${gameId}`);
        return gameId;
      }

      return null;
    });

    if (result) {
      return result;
    }
  }

  return null;
}

export function playerGameIdEquals(a: PlayerGameId, b: PlayerGameId): boolean {
  if (a.type !== b.type) {
    return false;
  }

  if (a.type === 'USER') {
    return a.userId === (b as { type: 'USER'; userId: number }).userId;
  } else {
    return a.guestId === (b as { type: 'GUEST'; guestId: string }).guestId;
  }
}

export function isPlayerInGame(game: GameState, playerId: PlayerGameId): boolean {
  return playerGameIdEquals(game.host, playerId)
    || (game.guest !== null && playerGameIdEquals(game.guest, playerId));
}

export type GuessError = 'INVALID_WORD' | 'WORD_NOT_FOUND' | 'WORD_USED' | 'SERVER_ERROR';
export type GuessResult =
  | { success: true; gameState: GameState; guess: Guess }
  | { success: false; error: GuessError };

export function includesGuess(game: GameState, word: string): boolean {
  return game.guesses.some(guess => guess.word === word);
}

function isLetterNotKnown(game: GameState, char: string): boolean {
  for (let i = 0; i < game.left_to_guess.length; i++) {
    if (game.left_to_guess[i] && game.secret_word.word[i] === char) {
      return true;
    }
  }
  return false;
}

export function createGuess(game: GameState, word: string): Guess {
  const guess: Guess = {
    word,
    letters: []
  };

  // First pass to mark CORRECT letters (to not mark them as present).
  for (let i = 0; i < word.length; i++) {
    const char = word[i];
    if (char === game.secret_word.word[i]) {
      game.left_to_guess[i] = false;
    }
  }

  // Second pass to actually create the guess result.
  for (let i = 0; i < word.length; i++) {
    const char = word[i];

    // Not in word? always ABSENT
    if (!game.secret_word.word.includes(char)) {
      guess.letters.push({ char, state: 'ABSENT' as GuessState });
      continue;
    }

    // In the correct position? always CORRECT
    if (char === game.secret_word.word[i]) {
      guess.letters.push({ char, state: 'CORRECT' as GuessState });
      game.left_to_guess[i] = false;
      continue;
    }

    // Otherwise PRESENT if it wasn't guessed already in the correct position.
    if (isLetterNotKnown(game, char)) {
      guess.letters.push({ char, state: 'PRESENT' as GuessState });
    } else {
      guess.letters.push({ char, state: 'ABSENT' as GuessState });
    }
  }

  return guess;
}

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
    if (includesGuess(game, sanitizedWord)) {
      return { success: false, error: 'WORD_USED' };
    }

    const guess = createGuess(game, sanitizedWord);
    game.guesses.push(guess);
    game.last_updated = new Date();
    return { success: true, gameState: game, guess };
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
