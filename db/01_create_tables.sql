
\c worduel_db

CREATE EXTENSION IF NOT EXISTS pgcrypto;

--------------------------------------------
-- WORDS RELATED TABLES
--------------------------------------------

-- two different languages can have words that are spelled the same, so we use an autoincremented id
-- we could use the word-language pair as primary key, but it doesn't feel like a good solution
CREATE TABLE words(
    word_id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    word    char(8) NOT NULL,
    lang    char(2) NOT NULL,

    -- ensure no duplicate words in the same language
    CONSTRAINT unique_word_lang UNIQUE (word, lang)
);

CREATE TABLE word_stats(
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
    -- we use JS bcrypt library. Their hashes and salts are concatenated, and have total length of 60 chars
    password_hash CHAR(60) NOT NULL,   
    username      VARCHAR(50) NOT NULL,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    games_played  INTEGER NOT NULL DEFAULT 0 CHECK (games_played>=0),
    games_won     INTEGER NOT NULL DEFAULT 0 CHECK (games_won>=0),
    is_public     BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT unique_username UNIQUE (username),
    CONSTRAINT unique_email UNIQUE (email)
);


CREATE TABLE friend_relation(
    friends_id    INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    lower_id      INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    higher_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    sender_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    was_accepted  BOOLEAN NOT NULL DEFAULT false,
    friends_since TIMESTAMP DEFAULT NULL,
    
    CONSTRAINT sender_is_one_of_participants CHECK(sender_id = lower_id OR sender_id = higher_id),
    CONSTRAINT id_ordering CHECK( lower_id < higher_id),
    CONSTRAINT no_repeated_friendships UNIQUE (lower_id, higher_id)
);

CREATE VIEW friend_requests AS (
    SELECT friends_id, sender_id, (lower_id + higher_id - sender_id) AS reciever_id -- I am unsure if this is a good solution but it works and should be faster than an IF statement
        FROM friend_relation WHERE was_accepted = false
);

CREATE VIEW friends_lookup AS (
    SELECT friends_id, lower_id AS fst, higher_id AS snd, friends_since FROM friend_relation WHERE was_accepted = true
    UNION
    SELECT friends_id, higher_id AS fst, lower_id AS snd, friends_since FROM friend_relation WHERE was_accepted = true
);

-- TODO: add indexes to things we use in WHERE statement, that are not primary keys or UNIQUE, to speed up queries


CREATE OR REPLACE FUNCTION accept_friend_request(request_id INTEGER) RETURNS void AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM friend_relation WHERE friends_id = request_id AND was_accepted = true) THEN
        RAISE EXCEPTION 'Friendship relation with id % is already accepted', request_id; -- add USING ERRORCODE '<coś>' for better error handling
    END IF;
    
    UPDATE friend_relation SET was_accepted = true, friends_since = NOW() WHERE friends_id = request_id; 
END;
$$ LANGUAGE plpgsql;


