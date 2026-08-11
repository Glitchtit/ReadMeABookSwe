/**
 * Component: Audible Region Types
 * Documentation: documentation/integrations/audible.md
 */

import type { SupportedLanguage } from '../constants/language-config';

export type AudibleRegion = 'us' | 'ca' | 'uk' | 'au' | 'in' | 'de' | 'es' | 'fr' | 'se';

export interface AudibleRegionConfig {
  code: AudibleRegion;
  name: string;
  baseUrl: string;
  apiBaseUrl: string;
  audnexusParam: string;
  language: SupportedLanguage;
  /**
   * True when the region's language differs from the marketplace's native
   * language (e.g. Sweden is served by audible.de). Catalog search results
   * are then filtered to the region's language, and popular/new-release
   * discovery uses /search (which honors the language param) instead of the
   * curated bestseller pages.
   */
  catalogLanguageFilter?: boolean;
}

export const AUDIBLE_REGIONS: Record<AudibleRegion, AudibleRegionConfig> = {
  us: {
    code: 'us',
    name: 'United States',
    baseUrl: 'https://www.audible.com',
    apiBaseUrl: 'https://api.audible.com',
    audnexusParam: 'us',
    language: 'en',
  },
  ca: {
    code: 'ca',
    name: 'Canada',
    baseUrl: 'https://www.audible.ca',
    apiBaseUrl: 'https://api.audible.ca',
    audnexusParam: 'ca',
    language: 'en',
  },
  uk: {
    code: 'uk',
    name: 'United Kingdom',
    baseUrl: 'https://www.audible.co.uk',
    apiBaseUrl: 'https://api.audible.co.uk',
    audnexusParam: 'uk',
    language: 'en',
  },
  au: {
    code: 'au',
    name: 'Australia',
    baseUrl: 'https://www.audible.com.au',
    apiBaseUrl: 'https://api.audible.com.au',
    audnexusParam: 'au',
    language: 'en',
  },
  in: {
    code: 'in',
    name: 'India',
    baseUrl: 'https://www.audible.in',
    apiBaseUrl: 'https://api.audible.in',
    audnexusParam: 'in',
    language: 'en',
  },
  de: {
    code: 'de',
    name: 'Germany',
    baseUrl: 'https://www.audible.de',
    apiBaseUrl: 'https://api.audible.de',
    audnexusParam: 'de',
    language: 'de',
  },
  es: {
    code: 'es',
    name: 'Spain',
    baseUrl: 'https://www.audible.es',
    apiBaseUrl: 'https://api.audible.es',
    audnexusParam: 'es',
    language: 'es',
  },
  fr: {
    code: 'fr',
    name: 'France',
    baseUrl: 'https://www.audible.fr',
    apiBaseUrl: 'https://api.audible.fr',
    audnexusParam: 'fr',
    language: 'fr',
  },
  // There is no audible.se marketplace — www.audible.se 301-redirects to
  // www.audible.de, which carries the Swedish catalog (language: "swedish").
  se: {
    code: 'se',
    name: 'Sweden (Svenska)',
    baseUrl: 'https://www.audible.de',
    apiBaseUrl: 'https://api.audible.de',
    audnexusParam: 'de',
    language: 'sv',
    catalogLanguageFilter: true,
  },
};

export const DEFAULT_AUDIBLE_REGION: AudibleRegion = 'us';
