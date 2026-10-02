import { SqliteAdapter } from '@mumbai-timetable/database';

/**
 * AndroidSqliteAdapter
 * Direct bridge to Android SQLite (via expo-sqlite or SQLiteOpenHelper).
 * Provides high-speed native binary queries on Android with index optimization.
 */
export class AndroidSqliteAdapter implements SqliteAdapter {
  private db: any;

  constructor(dbInstance: any) {
    this.db = dbInstance;
  }

  async execute(sql: string, params: any[] = []): Promise<void> {
    if (this.db.runAsync) {
      await this.db.runAsync(sql, params);
    } else if (this.db.executeSql) {
      await new Promise<void>((resolve, reject) => {
        this.db.executeSql(sql, params, () => resolve(), reject);
      });
    }
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (this.db.getAllAsync) {
      return await this.db.getAllAsync(sql, params);
    }
    return [];
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    if (this.db.getFirstAsync) {
      return await this.db.getFirstAsync(sql, params);
    }
    const all = await this.query<T>(sql, params);
    return all.length > 0 ? all[0] : null;
  }

  async execScript(sql: string): Promise<void> {
    if (this.db.execAsync) {
      await this.db.execAsync(sql);
    }
  }

  async beginTransaction(): Promise<void> {
    await this.execute('BEGIN TRANSACTION;');
  }

  async commitTransaction(): Promise<void> {
    await this.execute('COMMIT;');
  }

  async rollbackTransaction(): Promise<void> {
    await this.execute('ROLLBACK;');
  }

  async close(): Promise<void> {
    if (this.db.closeAsync) {
      await this.db.closeAsync();
    }
  }
}
