import { describe, it, expect } from 'vitest';
import { CreateProjectUseCase } from './create-project';
import type { ClockPort, FoundationIdentityRepositoryPort, PortfolioRepositoryPort } from '$application/ports';
import type { Domain } from '$domain/portfolio';
import type { ProjectMeta } from '$application/ports';
import type { FoundationIdentityDraft } from '$domain/foundation';

const clock: ClockPort = { nowIso: () => '2026-07-19T00:00:00.000Z' };

function fakeDrafts(): FoundationIdentityRepositoryPort {
	return { save: async () => {} } as unknown as FoundationIdentityRepositoryPort;
}

/** Identity store that keeps what was saved, for asserting on the draft itself. */
function recordingDrafts() {
	const saved: FoundationIdentityDraft[] = [];
	const repo = {
		save: async (d: FoundationIdentityDraft) => void saved.push(d)
	} as unknown as FoundationIdentityRepositoryPort;
	return { repo, saved };
}

/** In-memory portfolio: just the domain registry + per-project meta this test needs. */
function fakePortfolio(seed: Domain[] = []) {
	const domains = new Map(seed.map((d) => [d.id, d]));
	const meta = new Map<string, ProjectMeta>();
	const repo = {
		listDomains: async () => [...domains.values()],
		saveDomain: async (d: Domain) => void domains.set(d.id, d),
		setMeta: async (id: string, m: ProjectMeta) => void meta.set(id, m)
	} as unknown as PortfolioRepositoryPort;
	return { repo, domains, meta };
}

describe('CreateProjectUseCase — domain materialisation', () => {
	it('creates the referenced domain when none exists, honouring the caller id', async () => {
		const { repo, domains, meta } = fakePortfolio();
		const uc = new CreateProjectUseCase(fakeDrafts(), clock, repo, undefined, () => 'abc123');

		const id = await uc.execute({ name: 'Trailhead', domainId: 'mcp-test' });

		expect(domains.has('mcp-test')).toBe(true);
		expect(domains.get('mcp-test')?.name).toBe('Mcp Test');
		expect(meta.get(id)?.domainId).toBe('mcp-test'); // project points at the (now real) domain
	});

	it('reuses an existing domain instead of duplicating it', async () => {
		const existing: Domain = {
			id: 'mcp-test',
			name: 'MCP Test',
			description: 'kept',
			icon: 'lucide:beaker',
			createdAt: '2026-01-01T00:00:00.000Z'
		};
		const { repo, domains } = fakePortfolio([existing]);
		const uc = new CreateProjectUseCase(fakeDrafts(), clock, repo, undefined, () => 'abc123');

		await uc.execute({ name: 'Deskline', domainId: 'mcp-test' });

		expect(domains.size).toBe(1);
		expect(domains.get('mcp-test')?.description).toBe('kept'); // untouched
	});

	it('leaves the project unassigned when no domain is referenced', async () => {
		const { repo, domains, meta } = fakePortfolio();
		const uc = new CreateProjectUseCase(fakeDrafts(), clock, repo, undefined, () => 'abc123');

		const id = await uc.execute({ name: 'Loner' });

		expect(domains.size).toBe(0);
		expect(meta.get(id)?.domainId).toBeNull();
	});
});

describe('CreateProjectUseCase: source mode', () => {
	it('starts from scratch by default (greenfield)', async () => {
		const { repo, saved } = recordingDrafts();
		const uc = new CreateProjectUseCase(repo, clock, fakePortfolio().repo, undefined, () => 'abc123');

		await uc.execute({ name: 'Blank' });

		expect(saved[0]?.sourceMode).toBe('greenfield');
	});

	it('records "from a codebase" on the Foundation identity when asked', async () => {
		const { repo, saved } = recordingDrafts();
		const uc = new CreateProjectUseCase(repo, clock, fakePortfolio().repo, undefined, () => 'abc123');

		await uc.execute({ name: 'Legacy', sourceMode: 'code_to_spec' });

		expect(saved[0]?.sourceMode).toBe('code_to_spec');
		expect(saved[0]?.productName).toBe('Legacy');
	});
});
