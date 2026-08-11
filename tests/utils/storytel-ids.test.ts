/**
 * Component: Storytel Pseudo-ASIN Utilities Tests
 * Documentation: documentation/integrations/storytel.md
 */

import { describe, it, expect } from 'vitest';
import { toStorytelAsin, isStorytelAsin, fromStorytelAsin } from '@/lib/utils/storytel-ids';

describe('storytel-ids', () => {
  it('encodes numeric bookIds as 10-character pseudo-ASINs', () => {
    expect(toStorytelAsin(1282)).toBe('ST00001282');
    expect(toStorytelAsin('7')).toBe('ST00000007');
    expect(toStorytelAsin('99999999')).toBe('ST99999999');
    expect(toStorytelAsin(1282)).toHaveLength(10);
  });

  it('rejects bookIds that cannot fit the format', () => {
    expect(() => toStorytelAsin('123456789')).toThrow();
    expect(() => toStorytelAsin('abc')).toThrow();
    expect(() => toStorytelAsin('')).toThrow();
  });

  it('round-trips through fromStorytelAsin', () => {
    expect(fromStorytelAsin(toStorytelAsin(1282))).toBe('1282');
    expect(fromStorytelAsin(toStorytelAsin('42'))).toBe('42');
  });

  it('identifies pseudo-ASINs without matching real ASINs', () => {
    expect(isStorytelAsin('ST00001282')).toBe(true);
    expect(isStorytelAsin('B0F8Y17JRR')).toBe(false); // real Audible ASIN
    expect(isStorytelAsin('1508293866')).toBe(false); // ISBN-10-style ASIN
    expect(isStorytelAsin('STABCDEFGH')).toBe(false); // ST but not numeric
    expect(isStorytelAsin('')).toBe(false);
    expect(isStorytelAsin(null)).toBe(false);
    expect(isStorytelAsin(undefined)).toBe(false);
  });

  it('returns null from fromStorytelAsin for non-Storytel ids', () => {
    expect(fromStorytelAsin('B0F8Y17JRR')).toBeNull();
    expect(fromStorytelAsin(null)).toBeNull();
  });
});
