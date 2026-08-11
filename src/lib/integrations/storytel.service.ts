/**
 * Component: Storytel Integration Service
 * Documentation: documentation/integrations/storytel.md
 *
 * Supplementary Swedish metadata source. Storytel's legacy public JSON API
 * (no auth) has far better Swedish audiobook coverage than audible.de.
 * Books are mapped into the AudibleAudiobook shape with a 'ST'-prefixed
 * pseudo-ASIN (see storytel-ids.ts) so they flow through the existing
 * search/request pipeline unchanged.
 */

import axios, { AxiosInstance } from 'axios';
import { RMABLogger } from '../utils/logger';
import { pickUserAgent, getBrowserHeaders } from '../utils/scrape-resilience';
import { toStorytelAsin } from '../utils/storytel-ids';
import type { AudibleAudiobook } from './audible.service';

const logger = RMABLogger.create('Storytel');

const STORYTEL_BASE_URL = 'https://www.storytel.com';
const MAX_SEARCH_RESULTS = 50;

interface StorytelSeriesEntry {
  id?: string;
  name?: string;
}

interface StorytelBook {
  id: string | number;
  name?: string;
  origName?: string;
  authorsAsString?: string;
  language?: { isoValue?: string; name?: string };
  largeCover?: string;
  cover?: string;
  grade?: string | number;
  series?: StorytelSeriesEntry[];
  seriesOrder?: string | number;
}

interface StorytelAbook {
  id?: string | number;
  isbn?: string;
  description?: string;
  narratorAsString?: string;
  /** Duration in milliseconds (stringified number). */
  length?: string | number;
  releaseDateFormat?: string;
  publisher?: { name?: string };
}

interface StorytelSearchEntry {
  book?: StorytelBook;
  abook?: StorytelAbook | null;
  shareUrl?: string;
}

interface StorytelSearchResponse {
  books?: StorytelSearchEntry[];
}

interface StorytelBookInfoResponse {
  result?: string;
  slb?: StorytelSearchEntry;
  shareUrl?: string;
}

function mapEntry(entry: StorytelSearchEntry): AudibleAudiobook | null {
  const book = entry.book;
  const abook = entry.abook;
  if (!book?.id || !abook) return null;

  const durationMs = Number(abook.length);
  const rating = Number(book.grade);
  const seriesEntry = book.series?.[0];
  const seriesOrder =
    book.seriesOrder !== undefined && String(book.seriesOrder) !== '0'
      ? String(book.seriesOrder)
      : undefined;
  const coverPath = book.largeCover || book.cover;

  return {
    asin: toStorytelAsin(book.id),
    title: book.name ?? '',
    author: book.authorsAsString ?? '',
    narrator: abook.narratorAsString || undefined,
    description: abook.description || undefined,
    coverArtUrl: coverPath ? `${STORYTEL_BASE_URL}${coverPath}` : undefined,
    durationMinutes:
      Number.isFinite(durationMs) && durationMs > 0
        ? Math.round(durationMs / 60000)
        : undefined,
    releaseDate: abook.releaseDateFormat || undefined,
    rating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
    series: seriesEntry?.name || undefined,
    seriesPart: seriesEntry?.name ? seriesOrder : undefined,
    language: 'swedish',
    publisherName: abook.publisher?.name || undefined,
    source: 'storytel',
    isbn: abook.isbn || undefined,
    storeUrl: entry.shareUrl || undefined,
  };
}

export class StorytelService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: STORYTEL_BASE_URL,
      timeout: 15000,
      headers: getBrowserHeaders(pickUserAgent()),
    });
  }

  /**
   * Search Storytel's Swedish catalog. Returns Swedish-language audiobooks
   * only (ebook-only and foreign-language entries are dropped), capped at
   * MAX_SEARCH_RESULTS. The legacy API has no pagination.
   */
  async search(query: string): Promise<AudibleAudiobook[]> {
    try {
      const { data } = await this.client.get<StorytelSearchResponse>('/api/search.action', {
        params: { q: query, request_locale: 'sv' },
      });

      const entries = data?.books ?? [];
      const results: AudibleAudiobook[] = [];

      for (const entry of entries) {
        if (results.length >= MAX_SEARCH_RESULTS) break;
        if (entry.book?.language?.isoValue !== 'sv') continue;
        const mapped = mapEntry(entry);
        if (mapped) results.push(mapped);
      }

      logger.info(`Found ${results.length} Swedish audiobooks for "${query}"`);
      return results;
    } catch (error) {
      logger.error('Storytel search failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Fetch details for a single Storytel book by its numeric bookId.
   */
  async getBookDetails(bookId: string): Promise<AudibleAudiobook | null> {
    try {
      const { data } = await this.client.get<StorytelBookInfoResponse>(
        '/api/getBookInfoForContent.action',
        { params: { bookId, request_locale: 'sv' } },
      );

      if (data?.result !== 'success' || !data.slb) return null;

      const mapped = mapEntry({
        ...data.slb,
        shareUrl: data.slb.shareUrl ?? data.shareUrl,
      });
      if (!mapped) return null;
      return mapped;
    } catch (error) {
      logger.error(`Storytel book details failed for bookId ${bookId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

let storytelService: StorytelService | null = null;

export function getStorytelService(): StorytelService {
  if (!storytelService) {
    storytelService = new StorytelService();
  }
  return storytelService;
}
