# Storytel Integration (Swedish Metadata Source)

**Status:** ✅ Implemented | Sole Swedish search/metadata source via Storytel's legacy public JSON API

## Overview
Storytel is the only Swedish source (the audible.de-based `se` pseudo-region was removed — Storytel has far better Swedish coverage, e.g. 92 Swedish Läckberg titles vs 0 on Audible). Gated by the `storytel.enabled` config toggle (default ON), independent of the Audible region — English (region) and Swedish (Storytel) results coexist in the same install. Books are mapped into the `AudibleAudiobook` shape with a pseudo-ASIN so they ride the existing pipeline.

## Key Details
- **API (no auth, unofficial):**
  - Search: `GET https://www.storytel.com/api/search.action?q=<query>&request_locale=sv` → `{books: [{book, abook, shareUrl}]}`
  - Details: `GET https://www.storytel.com/api/getBookInfoForContent.action?bookId=<id>` → `{result: 'success', slb: {...}}`
  - No pagination; results capped at 50; sv-language audiobook entries only (`book.language.isoValue === 'sv'`, `abook` present).
- **Pseudo-ASIN:** `'ST' + bookId.padStart(8, '0')` (e.g. `ST00001282`) — 10 chars, satisfies all ASIN format gates and uniqueness constraints. Utils: `src/lib/utils/storytel-ids.ts` (`toStorytelAsin`, `fromStorytelAsin`, `isStorytelAsin`).
- **Field mapping:** name→title, authorsAsString→author, narratorAsString→narrator, `abook.length` ms→durationMinutes, grade→rating, series[0].name + seriesOrder→series/seriesPart, isbn→isbn, shareUrl→storeUrl, largeCover→coverArtUrl (www.storytel.com 302s to covers.storytel.com CDN).
- **Search merge:** `/api/audiobooks/search` appends Storytel results when `configService.isStorytelEnabled()` (key `storytel.enabled`, default ON; toggle in Library settings + setup wizard), page 1 only; title+author duplicates keep the Audible entry (real ASIN). Storytel failures degrade to Audible-only results.
- **Per-book language:** `getLanguageForBook(asin, region)` (language-config.ts) returns the `sv` config for ST asins, region config otherwise. Used by ranking (search-indexers processor, interactive search) and ebook search (Anna's Archive `lang=sv`, Swedish stop words).
- **Details dispatch:** `src/lib/services/metadata-provider.ts` `getDetailsByAsin(asin)` routes ST asins to Storytel, others to Audnexus/Audible. Used by details route, request-creator, request-with-torrent.
- **DB columns (audiobooks):** `metadata_source` (default 'audible'), `isbn`, `duration_minutes` — migration `20260811000000_add_metadata_source_isbn_duration`.

## Author Support
- **Author pseudo-ASINs:** `'SA' + authorId.padStart(8, '0')` (e.g. `SA00000298` = Läckberg). Distinct `SA` prefix keeps book plumbing (`isStorytelAsin`) from ever matching authors. Utils in `storytel-ids.ts`.
- **Service methods:** `searchAuthors(query)` — distinct authors (id, name, bookCount) collected from `book.authors[]` of Swedish audiobook search entries, diacritic-insensitive substring match (`normalizeAuthorName`). `getBooksByAuthor(name, id?)` — searches by name (only query the API supports), filters by exact author id when given, else diacritic-insensitive exact name.
- **`/api/authors/search`:** merges Storytel-only authors after Audnexus results (toggle-gated); Audnexus-known authors are NOT duplicated — their Swedish books merge on their page instead. Audnexus failures degrade to Storytel-only results.
- **`/api/authors/[asin]`:** for SA asins, synthesizes minimal detail from the `?name=` query param (no author-by-id lookup exists upstream); 404 without it. No bio/image/similar.
- **`/api/authors/[asin]/books`:** regular authors get Storytel books merged on page 1 (toggle-gated, title+author dedup keeps Audible); SA authors get Storytel-only books by author id.
- **Frontend:** `AuthorCard` links carry `?name=`; `useAuthorDetail(asin, name)` forwards it; `AuthorDetailCard` hides the Watch button for SA asins (author watch lists sync via Audible and can never match).

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
- No discovery endpoints (search only) — home-page popular/new-release sections are Audible (English) only; Swedish books are found via search.
- Deep-linking an SA author URL without `?name=` shows "Author not found" (name cannot be resolved from the id).

## Related: integrations/audible.md, phase3/ranking-algorithm.md
