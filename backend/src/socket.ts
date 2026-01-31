import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import ejs from 'ejs';
import path from 'path';
import * as GameService from './service/GameService';
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

// TODO: Implement DDoS protection, rate limiting, etc.
export const initWebSocket = (server: HttpServer) => {
  const wss = new WebSocketServer({ server });

  function broadcast(gameId: string, message: string) {
    const clients = GameService.getGame(gameId)?.clients;
    if (!clients) {
      logger.warn(`WS: No clients found for game ${gameId}`);
      return;
    }

    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
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

    gameState.clients.add(ws);
    logger.info(`WS: Client connected to game ${gameId}`);
    
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

        const guessResult = await GameService.addGuess(gameId, guessedWord);
        if (guessResult.success === true) {
          logger.info(`WS: Word "${guessedWord}" accepted for game ${gameId}`);
          const newWordRow = await ejs.renderFile(
            path.join(__dirname, '../views/partials/game/word_row.ejs'),
            { word: guessedWord }
          );
          const gameMessage = await ejs.renderFile(
            path.join(__dirname, '../views/partials/game/game_message.ejs'),
            { message: '', swap: true }
          );
          
          broadcast(gameId, newWordRow);
          ws.send(clearInput + gameMessage);
        } else {
          let errorMessage = getWordErrorMessage(guessResult.error);
          const gameMessage = await ejs.renderFile(
            path.join(__dirname, '../views/partials/game/game_message.ejs'),
            { message: errorMessage, swap: true }
          );

          ws.send(clearInput + gameMessage);
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
        gameState.clients.delete(ws);
      }
    });
  });
};
