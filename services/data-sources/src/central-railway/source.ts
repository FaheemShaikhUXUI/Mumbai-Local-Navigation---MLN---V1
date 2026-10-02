import { computeSha256 } from '@mumbai-timetable/shared';
import { SourceCheckResult } from '../western-railway/source.js';

export class CentralRailwaySource {
  public static readonly DEFAULT_URL =
    'https://cr.indianrailways.gov.in/view_section.jsp?fontColor=black&backgroundColor=LIGHTSTEELBLUE&lang=0&id=0,5,2360';

  private sourceUrl: string;

  constructor(sourceUrl: string = CentralRailwaySource.DEFAULT_URL) {
    this.sourceUrl = sourceUrl;
  }

  async checkSource(previousHash?: string, previousEtag?: string): Promise<SourceCheckResult> {
    try {
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

      const linkedDocuments: Array<{ title: string; url: string }> = [];
      const linkRegex = /<a\s+[^>]*href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        const docUrl = match[1].startsWith('http')
          ? match[1]
          : `https://cr.indianrailways.gov.in/${match[1].replace(/^\//, '')}`;
        const title = match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        linkedDocuments.push({ title: title || 'Official CR Timetable Document', url: docUrl });
      }

      const hasChanged = previousHash ? contentHash !== previousHash : true;

      return {
        hasChanged,
        etag,
        lastModified,
        contentHash,
        sourceUrl: this.sourceUrl,
        linkedDocuments,
        rawHtml: html,
      };
    } catch {
      return {
        hasChanged: false,
        contentHash: previousHash || 'cr-offline-fallback-hash',
        sourceUrl: this.sourceUrl,
        linkedDocuments: [],
      };
    }
  }
}
