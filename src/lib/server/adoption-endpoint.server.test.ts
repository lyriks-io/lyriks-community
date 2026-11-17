import { describe, expect, it } from 'vitest';
import { SEED_NEXT_STEP, adoptionJson, inLyriksTerms, seedAnswerInLyriksTerms } from './adoption-endpoint.server';

const ENGINE_UNKNOWN = (id: string) => `No element "${id}" in this feature. Call get_feature to list element ids.`;

describe('engine refusals in Lyriks terms', () => {
	it('names the Lyriks tool and what a span can point at instead of get_feature', () => {
		const said = inLyriksTerms(ENGINE_UNKNOWN('ac-1'));
		expect(said).toContain('No element "ac-1" that a span or a candidate can point at');
		expect(said).toContain('get_behavior_feature');
		expect(said).not.toContain('get_feature ');
	});

	it('lists exactly the elements the engine traces, and the ones that carry no span (criterion 8636a090)', () => {
		const said = inLyriksTerms(ENGINE_UNKNOWN('e-1'));
		expect(said).toContain(
			'name a surface, a state (by the id of its state definition), an action, a rule, an invariant, a transition, an event or an entity'
		);
		for (const spanless of ['effects', 'parameters', 'exposures', 'scenarios', 'reachability goals', 'personas', 'resources', 'constants', 'acceptance criteria']) {
			expect(said).toContain(spanless);
		}
		expect(said).toContain('carry no span of their own');
	});

	it('leaves every other refusal as the engine wrote it', () => {
		expect(inLyriksTerms('Analysis is already finalized.')).toBe('Analysis is already finalized.');
	});
});

describe('a batch answer puts each refused item in Lyriks terms (criterion 8636a090)', () => {
	it('rewrites the reason of every refused row and keeps the rest of the answer verbatim', async () => {
		const answer = await adoptionJson({
			ok: true,
			value: {
				ok: false,
				recorded: 1,
				failed: 2,
				results: [
					{ elementId: 'a1', elementType: 'action', ok: true },
					{ elementId: 'p1', ok: false, error: ENGINE_UNKNOWN('p1') },
					{ elementId: 's1', ok: false, error: 'No stored source "src-9". Call list_sources.' }
				]
			}
		}).json();

		expect(answer.available).toBe(true);
		expect(answer.ok).toBe(false);
		expect(answer.recorded).toBe(1);
		expect(answer.results[0]).toEqual({ elementId: 'a1', elementType: 'action', ok: true });
		expect(answer.results[1].error).toContain('No element "p1" that a span or a candidate can point at');
		expect(answer.results[1].error).not.toContain('Call get_feature');
		expect(answer.results[2].error).toBe('No stored source "src-9". Call list_sources.');
	});

	it('translates a whole refusal as before', async () => {
		const answer = await adoptionJson({ ok: false, error: ENGINE_UNKNOWN('g1') }).json();
		expect(answer).toEqual({ available: true, ok: false, error: inLyriksTerms(ENGINE_UNKNOWN('g1')) });
	});
});

describe('seedAnswerInLyriksTerms (criterion 40dc3260)', () => {
	const engine = {
		written: 2,
		writtenKeys: ['action:a1', 'rule:r1'],
		entries: { 'action:a1': { file: 'a.ts', line: 1 } },
		hint: 'Call sync_from_index to auto-heal lines and push the coverage report to the dashboard.'
	};

	it('names sync_implementation_index and never an engine tool or a platform route', () => {
		const said = JSON.stringify(seedAnswerInLyriksTerms(engine));
		expect(said).toContain('sync_implementation_index');
		expect(said).toContain('the keys of the features you touched are enough');
		expect(said).not.toContain('sync_from_index');
		expect(said).not.toMatch(/POST|\/api\//);
	});

	it('keeps the entries and says nothing was seeded when nothing was', () => {
		const seeded = seedAnswerInLyriksTerms(engine);
		expect(seeded.entries).toEqual(engine.entries);
		expect(seeded.hint).toBe(SEED_NEXT_STEP);
		const none = seedAnswerInLyriksTerms({ ...engine, written: 0, writtenKeys: [], hint: 'Nothing written; pass overwrite:true to replace existing entries.' });
		expect(none.hint).toMatch(/^Nothing seeded/);
	});
});
