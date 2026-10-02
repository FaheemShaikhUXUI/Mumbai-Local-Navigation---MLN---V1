import { Station, StationSearchResult } from '@mumbai-timetable/types';
import { SqliteAdapter } from '@mumbai-timetable/database';

/**
 * Calculates Levenshtein distance between two strings for typo tolerance.
 */
export function levenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix = Array.from({ length: bn + 1 }, () => new Array(an + 1).fill(0));
  for (let i = 0; i <= an; ++i) matrix[0][i] = i;
  for (let i = 0; i <= bn; ++i) matrix[i][0] = i;

  for (let i = 1; i <= bn; ++i) {
    for (let j = 1; j <= an; ++j) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }
  return matrix[bn][an];
}

export class StationSearchEngine {
  private adapter: SqliteAdapter;
  private cachedStations: Station[] | null = null;

  constructor(adapter: SqliteAdapter) {
    this.adapter = adapter;
  }

  /**
   * Refreshes the local in-memory station index.
   */
  async loadStations(): Promise<Station[]> {
    const rows = await this.adapter.query<any>('SELECT * FROM stations WHERE status = ?', ['ACTIVE']);
    this.cachedStations = rows.map((r) => ({
      ...r,
      aliases: typeof r.aliases === 'string' ? JSON.parse(r.aliases) : r.aliases || [],
    }));
    return this.cachedStations;
  }

  /**
   * Fast, multi-strategy station search:
   * 1. Exact station code (score 100)
   * 2. Exact station name (score 95)
   * 3. Prefix station code (score 90)
   * 4. Exact alias match (score 85)
   * 5. Prefix station name (score 80)
   * 6. Substring match in name or aliases (score 70)
   * 7. Fuzzy / Typo tolerance (score 50 - distance * 10)
   */
  async search(query: string, limit = 10): Promise<StationSearchResult[]> {
    if (!query || query.trim().length === 0) return [];

    if (!this.cachedStations) {
      await this.loadStations();
    }

    const cleanQuery = query.trim().toLowerCase();
    const cleanUpperQuery = query.trim().toUpperCase();
    const results: StationSearchResult[] = [];

    for (const station of this.cachedStations!) {
      const code = (station.station_code || '').toUpperCase();
      const name = (station.station_name || '').toLowerCase();
      const normalized = (station.normalized_name || '').toLowerCase();
      const aliases = (station.aliases || []).map((a) => a.toLowerCase());

      // 1. Exact station code match (e.g. 'KYN', 'CCG')
      if (code === cleanUpperQuery) {
        results.push({ station, score: 100, matchedField: 'code' });
        continue;
      }

      // 2. Exact station name match
      if (name === cleanQuery || normalized === cleanQuery) {
        results.push({ station, score: 95, matchedField: 'name' });
        continue;
      }

      // 3. Exact alias match (e.g. 'Bombay Central' or 'VT')
      if (aliases.some((a) => a === cleanQuery)) {
        results.push({ station, score: 92, matchedField: 'alias' });
        continue;
      }

      // 4. Station code prefix (e.g. 'KY' -> 'KYN')
      if (code.startsWith(cleanUpperQuery) && cleanUpperQuery.length >= 2) {
        results.push({ station, score: 88, matchedField: 'code' });
        continue;
      }

      // 5. Station name prefix (e.g. 'Kaly' -> 'Kalyan')
      if (name.startsWith(cleanQuery) || normalized.startsWith(cleanQuery)) {
        results.push({ station, score: 80, matchedField: 'name' });
        continue;
      }

      // 6. Substring match in name or aliases
      if (name.includes(cleanQuery) || normalized.includes(cleanQuery)) {
        results.push({ station, score: 70, matchedField: 'name' });
        continue;
      }
      if (aliases.some((a) => a.includes(cleanQuery))) {
        results.push({ station, score: 65, matchedField: 'alias' });
        continue;
      }

      // 7. Fuzzy typo tolerance for queries >= 4 chars (e.g. 'Kalyan Jn' -> 'Kalyan')
      if (cleanQuery.length >= 4) {
        const distName = levenshteinDistance(cleanQuery, name.slice(0, cleanQuery.length));
        if (distName <= 2) {
          results.push({
            station,
            score: Math.max(30, 60 - distName * 15),
            matchedField: 'name',
          });
        }
      }
    }

    // Sort by score descending, then alphabetically by name
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.station.station_name.localeCompare(b.station.station_name);
    });

    return results.slice(0, limit);
  }
}
