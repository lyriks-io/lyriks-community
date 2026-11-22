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
import { emptyRowSnapshot } from '$domain/portability';
import { PgProjectPortabilityStore } from './pg-project-portability-store.server';
import { PgBackLinkRepository } from './pg-back-link-repository.server';

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


integration('project restore preserves live local ownership', () => {
	it('keeps the latest team and refuses archive owners during a content restore [criterion:d91acf2d]', async () => {
		await ready();
		const id = `restore-team-${randomUUID()}`;
		const residue = new PgProjectResidueRepository();
		const store = new PgProjectPortabilityStore();
		const latestTeam = { collaborators: [{ id: 'real-owner', role: 'owner' }] };
		try {
			await residue.save(id, 'team', latestTeam);
			await residue.save(id, 'content', { old: true });
			await store.write(id, { ...emptyRowSnapshot(), residue: {
				team: { collaborators: [{ id: 'archive-owner', role: 'owner' }] }, content: { restored: true }
			} }, { preserveLocalTeam: true });
			expect(await residue.load(id, 'team')).toEqual(latestTeam);
			expect(await residue.load(id, 'content')).toEqual({ restored: true });
			await pgQuery('DELETE FROM project_residue WHERE project_id = $1 AND section = $2', [id, 'team']);
			await store.write(id, { ...emptyRowSnapshot(), residue: { team: { collaborators: [{ id: 'archive-owner', role: 'owner' }] } } }, { preserveLocalTeam: true });
			expect(await residue.load(id, 'team')).toBeNull();
		} finally {
			await pgQuery('DELETE FROM project_residue WHERE project_id = $1', [id]);
		}
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

integration('the link of a project to its Back project', () => {
	const repository = new PgBackLinkRepository();
	const ids: string[] = [];
	/** A local project (a link names one that exists), not yet registered on the Back. */
	const fresh = async () => {
		const id = `link-${randomUUID()}`;
		ids.push(id);
		await pgQuery('INSERT INTO project_drafts (project_id, document, updated_at) VALUES ($1, $2, $3)', [id, JSON.stringify({ projectId: id }), new Date().toISOString()]);
		return id;
	};
	afterAll(async () => {
		await pgQuery('DELETE FROM project_drafts WHERE project_id = ANY($1::text[])', [ids]);
	});

	it('is absent for a project never registered, and gets no envelope version', async () => {
		await ready();
		const id = await fresh();
		expect(await repository.find(id)).toBeNull();
		expect(await repository.nextEnvelopeVersion(id)).toBeNull();
	});

	it('is linked once saved, keeps the error of a failed health check, and a new save heals it', async () => {
		await ready();
		const id = await fresh();
		await repository.save({ localProjectId: id, backProjectId: 'b-1', backWorkspaceId: 'ws-1' });
		expect(await repository.find(id)).toEqual({ localProjectId: id, backProjectId: 'b-1', backWorkspaceId: 'ws-1', status: 'linked' });
		await repository.markStatus(id, 'stale', 'back project 404');
		expect(await repository.find(id)).toMatchObject({ status: 'stale', lastError: 'back project 404' });
		await repository.save({ localProjectId: id, backProjectId: 'b-2', backWorkspaceId: 'ws-1' });
		expect(await repository.find(id)).toEqual({ localProjectId: id, backProjectId: 'b-2', backWorkspaceId: 'ws-1', status: 'linked' });
	});

	it('hands concurrent pushes distinct, strictly increasing envelope versions', async () => {
		await ready();
		const id = await fresh();
		await repository.save({ localProjectId: id, backProjectId: 'b-1', backWorkspaceId: 'ws-1' });
		const versions = await Promise.all(Array.from({ length: 5 }, () => repository.nextEnvelopeVersion(id)));
		expect(new Set(versions).size).toBe(5);
		expect(await repository.nextEnvelopeVersion(id)).toBe(Math.max(...(versions as number[])) + 1);
	});
});

integration('a project copied out of PostgreSQL and back', () => {
	it('reads back exactly the rows it wrote, and replaces what the copy does not describe', async () => {
		await ready();
		const id = `portable-${randomUUID()}`;
		const store = new PgProjectPortabilityStore();
		const snapshot = {
			...emptyRowSnapshot(),
			legacyDocuments: { project_drafts: { projectId: id, productName: 'Shop' }, project_rules_drafts: { rules: ['r1'] } },
			sectionDocuments: { glossary: { schemaVersion: 1, document: { terms: ['cart'] }, revision: 3 } },
			residue: { 'kernel-residue': { sources: [] }, team: { collaborators: [] } },
			revisions: { rules: 4 },
			meta: { domainId: null, shippedAt: null }
		};
		try {
			await store.write(id, snapshot);
			expect(await store.exists(id)).toBe(true);
			expect(await store.read(id)).toEqual(snapshot);

			const smaller = { ...emptyRowSnapshot(), legacyDocuments: { project_drafts: { projectId: id, productName: 'Shop 2' } } };
			await store.write(id, smaller);
			expect(await store.read(id)).toEqual({ ...smaller, meta: null });
		} finally {
			for (const table of ['project_section_documents', 'project_residue', 'draft_revisions', 'project_meta', 'project_drafts', 'project_rules_drafts']) {
				await pgQuery(`DELETE FROM ${table} WHERE project_id = $1`, [id]);
			}
		}
	});

	it('leaves the project as it was when the copy cannot be written whole', async () => {
		await ready();
		const id = `portable-${randomUUID()}`;
		const store = new PgProjectPortabilityStore();
		const original = { ...emptyRowSnapshot(), legacyDocuments: { project_drafts: { projectId: id, productName: 'Kept' } } };
		try {
			await store.write(id, original);
			// A revision that is not a number makes the last insert fail, after the deletes and the first inserts.
			const broken = { ...emptyRowSnapshot(), legacyDocuments: { project_drafts: { projectId: id, productName: 'Lost' } }, revisions: { rules: 'not-a-number' as unknown as number } };
			await expect(store.write(id, broken)).rejects.toThrow();
			expect((await store.read(id)).legacyDocuments).toEqual({ project_drafts: { projectId: id, productName: 'Kept' } });
		} finally {
			await pgQuery('DELETE FROM project_drafts WHERE project_id = $1', [id]);
			await pgQuery('DELETE FROM draft_revisions WHERE project_id = $1', [id]);
		}
	});
});
