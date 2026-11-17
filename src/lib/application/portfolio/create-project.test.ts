import { describe, it, expect } from 'vitest';
import { CreateProjectUseCase, ProjectFolderRefusedError } from './create-project';
import type { ClockPort, FoundationIdentityRepositoryPort, PortfolioRepositoryPort } from '$application/ports';
import type { Domain } from '$domain/portfolio';
import type { ProjectMeta } from '$application/ports';
import type { FoundationIdentityDraft, FoundationOperationsDraft } from '$domain/foundation';

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

describe('CreateProjectUseCase, the language of a new project', () => {
	function seed(preferred: string) {
		const saved: FoundationOperationsDraft[] = [];
		return {
			saved,
			language: {
				operations: { save: async (d: FoundationOperationsDraft) => (saved.push(d), 1) },
				preferred: async () => preferred
			}
		};
	}

	it('starts in the language the installation prefers', async () => {
		const { saved, language } = seed('fr');
		const uc = new CreateProjectUseCase(fakeDrafts(), clock, fakePortfolio().repo, undefined, () => 'abc123', language);
		const id = await uc.execute({ name: 'Trailhead' });
		expect(saved).toHaveLength(1);
		expect(saved[0].projectId).toBe(id);
		expect(saved[0].i18n.primaryLocale).toBe('fr');
	});

	it('declares nothing while nobody has chosen a language', async () => {
		const { saved, language } = seed('');
		const uc = new CreateProjectUseCase(fakeDrafts(), clock, fakePortfolio().repo, undefined, () => 'abc123', language);
		await uc.execute({ name: 'Trailhead' });
		expect(saved).toHaveLength(0);
	});
});

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

describe('CreateProjectUseCase, the folder a new project is filed in (issue 157)', () => {
	const folder = (id: string, workspaceId: string): Domain => ({
		id,
		name: id,
		description: '',
		icon: 'lucide:building-2',
		createdAt: '2026-01-01T00:00:00.000Z',
		workspaceId
	});

	function setup() {
		const drafts = recordingDrafts();
		const portfolio = fakePortfolio([folder('dom-ours', 'ws-a'), folder('dom-theirs', 'ws-b')]);
		const uc = new CreateProjectUseCase(drafts.repo, clock, portfolio.repo, undefined, () => 'abc123');
		return { ...portfolio, saved: drafts.saved, uc };
	}

	it('refuses another workspace\'s folder before anything is written [rule:a8664b7b]', async () => {
		const { uc, saved, meta } = setup();
		const create = uc.execute({ name: 'Ledger', domainId: 'dom-theirs', placement: { workspaceId: 'ws-a', folders: null } });
		await expect(create).rejects.toBeInstanceOf(ProjectFolderRefusedError);
		await expect(create).rejects.toThrow('The target domain is outside your portfolio scope');
		expect(saved).toHaveLength(0);
		expect(meta.size).toBe(0);
	});

	it('refuses a folder outside a limited member\'s folders [rule:a8664b7b]', async () => {
		const { uc, saved } = setup();
		await expect(
			uc.execute({ name: 'Ledger', domainId: 'dom-ours', placement: { workspaceId: 'ws-a', folders: new Set(['dom-other']) } })
		).rejects.toThrow('The target domain is outside your portfolio scope');
		expect(saved).toHaveLength(0);
	});

	it('makes no folder for a limited member [rule:ed4ab638]', async () => {
		const { uc, saved, domains } = setup();
		await expect(
			uc.execute({ name: 'Ledger', domainId: 'dom-new', placement: { workspaceId: 'ws-a', folders: new Set(['dom-ours']) } })
		).rejects.toThrow('Only members with full portfolio access can create domains');
		expect(saved).toHaveLength(0);
		expect(domains.has('dom-new')).toBe(false);
	});

	it('files in a folder of the owning workspace the creator reaches', async () => {
		const { uc, meta } = setup();
		const id = await uc.execute({ name: 'Ledger', domainId: 'dom-ours', placement: { workspaceId: 'ws-a', folders: new Set(['dom-ours']) } });
		expect(meta.get(id)?.domainId).toBe('dom-ours');
	});

	it('makes a named folder in the owning workspace for a member who reaches every folder [rule:38cafaca]', async () => {
		const { uc, domains, meta } = setup();
		const id = await uc.execute({ name: 'Ledger', domainId: 'dom-new', placement: { workspaceId: 'ws-a', folders: null } });
		expect(domains.get('dom-new')?.workspaceId).toBe('ws-a');
		expect(meta.get(id)?.domainId).toBe('dom-new');
	});
});
