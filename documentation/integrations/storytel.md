# Storytel Integration (Swedish Metadata Source)

**Status:** ✅ Implemented | Supplementary Swedish search/metadata via Storytel's legacy public JSON API

## Overview
Storytel has far better Swedish audiobook coverage than audible.de (e.g. 92 Swedish Läckberg titles vs 0 on Audible). Active only for the `se` Audible region. Books are mapped into the `AudibleAudiobook` shape with a pseudo-ASIN so they ride the existing pipeline.

## Key Details
- **API (no auth, unofficial):**
  - Search: `GET https://www.storytel.com/api/search.action?q=<query>&request_locale=sv` → `{books: [{book, abook, shareUrl}]}`
  - Details: `GET https://www.storytel.com/api/getBookInfoForContent.action?bookId=<id>` → `{result: 'success', slb: {...}}`
  - No pagination; results capped at 50; sv-language audiobook entries only (`book.language.isoValue === 'sv'`, `abook` present).
- **Pseudo-ASIN:** `'ST' + bookId.padStart(8, '0')` (e.g. `ST00001282`) — 10 chars, satisfies all ASIN format gates and uniqueness constraints. Utils: `src/lib/utils/storytel-ids.ts` (`toStorytelAsin`, `fromStorytelAsin`, `isStorytelAsin`).
- **Field mapping:** name→title, authorsAsString→author, narratorAsString→narrator, `abook.length` ms→durationMinutes, grade→rating, series[0].name + seriesOrder→series/seriesPart, isbn→isbn, shareUrl→storeUrl, largeCover→coverArtUrl (www.storytel.com 302s to covers.storytel.com CDN).
- **Search merge:** `/api/audiobooks/search` appends Storytel results for region `se`, page 1 only; title+author duplicates keep the Audible entry (real ASIN). Storytel failures degrade to Audible-only results.
- **Details dispatch:** `src/lib/services/metadata-provider.ts` `getDetailsByAsin(asin)` routes ST asins to Storytel, others to Audnexus/Audible. Used by details route, request-creator, request-with-torrent.
- **DB columns (audiobooks):** `metadata_source` (default 'audible'), `isbn`, `duration_minutes` — migration `20260811000000_add_metadata_source_isbn_duration`.

## ASIN-less Downstream Handling
- **Library matching:** `findPlexMatch` falls back for ST asins: (1) exact `plexLibrary.isbn` match (ABS populates isbn), (2) case-insensitive exact title + author word-overlap. Fixes the downloaded→available transition and availability badges.
- **Ranking runtime:** `search-indexers.processor` prefers stored `durationMinutes` (Storytel provides it) before Audnexus; skips Audnexus for ST asins.
- **ABS metadata match:** `triggerABSItemMatch` never receives an ST asin (would force a bad Audible-provider match); ABS falls back to its own fuzzy matching.
- **UI:** `AudiobookDetailsModal` Source link uses `storeUrl` (Storytel) instead of the Audible /pd link; label switches to "Storytel".
- **Ebook sidecar:** ST asin yields no Anna's Archive `asin:` hit → existing title/author fallback applies.

## Files
- Service: `src/lib/integrations/storytel.service.ts`
- IDs: `src/lib/utils/storytel-ids.ts`
- Dispatcher: `src/lib/services/metadata-provider.ts`
- Matcher fallback: `src/lib/utils/audiobook-matcher.ts` (`findStorytelFallbackMatch`)
- Tests: `tests/integrations/storytel.service.test.ts`, `tests/utils/storytel-ids.test.ts`, `tests/utils/audiobook-matcher.test.ts`

## Critical Issues
- Unofficial legacy API — may change/rate-limit without notice; all failures degrade gracefully (empty results / null details).
- Storytel books never enter watched-list auto-requests (ASIN-validated flows) — by design for Phase 1.

## Related: integrations/audible.md, phase3/ranking-algorithm.md
