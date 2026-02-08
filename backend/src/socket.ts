import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import ejs from 'ejs';
import path from 'path';
import { parse, Cookies } from 'cookie';

import * as GameService from './service/GameService';
import * as AuthService from './service/AuthService';
import { logger } from './logging/logger';

function getWordErrorMessage(error: GameService.GuessError): string {
  switch (error) {
    case 'INVALID_WORD':
      return 'Invalid word format.';
    case 'WORD_NOT_FOUND':
      return 'Word not found in dictionary.';
    case 'WORD_USED':
      return 'Word has already been used.';
    case 'SERVER_ERROR':
    default:
      return 'Server error occurred.';
  }
}

// Returns user ID if logged in, null otherwise; Needed for non-middleware contexts (webSockets)
function getUserId(cookies: Cookies): number | null {
  if (cookies.worduelSessionCookie === undefined) {
    return null;
  }

  const sessionCookie = cookies.worduelSessionCookie as string;
  if (!sessionCookie){
    return null;
  }

  const payload = AuthService.verifyToken(sessionCookie);
  if (payload !== null) {
    return payload.user_id;
  }
  return null;
}

function getGuestId(cookies: Cookies): string | null {
  if (cookies.worduelGuestId === undefined) {
    return null;
  }
  return cookies.worduelGuestId as string;
}

export interface WebSocketWithCredentials extends WebSocket {
  playerCredentials: GameService.PlayerGameId;
}

// TODO: Implement DDoS protection, rate limiting, etc.
export const initWebSocket = (server: HttpServer) => {
  const wss = new WebSocketServer({ server });

  async function broadcastGuessOther(gameId: string, sourceCredentials: GameService.PlayerGameId, guess: GameService.Guess) {
    const clients = GameService.getGame(gameId)?.clients;
    if (!clients) {
      logger.warn(`WS: No clients found for game ${gameId}`);
      return;
    }

    const opponentGuessList = await ejs.renderFile(
      path.join(__dirname, '../views/partials/game/mini_word_row.ejs'),
      { guess }
    );

    clients.forEach(client => {
      // Send guessed only to the other player
      if (GameService.playerGameIdEquals(client.playerCredentials, sourceCredentials)) {
        return;
      }

      if (client.readyState === WebSocket.OPEN) {
        try {
          (client as WebSocket).send(opponentGuessList);
        } catch (err) {
          logger.error(`WS: Broadcast Error for client in game ${gameId}`, err);
        }
      }
    });
  }

  const refreshCommand = `
    <div id="game-commands" hx-swap-oob="true">
      <script>
        window.location.reload();
      </script>
    </div>
  `;

  function broadcastGameOver(gameId: string) {
    const clients = GameService.getGame(gameId)?.clients;
    if (!clients) {
      logger.warn(`WS: No clients found for game ${gameId}`);
      return;
    }

    // To end the game it is enough to just refresh the page; Controller will take care of the redirection.
    // TODO: Figure out HTMX WS headers.
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(refreshCommand);
        } catch (err) {
          logger.error(`WS: Broadcast Error for client in game ${gameId}`, err);
        }
      }
    });
  }

  function broadcastRefresh(gameId: string, sourceCredentials: GameService.PlayerGameId) {
    const clients = GameService.getGame(gameId)?.clients;
    if (!clients) {
      logger.warn(`WS: No clients found for game ${gameId}`);
      return;
    }

    clients.forEach(client => {
      // Send refresh only to the other player
      if (GameService.playerGameIdEquals(client.playerCredentials, sourceCredentials)) {
        return;
      }

      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(refreshCommand);
        } catch (err) {
          logger.error(`WS: Broadcast Error for client in game ${gameId}`, err);
        }
      }
    });
  }

  wss.on('connection', (ws: WebSocket, req) => {
    // This is iffy...
    const urlParts = req.url?.split('/');
    const gameId = urlParts ? urlParts[urlParts.length - 1] : null;
    
    let gameState = GameService.getGame(gameId || '');
    if (!gameId || gameState === undefined) {
      logger.error('WS: Invalid game ID, closing connection');
      ws.close();
      return;
    }

    // Authentication in WS connect is needed as well because 'direct' websocket connections are possible.
    const cookies = parse(req.headers.cookie || '');
    const loggedInUserId : number | string | null = getUserId(cookies) || getGuestId(cookies);
    let playerCredentials : null | GameService.PlayerGameId = GameService.getCredentialsFromGame(gameState, loggedInUserId);

    if (playerCredentials === null) {
      logger.error('WS: Could not identify player, closing connection');
      ws.close();
      return;
    }

    const stateGetter = GameService.isPlayerInGame(gameState, playerCredentials);
    if (stateGetter === null) {
      logger.error('WS: Player not part of this game, closing connection');
      logger.debug(`Player credentials: ${JSON.stringify(playerCredentials)}\nGame Host: ${JSON.stringify(gameState.host)}\nGame Guest: ${JSON.stringify(gameState.guest)}`);
      ws.close();
      return;
    }

    const wsWithCredentials = ws as WebSocketWithCredentials;
    wsWithCredentials.playerCredentials = playerCredentials;

    gameState.clients.add(wsWithCredentials);
    logger.info(`WS: Client ${JSON.stringify(playerCredentials)} connected to game ${gameId}`);

    if (gameState.needs_refresh) {
      gameState.needs_refresh = false;
      broadcastRefresh(gameId, playerCredentials);
    }
    
    ws.on('message', async (message) => {
      try {
        // HTMX sends {"word": <guess>} as message.
        // TODO: Extra validation.
        const data = JSON.parse(message.toString());
        
        const guessedWord = data.word; 
        if (!guessedWord) {
          logger.warn('WS: No word provided in message');
          return;
        }
 
        const clearInput = await ejs.renderFile(
          path.join(__dirname, '../views/partials/game/input_field.ejs'),
          { swap: true }
        );

        const guessResult = await GameService.addGuess(gameId, stateGetter, guessedWord);
        if (guessResult.success === true) {
          logger.info(`WS: Word "${guessedWord}" accepted for game ${gameId}`);
          const newWordRow = await ejs.renderFile(
            path.join(__dirname, '../views/partials/game/word_row.ejs'),
            { guess: guessResult.guess }
          );
          const gameMessage = await ejs.renderFile(
            path.join(__dirname, '../views/partials/game/game_message.ejs'),
            { message: '', swap: true }
          );
          const newKeyboard = await ejs.renderFile(
            path.join(__dirname, '../views/partials/game/keyboard.ejs'),
            { keyboardMap: GameService.getKeyboardMap(guessResult.gameState, stateGetter) }
          );

          await broadcastGuessOther(gameId, playerCredentials, guessResult.guess);
          ws.send(newKeyboard + clearInput + gameMessage + newWordRow);
          if (gameState.game_state === 'FINISHED') {
            logger.info(`WS: Game ${gameId} finished. Broadcasting game over.`);
            broadcastGameOver(gameId);
          }
        } else {
          let errorMessage = getWordErrorMessage(guessResult.error);
          const gameMessage = await ejs.renderFile(
            path.join(__dirname, '../views/partials/game/game_message.ejs'),
            { message: errorMessage, swap: true }
          );

          ws.send(gameMessage);
        }

      } catch (err) {
        const errorMessage = await ejs.renderFile(
          path.join(__dirname, '../views/partials/game/game_message.ejs'),
          { message: "Internal server error occurred.", swap: true }
        );
        ws.send(errorMessage);
        logger.error('WS Message Error', err);
      }
    });

    ws.on('close', () => {
      logger.info(`WS: Client disconnected from game ${gameId}`);
      if (gameState.clients) {
        gameState.clients.delete(wsWithCredentials);
      }
    });

    ws.on('disconnect', () => {
      logger.info(`WS: Client disconnected from game ${gameId}`);
      if (gameState.clients) {
        gameState.clients.delete(wsWithCredentials);
      }
    });
  });
};
