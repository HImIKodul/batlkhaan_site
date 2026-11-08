import { useEffect } from 'react';

/**
 * Ambient environment switch. Setting `data-env` on <html> re-points the shared
 * --ambient-* / --domain-* tokens (see components/glass.css), so the page
 * background, glass tint, glow and accents change together.
 */
export type AmbientEnvironment = 'prism' | 'about' | 'guide' | 'diagnosis' | 'result' | 'payment' | 'marketing' | 'it' | 'finance' | 'people' | 'operations';

export function useAmbientEnvironment(env: AmbientEnvironment | string | null | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    if (env) root.dataset.env = env; else delete root.dataset.env;
    return () => { delete root.dataset.env; };
  }, [env]);
}
