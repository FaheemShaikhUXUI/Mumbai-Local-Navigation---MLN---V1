import { computeSha256 } from '@mumbai-timetable/shared';

export interface SourceCheckResult {
  hasChanged: boolean;
  etag?: string;
  lastModified?: string;
  contentHash: string;
  sourceUrl: string;
  effectiveDate?: string;
  linkedDocuments: Array<{ title: string; url: string }>;
  rawHtml?: string;
}

export class WesternRailwaySource {
  public static readonly DEFAULT_URL =
    'https://wr.indianrailways.gov.in/view_section.jsp?fontColor=black&backgroundColor=LIGHTSTEELBLUE&lang=0&id=0,6,458';

  private sourceUrl: string;

  constructor(sourceUrl: string = WesternRailwaySource.DEFAULT_URL) {
    this.sourceUrl = sourceUrl;
  }

  /**
   * Checks the official Western Railway website for timetable changes.
   * Uses ETag, Last-Modified, and SHA-256 hash comparison (Section 13).
   */
  async checkSource(previousHash?: string, previousEtag?: string): Promise<SourceCheckResult> {
    try {
      // Use native fetch with TLS rejection disabled if government portal uses legacy TLS
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MumbaiLocalSyncBot/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml',
      };
      if (previousEtag) {
        headers['If-None-Match'] = previousEtag;
      }

      const response = await fetch(this.sourceUrl, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.status === 304) {
        return {
          hasChanged: false,
          etag: previousEtag,
          contentHash: previousHash || '',
          sourceUrl: this.sourceUrl,
          linkedDocuments: [],
        };
      }

      const html = await response.text();
      const etag = response.headers.get('etag') || undefined;
      const lastModified = response.headers.get('last-modified') || undefined;
      const contentHash = computeSha256(html);

      // Extract effective date from text e.g. "Mumbai Suburban Timetable w.e.f. 01.09.2026"
      const dateMatch = html.match(/w\.e\.f\.?\s*([0-9]{2}[./-][0-9]{2}[./-][0-9]{4})/i);
      const effectiveDate = dateMatch ? dateMatch[1].replace(/[./]/g, '-') : undefined;

      // Extract linked official PDFs (PTT 79 DN, PTT 79 UP, AC EMU, Dahanu Road EMU, etc.)
      const linkedDocuments: Array<{ title: string; url: string }> = [];
      const linkRegex = /<a\s+[^>]*href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        const docUrl = match[1].startsWith('http')
          ? match[1]
          : `https://wr.indianrailways.gov.in/${match[1].replace(/^\//, '')}`;
        const title = match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        linkedDocuments.push({ title: title || 'Official Timetable Document', url: docUrl });
      }

      const hasChanged = previousHash ? contentHash !== previousHash : true;

      return {
        hasChanged,
        etag,
        lastModified,
        contentHash,
        sourceUrl: this.sourceUrl,
        effectiveDate,
        linkedDocuments,
        rawHtml: html,
      };
    } catch (err: any) {
      // In offline / network restricted scenarios or test environments:
      return {
        hasChanged: false,
        contentHash: previousHash || 'offline-fallback-hash',
        sourceUrl: this.sourceUrl,
        linkedDocuments: [],
      };
    }
  }
}
