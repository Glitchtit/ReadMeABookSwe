/**
 * Component: Language Configuration Tests
 * Documentation: documentation/integrations/audible.md
 */

import { describe, it, expect } from 'vitest';
import {
  LANGUAGE_CONFIGS,
  REGION_LANGUAGE_MAP,
  getLanguageForRegion,
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

describe('Swedish (se region via audible.de)', () => {
  const sv = LANGUAGE_CONFIGS.sv;

  it('resolves the se region to the Swedish config', () => {
    expect(getLanguageForRegion('se')).toBe(sv);
  });

  it('uses the audible.de marketplace with catalog language filtering', () => {
    const region = AUDIBLE_REGIONS.se;
    expect(region.baseUrl).toBe('https://www.audible.de');
    expect(region.apiBaseUrl).toBe('https://api.audible.de');
    expect(region.audnexusParam).toBe('de');
    expect(region.catalogLanguageFilter).toBe(true);
  });

  it('accepts the language values the Audible catalog API returns for Swedish titles', () => {
    // The catalog API returns language: "swedish" (verified against api.audible.de)
    expect(isAcceptedLanguage('swedish', sv)).toBe(true);
    expect(isAcceptedLanguage('Svenska', sv)).toBe(true);
    expect(isAcceptedLanguage('Schwedisch', sv)).toBe(true);
    expect(isAcceptedLanguage('german', sv)).toBe(false);
    expect(isAcceptedLanguage('english', sv)).toBe(false);
  });

  it('parses runtimes in both German (page UI) and Swedish formats', () => {
    // audible.de serves Swedish titles with German UI labels
    expect(parseRuntime('9 Std. 12 Min.', sv)).toBe(552);
    expect(parseRuntime('9 tim 12 min', sv)).toBe(552);
    expect(parseRuntime('14 timmar', sv)).toBe(840);
    expect(parseRuntime('45 minuter', sv)).toBe(45);
  });

  it('strips both German and Swedish author/narrator prefixes', () => {
    expect(stripPrefixes('Von: Jonas Jonasson', sv.scraping.authorPrefixes)).toBe('Jonas Jonasson');
    expect(stripPrefixes('Av: Jonas Jonasson', sv.scraping.authorPrefixes)).toBe('Jonas Jonasson');
    expect(stripPrefixes('Gesprochen von: Björn Granath', sv.scraping.narratorPrefixes)).toBe('Björn Granath');
    expect(stripPrefixes('Uppläsare: Björn Granath', sv.scraping.narratorPrefixes)).toBe('Björn Granath');
  });
});
