/**
 * Deterministic timetable version management.
 * Format: YYYY.MM.DD.NNN (e.g. 2026.10.02.001)
 */

export interface ParsedVersion {
  year: number;
  month: number;
  day: number;
  sequence: number;
  raw: string;
}

export function parseVersion(versionStr: string): ParsedVersion | null {
  const match = versionStr.match(/^(\d{4})\.(\d{2})\.(\d{2})\.(\d{3})$/);
  if (!match) return null;
  return {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10),
    day: parseInt(match[3], 10),
    sequence: parseInt(match[4], 10),
    raw: versionStr,
  };
}

/**
 * Compares two versions.
 * Returns negative if v1 < v2, positive if v1 > v2, 0 if equal.
 */
export function compareVersions(v1: string, v2: string): number {
  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);
  if (!p1 || !p2) {
    return v1.localeCompare(v2);
  }
  if (p1.year !== p2.year) return p1.year - p2.year;
  if (p1.month !== p2.month) return p1.month - p2.month;
  if (p1.day !== p2.day) return p1.day - p2.day;
  return p1.sequence - p2.sequence;
}

/**
 * Generates the next version string for a given date.
 * If previous version was on the same date, increments sequence.
 * Otherwise starts with sequence 001.
 */
export function generateNextVersion(previousVersion?: string, date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const datePrefix = `${year}.${month}.${day}`;

  if (previousVersion) {
    const parsed = parseVersion(previousVersion);
    if (parsed && parsed.year === year && parsed.month === parseInt(month, 10) && parsed.day === parseInt(day, 10)) {
      const nextSeq = String(parsed.sequence + 1).padStart(3, '0');
      return `${datePrefix}.${nextSeq}`;
    }
  }

  return `${datePrefix}.001`;
}
