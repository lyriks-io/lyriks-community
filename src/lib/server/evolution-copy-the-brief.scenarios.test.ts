import { beforeEach, describe, expect, it, vi } from 'vitest';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('./evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
import { correctionReading, type EvolutionRequest } from '$domain/evolution';
import { briefSubject, briefToCopy, type ReportLineLike } from '$ui/evolution/report-board';
import { batchScene, claude, requestAt } from './evolution-batch-scene.fixture';

/**
 * Copy the brief (feat-25, action bba7e1cd): every scenario on the text the
 * button hands to the clipboard and the toast it shows, composed by the code
 * the page runs from the request as the dossier reads it. The clipboard write
 * itself is the browser's and is not run here.
 */
const s = batchScene(scene);
const T = (id: string) => `[unspa:55da6501:bba7e1cd:${id}]`;
const PROJECT = { id: 'p', name: 'Shop' };
const line = (id: string, verdict: string, extra: Partial<ReportLineLike> = {}): ReportLineLike =>
	({ id, verdict, decision: 'undecided', requirement: `Checkout › rule "Requirement ${id}"`, specStatement: `Spec of ${id}`, filePath: null, lineRange: null, scope: 'request', ...extra }) as ReportLineLike;
const LINES = [line('a', 'conform'), line('b', 'non_conform', { filePath: 'src/cart.ts', lineRange: '12', codeStatement: 'save(cart) (no passing result proves it yet)' } as Partial<ReportLineLike>), line('c', 'missing')];
/** The request as the dossier reads it: its key, and the correction its reading names. */
const subjectOf = (request: EvolutionRequest) => briefSubject({ ...request, key: 'EVO-012', correction: correctionReading(request) }, PROJECT);

describe('Copy the brief', () => {
	beforeEach(() => s.show(requestAt('implementation')));

	it(`copies the brief of version 1 with its requirements; only the clipboard write is the browser's ${T('9a007a90')}`, () => {
		const copy = briefToCopy('whole', subjectOf(s.current()), LINES, [{ label: 'Payment', reason: 'Card only for now' }]);
		expect(copy.text).toContain('Implement evolution EVO-012 “Save a cart for later” (Shop project).');
		expect(copy.text).toContain('Reference spec: Lyriks › EVO-012 v1');
		expect(copy.text).toContain('Validated decisions:\n- Payment: Card only for now');
		expect(copy.text).toContain('Requirements to cover (3):');
		expect(copy.text).not.toContain('in correction');
		expect(copy.copied).toBe('Brief copied: paste it into your LLM');
	});

	it(`copies only the points still open once the build waits on the code; only the clipboard write is the browser's ${T('1ca01d8f')}`, () => {
		const copy = briefToCopy('open_points', subjectOf(s.current()), LINES);
		expect(copy.text).toContain('Finish evolution EVO-012 “Save a cart for later” (Shop project): the points of spec v1 no passing test covers yet.');
		expect(copy.text).toContain('Points still open (2), with what the last reading of the code says:');
		expect(copy.text).toContain('Requirement b');
		expect(copy.text).not.toContain('Requirement a');
		expect(copy.copied).toBe('Brief of the open points copied: paste it into your LLM');
	});

	it(`while version 2 is in correction both briefs are version 1's; only the clipboard write is the browser's ${T('e1b7c4de')}`, async () => {
		// A change to a draft in the Build opens version 2 in correction, through the real batch.
		expect((await s.run([{ op: 'update_draft_leaf', requestId: 'r', draftId: 'draft:r-1', objective: 'Keep a cart, and print it.' }], claude)).ok).toBe(true);
		const request = s.saved();
		expect(correctionReading(request)).toMatchObject({ version: 2, builtAgainst: 1 });
		for (const part of ['whole', 'open_points'] as const) {
			const { text } = briefToCopy(part, subjectOf(request), LINES);
			expect(text).toContain('Lyriks › EVO-012 v1');
			expect(text).not.toContain('Lyriks › EVO-012 v2');
			expect(text).toContain('Version 2 is in correction and waits for its validation: build against v1 until it is frozen.');
		}
	});
});
