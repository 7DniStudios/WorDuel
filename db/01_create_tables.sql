
\c worduel_db

CREATE EXTENSION IF NOT EXISTS pgcrypto;

--------------------------------------------
-- WORDS RELATED TABLES
--------------------------------------------

-- two different languages can have words that are spelled the same, so we use an autoincremented id
-- we could use the word-language pair as primary key, but it doesn't feel like a good solution
CREATE TABLE IF NOT EXISTS words(
    word_id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    word    char(8) NOT NULL,
    lang    char(2) NOT NULL,

    -- ensure no duplicate words in the same language
    CONSTRAINT unique_word_lang UNIQUE (word, lang)
);

CREATE TABLE IF NOT EXISTS word_stats(
    word_id        INTEGER PRIMARY KEY REFERENCES words(word_id) ON DELETE CASCADE ON UPDATE CASCADE,
    last_used      TIMESTAMP,
    game_count     INTEGER NOT NULL DEFAULT 0 CHECK (game_count>=0),
    won_game_count INTEGER NOT NULL DEFAULT 0 CHECK (won_game_count>=0),
    guess_count    INTEGER NOT NULL DEFAULT 0 CHECK (guess_count>=0)
);

--------------------------------------------
-- USER RELATED TABLES
--------------------------------------------

CREATE TABLE users (
    user_id       INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    email         VARCHAR(200) NOT NULL,
    -- we will use JS bcrypt library. Their hashes and salts are concatenated, and have total length of 60 chars
    password_hash CHAR(60) NOT NULL,   
    username      VARCHAR(50) NOT NULL,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    games_played  INTEGER NOT NULL DEFAULT 0 CHECK (games_played>=0),
    games_won     INTEGER NOT NULL DEFAULT 0 CHECK (games_won>=0),

    CONSTRAINT unique_username UNIQUE (username),
    CONSTRAINT unique_email UNIQUE (email)
);
