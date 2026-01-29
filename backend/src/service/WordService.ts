import { ITask } from 'pg-promise';
import { db } from '../config/db';
import { logger } from '../logging/logger';

interface WordRecord {
    word_id: number;
    word: string;
    lang: string;
}

// Unused now; Will be used in the future.
export async function drawRandomWord(languageSanitized: string): Promise<WordRecord> {
  return db.tx('draw-word-transaction', async (t: ITask<any>) => {
    // TODO: Do not use 'ORDER BY RANDOM()' for performance reasons.
    // TODO: Implement pseudo-random selection based on word_stats data (timestamp, game_count).
    const drawnWord = await t.oneOrNone<WordRecord>(
      `SELECT word_id, word, lang 
        FROM words 
        WHERE lang = $(language) 
        ORDER BY RANDOM() 
        LIMIT 1`,
      { language: languageSanitized }
    );

    if (!drawnWord) {
      throw new Error(`No words found for language: ${languageSanitized}`);
    }

    await t.none(
      `UPDATE word_stats
        SET game_count = game_count + 1, last_used = NOW()
        WHERE word_id = $(word_id)`,
      { word_id: drawnWord.word_id }
    );

    return drawnWord;
  });
}

type WordExists =
  | { exists: true }
  // TODO: Add 'exists in another language' case.
  | { exists: false, reason: 'NOT_FOUND' };

export async function checkWordExists(languageSanitized: string, wordSanitized: string): Promise<WordExists> {
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
    if (result !== null) {
      return { exists: true };
    } else {
      return { exists: false, reason: 'NOT_FOUND' };
    }
  } catch (error) {
    logger.error('Database error in checkWordExists:', error);
    return { exists: false, reason: 'NOT_FOUND' };
  }
}
