import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { db } from './db';

const app = express();
app.set('trust proxy', 1); // We are behind nginx proxy.
app.use(cors());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    // TODO: Set origin to a real URL.
    origin: "*",
    methods: ["GET", "POST"]
  }
});

async function bootstrap() {
  console.log("Checking connection to PostgreSQL database...");
  const obj = await db.connect();
  obj.done();
  console.log('Database available!');

  console.log('Running test query...');
  interface DatabaseTimeResponse {
    server_time: Date;
  };

  const res = await db.one<DatabaseTimeResponse>('SELECT NOW() as server_time');    
  console.log(`Test query: 'SELECT NOW()' -> "${res.server_time.toISOString()}".`);

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
  });
}

bootstrap().catch(err => console.error('Error during database bootstrap', err));

app.get('/', (req, res) => {
  res.send('Backend is running!');
});

interface CheckWordParams {
  language: string;
  word: string;
}

/* Responds with a JSON object:
 * {
 *   "valid": boolean,
 *   "message": string
 * }
 */
app.get('/word-exists/:language/:word', async (req: express.Request<CheckWordParams>, res) => {
  const { language, word } = req.params;

  const languageSanitized = language.toUpperCase().trim();
  const wordSanitized = word.toLowerCase().trim();

  if (languageSanitized.length !== 2) {
    return res.status(400).json({ valid: false, message: 'Language code must be 2 characters long' });
  }

  // Only words of length 8 are allowed.
  if (wordSanitized.length !== 8) {
    return res.status(400).json({ valid: false, message: 'Word length must be between 1 and 8 characters' });
  }

  try {
    const result = await db.oneOrNone(
      `SELECT 1 FROM words
        WHERE lang = $(language) AND word = $(word)
        LIMIT 1`,
      {
        language: languageSanitized,
        word: wordSanitized 
      }
    );

    const valid = result !== null;
    const message = valid ? 'Word exists in the database' : 'Word does not exist in the database';
    return res.json({ valid, message });
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ valid: false, message: 'Internal server error' });
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
  
  socket.on('ping', () => {
    socket.emit('pong', { message: 'Hello from server' });
  });
});
