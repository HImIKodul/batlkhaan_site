/**
 * @mmri/ui - design-system entry. Re-exports MMRI's reusable, router/API-free components so they can be
 * compiled to a library (ds-lib/dist) and imported into Claude Design. App pages are intentionally not exported.
 */
import React from 'react';
import './ds-entry.css';
import { useAmbientEnvironment, type AmbientEnvironment } from './design/environment';

export * from './components/UI';
export { Glyph, StatusRing } from './components/Glyphs';
export { Icon } from './components/Icon';
export { AnalyticalBars } from './components/AnalyticalBars';
export { TrendChart } from './components/TrendChart';
export { SkeletonScreen, LoadingState, ErrorState, EmptyState, ComingSoonState, OfflineState } from './components/ApiState';
export { Reveal, AnimatedNumber, MotionCheck } from './components/Motion';
export type { BusinessAreaId } from './data/businessEvaluation';
export type { AmbientEnvironment };

/**
 * Sets the page environment (category-coloured geometric background and glass lighting) on <html>.
 * env: 'marketing' | 'it' | 'finance' | 'people' | 'operations' (or omit for the default blue environment).
 * Wrap a design in it, e.g. <MmriEnvironment env="finance">…</MmriEnvironment>.
 */
export function MmriEnvironment({ env, children }: { env?: AmbientEnvironment | null; children?: React.ReactNode }) {
  useAmbientEnvironment(env);
  return <>{children}</>;
}
