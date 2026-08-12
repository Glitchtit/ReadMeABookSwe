/**
 * Component: Author Books API Route
 * Documentation: documentation/integrations/audible.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAudibleService, type AudibleAudiobook } from '@/lib/integrations/audible.service';
import { getStorytelService } from '@/lib/integrations/storytel.service';
import { getConfigService } from '@/lib/services/config.service';
import { isStorytelAuthorAsin, fromStorytelAuthorAsin } from '@/lib/utils/storytel-ids';
import { enrichAudiobooksWithMatches } from '@/lib/utils/audiobook-matcher';
import { deduplicateAndCollectGroups } from '@/lib/utils/deduplicate-audiobooks';
import { persistDedupGroups, collapseByExistingWorks } from '@/lib/services/works.service';
import { getCurrentUser } from '@/lib/middleware/auth';
import { RMABLogger } from '@/lib/utils/logger';
import { annotateWithIgnoreStatus } from '@/lib/utils/ignored-audiobooks';

const logger = RMABLogger.create('API.Authors.Books');

/**
 * GET /api/authors/{asin}/books?name=Author+Name
 * Scrape Audible for all books by this author, filtered by ASIN and English language.
 * Enriched with library availability and request status.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ asin: string }> }
) {
  try {
    const currentUser = getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { asin } = await params;
    const authorName = request.nextUrl.searchParams.get('name');

    if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) {
      return NextResponse.json(
        { error: 'ValidationError', message: 'Valid author ASIN is required' },
        { status: 400 }
      );
    }

    if (!authorName || authorName.trim().length === 0) {
      return NextResponse.json(
        { error: 'ValidationError', message: 'Author name is required' },
        { status: 400 }
      );
    }

    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);

    logger.info(`Fetching books for author "${authorName}" (ASIN: ${asin}), page ${page}`);

    let books: AudibleAudiobook[];
    let hasMore = false;
    let resultPage = page;

    if (isStorytelAuthorAsin(asin)) {
      // Storytel-only author: books come exclusively from Storytel, matched by
      // numeric author id. The legacy API has no pagination — page 1 only.
      const authorId = fromStorytelAuthorAsin(asin)!;
      books = page === 1
        ? await getStorytelService().getBooksByAuthor(authorName.trim(), authorId)
        : [];
    } else {
      const result = await getAudibleService().searchByAuthorAsin(authorName.trim(), asin, page);
      books = result.books;
      hasMore = result.hasMore;
      resultPage = result.page;

      // Swedish support: merge the author's Storytel books on page 1 (no
      // pagination upstream). Title+author duplicates keep the Audible entry,
      // which carries a real ASIN. Storytel failures degrade to Audible-only.
      if (page === 1 && (await getConfigService().isStorytelEnabled())) {
        const storytelBooks = await getStorytelService().getBooksByAuthor(authorName.trim());
        if (storytelBooks.length > 0) {
          const normKey = (b: AudibleAudiobook) =>
            `${b.title.toLowerCase().trim()}|${b.author.toLowerCase().trim()}`;
          const seen = new Set(books.map(normKey));
          books = [...books, ...storytelBooks.filter((b) => !seen.has(normKey(b)))];
        }
      }
    }

    // Two-pass dedup: local title/narrator/duration matching first, then collapse
    // any remaining duplicates that the works table already knows are the same book
    // (handles cases where source metadata diverges across paths or pages).
    const { books: dedupedBooks, groups } = deduplicateAndCollectGroups(books);

    if (groups.length > 0) {
      persistDedupGroups(groups).catch(() => {});
    }

    const collapsedBooks = await collapseByExistingWorks(dedupedBooks);

    // Enrich with library availability and request status
    const userId = currentUser.sub || undefined;
    const enrichedBooks = await enrichAudiobooksWithMatches(collapsedBooks, userId);

    // Annotate with per-user ignore status
    const annotatedBooks = await annotateWithIgnoreStatus(enrichedBooks, userId);

    logger.info(`Author books complete: "${authorName}" → ${annotatedBooks.length} books (page ${page})`);

    return NextResponse.json({
      success: true,
      books: annotatedBooks,
      authorName: authorName.trim(),
      authorAsin: asin,
      totalBooks: enrichedBooks.length,
      hasMore,
      page: resultPage,
    });
  } catch (error) {
    logger.error('Failed to fetch author books', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'FetchError', message: 'Failed to fetch author books' },
      { status: 500 }
    );
  }
}
