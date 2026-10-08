import { getDatabase } from '../db/client';

export async function getCachedClassData(className: string) {
  try {
    const db = await getDatabase();
    if (!db) {
      console.warn("Database handle is null in classCache");
      return null;
    }
    
    // Ensure table exists safely before preparing statement
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS class_cache (
        class_name TEXT PRIMARY KEY,
        data TEXT
      );
    `);

    const stmt = await db.prepareAsync('SELECT data FROM class_cache WHERE class_name = ?');
    try {
      const result = await stmt.executeAsync({ $1: className });
      const firstRow = await result.getFirstAsync();
      return firstRow;
    } finally {
      await stmt.finalizeAsync();
    }
  } catch (err) {
    console.error("Error in getCachedClassData:", err);
    return null;
  }
}
