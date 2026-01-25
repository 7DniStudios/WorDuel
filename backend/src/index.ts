import express, { NextFunction, Request, Response } from 'express';
import { ParamsDictionary } from "express-serve-static-core";
import bodyParser from "body-parser";
import expressEjsLayouts from 'express-ejs-layouts';

import { createServer } from 'http';
import path from 'path';
import { Server } from 'socket.io';
import cors from 'cors';

import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';

import { db } from './db';
import { logger } from './logging/logger';
import { morganMiddleware } from './logging/morgan';

import { getUser, jwtSecret, readSessionCookies, LoginInput, LoginLocals } from './AuthenticationService';

// bcrypt setup
const saltRounds = 10;

// express setup
const app = express();

app.set('trust proxy', 1); // We are behind nginx proxy.
app.use(cors());
app.use(morganMiddleware);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

app.use(expressEjsLayouts);
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(readSessionCookies)


const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    // TODO: Set origin to a real URL.
    origin: "*",
    methods: ["GET", "POST"]
  }
});

async function bootstrap() {
  logger.info("Checking connection to PostgreSQL database...");
  const obj = await db.connect();
  obj.done();
  logger.info('Database available!');

  logger.info('Running test query...');
  interface DatabaseTimeResponse {
    server_time: Date;
  };

  const res = await db.one<DatabaseTimeResponse>('SELECT NOW() as server_time');
  logger.info(`Test query: 'SELECT NOW()' -> "${res.server_time.toISOString()}".`);

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT}`);
  });
}

bootstrap().catch(err => logger.error('Error during database bootstrap', err));


app.get('/', (req, res) => {
  res.render('index');
});



// TODO: Remove this! Debug route to test HTMX.
app.get('/toggle', (req, res) => {
  const currentText = req.query.text as string;
  const nextText = currentText === 'Ping' ? 'Pong' : 'Ping';

  res.render('partials/test_button', { layout: false, label: nextText }, (err, html) => {
    if (err) {
      throw err;
    } else {
      res.send(html);
    }
  });
});

interface CheckWordParams extends ParamsDictionary {
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
    logger.error('Database error:', error);
    return res.status(500).json({ valid: false, message: 'Internal server error' });
  }
});

io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.id}`);

  logger.debug(socket.request.headers.cookie)

  socket.on('disconnect', () => {
    logger.info(`User disconnected: ${socket.id}`);
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


    return res.header("HX-Redirect", "/login").status(200).end();
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

app.get('/register', async (req, res) => {
  if (res.locals.logged_in_user) {
    // User already logged in. Redirect to their
    return res.redirect("/user/" + res.locals.logged_in_user.user_id);
  } else {
    res.render("register");
  }
})

app.post('/login', getUser, async (
  req: Request<{}, {}, LoginInput>,
  res: Response<string, LoginLocals>
) => {
  // Create and send jwt session token:
  if (!res.locals.logged_in_user) {
    // getUser always sets LoginLocals or fails, so this should be impossible
    throw new Error("Error: absurd -- getUser did not set LoginLocals")
  }
  const { user_id, username } = res.locals.logged_in_user;
  const payload = { user_id: user_id, username: username };
  const weekInSeconds = 60 * 60 * 24 * 7;
  jwt.sign(payload, jwtSecret, { expiresIn: weekInSeconds }, (err, token) => {
    if (err) {
      throw err;
    } else if (typeof token === 'undefined') {
      logger.error("Error: Failed to generate token.");
      return res.status(500).end();
    } else {
      res.cookie("worduelSessionCookie", token, { maxAge: weekInSeconds * 1000 })
      res.header("HX-Redirect", "/user/" + user_id)
      return res.status(200).send();
    }
  })
});

app.get('/login', (req, res: Response<any, LoginLocals>) => {
  if (res.locals.logged_in_user) {
    // User already logged in. Redirect to their
    return res.redirect("/user/" + res.locals.logged_in_user.user_id);
  } else {
    res.render("login");
  }
})

// Debug route to test authentication middleware.
// TODO: Remove this on release!!!
app.get('/test-login', async (req, res: Response<any, LoginLocals>) => {
  if (!res.locals.logged_in_user) {
    return res.send("User not authenticated");
  }
  const user_id = res.locals.logged_in_user.user_id;
  try {
    let data = await db.one('SELECT * FROM users WHERE user_id = $1;', [user_id])
    return res.send(data);
  } catch (err) {
    throw err;
  }
});

interface UserSiteParams extends ParamsDictionary {
  userID: string
};

app.get("/logout", (req, res) => {
  return res.clearCookie("worduelSessionCookie").redirect("/");
})



interface UserStatsQuery {
  email: string,
  user_id: number,
  username: string,
  created_at: Date,
  games_played: number,
  games_won: number,
  is_public: boolean
}

const showOwnSite = async function (req: Request<UserSiteParams>, res: Response<any, LoginLocals>, next: NextFunction) {
  const user_id = +req.params.userID
  if (!res.locals.logged_in_user || user_id != res.locals.logged_in_user.user_id) {
    return next();
  }
  try {
    let data = await db.one<UserStatsQuery>('SELECT email, username, created_at, games_played, games_won, is_public FROM users WHERE user_id = $1;', [user_id])
    const options = {
      user_id: user_id,
      email: data.email,
      username: data.username,
      created_at: data.created_at,
      games_played: data.games_played,
      games_won: data.games_won,
      is_public: data.is_public,
    }
    return res.render("logged_in_user", options);
  } catch (err) {
    const error = err as PgError;
    //TODO: error handling
    return res.send("User does not exists");
  }
}

app.get('/user/:userID',
  showOwnSite,
  async (req: Request<UserSiteParams>, res: Response<any, LoginLocals>) => {
    const user_id = +req.params.userID
    try {
      let data = await db.one<UserStatsQuery>('SELECT email, username, created_at, games_played, games_won, is_public FROM users WHERE user_id = $1;', [user_id])
      const is_public = data.is_public;

      if (!is_public) {
        // Profile isnt public, so do not show it.
        // TODO: when making friends is implemented, allow them to see your profile even if not public
        return res.render("nonexistent_user");
      }

      const options = {
        user_id: user_id,
        username: data.username,
        created_at: data.created_at,
        games_played: data.games_played,
        games_won: data.games_won,
        is_public: data.is_public,
      }
      return res.render("user", options);
    } catch (err) {
      const error = err as PgError;
      //TODO: error handling
      return res.render("nonexistent_user");
    }
  })


app.patch("/update_user_data", async (req, res) => {
  const { username, email } = req.body;

  const is_public = (typeof req.body.is_public !== 'undefined')


  if (!res.locals.logged_in_user) {
    const message = "User not logged in.";
    return res.status(401).json({ message }).end();
  }
  const user_id = res.locals.logged_in_user.user_id;

  // TODO: Add proper validation.
  // TODO: Make this into a monad.
  if (typeof username !== 'string' || typeof email !== 'string' /* || typeof password !== 'string' */) {
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

  // create new session token before updating database -- if this fails, we dont update
  const payload = { user_id: user_id, username: username };
  const weekInSeconds = 60 * 60 * 24 * 7;
  jwt.sign(payload, jwtSecret, { expiresIn: weekInSeconds }, async (err, token) => {
    if (err) {
      throw err;
    } else if (typeof token === 'undefined') {
      console.log("Error: Failed to generate token.");
      return res.status(500).send("Error: Failed to generate token.");
    } else {
      try {
        await db.none(
          `UPDATE users
            SET email = $(email),
              username = $(username),
              is_public = $(is_public)
            WHERE user_id= $(user_id);`,
          { email, username, is_public, user_id }
        );
        res.cookie("worduelSessionCookie", token, { maxAge: weekInSeconds * 1000 })
        return res.header("HX-Refresh", "true").status(200).end();

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
    }
  })

})
