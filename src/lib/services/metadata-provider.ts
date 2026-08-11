/**
 * Component: Metadata Provider Dispatcher
 * Documentation: documentation/integrations/storytel.md
 *
 * Routes detail lookups to the right metadata source based on the ASIN shape:
 * 'ST'-prefixed pseudo-ASINs go to Storytel, everything else to Audible
 * (Audnexus with catalog-API fallback).
 */

import { getAudibleService, type AudibleAudiobook } from '../integrations/audible.service';
import { getStorytelService } from '../integrations/storytel.service';
import { fromStorytelAsin } from '../utils/storytel-ids';

export async function getDetailsByAsin(asin: string): Promise<AudibleAudiobook | null> {
  const storytelId = fromStorytelAsin(asin);
  if (storytelId) {
    return getStorytelService().getBookDetails(storytelId);
  }
  return getAudibleService().getAudiobookDetails(asin);
}
