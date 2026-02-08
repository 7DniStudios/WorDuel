import { checkWordExists, isValidWord } from "./WordService";
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

import { Mutex } from 'async-mutex';

import * as WordService from "./WordService";
import * as UserService from "./UserService";
import { logger } from "../logging/logger";

export type PlayerGameId = 
  | { type: 'USER'; username: string, userId: number }
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

export interface PlayerGameState {
  left_to_guess: boolean[]; // position -> Was this letter guessed?
  used_for_guesses: Set<string>; // For a given char - was it used for a guess?

  found_word: boolean;
  guesses: Guess[];
}

export interface WebSocketWithCredentials extends WebSocket {
  playerCredentials: PlayerGameId;
}

// TODO: Make the state persistent.
export interface GameState {
  id: string;
  mutex: Mutex;
  game_state: 'WAITING_FOR_OPPONENT' | 'IN_PROGRESS' | 'FINISHED';
  needs_refresh: boolean;

  secret_word: WordService.WordRecord;

  word_length: number;
  language: string;

  host: PlayerGameId;
  guest: PlayerGameId | null;

  host_state: PlayerGameState;
  guest_state: PlayerGameState;

  last_updated: Date;

  // Client not necessarily directly map to host/guess.
  // Ex. on device-change for a brief moment one player might have two clients connected.
  clients: Set<WebSocketWithCredentials>;
}

export type StateGetter = (game: GameState) => PlayerGameState;
export const hostState : StateGetter = (game: GameState) =>  game.host_state;
export const guestState : StateGetter = (game: GameState) => game.guest_state;
export const otherGameState = (stateGetter: StateGetter) => {
  if (stateGetter === hostState) {
    return guestState;
  } else {
    return hostState;
  }
}

const games = new Map<string, GameState>();

// FIFO queue of IDs of public games (joinable by anyone).
const publicGames: string[] = [];

export async function createGame(playerId: PlayerGameId) : Promise<string> {
  const gameId = uuidv4();

  const word = await WordService.drawRandomWord('PL');

  logger.info(`GameService: Creating game with ID ${gameId} and secret word '${word.word}' for player ${playerGameIdToString(playerId)}`);

  games.set(gameId, {
    id: gameId,
    // NOTE: We might prefere a queue here but for two players mutex should be fine.
    mutex: new Mutex(),
    game_state: 'WAITING_FOR_OPPONENT',
    needs_refresh: false,

    secret_word: word,

    word_length: 8,
    // TODO: Parameterize language selection.
    language: 'PL',

    host: playerId,
    guest: null,

    host_state: {
      left_to_guess: new Array(word.word.length).fill(true),
      used_for_guesses: new Set<string>(),
      found_word: false,
      guesses: [],
    },

    guest_state: {
      left_to_guess: new Array(word.word.length).fill(true),
      used_for_guesses: new Set<string>(),
      found_word: false,
      guesses: [],
    },


    last_updated: new Date(),
    clients: new Set<WebSocketWithCredentials>(),
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
      // Discard abandoned games.
      if (game.clients.size === 0 && game.game_state === 'WAITING_FOR_OPPONENT') {
        logger.info(`GameService: Discarding abandoned public game with ID ${gameId}`);
        game.game_state = 'FINISHED';
        games.delete(gameId);
        return null;
      }

      if (isPlayerInGame(game, playerId) !== null) {
        logger.info(`GameService: Host re-joined public game with ID ${gameId}`);
        publicGames.unshift(gameId);
        return gameId;
      }

      if (game.guest === null) {
        game.guest = playerId;
        game.game_state = 'IN_PROGRESS';
        game.needs_refresh = true;
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

export async function joinGameViaInvite(gameId: string, playerId: PlayerGameId) : Promise<string | null> {
  const game = games.get(gameId);
  if (!game) {
    return null;
  }

  return await game.mutex.runExclusive(() => {
    if (isPlayerInGame(game, playerId) !== null) {
      logger.info(`GameService: Player re-joined game with ID ${gameId} via invite`);
      return gameId;
    }

    if (game.guest === null) {
      game.guest = playerId;
      game.game_state = 'IN_PROGRESS';
      game.needs_refresh = true;
      logger.info(`GameService: Player joined game with ID ${gameId} via invite`);
      return gameId;
    }

    return null;
  });
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

export function isPlayerInGame(game: GameState, playerId: PlayerGameId): StateGetter | null {
  if (playerGameIdEquals(game.host, playerId)) {
    return hostState;
  } else if (game.guest !== null && playerGameIdEquals(game.guest, playerId)) {
    return guestState;
  } else {
    return null;
  }
}

export function getPlayerNames(game: GameState, stateGetter: StateGetter): { myName: string, opponentName: string } {
  const hostName = game.host.type === 'USER' ? game.host.username : `Guest (${game.host.guestId.slice(0, 6)})`;
  const guestName = game.guest ? (game.guest.type === 'USER' ? game.guest.username : `Guest#${game.guest.guestId.slice(0, 6)}`) : 'Waiting for opponent...';

  if (stateGetter === hostState) {
    return { myName: hostName, opponentName: guestName };
  } else {
    return { myName: guestName, opponentName: hostName };
  }
}

export function getCredentialsFromGame(game: GameState, playerId: number | string | null) : PlayerGameId | null {
  if (playerId === null) {
     return null;
  }

  if (typeof playerId === 'number') {
    if (game.host.type === 'USER' && game.host.userId === playerId) {
      return game.host;
    } else if (game.guest && game.guest.type === 'USER' && game.guest.userId === playerId) {
      return game.guest;
    } else {
      return null;
    }
  } else {
    if (game.host.type === 'GUEST' && game.host.guestId === playerId) {
    return game.host;
  } else if (game.guest && game.guest.type === 'GUEST' && game.guest.guestId === playerId) {
    return game.guest;
  } else {
    return null;
  }
  }
}

export type GuessError = 'INVALID_WORD' | 'WORD_NOT_FOUND' | 'WORD_USED' | 'SERVER_ERROR';
export type GuessResult =
  | { success: true; gameState: GameState; guess: Guess }
  | { success: false; error: GuessError };

export function includesGuess(playerGame: PlayerGameState, word: string): boolean {
  return playerGame.guesses.some(guess => guess.word === word);
}

export function createGuess(game: GameState, stateGetter: StateGetter, word: string): Guess {
  const guess: Guess = {
    word,
    letters: []
  };

  let notKnownLetters = new Map<string, number>();

  const playerGame = stateGetter(game);

  // First pass to mark CORRECT letters (to not mark them as present).
  for (let i = 0; i < word.length; i++) {
    const char = word[i];
    const secretChar = game.secret_word.word[i];
    if (char === secretChar) {
      playerGame.left_to_guess[i] = false;
    }

    if (playerGame.left_to_guess[i]) {
      notKnownLetters.set(secretChar, (notKnownLetters.get(secretChar) || 0) + 1);
    }
  }

  let processedLetters = new Map<string, number>();

  // Second pass to actually create the guess result.
  for (let i = 0; i < word.length; i++) {
    const char = word[i];

    const alreadyProcessed = processedLetters.get(char) || 0;
    const notKnown = notKnownLetters.get(char) || 0;

    // Not in word? always ABSENT
    if (!game.secret_word.word.includes(char)) {
      guess.letters.push({ char, state: 'ABSENT' as GuessState });
    } else if (char === game.secret_word.word[i]) {
      guess.letters.push({ char, state: 'CORRECT' as GuessState });
      playerGame.left_to_guess[i] = false;
    } else if (alreadyProcessed < notKnown) {
      guess.letters.push({ char, state: 'PRESENT' as GuessState });
    } else {
      guess.letters.push({ char, state: 'ABSENT' as GuessState });
    }

    processedLetters.set(char, (processedLetters.get(char) || 0) + 1);
  }

  return guess;
}

async function updateDatabaseWithGameResult(game: GameState) {
  const host = game.host;
  if (host.type === 'USER') {
    logger.info(`Recording game result for user ${host.username} (ID: ${host.userId}). Player won: ${game.host_state.found_word}`);
    await UserService.recordGameParticipation(host.userId, game.host_state.found_word);
  }

  const guest = game.guest;
  if (guest && guest.type === 'USER') {
    logger.info(`Recording game result for user ${guest.username} (ID: ${guest.userId}). Player won: ${game.guest_state.found_word}`);
    await UserService.recordGameParticipation(guest.userId, game.guest_state.found_word);
  }

  const isGuessed = game.host_state.found_word || (game.guest_state.found_word);
  await WordService.markFinishedGame(game.secret_word, isGuessed);

  // TODO: Fill 'guess_count' field of word_stats table.
}

export async function addGuess(gameId: string, stateGetter: StateGetter, word: string): Promise<GuessResult> {
  const game = games.get(gameId);
  if (!game) {
    return { success: false, error: 'SERVER_ERROR' };
  }

  const playerGame = stateGetter(game); 

  const sanitizedWord = word.trim().toLowerCase();
  if (!isValidWord(sanitizedWord, game.word_length)) {
    return { success: false, error: 'INVALID_WORD' };
  }

  const wordExists = await checkWordExists(game.language, sanitizedWord);
  if (!wordExists.exists) {
    return { success: false, error: 'WORD_NOT_FOUND' };
  }

  return await game.mutex.runExclusive(async () => {
    if (includesGuess(playerGame, sanitizedWord)) {
      return { success: false, error: 'WORD_USED' };
    }

    const guess = createGuess(game, stateGetter, sanitizedWord);
    playerGame.guesses.push(guess);
    game.last_updated = new Date();
    for (const letter of guess.letters) {
      playerGame.used_for_guesses.add(letter.char);
    }

    logger.info(`GameService: Comparing guess '${sanitizedWord}' to secret word '${game.secret_word.word}' for game ${gameId}`);
    if (sanitizedWord === game.secret_word.word) {
      logger.info(`GameService: Player guessed the word correctly in game ${gameId}!`);
      playerGame.found_word = true;
      if (game.game_state === 'IN_PROGRESS') {
        game.game_state = 'FINISHED';
        updateDatabaseWithGameResult(game);
      }
    }

    return { success: true, gameState: game, guess };
  });
};

// TODO: This is bad, but I am tired at this point...
// NOTE: This is a bit different to an original wordle keyboard: if word contains many 'x' lettes
//       and the player guessed one 'x' correctly the 'x' on the keyboard will be marked as PRESENT, not CORRECT.
export function getKeyboardMap(game: GameState, stateGetter: StateGetter): Map<string, GuessState> {
  const map = new Map<string, GuessState>();

  let notKnownLetters = new Map<string, number>();

  const playerGame = stateGetter(game);

  // First pass to mark CORRECT letters (to not mark them as present).
  for (let i = 0; i < game.secret_word.word.length; i++) {
    const char = game.secret_word.word[i];
    if (playerGame.left_to_guess[i]) {
      notKnownLetters.set(char, (notKnownLetters.get(char) || 0) + 1);
    }
  }

  playerGame.used_for_guesses.forEach(char => {
    if (!game.secret_word.word.includes(char)) {
      map.set(char, 'ABSENT');
      return;
    }

    const notKnown = notKnownLetters.get(char) || 0;
    if (notKnown > 0) {
      map.set(char, 'PRESENT');
      return;
    }

    map.set(char, 'CORRECT');
  });

  return map;
}

export function getGame(gameId: string): GameState | undefined {
  return games.get(gameId);
}

function minutesToMilliseconds(minutes: number): number {
  return minutes * 60 * 1000;
}

const gcInterval = minutesToMilliseconds(10);

// Simple garbage collection to clean up abandoned games.
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
