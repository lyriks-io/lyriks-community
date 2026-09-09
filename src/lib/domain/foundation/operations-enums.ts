/**
 * Closed vocabularies for the Foundation operations slice. Source of truth:
 * Unspaghettit feature `aae37f44`. Codes are persisted; labels are display copy.
 */

import type { Option } from '$domain/shared';

/** The five sub-sections of the Ops tab, in two sidebar groups. */
export const OPERATIONS_SECTIONS = [
	{ code: 'i18n', label: 'i18n & locales' },
	{ code: 'quality', label: 'Quality budgets' },
	{ code: 'uiStates', label: 'UI states' },
	{ code: 'migration', label: 'Migration' },
	{ code: 'fixtures', label: 'Test fixtures' }
] as const satisfies readonly Option[];
export type OperationsSection = (typeof OPERATIONS_SECTIONS)[number]['code'];
export const isOperationsSection = (v: unknown): v is OperationsSection =>
	OPERATIONS_SECTIONS.some((s) => s.code === v);

/** How a change rolls out to production. */
export const MIGRATION_STRATEGIES = [
	{ code: 'big-bang', label: 'Big bang (full cut-over)' },
	{ code: 'feature-flagged', label: 'Feature-flagged (progressive)' },
	{ code: 'strangler', label: 'Strangler (replace gradually)' },
	{ code: 'parallel-run', label: 'Parallel run (compare outputs)' },
	{ code: 'canary', label: 'Canary (1% → 100%)' }
] as const satisfies readonly Option[];
export type MigrationStrategy = (typeof MIGRATION_STRATEGIES)[number]['code'];
export const isMigrationStrategy = (v: unknown): v is MigrationStrategy =>
	MIGRATION_STRATEGIES.some((s) => s.code === v);

/** Default state a feature flag ships in. */
export const FLAG_DEFAULTS = [
	{ code: 'off', label: 'off' },
	{ code: 'on', label: 'on' },
	{ code: 'cohort', label: 'cohort' }
] as const satisfies readonly Option[];
export type FlagDefault = (typeof FLAG_DEFAULTS)[number]['code'];
export const isFlagDefault = (v: unknown): v is FlagDefault =>
	FLAG_DEFAULTS.some((s) => s.code === v);

/** The five UI states an LLM must always handle per screen. */
export const UI_STATE_KEYS = ['empty', 'loading', 'error', 'success', 'partialData'] as const;
export type UiStateKey = (typeof UI_STATE_KEYS)[number];
