import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  if (!initPromise) {
    initPromise = (async () => {
      try {
        const db = await SQLite.openDatabaseAsync('modkit-v2.db');
        await db.execAsync('PRAGMA journal_mode = WAL;');
        await db.execAsync('PRAGMA foreign_keys = ON;');
        
        // Fully provision baseline pipeline tables to avoid 'no such table' errors
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS pipeline_jobs (
            id TEXT PRIMARY KEY,
            status TEXT,
            apk_path TEXT,
            created_at INTEGER
          );
          CREATE TABLE IF NOT EXISTS pipeline_chats (
            id TEXT PRIMARY KEY,
            job_id TEXT,
            title TEXT,
            created_at INTEGER
          );
          CREATE TABLE IF NOT EXISTS class_cache (
            class_name TEXT PRIMARY KEY,
            data TEXT
          );
        `);
        
        dbInstance = db;
        return db;
      } catch (err) {
        initPromise = null;
        throw err;
      }
    })();
  }

  return initPromise;
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
