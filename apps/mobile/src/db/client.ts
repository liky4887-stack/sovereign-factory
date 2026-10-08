import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('modkit.db');
    await dbInstance.execAsync('PRAGMA journal_mode = WAL;');
    await dbInstance.execAsync('PRAGMA foreign_keys = ON;');
    
    // Ensure missing tables are automatically provisioned if migrations didn't run
    await dbInstance.execAsync(`
      CREATE TABLE IF NOT EXISTS pipeline_chats (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at INTEGER
      );
    `);
  }
  return dbInstance;
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  return getDatabase();
}

export async function safeExecAsync(query: string, params: any[] = []) {
  const db = await getDatabase();
  return await db.execAsync(query);
}

export async function safePrepareAsync(query: string) {
  const db = await getDatabase();
  return await db.prepareAsync(query);
}
