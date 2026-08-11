/**
 * Component: Storytel Integration Service Tests
 * Documentation: documentation/integrations/storytel.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const clientMock = vi.hoisted(() => ({ get: vi.fn() }));
const axiosMock = vi.hoisted(() => ({
  create: vi.fn(() => clientMock),
  get: vi.fn(),
}));

vi.mock('axios', () => ({
  default: axiosMock,
  ...axiosMock,
}));

import { StorytelService } from '@/lib/integrations/storytel.service';

// Mirrors the live search.action response shape (verified against
// www.storytel.com/api/search.action for "hundraåringen").
function makeEntry(overrides: {
  bookId?: number;
  name?: string;
  iso?: string;
  abook?: Record<string, unknown> | null;
  seriesName?: string;
  seriesOrder?: string;
} = {}) {
  const {
    bookId = 1282,
    name = 'Hundraåringen som klev ut genom fönstret och försvann',
    iso = 'sv',
    seriesName,
    seriesOrder,
    abook = {},
  } = overrides;
  return {
    shareUrl: `https://www.storytel.com/se/books/test-${bookId}`,
    book: {
      id: String(bookId),
      name,
      authorsAsString: 'Jonas Jonasson',
      language: { isoValue: iso, name: 'Swedish' },
      largeCover: `/images/320x320/${String(bookId).padStart(10, '0')}.jpg`,
      grade: '4.37',
      ...(seriesName ? { series: [{ id: '27', name: seriesName }], seriesOrder: seriesOrder ?? '1' } : {}),
    },
    abook:
      abook === null
        ? null
        : {
            id: String(bookId),
            isbn: '9789164232519',
            description: 'Efter ett långt och synnerligen händelserikt liv...',
            narratorAsString: 'Björn Granath',
            length: '52158000',
            releaseDateFormat: '2009-09-01',
            publisher: { name: 'Piratförlaget' },
            ...abook,
          },
  };
}

describe('StorytelService', () => {
  beforeEach(() => {
    clientMock.get.mockReset();
  });

  it('maps search entries to the AudibleAudiobook shape with pseudo-ASINs', async () => {
    clientMock.get.mockResolvedValue({ data: { books: [makeEntry({ seriesName: 'Testserien', seriesOrder: '2' })] } });

    const service = new StorytelService();
    const results = await service.search('hundraåringen');

    expect(clientMock.get).toHaveBeenCalledWith('/api/search.action', {
      params: { q: 'hundraåringen', request_locale: 'sv' },
    });
    expect(results).toHaveLength(1);
    const book = results[0];
    expect(book.asin).toBe('ST00001282');
    expect(book.title).toContain('Hundraåringen');
    expect(book.author).toBe('Jonas Jonasson');
    expect(book.narrator).toBe('Björn Granath');
    expect(book.durationMinutes).toBe(869); // 52158000 ms
    expect(book.releaseDate).toBe('2009-09-01');
    expect(book.rating).toBe(4.37);
    expect(book.series).toBe('Testserien');
    expect(book.seriesPart).toBe('2');
    expect(book.isbn).toBe('9789164232519');
    expect(book.language).toBe('swedish');
    expect(book.source).toBe('storytel');
    expect(book.storeUrl).toBe('https://www.storytel.com/se/books/test-1282');
    expect(book.coverArtUrl).toMatch(/^https:\/\/www\.storytel\.com\/images\//);
  });

  it('drops non-Swedish and ebook-only entries', async () => {
    clientMock.get.mockResolvedValue({
      data: {
        books: [
          makeEntry({ bookId: 1, iso: 'en' }),
          makeEntry({ bookId: 2, abook: null }),
          makeEntry({ bookId: 3 }),
        ],
      },
    });

    const service = new StorytelService();
    const results = await service.search('test');

    expect(results.map((b) => b.asin)).toEqual(['ST00000003']);
  });

  it('returns an empty list on network errors (never breaks the merged search)', async () => {
    clientMock.get.mockRejectedValue(new Error('boom'));

    const service = new StorytelService();
    await expect(service.search('test')).resolves.toEqual([]);
  });

  it('fetches single-book details via getBookInfoForContent', async () => {
    clientMock.get.mockResolvedValue({
      data: { result: 'success', slb: makeEntry() },
    });

    const service = new StorytelService();
    const book = await service.getBookDetails('1282');

    expect(clientMock.get).toHaveBeenCalledWith('/api/getBookInfoForContent.action', {
      params: { bookId: '1282', request_locale: 'sv' },
    });
    expect(book?.asin).toBe('ST00001282');
    expect(book?.narrator).toBe('Björn Granath');
  });

  it('returns null when the details endpoint reports failure', async () => {
    clientMock.get.mockResolvedValue({ data: { result: 'failure' } });

    const service = new StorytelService();
    await expect(service.getBookDetails('999')).resolves.toBeNull();
  });
});
