/**
 * Closed vocabularies for Step 05 — Experience. Source of truth: Unspaghettit
 * feature `1bf10f8f`. Codes are persisted; labels are display only.
 */

import type { Option } from '$domain/shared';

/**
 * The top-level tabs of the Experience screen — the mockup's Step 5 view set
 * (Landscape · Journeys · Screens · Components). The legacy `user_scenario` /
 * `library` / `prototype` ids are migrated on load by `parseExperienceDraft`.
 */
export type ExperienceTab = 'landscape' | 'journeys' | 'screens' | 'components' | 'data';

/** Sub-catalog shown inside the Screens / Components views (Template, Element). */
export type LibraryTab = 'templates' | 'screens' | 'components' | 'elements';

/** Accent colors a Component can carry (mirrors the mockup's COLOR_MAP keys). */
export const COMPONENT_COLORS = [
	{ code: 'violet', label: 'Violet' },
	{ code: 'blue', label: 'Blue' },
	{ code: 'pink', label: 'Pink' },
	{ code: 'amber', label: 'Amber' },
	{ code: 'mint', label: 'Mint' }
] as const satisfies readonly Option[];
export type ComponentColor = (typeof COMPONENT_COLORS)[number]['code'];
export const isComponentColor = (v: unknown): v is ComponentColor =>
	typeof v === 'string' && (COMPONENT_COLORS as readonly Option[]).some((c) => c.code === v);

/**
 * Kind of a Step's Events-Flow entry — drives the API / CACHE / EVENT badge.
 * `api` = an HTTP call, `cache` = a cache/aggregate op, `event` = an emitted
 * domain event.
 */
export const OPERATION_KINDS = [
	{ code: 'api', label: 'API' },
	{ code: 'cache', label: 'Cache' },
	{ code: 'event', label: 'Event' }
] as const satisfies readonly Option[];
export type OperationKind = (typeof OPERATION_KINDS)[number]['code'];
export const isOperationKind = (v: unknown): v is OperationKind =>
	typeof v === 'string' && (OPERATION_KINDS as readonly Option[]).some((o) => o.code === v);

/** Whether a Step reads from or writes to an Entity (the Data-Consumed underlay). */
export const DATA_MODES = [
	{ code: 'read', label: 'Read' },
	{ code: 'write', label: 'Write' }
] as const satisfies readonly Option[];
export type DataMode = (typeof DATA_MODES)[number]['code'];
export const isDataMode = (v: unknown): v is DataMode =>
	typeof v === 'string' && (DATA_MODES as readonly Option[]).some((m) => m.code === v);

/** Direction a Step can be nudged within its Journey / an operation within its Step. */
export type ReorderDirection = 'up' | 'down';
