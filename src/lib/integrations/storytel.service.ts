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

interface StorytelAuthorEntry {
  id?: string | number;
  name?: string;
}

interface StorytelBook {
  id: string | number;
  name?: string;
  origName?: string;
  authors?: StorytelAuthorEntry[];
  authorsAsString?: string;
  language?: { isoValue?: string; name?: string };
  largeCover?: string;
  cover?: string;
  grade?: string | number;
  series?: StorytelSeriesEntry[];
  seriesOrder?: string | number;
}

export interface StorytelAuthor {
  /** Numeric Storytel author id (stringified). */
  id: string;
  name: string;
  /** Number of Swedish audiobooks seen for this author in the search sample. */
  bookCount: number;
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

/**
 * Diacritic-insensitive name normalization for author matching
 * (Audnexus may render "Läckberg" as "Lackberg").
 */
export function normalizeAuthorName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** True for entries that mapEntry would keep: Swedish-language audiobooks. */
function isSwedishAudiobook(entry: StorytelSearchEntry): boolean {
  return entry.book?.language?.isoValue === 'sv' && !!entry.abook;
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

  /** Raw search entries (all types); throws on transport errors. */
  private async rawSearch(query: string): Promise<StorytelSearchEntry[]> {
    const { data } = await this.client.get<StorytelSearchResponse>('/api/search.action', {
      params: { q: query, request_locale: 'sv' },
    });
    return data?.books ?? [];
  }

  /**
   * Search Storytel's Swedish catalog. Returns Swedish-language audiobooks
   * only (ebook-only and foreign-language entries are dropped), capped at
   * MAX_SEARCH_RESULTS. The legacy API has no pagination.
   */
  async search(query: string): Promise<AudibleAudiobook[]> {
    try {
      const entries = await this.rawSearch(query);
      const results: AudibleAudiobook[] = [];

      for (const entry of entries) {
        if (results.length >= MAX_SEARCH_RESULTS) break;
        if (!isSwedishAudiobook(entry)) continue;
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
   * Distinct authors of Swedish audiobooks matching a name query
   * (diacritic-insensitive substring match on the author name). The legacy
   * API has no author entity search, so authors are collected from the
   * `book.authors[]` of search results.
   */
  async searchAuthors(query: string): Promise<StorytelAuthor[]> {
    try {
      const entries = await this.rawSearch(query);
      const normalizedQuery = normalizeAuthorName(query);
      const byId = new Map<string, StorytelAuthor>();

      for (const entry of entries) {
        if (!isSwedishAudiobook(entry)) continue;
        for (const author of entry.book?.authors ?? []) {
          if (author.id === undefined || author.id === null || !author.name) continue;
          if (!normalizeAuthorName(author.name).includes(normalizedQuery)) continue;
          const id = String(author.id);
          const existing = byId.get(id);
          if (existing) {
            existing.bookCount++;
          } else {
            byId.set(id, { id, name: author.name, bookCount: 1 });
          }
        }
      }

      const authors = [...byId.values()].sort((a, b) => b.bookCount - a.bookCount);
      logger.info(`Found ${authors.length} Storytel authors for "${query}"`);
      return authors;
    } catch (error) {
      logger.error('Storytel author search failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Swedish audiobooks by a specific author. Searches by the author's name
   * (the only query the legacy API supports) and keeps entries whose
   * `book.authors[]` contains the author — by numeric id when given,
   * otherwise by diacritic-insensitive exact name match.
   */
  async getBooksByAuthor(authorName: string, authorId?: string): Promise<AudibleAudiobook[]> {
    try {
      const entries = await this.rawSearch(authorName);
      const normalizedName = normalizeAuthorName(authorName);
      const results: AudibleAudiobook[] = [];

      for (const entry of entries) {
        if (results.length >= MAX_SEARCH_RESULTS) break;
        if (!isSwedishAudiobook(entry)) continue;
        const authorMatch = (entry.book?.authors ?? []).some((a) =>
          authorId !== undefined
            ? String(a.id) === authorId
            : !!a.name && normalizeAuthorName(a.name) === normalizedName,
        );
        if (!authorMatch) continue;
        const mapped = mapEntry(entry);
        if (mapped) results.push(mapped);
      }

      logger.info(`Found ${results.length} Storytel books for author "${authorName}"`);
      return results;
    } catch (error) {
      logger.error('Storytel author books failed', {
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
