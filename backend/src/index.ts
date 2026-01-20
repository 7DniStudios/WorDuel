import express, { NextFunction, Request, Response } from 'express';

import { createServer } from 'http';
import path from 'path';
import { Server } from 'socket.io';
import cors from 'cors';

import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken';

import { db } from './db';
import { getUser, jwtSecret, isAuthenticated, LoginInput, LoginLocals } from './AuthenticationService';

// bcrypt setup
const saltRounds = 10;

// express setup
const app = express();

app.set('trust proxy', 1); // We are behind nginx proxy.
app.use(cors());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

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
  res.render('index');
});

// TODO: Remove this! Debug route to test HTMX.
app.get('/toggle', (req, res) => {
  const currentText = req.query.text as string;
  const nextText = currentText === 'Ping' ? 'Pong' : 'Ping';

  res.render('partials/test_button', { label: nextText }, (err, html) => {
    if (err) {
      throw err;
    } else {
      res.send(html);
    }
  });
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

// PostgreSQL error code.
// TODO: Move error codes definitions to a separate file.
const UniqueViolation = '23505';
interface PgError extends Error {
  code: string;
  constraint?: string;
}

export interface RegisterInput {
  username?: string;
  email?: string;
  password?: string;
}

/* Responds with 200 OK on success.
 * If provided credentials are invalid, responds with 422 Unprocessable Entity.
 */
app.post('/register', async (
  req: Request<{}, {}, RegisterInput>,
  res: Response
) => {
  const { username, email, password } = req.body;

  // TODO: Add proper validation.
  // TODO: Make this into a monad.
  if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    const message = "Invalid input types.";
    return res.status(422).json({ message }).end();
  }

  if (username.length < 2 || username.length > 50) {
    const message = "Invalid username length. Must be between 2 and 50 characters.";
    return res.status(422).json({ message }).end();
  }

  if (email.length > 200) {
    const message = "Email too long. Max 200 characters.";
    return res.status(422).json({ message }).end();
  }

  if (password.length < 8 || password.length > 100) {
    const message = "Invalid password length. Must be between 8 and 100 characters.";
    return res.status(422).json({ message }).end();
  }

  let hash = await bcrypt.hash(password, saltRounds);

  try {
    // TODO: Return the created user_id to auto-login after registration.
    await db.none(
      `INSERT INTO users(email, password_hash, username)
        VALUES ($(email), $(hash), $(username))`,
      { email, hash, username }
    );

    return res.status(200).end();
  } catch (err) {
    const error = err as PgError;
    if (error.code === UniqueViolation) {
      let message = 'User already exists.';

      if (error.constraint === 'unique_username') {
        message = 'Username already taken.';
      } else if (error.constraint === 'unique_email') {
        message = 'Email already registered.';
      }

      return res.status(422).json({ message }).end();
    }

    throw error;
  }
})

interface LoginResponseData {
  token: string;
}

app.post('/login', getUser, async (
  req: Request<{}, {}, LoginInput>,
  res: Response<LoginResponseData, LoginLocals>
) => {
  // Create and send jwt session token:
  const payload = { user_id: res.locals.user_id };
  const weekInSeconds = 60 * 60 * 24 * 7;
  jwt.sign(payload, jwtSecret, { expiresIn: weekInSeconds }, (err, token) => {
    if (err) {
      throw err;
    } else if (typeof token === 'undefined') {
      console.log("Error: Failed to generate token.");
      return res.status(500).end();
    } else {
      return res.status(200).json({ token: token }).end();
    }
  })
})

// Debug route to test authentication middleware.
// TODO: Remove this on release!!!
app.get('/test-login', isAuthenticated, async (req, res: Response<any, LoginLocals>) => {
  const user_id = res.locals.user_id;
  try {
    let data = await db.one('SELECT * FROM users WHERE user_id = $1;', [user_id])
    res.send(data);
  } catch (err) {
    throw err;
  }
})
