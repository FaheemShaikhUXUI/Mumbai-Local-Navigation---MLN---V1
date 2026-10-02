/**
 * Unified SQLite Adapter Interface.
 * Allows identical application & search logic to run against:
 * 1. Android Native SQLite (expo-sqlite / SQLiteOpenHelper)
 * 2. Node.js backend canonical database (node:sqlite / better-sqlite3)
 * 3. In-memory / SQL.js testing and web-preview engine
 */
export interface SqliteAdapter {
  execute(sql: string, params?: any[]): Promise<void>;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execScript(sql: string): Promise<void>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
  close(): Promise<void>;
}
