/**
 * Closed vocabularies for Step 04 — Features And Prioritization. Source of
 * truth: Unspaghettit feature `1e95b087`. Codes are persisted; labels are
 * display only.
 */

import type { Option } from '$domain/shared';

export const CORE_TONES = [
	{ code: 'customer', label: 'Customer' },
	{ code: 'invoicing', label: 'Invoicing' },
	{ code: 'payment', label: 'Payment' },
	{ code: 'dunning', label: 'Dunning' },
	{ code: 'reporting', label: 'Reporting' },
	// Domain-neutral tones — a tone is a color identity for the core, so products
	// that aren't billing tools get a vocabulary that fits (same palette slots).
	{ code: 'engagement', label: 'Engagement' },
	{ code: 'content', label: 'Content' },
	{ code: 'commerce', label: 'Commerce' },
	{ code: 'operations', label: 'Operations' },
	{ code: 'insight', label: 'Insight' },
	{ code: 'custom', label: 'Custom' }
] as const satisfies readonly Option[];
export type CoreTone = (typeof CORE_TONES)[number]['code'];
export const isCoreTone = (v: unknown): v is CoreTone =>
	typeof v === 'string' && (CORE_TONES as readonly Option[]).some((t) => t.code === v);

export const MVP_TIERS = [
	{ code: 'must', label: 'Must have' },
	{ code: 'should', label: 'Should have' },
	{ code: 'later', label: 'Later' },
	{ code: 'out', label: 'Out of scope' }
] as const satisfies readonly Option[];
export type MvpTier = (typeof MVP_TIERS)[number]['code'];
export const isMvpTier = (v: unknown): v is MvpTier =>
	typeof v === 'string' && (MVP_TIERS as readonly Option[]).some((t) => t.code === v);

export type FeaturesTab =
	| 'tree'
	| 'mvp'
	| 'roadmap'
	| 'behavior'
	| 'rules'
	| 'reuse'
	| 'mywork'
	| 'delivery';

/**
 * Tag prefixes used when mirroring the wizard into Unspaghettit project tags.
 * Each leaf Feature shell carries `core:<name>`, `family:<path>`, optionally
 * `mvp:<tier>`, and optionally `phase:<version>`.
 */
export const TAG_TYPES = {
	core: 'core',
	family: 'family',
	mvp: 'mvp',
	phase: 'phase'
} as const;
