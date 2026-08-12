/**
 * Component: Storytel Pseudo-ASIN Utilities
 * Documentation: documentation/integrations/storytel.md
 *
 * Storytel books have no Audible ASIN. The app's identity plumbing (React
 * keys, WorkAsin uniqueness, route validation `length === 10`, status-badge
 * joins on audibleAsin) all assume a 10-character ASIN, so Storytel books get
 * a synthetic one: 'ST' + zero-padded numeric Storytel bookId (e.g. bookId
 * 1282 -> 'ST00001282'). Real Amazon ASINs are 'B0'-prefixed or ISBN-10
 * digits, so the 'ST' prefix cannot collide.
 */

const STORYTEL_ASIN_PATTERN = /^ST(\d{8})$/;

// Authors get their own 'SA' prefix so book plumbing keyed on isStorytelAsin()
// never matches an author pseudo-ASIN. Author asins only appear in the
// /authors routes (Audnexus author ASINs are the counterpart namespace).
const STORYTEL_AUTHOR_ASIN_PATTERN = /^SA(\d{8})$/;

export function toStorytelAsin(bookId: string | number): string {
  const id = String(bookId).trim();
  if (!/^\d{1,8}$/.test(id)) {
    throw new Error(`Storytel bookId not encodable as pseudo-ASIN: ${bookId}`);
  }
  return `ST${id.padStart(8, '0')}`;
}

export function isStorytelAsin(asin: string | null | undefined): boolean {
  return !!asin && STORYTEL_ASIN_PATTERN.test(asin);
}

/** Returns the numeric Storytel bookId, or null if not a Storytel pseudo-ASIN. */
export function fromStorytelAsin(asin: string | null | undefined): string | null {
  const match = asin ? STORYTEL_ASIN_PATTERN.exec(asin) : null;
  return match ? String(parseInt(match[1], 10)) : null;
}

export function toStorytelAuthorAsin(authorId: string | number): string {
  const id = String(authorId).trim();
  if (!/^\d{1,8}$/.test(id)) {
    throw new Error(`Storytel authorId not encodable as pseudo-ASIN: ${authorId}`);
  }
  return `SA${id.padStart(8, '0')}`;
}

export function isStorytelAuthorAsin(asin: string | null | undefined): boolean {
  return !!asin && STORYTEL_AUTHOR_ASIN_PATTERN.test(asin);
}

/** Returns the numeric Storytel authorId, or null if not a Storytel author pseudo-ASIN. */
export function fromStorytelAuthorAsin(asin: string | null | undefined): string | null {
  const match = asin ? STORYTEL_AUTHOR_ASIN_PATTERN.exec(asin) : null;
  return match ? String(parseInt(match[1], 10)) : null;
}
