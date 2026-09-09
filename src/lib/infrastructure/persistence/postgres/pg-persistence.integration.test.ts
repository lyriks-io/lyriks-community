import { LocalIdentityProvider } from '$infrastructure/auth/local-identity-provider.server';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { pgQuery, ready } from './pg-database.server';
import { PgProjectResidueRepository } from './pg-project-residue-repository.server';
import { PgSectionDocumentStore } from './pg-section-documents.server';
import { PgDraftLock } from './pg-draft-lock.server';
import { MIGRATIONS } from './pg-migrations.server';
import type { SectionChangeEvent } from '$application/ports';

const projectId = `pg-integration-${randomUUID()}`;
const integration = process.env.LYRIKS_PG_URL ? describe : describe.skip;

integration('PostgreSQL persistence integration', () => {
	afterAll(async () => {
		await pgQuery('DELETE FROM project_residue WHERE project_id = $1', [projectId]);
		await pgQuery('DELETE FROM project_section_documents WHERE project_id = $1', [projectId]);
	});

	it('creates every table required by the PostgreSQL-only platform', async () => {
		await ready();
		const expected = [
			'project_finops_drafts',
			'project_residue',
			'project_section_documents',
			'draft_revisions',
			'schema_migrations'
		];
		const { rows } = await pgQuery<{ table_name: string }>(
			`SELECT table_name FROM information_schema.tables
			 WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
			[expected]
		);

		expect(rows.map((row) => row.table_name).sort()).toEqual(expected.sort());
	});

	it('records every migration exactly once', async () => {
		await ready();
		const { rows } = await pgQuery<{ id: string }>('SELECT id FROM schema_migrations ORDER BY id');
		expect(rows.map((r) => r.id)).toEqual(MIGRATIONS.map((m) => m.id));
	});

	it('round-trips project residue without SQLite', async () => {
		const repository = new PgProjectResidueRepository();
		await repository.save(projectId, 'kernel-residue', { sources: [{ id: 'source-1' }] });

		await expect(repository.load(projectId, 'kernel-residue')).resolves.toEqual({
			sources: [{ id: 'source-1' }]
		});
	});

	it('saves section documents atomically: bump on match, conflict on stale', async () => {
		const published: SectionChangeEvent[] = [];
		const store = new PgSectionDocumentStore({
			publishInTx: async () => {},
			publishAfterCommit: (change) => published.push(change)
		});

		// First save: no expectation → unconditional, revision 1.
		await expect(store.save(projectId, 'glossary', { terms: ['a'] }, null, 'tab-1')).resolves.toBe(
			1
		);
		// Matching expectation → bump to 2.
		await expect(
			store.save(projectId, 'glossary', { terms: ['a', 'b'] }, 1, 'tab-1')
		).resolves.toBe(2);
		// Stale expectation → conflict: nothing written, nothing published.
		await expect(store.save(projectId, 'glossary', { terms: ['x'] }, 1, 'tab-2')).resolves.toBe(
			null
		);

		await expect(store.currentRevision(projectId, 'glossary')).resolves.toBe(2);
		await expect(store.load(projectId, 'glossary')).resolves.toEqual({ terms: ['a', 'b'] });
		expect(published).toHaveLength(2);
		expect(published[0]).toEqual({ projectId, section: 'glossary', origin: 'tab-1' });
	});

	it('allows exactly one concurrent first section save at revision zero', async () => {
		const store = new PgSectionDocumentStore({
			publishInTx: async () => {},
			publishAfterCommit: () => {}
		});
		const section = 'concurrent-first-document';
		const results = await Promise.all([
			store.save(projectId, section, { writer: 'a' }, 0, 'tab-a'),
			store.save(projectId, section, { writer: 'b' }, 0, 'tab-b')
		]);

		expect(results.filter((revision) => revision === 1)).toHaveLength(1);
		expect(results.filter((revision) => revision === null)).toHaveLength(1);
		expect(await store.currentRevision(projectId, section)).toBe(1);
	});

	it('allows exactly one concurrent first legacy revision commit', async () => {
		const lock = new PgDraftLock();
		const section = 'concurrent-first-lock';
		const results = await Promise.all([
			lock.commit(projectId, section, 0),
			lock.commit(projectId, section, 0)
		]);

		expect(results.filter((revision) => revision === 1)).toHaveLength(1);
		expect(results.filter((revision) => revision === null)).toHaveLength(1);
	});
});


integration('operator session version migration', () => {
	it('invalidates sessions across provider instances after password change and logout', async () => {
		await ready();
		const email = `audit-${randomUUID()}@example.test`;
		const secret = 'synthetic-integration-session-secret-0123456789';
		const password = 'initial-password-123';
		await pgQuery('INSERT INTO operator_accounts (email, password_hash) VALUES ($1, $2)', [email, await bcrypt.hash(password, 4)]);
		try {
			const identity = new LocalIdentityProvider(secret);
			const otherProcess = new LocalIdentityProvider(secret);
			const login = await identity.login(email, password);
			if (!('token' in login)) throw new Error('login failed');
			expect(await otherProcess.verify(login.token)).toMatchObject({ email });
			await identity.changePassword(login.token, password, 'replacement-password-123');
			expect(await otherProcess.verify(login.token)).toBeNull();
			const fresh = await identity.login(email, 'replacement-password-123');
			if (!('token' in fresh)) throw new Error('login failed');
			expect(await otherProcess.verify(fresh.token)).toMatchObject({ email });
			await identity.revokeSessions(fresh.token);
			expect(await otherProcess.verify(fresh.token)).toBeNull();
		} finally {
			await pgQuery('DELETE FROM operator_accounts WHERE email = $1', [email]);
		}
	});
});
