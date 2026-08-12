/**
 * Component: Language Configuration Tests
 * Documentation: documentation/integrations/audible.md
 */

import { describe, it, expect } from 'vitest';
import {
  LANGUAGE_CONFIGS,
  REGION_LANGUAGE_MAP,
  getLanguageForBook,
  isAcceptedLanguage,
  stripPrefixes,
} from '@/lib/constants/language-config';
import { AUDIBLE_REGIONS } from '@/lib/types/audible';
import { parseRuntime } from '@/lib/utils/parse-runtime';

describe('language-config exhaustiveness', () => {
  it('maps every Audible region to a language', () => {
    for (const region of Object.keys(AUDIBLE_REGIONS)) {
      expect(REGION_LANGUAGE_MAP[region as keyof typeof REGION_LANGUAGE_MAP]).toBeDefined();
    }
  });

  it('has a full LanguageConfig for every mapped language', () => {
    for (const lang of Object.values(REGION_LANGUAGE_MAP)) {
      const config = LANGUAGE_CONFIGS[lang];
      expect(config).toBeDefined();
      expect(config.code).toBe(lang);
      expect(config.scraping.acceptedLanguageValues.length).toBeGreaterThan(0);
      expect(config.stopWords.length).toBeGreaterThan(0);
    }
  });

  it('keeps region language consistent between AUDIBLE_REGIONS and REGION_LANGUAGE_MAP', () => {
    for (const region of Object.values(AUDIBLE_REGIONS)) {
      expect(REGION_LANGUAGE_MAP[region.code]).toBe(region.language);
    }
  });
});

describe('Swedish (via Storytel)', () => {
  const sv = LANGUAGE_CONFIGS.sv;

  it('has no Swedish Audible region — Swedish rides on the Storytel toggle', () => {
    expect(Object.keys(AUDIBLE_REGIONS)).not.toContain('se');
    expect(Object.keys(REGION_LANGUAGE_MAP)).not.toContain('se');
  });

  it('accepts Swedish language values', () => {
    expect(isAcceptedLanguage('swedish', sv)).toBe(true);
    expect(isAcceptedLanguage('Svenska', sv)).toBe(true);
    expect(isAcceptedLanguage('german', sv)).toBe(false);
    expect(isAcceptedLanguage('english', sv)).toBe(false);
  });

  it('parses Swedish runtime formats', () => {
    expect(parseRuntime('9 tim 12 min', sv)).toBe(552);
    expect(parseRuntime('14 timmar', sv)).toBe(840);
    expect(parseRuntime('45 minuter', sv)).toBe(45);
  });

  it('strips Swedish author/narrator prefixes', () => {
    expect(stripPrefixes('Av: Jonas Jonasson', sv.scraping.authorPrefixes)).toBe('Jonas Jonasson');
    expect(stripPrefixes('Uppläsare: Björn Granath', sv.scraping.narratorPrefixes)).toBe('Björn Granath');
  });
});

describe('getLanguageForBook', () => {
  it('returns Swedish for Storytel pseudo-ASINs regardless of region', () => {
    expect(getLanguageForBook('ST00001282', 'us')).toBe(LANGUAGE_CONFIGS.sv);
    expect(getLanguageForBook('ST00001282', 'de')).toBe(LANGUAGE_CONFIGS.sv);
  });

  it('falls back to the region language for real ASINs and missing ASINs', () => {
    expect(getLanguageForBook('B08G9PRS1K', 'us')).toBe(LANGUAGE_CONFIGS.en);
    expect(getLanguageForBook('B08G9PRS1K', 'de')).toBe(LANGUAGE_CONFIGS.de);
    expect(getLanguageForBook(undefined, 'us')).toBe(LANGUAGE_CONFIGS.en);
    expect(getLanguageForBook(null, 'fr')).toBe(LANGUAGE_CONFIGS.fr);
  });
});
