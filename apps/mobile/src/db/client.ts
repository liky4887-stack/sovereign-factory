import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('modkit.db');
  }
  return dbInstance;
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  return getDatabase();
}

export async function safeExecAsync(query: string, params: any[] = []) {
  const db = await getDatabase();
  if (!db) {
    throw new Error("Database instance is null or uninitialized.");
  }
  return await db.execAsync(query);
}
