import { describe, expect, it } from 'vitest';
import { LoadConformanceUseCase } from './load-conformance';
import { LoadImplementationCoverageUseCase, type FeatureImplementationCoverage } from './load-implementation-coverage';
import type { BehaviorRepositoryPort, CodeAdoptionPort } from '../ports';

/**
 * The assembly of Proven against code: the engine's implementation status, folded
 * by the coverage read, then measured. Run end to end on the engine's own answer
 * shape so a renamed field upstream fails here instead of reading 0 %.
 */

const LEAVES = {
	features: [
		{ id: 'feat-archive', name: 'Archive bookmarks', parentId: null },
		{ id: 'feat-tags', name: 'Tag bookmarks', parentId: null },
		{ id: 'feat-feeds', name: 'Feeds', parentId: null }
	],
	cores: []
};

const action = (id: string, opts: { located: boolean; verifiedAt?: string }) => ({
	actionId: id,
	expectedEntities: [
		{ entityType: 'action', entityId: id, entityName: id },
		{ entityType: 'rule', entityId: `${id}-r`, entityName: 'rule' }
	],
	foundEntities: [
		...(opts.located ? [{ entityType: 'action', entityId: id, locations: [{ file: 'views.py', line: 3, snippet: `def ${id}():` }] }] : []),
		{ entityType: 'rule', entityId: `${id}-r`, locations: [{ file: 'views.py', line: 2, snippet: '@login_required' }] }
	],
	missingEntities: [],
	auditMeta: { auditedAt: '2026-11-01T22:55:47.508Z', ...(opts.verifiedAt ? { verifiedAt: opts.verifiedAt } : {}) }
});

/** The engine's get_implementation_status answers, per feature. */
const STATUS: Record<string, Record<string, unknown>> = {
	'feat-archive': {
		actions: [action('archive', { located: true, verifiedAt: '2026-11-02T08:00:00.000Z' }), action('unarchive', { located: true })],
		surfaces: [],
		criteria: [
			{ criterionId: 'c1', title: 'Archived leave the list', standing: 'active', state: 'verified' },
			{ criterionId: 'c2', title: 'Old wording', standing: 'superseded by c1', state: 'failing' },
			{ criterionId: 'c3', title: 'Not decided', standing: 'draft', state: 'none' }
		],
		verified: { actions: 1, total: 2 }
	},
	'feat-tags': {
		actions: [action('tag', { located: true }), action('untag', { located: false, verifiedAt: '2026-11-02T08:00:00.000Z' })],
		surfaces: [],
		criteria: [
			{ criterionId: 'c4', title: 'Tags are shared', standing: 'active, but superseded by c9', state: 'failing' },
			{ criterionId: 'c5', title: 'Tag cloud', standing: 'active', state: 'none' }
		]
	}
	// feat-feeds: never indexed, so no coverage row at all.
};

function coverageRead() {
	return new LoadImplementationCoverageUseCase(
		{ execute: async () => LEAVES } as never,
		{
			available: true,
			getImplementationStatus: async (featureId: string) => (STATUS[featureId] ? { ok: true as const, value: STATUS[featureId] } : { ok: true as const, value: {} })
		} as unknown as CodeAdoptionPort,
		{ loadFeature: async () => null } as unknown as BehaviorRepositoryPort
	);
}

describe('LoadConformanceUseCase', () => {
	it('measures proven actions over located ones and active criteria by their last result', async () => {
		const read = coverageRead();
		const c = await new LoadConformanceUseCase({ get: (projectId) => read.execute(projectId) }).execute('linkding');

		// archive proven, unarchive and tag located but not proven; untag's stamp
		// counts for nothing because the index never located the action itself.
		expect(c.actions).toEqual({ proven: 1, located: 3 });
		expect(c.percent).toBe(33);
		expect(c.label).toBe('33% proven');
		// c1 verified, c4 failing (still in force), c5 nothing yet; draft and superseded left out.
		expect(c.criteria).toEqual({ total: 3, verified: 1, failing: 1 });
		expect(c.detail).toBe('1 of 3 located actions proven · 1 of 3 criteria verified · 1 failing');
	});

	it('says No code linked on a project the index never reached', async () => {
		const c = await new LoadConformanceUseCase({ get: async () => ({}) }).execute('fresh');
		expect(c.reading).toBe('no_code_linked');
		expect(c.percent).toBeNull();
		expect(c.label).toBe('No code linked');
	});

	it('reads a coverage snapshot taken before proof stamps existed as nothing proven, criteria unknown', async () => {
		const legacy: FeatureImplementationCoverage = {
			featureId: 'feat-archive',
			found: 4,
			expected: 4,
			percent: 100,
			actions: { archive: { found: 2, expected: 2, percent: 100, elements: [{ kind: 'action', id: 'archive', name: 'archive', location: { file: 'views.py', line: 3 } }] } },
			updatedAt: null,
			specUpdatedAt: null
		};
		const c = await new LoadConformanceUseCase({ get: async () => ({ 'feat-archive': legacy }) }).execute('p');
		expect(c.actions).toEqual({ proven: 0, located: 1 });
		expect(c.percent).toBe(0);
		expect(c.criteria).toBeNull();
	});
});
