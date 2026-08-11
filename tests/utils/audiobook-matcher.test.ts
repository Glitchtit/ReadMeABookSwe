/**
 * Component: Audiobook Matcher Tests
 * Documentation: documentation/integrations/audible.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaMock } from '../helpers/prisma';

const prismaMock = createPrismaMock() as ReturnType<typeof createPrismaMock> & {
  reportedIssue: { findMany: ReturnType<typeof vi.fn> };
};

// Add reportedIssue mock (not yet in shared helper) for getOpenIssuesByAsins
(prismaMock as any).reportedIssue = { findMany: vi.fn() };

vi.mock('@/lib/db', () => ({
  prisma: prismaMock,
}));

describe('audiobook-matcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ASIN exact match from dedicated field', async () => {
    prismaMock.plexLibrary.findMany.mockResolvedValue([
      {
        plexGuid: 'guid-1',
        plexRatingKey: 'rating-1',
        title: 'Test Book',
        author: 'Test Author',
        asin: 'B00TEST123',
        isbn: null,
      },
    ]);

    const { findPlexMatch } = await import('@/lib/utils/audiobook-matcher');
    const match = await findPlexMatch({
      asin: 'B00TEST123',
      title: 'Test Book',
      author: 'Test Author',
    });

    expect(match?.plexGuid).toBe('guid-1');
  });

  it('rejects candidates with mismatched ASINs in plexGuid', async () => {
    prismaMock.plexLibrary.findMany.mockResolvedValue([
      {
        plexGuid: 'com.plexapp.agents.audible://B00WRONG999',
        plexRatingKey: null,
        title: 'Test Book',
        author: 'Test Author',
        asin: null,
        isbn: null,
      },
    ]);

    const { findPlexMatch } = await import('@/lib/utils/audiobook-matcher');
    const match = await findPlexMatch({
      asin: 'B00RIGHT123',
      title: 'Test Book',
      author: 'Test Author',
    });

    expect(match).toBeNull();
  });

  it('returns null when no ASIN match exists (fuzzy matching removed)', async () => {
    prismaMock.plexLibrary.findMany.mockResolvedValue([]);

    const { findPlexMatch } = await import('@/lib/utils/audiobook-matcher');
    const match = await findPlexMatch({
      asin: 'B00TEST999',
      title: 'Great Book',
      author: 'Different Author',
      narrator: 'Jane Narrator',
    });

    expect(match).toBeNull();
  });

  it('matches library items by ASIN or ISBN only (no fuzzy fallback)', async () => {
    const items = [
      { id: '1', externalId: 'g1', title: 'Alpha', author: 'Author A', asin: 'ASIN1' },
      { id: '2', externalId: 'g2', title: 'Beta', author: 'Author B', isbn: '978-1-23456-789-7' },
      { id: '3', externalId: 'g3', title: 'Gamma Book', author: 'Author C' },
    ];

    const { matchAudiobook } = await import('@/lib/utils/audiobook-matcher');
    const asinMatch = matchAudiobook({ title: 'x', author: 'y', asin: 'ASIN1' }, items);
    expect(asinMatch?.externalId).toBe('g1');

    const isbnMatch = matchAudiobook({ title: 'x', author: 'y', isbn: '9781234567897' }, items);
    expect(isbnMatch?.externalId).toBe('g2');

    const noMatch = matchAudiobook({ title: 'Gamma Book', author: 'Author C' }, items);
    expect(noMatch).toBeNull();
  });

  it('enriches audiobooks with availability and request status', async () => {
    prismaMock.plexLibrary.findMany
      .mockResolvedValueOnce([
        {
          plexGuid: 'guid-1',
          plexRatingKey: null,
          title: 'Book One',
          author: 'Author One',
          asin: 'ASIN1',
          isbn: null,
        },
      ])
      .mockResolvedValueOnce([]);

    prismaMock.audiobook.findMany.mockResolvedValue([
      {
        id: 'a1',
        audibleAsin: 'ASIN1',
        requests: [
          {
            id: 'r1',
            status: 'downloading',
            userId: 'other-user',
            user: { plexUsername: 'OtherUser' },
          },
        ],
      },
    ]);

    // Mock reported issues (none for this test)
    prismaMock.reportedIssue.findMany.mockResolvedValue([]);

    const { enrichAudiobooksWithMatches } = await import('@/lib/utils/audiobook-matcher');
    const results = await enrichAudiobooksWithMatches(
      [
        { asin: 'ASIN1', title: 'Book One', author: 'Author One' },
        { asin: 'ASIN2', title: 'Book Two', author: 'Author Two' },
      ],
      'current-user'
    );

    expect(results[0].isAvailable).toBe(true);
    expect(results[0].isRequested).toBe(true);
    expect(results[0].requestedByUsername).toBe('OtherUser');

    expect(results[1].isAvailable).toBe(false);
    expect(results[1].isRequested).toBe(false);
  });

  describe('Storytel pseudo-ASIN fallback matching', () => {
    it('matches by ISBN when the library item carries one (Audiobookshelf scans)', async () => {
      prismaMock.plexLibrary.findMany.mockResolvedValue([]); // no ASIN match
      prismaMock.plexLibrary.findFirst.mockResolvedValue({
        plexGuid: 'abs-item-1',
        plexRatingKey: null,
        title: 'Hundraåringen',
        author: 'Jonas Jonasson',
      });

      const { findPlexMatch } = await import('@/lib/utils/audiobook-matcher');
      const match = await findPlexMatch({
        asin: 'ST00001282',
        title: 'Hundraåringen',
        author: 'Jonas Jonasson',
        isbn: '9789164232519',
      });

      expect(match?.plexGuid).toBe('abs-item-1');
      expect(prismaMock.plexLibrary.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isbn: '9789164232519' } })
      );
    });

    it('falls back to exact title + author word-overlap ("Last, First" ordering)', async () => {
      prismaMock.plexLibrary.findMany
        .mockResolvedValueOnce([]) // ASIN query
        .mockResolvedValueOnce([
          {
            plexGuid: 'lib-item-2',
            plexRatingKey: null,
            title: 'Isprinsessan',
            author: 'Läckberg, Camilla',
          },
        ]); // title query
      prismaMock.plexLibrary.findFirst.mockResolvedValue(null);

      const { findPlexMatch } = await import('@/lib/utils/audiobook-matcher');
      const match = await findPlexMatch({
        asin: 'ST00000042',
        title: 'Isprinsessan',
        author: 'Camilla Läckberg',
        isbn: '9789100000000',
      });

      expect(match?.plexGuid).toBe('lib-item-2');
    });

    it('does not match when authors differ', async () => {
      prismaMock.plexLibrary.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            plexGuid: 'lib-item-3',
            plexRatingKey: null,
            title: 'Isprinsessan',
            author: 'Someone Else',
          },
        ]);
      prismaMock.plexLibrary.findFirst.mockResolvedValue(null);

      const { findPlexMatch } = await import('@/lib/utils/audiobook-matcher');
      const match = await findPlexMatch({
        asin: 'ST00000042',
        title: 'Isprinsessan',
        author: 'Camilla Läckberg',
      });

      expect(match).toBeNull();
    });

    it('does not run the fallback for real Audible ASINs', async () => {
      prismaMock.plexLibrary.findMany.mockResolvedValue([]);

      const { findPlexMatch } = await import('@/lib/utils/audiobook-matcher');
      const match = await findPlexMatch({
        asin: 'B00TEST123',
        title: 'Some Book',
        author: 'Some Author',
        isbn: '9789164232519',
      });

      expect(match).toBeNull();
      expect(prismaMock.plexLibrary.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.plexLibrary.findMany).toHaveBeenCalledTimes(1);
    });
  });
});


