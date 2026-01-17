import { ITask } from 'pg-promise';
import { db } from './db';

interface WordRecord {
    word_id: number;
    word: string;
    lang: string;
}

// Unused now; Will be used in the future.
export async function drawRandomWord(languageUnchecked: string): Promise<WordRecord> {
  const language = languageUnchecked.toUpperCase().trim();
  if (language.length !== 2) {
    throw new Error('Language code must be 2 characters long');
  }

  return db.tx('draw-word-transaction', async (t: ITask<any>) => {
    // TODO: Do not use 'ORDER BY RANDOM()' for performance reasons.
    // TODO: Implement pseudo-random selection based on word_stats data (timestamp, game_count).
    const drawnWord = await t.oneOrNone<WordRecord>(
      `SELECT word_id, word, lang 
        FROM words 
        WHERE lang = $(language) 
        ORDER BY RANDOM() 
        LIMIT 1`,
      { language }
    );

    if (!drawnWord) {
      throw new Error(`No words found for language: ${language}`);
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
