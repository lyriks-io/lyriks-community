import type pg from 'pg';

/**
 * Versioned schema migrations, replacing the old single idempotent
 * `CREATE TABLE IF NOT EXISTS` bootstrap. Hand-rolled on purpose: the appliance
 * is air-gapped, so the runner must need no external service and no runtime
 * egress — just ordered SQL applied once, recorded in `schema_migrations`.
 *
 * Rules:
 *  - Migrations are append-only. Never edit or reorder a shipped entry; add a
 *    new one. Ids are compared as strings, so keep the zero-padded prefix.
 *  - Each migration runs in its own transaction and is recorded in the same
 *    transaction, so a failure leaves the database at the last good version.
 *  - A cluster-wide advisory lock serializes replicas racing at boot; the
 *    losers see the winner's `schema_migrations` rows and skip.
 */
export interface Migration {
	/** Stable, ordered id, e.g. '0002-project-section-documents'. */
	readonly id: string;
	/** The SQL to apply — may hold several statements. */
	readonly sql: string;
}

/** Arbitrary but fixed app-wide key for `pg_advisory_lock`. */
const MIGRATION_LOCK_KEY = 0x1f9a_c0de;

const LEGACY_DOCUMENT_TABLES = [
	'project_foundations_drafts',
	'project_glossary_drafts',
	'project_supervision_drafts',
	'project_finops_drafts',
	'project_architecture_drafts',
	'project_contract_drafts',
	'project_generation_drafts'
] as const;

/**
 * PostgreSQL jsonb rejects the JSON escape `\u0000`, although the legacy TEXT
 * stores accepted it. Replace that one unsupported code point with U+FFFD
 * before migration 0002 casts the documents. Table names are fixed constants.
 */
async function sanitizeLegacySectionDocuments(client: pg.PoolClient): Promise<void> {
	for (const table of LEGACY_DOCUMENT_TABLES) {
		await client.query(
			`UPDATE ${table}
			 SET document = replace(document, E'\\\\u0000', E'\\\\ufffd')
			 WHERE strpos(document, E'\\\\u0000') > 0`
		);
	}
	await client.query(
		`UPDATE project_residue
		 SET document = replace(document, E'\\\\u0000', E'\\\\ufffd')
		 WHERE section IN ('documents', 'baselines', 'approvals')
		   AND strpos(document, E'\\\\u0000') > 0`
	);
}

export const MIGRATIONS: readonly Migration[] = [
	{
		// The pre-runner schema, verbatim. Idempotent (IF NOT EXISTS) so existing
		// installs adopt the runner without noticing.
		id: '0001-baseline',
		sql: `
CREATE TABLE IF NOT EXISTS project_drafts (project_id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_definition_drafts (project_id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_users_drafts (project_id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_features_drafts (project_id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_experience_drafts (project_id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_rules_drafts (project_id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_glossary_drafts (project_id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_supervision_drafts (project_id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_finops_drafts (project_id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_foundations_drafts (project_id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_data_drafts (project_id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_architecture_drafts (project_id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_coherence_drafts (project_id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_contract_drafts (project_id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_generation_drafts (project_id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_residue (project_id TEXT NOT NULL, section TEXT NOT NULL, document TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (project_id, section));
CREATE TABLE IF NOT EXISTS back_project_links (local_project_id TEXT PRIMARY KEY, back_project_id TEXT NOT NULL, back_workspace_id TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS domains (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT 'lucide:building-2', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_meta (project_id TEXT PRIMARY KEY, domain_id TEXT, stage TEXT NOT NULL DEFAULT 'ideation', updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS draft_revisions (project_id TEXT NOT NULL, section TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (project_id, section));
CREATE TABLE IF NOT EXISTS app_settings (id TEXT PRIMARY KEY, document TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS product_activation (id TEXT PRIMARY KEY, license_key TEXT NOT NULL, activated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS install_clock_floor (id TEXT PRIMARY KEY, seen_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS domain_access (workspace_id TEXT NOT NULL, user_email TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'all', domain_ids TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL, PRIMARY KEY (workspace_id, user_email));
`
	},
	{
		// Consolidate the simple (no kernel projection) wizard sections into one
		// section-keyed document table where the document and its optimistic-lock
		// revision live in the SAME row — that is what makes the save a single
		// atomic compare-and-write (no separate lock table, no compensation).
		// Sections: foundations, glossary, supervision, finops, architecture,
		// contract, generation (from their dedicated tables) + documents,
		// baselines, approvals (from project_residue). Old dedicated tables are
		// kept as tombstones for one release and dropped by a later migration;
		// nothing writes them anymore. The migrated project_residue rows are
		// removed so a section never has two sources of truth.
		id: '0002-project-section-documents',
		sql: `
CREATE TABLE IF NOT EXISTS project_section_documents (
	project_id TEXT NOT NULL,
	section TEXT NOT NULL,
	schema_version INTEGER NOT NULL DEFAULT 1,
	document JSONB NOT NULL,
	revision INTEGER NOT NULL DEFAULT 0,
	updated_at TEXT NOT NULL,
	PRIMARY KEY (project_id, section)
);
INSERT INTO project_section_documents (project_id, section, schema_version, document, revision, updated_at)
SELECT d.project_id, d.section, 1, d.document::jsonb, COALESCE(r.revision, 0), d.updated_at
FROM (
	SELECT project_id, 'foundations'  AS section, document, updated_at FROM project_foundations_drafts
	UNION ALL SELECT project_id, 'glossary',     document, updated_at FROM project_glossary_drafts
	UNION ALL SELECT project_id, 'supervision',  document, updated_at FROM project_supervision_drafts
	UNION ALL SELECT project_id, 'finops',       document, updated_at FROM project_finops_drafts
	UNION ALL SELECT project_id, 'architecture', document, updated_at FROM project_architecture_drafts
	UNION ALL SELECT project_id, 'contract',     document, updated_at FROM project_contract_drafts
	UNION ALL SELECT project_id, 'generation',   document, updated_at FROM project_generation_drafts
) d
LEFT JOIN draft_revisions r ON r.project_id = d.project_id AND r.section = d.section
ON CONFLICT (project_id, section) DO NOTHING;
INSERT INTO project_section_documents (project_id, section, schema_version, document, revision, updated_at)
SELECT p.project_id, p.section, 1, p.document::jsonb, COALESCE(r.revision, 0), p.updated_at
FROM project_residue p
LEFT JOIN draft_revisions r ON r.project_id = p.project_id AND r.section = p.section
WHERE p.section IN ('documents', 'baselines', 'approvals')
ON CONFLICT (project_id, section) DO NOTHING;
DELETE FROM project_residue WHERE section IN ('documents', 'baselines', 'approvals');
`
	},
	{
		// Link registration health. `status` records whether a project is really
		// mirrored to the back; `last_error` keeps the last probe/registration
		// failure so the UI can offer an explicit retry. The FK to the catalog is
		// added NOT VALID on purpose: existing installs may still hold orphan links
		// (a link whose local project was removed out-of-band) that reconciliation
		// (MR 3 + the operational checkpoint) has not cleaned yet. NOT VALID enforces
		// the constraint for every NEW write while tolerating those legacy rows; a
		// later migration runs `VALIDATE CONSTRAINT` once the store is clean.
		id: '0003-back-link-health',
		sql: `
ALTER TABLE back_project_links ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'linked';
ALTER TABLE back_project_links ADD COLUMN IF NOT EXISTS last_error TEXT;
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'back_project_links_local_project_fk') THEN
		ALTER TABLE back_project_links
			ADD CONSTRAINT back_project_links_local_project_fk
			FOREIGN KEY (local_project_id) REFERENCES project_drafts (project_id) ON DELETE CASCADE NOT VALID;
	END IF;
END $$;
`
	},
	{
		// Coherence contains authored thresholds/acknowledgements and generated
		// artifacts but no kernel projection. Move it to the atomic section store
		// so generation and autosave share one revisioned document.
		id: '0004-coherence-section-document',
		sql: `
INSERT INTO project_section_documents (project_id, section, schema_version, document, revision, updated_at)
SELECT d.project_id, 'coherence', 1, d.document::jsonb, COALESCE(r.revision, 0), d.updated_at
FROM project_coherence_drafts d
LEFT JOIN draft_revisions r ON r.project_id = d.project_id AND r.section = 'coherence'
ON CONFLICT (project_id, section) DO NOTHING;
DELETE FROM draft_revisions WHERE section = 'coherence';
`
	},
	{
		// A NOT VALID foreign key still protects new writes, but legacy links for
		// projects deleted before the cascade remained. They have no live owner and
		// can prevent their kernel folders from being recognized as quarantine
		// candidates. Remove only those deterministic orphans, then validate the FK.
		id: '0005-validate-back-link-owner',
		sql: `
DELETE FROM back_project_links link
WHERE NOT EXISTS (
	SELECT 1 FROM project_drafts project
	WHERE project.project_id = link.local_project_id
);
ALTER TABLE back_project_links VALIDATE CONSTRAINT back_project_links_local_project_fk;
`
	},
	{
		// Durable back-sync outbox (persistence-sync-remaining, item 5). The
		// envelope mirror is a whole-project snapshot, so this coalesces to ONE
		// row per project (latest-wins) instead of a queue: a row means
		// "PostgreSQL is newer than Back", drained with backoff by the
		// composition-root worker. Stays empty in standalone MAP mode.
		id: '0006-back-sync-outbox',
		sql: `
CREATE TABLE IF NOT EXISTS back_sync_outbox (
	project_id TEXT PRIMARY KEY,
	queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	attempts INT NOT NULL DEFAULT 0,
	next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	last_error TEXT
);
`
	},
	{
		// Monotonic per-project envelope version for the back mirror's
		// stale-write guard: bumped atomically before each push so a slow, older
		// push can never overwrite a newer envelope on the back (the back
		// compares in its UPDATE's WHERE clause and 409s the loser).
		id: '0007-back-link-envelope-version',
		sql: `
ALTER TABLE back_project_links ADD COLUMN IF NOT EXISTS envelope_version BIGINT NOT NULL DEFAULT 0;
`
	},
	{
		// Foundation fold: the initialization/framing/foundations vocabulary
		// collapses into the single `foundation` bounded context. Storage keys
		// follow: the definition slice's dedicated table is renamed (IF EXISTS —
		// fresh installs create `project_definition_drafts` directly in 0001),
		// the operations slice's section-document rows move to the namespaced
		// `foundation.operations` key, and the identity/definition optimistic-lock
		// revision rows are re-keyed so open editors keep their revision trail.
		// Stale pre-consolidation `foundations` revision rows (unread since 0002)
		// are dropped rather than re-keyed — the revision now lives in-row in
		// project_section_documents.
		id: '0008-foundation-fold',
		sql: `
ALTER TABLE IF EXISTS project_framing_drafts RENAME TO project_definition_drafts;
UPDATE project_section_documents SET section = 'foundation.operations' WHERE section = 'foundations';
UPDATE draft_revisions SET section = 'foundation.identity' WHERE section = 'initialization';
UPDATE draft_revisions SET section = 'foundation.definition' WHERE section = 'framing';
DELETE FROM draft_revisions WHERE section = 'foundations';
`
	},
	{
		// The delivery stage stopped being a stored, hand-picked value: it is now
		// derived from the live signals (see `deriveProjectStage`). Drop the column
		// so no reader can resurrect a stale, author-declared stage.
		id: '0009-drop-stored-stage',
		sql: `
ALTER TABLE IF EXISTS project_meta DROP COLUMN IF EXISTS stage;
`
	},
	{
		// Shipping is the one delivery fact no score can establish: a person says
		// the product went live. Recorded here as a timestamp, written only by the
		// portfolio's explicit human action.
		id: '0010-project-shipped-at',
		sql: `
ALTER TABLE IF EXISTS project_meta ADD COLUMN IF NOT EXISTS shipped_at TEXT;
`
	},
	{
		// The AI Generation Contract and Generation & evidence sections are gone:
		// nothing reads or writes them, and no score is derived from them anymore.
		// Drop their consolidated rows plus the two 0001 tombstone tables that
		// migration 0002 already drained. Migrations 0001/0002 stay verbatim, so a
		// from-scratch install still creates, drains, and then drops them here.
		// (Renamed from a duplicate 0010 prefix; idempotent, so DBs that already
		// ran it under the old id just re-run it as a no-op.)
		id: '0011-drop-contract-and-generation',
		sql: `
DELETE FROM project_section_documents WHERE section IN ('contract', 'generation');
DELETE FROM draft_revisions WHERE section IN ('contract', 'generation');
DROP TABLE IF EXISTS project_contract_drafts;
DROP TABLE IF EXISTS project_generation_drafts;
`
	},
	{
		// One random identifier per installation, minted on first read and never
		// rewritten. It is what an operator hands back to lyriks.io to register the
		// install, now that Community is licensed too and the appliance still never
		// calls home. Its own table, like the clock floor, because it must outlive
		// every licence key this box is given (`clear()` must not reset it).
		id: '0012-install-identity',
		sql: `
CREATE TABLE IF NOT EXISTS install_identity (
	id TEXT PRIMARY KEY,
	install_id TEXT NOT NULL,
	created_at TEXT NOT NULL
);
`
	},
	{
		// Replacing a licence used to overwrite the only copy of the working key.
		// A renewal that verifies but grants less than expected (fewer seats, a
		// shorter window, the wrong edition for a planned upgrade) therefore had
		// no way back except finding the old key in an inbox. Keeping the
		// superseded key beside the current one makes a key swap reversible on
		// the box itself, which is what lets an operator try a new key at all.
		id: '0013-activation-previous-key',
		sql: `
ALTER TABLE IF EXISTS product_activation ADD COLUMN IF NOT EXISTS previous_key TEXT;
ALTER TABLE IF EXISTS product_activation ADD COLUMN IF NOT EXISTS previous_activated_at TEXT;
`
	},
	{
		// The Community operator account, held by the platform so the edition runs
		// without the Back. One row on purpose (the single seat); bcrypt hash and
		// the same session-token shape as the Back, so an account moves between
		// editions by copying this row (see LocalIdentityProvider).
		id: '0014-operator-accounts',
		sql: `
CREATE TABLE IF NOT EXISTS operator_accounts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`
	},
	{
		id: '0015-operator-session-version',
		sql: `ALTER TABLE operator_accounts ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;`
	}
];

/**
 * Apply every pending migration, exactly once across all replicas. Runs at
 * boot before the first query (see `ready()` in pg-database.server.ts).
 */
export async function runMigrations(pool: pg.Pool): Promise<void> {
	const client = await pool.connect();
	try {
		await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
		try {
			await client.query(
				'CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)'
			);
			const { rows } = await client.query<{ id: string }>('SELECT id FROM schema_migrations');
			const applied = new Set(rows.map((r) => r.id));
			for (const migration of MIGRATIONS) {
				if (applied.has(migration.id)) continue;
				try {
					await client.query('BEGIN');
					if (migration.id === '0002-project-section-documents') {
						await sanitizeLegacySectionDocuments(client);
					}
					await client.query(migration.sql);
					await client.query('INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)', [
						migration.id,
						new Date().toISOString()
					]);
					await client.query('COMMIT');
				} catch (e) {
					await client.query('ROLLBACK');
					throw new Error(
						`migration ${migration.id} failed: ${e instanceof Error ? e.message : String(e)}`
					);
				}
			}
		} finally {
			await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
		}
	} finally {
		client.release();
	}
}
