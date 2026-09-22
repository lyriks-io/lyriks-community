import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { createEmptyCoherenceDraft, type Gap, type ProjectCoherenceDraft } from '$domain/coherence';

/**
 * The door that decides who may take a finding off the score.
 *
 * The domain has said from the start that settling belongs to a person and that
 * a client may only report, and `canSettle` refuses anything else. This route
 * then built its author as `{ kind: 'person' }` unconditionally, so that refusal
 * could never fire: the MCP names itself with `x-lyriks-actor: ai_client` on
 * every call it makes, and its decisions were being recorded, and signed, as a
 * person's. The header is now what says who is deciding.
 */

let stored: ProjectCoherenceDraft = createEmptyCoherenceDraft('p1');
let openGaps: Gap[] = [];
let saved: ProjectCoherenceDraft | null = null;

const gap = (id: string, blocking = false): Gap => ({
	id,
	severity: 'medium',
	title: `finding ${id}`,
	detail: '',
	sourceStep: 'rules',
	blocking,
	provenance: 'detected'
});

vi.mock('$composition/container.server', () => ({
	getServices: () => ({
		currentSession: () => ({ email: 'ana@example.com' }),
		clock: { nowIso: () => '2026-09-22T12:00:00.000Z' },
		sectionDocuments: { currentRevision: async () => 3 },
		loadCoherenceDraft: {
			execute: async () => ({
				draft: stored,
				analysis: { dimensions: [], gaps: openGaps, readinessScore: 0 }
			})
		},
		saveCoherenceDraft: {
			executeDecided: async (draft: ProjectCoherenceDraft) => {
				saved = draft;
				return { savedAt: '', coherenceScore: 88, coherenceIssues: [], readinessScore: 0, revision: 4 };
			}
		}
	})
}));

vi.mock('$lib/server/project-access.server', () => ({
	requireProjectAccess: vi.fn(async () => {})
}));

const { POST } = await import('./+server');

type Handler = Parameters<typeof POST>[0];

const decide = (headers: Record<string, string> = {}) =>
	({
		params: { projectId: 'p1' },
		request: new Request('http://localhost/api/projects/p1/coherence/decisions', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...headers },
			body: JSON.stringify({ gapId: 'g1', status: 'by_design', reason: 'deliberate and correct' })
		})
	}) as unknown as Handler;

const refusal = async (event: Handler): Promise<string> => {
	try {
		await POST(event);
	} catch (thrown) {
		if (isHttpError(thrown)) return String(thrown.body.message);
		throw thrown;
	}
	return '';
};

beforeEach(() => {
	stored = createEmptyCoherenceDraft('p1');
	openGaps = [gap('g1')];
	saved = null;
});

describe('who may settle a coherence finding', () => {
	it('records a person’s decision, signed with their own name', async () => {
		const response = await POST(decide());
		expect(response.status).toBe(200);
		expect(saved?.decisions).toHaveLength(1);
		expect(saved?.decisions[0]).toMatchObject({
			gapId: 'g1',
			status: 'by_design',
			authorId: 'ana@example.com',
			authorKind: 'person'
		});
	});

	it('refuses a client, which is what the domain has always said', async () => {
		const why = await refusal(decide({ 'x-lyriks-actor': 'ai_client' }));
		expect(why).toContain('decisions belong to a person');
		expect(saved).toBeNull();
	});

	it('refuses a client reopening too: undoing a decision is deciding', async () => {
		stored = {
			...createEmptyCoherenceDraft('p1'),
			acknowledgedGapIds: ['g1']
		};
		const event = {
			params: { projectId: 'p1' },
			request: new Request('http://localhost/api/projects/p1/coherence/decisions', {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-lyriks-actor': 'ai_client' },
				body: JSON.stringify({ gapId: 'g1', status: 'reopened', reason: 'it is back' })
			})
		} as unknown as Handler;
		const why = await refusal(event);
		expect(why).toContain('decisions belong to a person');
		expect(saved).toBeNull();
	});

	it('still refuses a blocking finding, whoever is asking', async () => {
		openGaps = [gap('g1', true)];
		const why = await refusal(decide());
		expect(why).toContain('fix it at the source');
	});
});
