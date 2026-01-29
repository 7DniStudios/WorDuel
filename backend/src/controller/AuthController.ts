import { Request, Response } from 'express';

import { logger } from '../logging/logger';
import * as AuthService from '../service/AuthService';
import { LoginLocals, LoginInput } from '../middleware/AuthMiddleware';

const weekInSeconds = 60 * 60 * 24 * 7;

interface RegisterInput {
  username?: string;
  email?: string;
  password?: string;
}

function registerErrorToMessage(error: AuthService.RegisterError): string {
  switch (error) {
    case 'USERNAME_TAKEN':
      return 'Username already taken.';
    case 'EMAIL_TAKEN':
      return 'Email already registered.';
    case 'SERVER_ERROR':
    default:
      return 'Server error occurred. Please try again later.';
  }
}

export async function registerUser( 
  req: Request<{}, {}, RegisterInput>,
  res: Response
) {
  const { username, email, password } = req.body;

  // TODO: Add proper validation.
  // TODO: Make this into a monad.
  if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    const message = "Invalid input types.";
    return res.status(200).send( message );
  }

  if (username.length < 2 || username.length > 50) {
    const message = "Invalid username length. Must be between 2 and 50 characters.";
    return res.status(200).send(message);
  }

  if (email.length > 200) {
    const message = "Email too long. Max 200 characters.";
    return res.status(200).send(message);
  }

  if (password.length < 8 || password.length > 100) {
    const message = "Invalid password length. Must be between 8 and 100 characters.";
    return res.status(200).send(message);
  }

  const registerResult = await AuthService.registerUser(email, password, username);
  
  if (registerResult.success) {
    return res.header("HX-Redirect", "/auth/login").status(200).end();
  } else {
    let message = registerErrorToMessage(registerResult.error);
    return res.status(200).send(message);
  }
}

export function renderRegisterPage(
  req: Request,
  res: Response<any, LoginLocals>) {
  if (res.locals.logged_in_user) {
    // User already logged in. Redirect to their
    return res.redirect("/user/" + res.locals.logged_in_user.user_id);
  } else {
    res.render("register");
  }
}

export function logoutUser(req: Request, res: Response) {
  return res.clearCookie("worduelSessionCookie").redirect("/");
}

export function renderLoginPage(
  req: Request,
  res: Response<any, LoginLocals>) {
  if (res.locals.logged_in_user) {
    // User already logged in. Redirect to their
    return res.redirect("/user/" + res.locals.logged_in_user.user_id);
  } else {
    res.render("login");
  }
}

export async function loginUser(
  req: Request<{}, {}, LoginInput>,
  res: Response<string, LoginLocals>
) {
  // Create and send jwt session token:
  if (!res.locals.logged_in_user) {
    // getUser always sets LoginLocals or fails, so this should be impossible
    throw new Error("Error: absurd -- getUser did not set LoginLocals")
  }
  const { user_id, username } = res.locals.logged_in_user;
  
  const token = await AuthService.generateToken(user_id, username);
  
  res.cookie("worduelSessionCookie", token, { maxAge: weekInSeconds * 1000 })
  res.header("HX-Redirect", "/user/" + user_id);
  return res.status(200).send();
}

export async function updateData(req: Request, res: Response) {
  if (!res.locals.logged_in_user) {
    const message = "User not logged in.";
    return res.status(200).send({ message });
  }
  const user_id = res.locals.logged_in_user.user_id;

  const { username, email } = req.body;
  const is_public = (typeof req.body.is_public !== 'undefined')

  // TODO: Do not duplicate registration validation.
  if (typeof username !== 'string' || typeof email !== 'string' /* || typeof password !== 'string' */) {
    const message = "Invalid input types.";
    return res.status(200).send(message);
  }

  if (username.length < 2 || username.length > 50) {
    const message = "Invalid username length. Must be between 2 and 50 characters.";
    return res.status(200).send(message);
  }

  if (email.length > 200) {
    const message = "Email too long. Max 200 characters.";
    return res.status(200).send(message);
  }

  const input: AuthService.UpdateUserDataInput = {
    username,
    email,
    is_public
  };

  const updateResult = await AuthService.updateUserData(user_id, input);
  if (updateResult.success === false) {
    const message = registerErrorToMessage(updateResult.error);
    return res.status(200).send(message);
  }

  const token = await AuthService.generateToken(user_id, username);
  res.cookie("worduelSessionCookie", token, { maxAge: weekInSeconds * 1000 })
  return res.header("HX-Refresh", "true").status(200).end();
}
