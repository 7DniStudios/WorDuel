import { Router } from 'express';

import * as GameController from '../controller/GameController';

export const gameRouter = Router();

gameRouter.post('/create', GameController.createAndJoinGame);
gameRouter.post('/join', GameController.createOrJoinGame);
gameRouter.get('/:game_id', GameController.renderGameRoom);
