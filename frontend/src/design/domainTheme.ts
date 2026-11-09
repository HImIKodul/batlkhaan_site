import { useEffect } from 'react';

/**
 * Centralised domain-theme controller. The active domain lives in ONE place: `data-domain` on <html>
 * (absent = neutral sapphire). design/crystal.css owns everything that follows from it:
 *  - registered colour tokens (--dom, --btn-a/b/c) transition on the few elements that use them (buttons, nav pill, report ring);
 *  - five fixed light layers in GlassStage cross-fade their opacity for the large areas (background wash, perimeter halo).
 * The attribute is deliberately NOT cleared on unmount: the outgoing page's cleanup and the incoming page's effect run in the same
 * commit, so the browser never paints an intermediate neutral frame and the colours blend instead of flashing.
 */
export const DOMAIN_IDS = ['marketing', 'it', 'finance', 'people', 'operations'] as const;
const IDS: readonly string[] = DOMAIN_IDS;

export function setDomainTheme(id: string | null | undefined) {
  const root = document.documentElement;
  const next = id && IDS.includes(id) ? id : null;
  if (next) { if (root.dataset.domain !== next) root.dataset.domain = next; }
  else if (root.dataset.domain) delete root.dataset.domain;
}

export function useDomainTheme(id: string | null | undefined) {
  useEffect(() => { setDomainTheme(id); }, [id]);
}
