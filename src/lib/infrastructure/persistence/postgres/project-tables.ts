/**
 * The tables a single project owns rows in — the one list, so "delete a project"
 * and "copy a project" can never disagree about what a project *is*.
 *
 * Every name here must be a table that still EXISTS: the statements built from
 * this list are unguarded, so a stale name fails the whole sweep. `contract` and
 * `generation` are absent deliberately — migration `0011-drop-contract-and-generation`
 * drops them after draining their rows into `project_section_documents`.
 */

/**
 * Pre-consolidation per-section draft tables, all shaped
 * `(project_id PRIMARY KEY, document TEXT, updated_at TEXT)`.
 *
 * `project_drafts` is the important one: it holds the Foundation identity draft,
 * whose presence IS the project's existence (see `CreateProjectUseCase`) and
 * from which the catalog derives every project's name. The rest are tombstones
 * for projects migrated into `project_section_documents` — kept because an
 * install that never re-saved an old project still has its only copy here.
 */
export const LEGACY_DRAFT_TABLES = [
	'project_drafts',
	'project_definition_drafts',
	'project_users_drafts',
	'project_features_drafts',
	'project_experience_drafts',
	'project_rules_drafts',
	'project_glossary_drafts',
	'project_supervision_drafts',
	'project_finops_drafts',
	'project_foundations_drafts',
	'project_data_drafts',
	'project_architecture_drafts',
	'project_coherence_drafts'
] as const;

export type LegacyDraftTable = (typeof LEGACY_DRAFT_TABLES)[number];

/** Every `project_id`-keyed table, in delete order. */
export const PROJECT_OWNED_TABLES = [
	'project_section_documents',
	...LEGACY_DRAFT_TABLES,
	'project_meta'
] as const;
