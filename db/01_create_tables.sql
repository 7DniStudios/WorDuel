
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


CREATE TABLE friend_requests (
    id          INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    sender_id   INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    reciever_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    send_time   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT sender_reciever_different CHECK (sender_id != reciever_id)
);

CREATE TABLE friends(
    friends_id    INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    lower_id      INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    higher_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    friends_since TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT id_ordering CHECK( lower_id < higher_id)
);

CREATE VIEW friends_lookup AS (
    SELECT lower_id AS fst, higher_id AS snd, friends_since FROM friends
    UNION
    SELECT higher_id AS fst, lower_id AS snd, friends_since FROM friends
);

-- TODO: add trigger to make sure users that are already friends cant have an active friend request between each other

CREATE OR REPLACE FUNCTION accept_friend_request(request_id INTEGER) RETURNS void AS $$
DECLARE
    fst_id INTEGER;
    snd_id INTEGER;
    temp INTEGER;
BEGIN
    SELECT sender_id, reciever_id
        INTO fst_id, snd_id 
        FROM friend_requests
        WHERE id = request_id
    ;
    
    IF snd_id < fst_id THEN
        temp := fst_id;
        fst_id := snd_id;
        snd_id := temp;
    END IF;
    
    
    DELETE FROM friend_requests WHERE id = request_id;
    INSERT INTO friends(lower_id, higher_id) VALUES (fst_id, snd_id);
    
END;
$$ LANGUAGE plpgsql;


-- TODO: add indexes to things we use in WHERE statement, that are not primary keys or UNIQUE, to speed up queries