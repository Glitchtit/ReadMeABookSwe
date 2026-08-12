/**
 * Component: Author Search API Route
 * Documentation: documentation/integrations/audible.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/middleware/auth';
import { getConfigService } from '@/lib/services/config.service';
import { AUDIBLE_REGIONS, DEFAULT_AUDIBLE_REGION, AudibleRegion } from '@/lib/types/audible';
import { RMABLogger } from '@/lib/utils/logger';
import {
  AudnexusAuthorDetail,
  searchAuthors,
  fetchAuthorDetail,
} from '@/lib/integrations/audnexus-authors';
import { getStorytelService, normalizeAuthorName } from '@/lib/integrations/storytel.service';
import { toStorytelAuthorAsin } from '@/lib/utils/storytel-ids';

const logger = RMABLogger.create('API.Authors.Search');

/**
 * GET /api/authors/search?name=Brandon Sanderson
 * Search for authors on Audnexus, deduplicate, and return enriched details
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const currentUser = getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const name = request.nextUrl.searchParams.get('name');

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'ValidationError', message: 'Author name is required' },
        { status: 400 }
      );
    }

    // Get configured Audible region
    const configService = getConfigService();
    const audibleRegion: AudibleRegion = await configService.getAudibleRegion();
    const region = AUDIBLE_REGIONS[audibleRegion]?.audnexusParam || AUDIBLE_REGIONS[DEFAULT_AUDIBLE_REGION].audnexusParam;

    logger.info(`Searching authors: "${name}" (region: ${region})`);

    // Steps 1-3: Audnexus author search + parallel detail enrichment.
    // Degrades to an empty list on failure so Storytel results still return.
    let authors: Array<{
      asin: string;
      name: string;
      description?: string;
      image?: string;
      genres: string[];
      similarCount: number;
    }> = [];
    try {
      const searchResults = await searchAuthors(name.trim(), region);
      const detailPromises = searchResults.map(author => fetchAuthorDetail(author.asin, region));
      const detailResults = await Promise.all(detailPromises);

      authors = detailResults
        .filter((detail): detail is AudnexusAuthorDetail => detail !== null)
        .map(detail => ({
          asin: detail.asin,
          name: detail.name,
          description: detail.description || undefined,
          image: detail.image || undefined,
          genres: detail.genres?.map(g => g.name).slice(0, 3) || [],
          similarCount: detail.similar?.length || 0,
        }));
    } catch (audnexusError) {
      logger.warn('Audnexus author search failed, continuing with Storytel only', {
        error: audnexusError instanceof Error ? audnexusError.message : String(audnexusError),
      });
    }

    // Step 4: Merge Storytel-only authors (Swedish support). Authors already
    // found on Audnexus keep their Audible identity — their Swedish books are
    // merged on the author page instead. Storytel-only authors get an 'SA'
    // pseudo-ASIN and a minimal card (the legacy API has no image/bio).
    if (await configService.isStorytelEnabled()) {
      const storytelAuthors = await getStorytelService().searchAuthors(name.trim());
      const seenNames = new Set(authors.map(a => normalizeAuthorName(a.name)));
      for (const author of storytelAuthors) {
        if (seenNames.has(normalizeAuthorName(author.name))) continue;
        authors.push({
          asin: toStorytelAuthorAsin(author.id),
          name: author.name,
          description: undefined,
          image: undefined,
          genres: [],
          similarCount: 0,
        });
      }
    }

    logger.info(`Author search complete: "${name}" → ${authors.length} results`);

    return NextResponse.json({
      success: true,
      authors,
      query: name.trim(),
    });
  } catch (error) {
    logger.error('Failed to search authors', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'SearchError', message: 'Failed to search authors' },
      { status: 500 }
    );
  }
}
