import { Router } from 'express';

import * as GameController from '../controller/GameController';

export const gameRouter = Router();

gameRouter.post('/create', GameController.createAndJoinGame);
gameRouter.post('/join', GameController.createOrJoinGame);
gameRouter.get('/invite/:game_id', GameController.inviteJoinGame);
gameRouter.get('/:game_id', GameController.renderGameRoom);
