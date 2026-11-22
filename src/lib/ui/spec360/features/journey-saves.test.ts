import { describe, expect, it, vi } from 'vitest';
import { applyJourneyAct, type ActionJourney, type JourneyAct } from '$domain/features';
import { JourneySaves, type JourneySaveAnswer } from './journey-saves';

const ids = new Set(['a', 'b', 'c']);
const declared: ActionJourney[] = [{ id: 'j', name: 'Journeys', nodes: ['a', 'b', 'c'], links: [], origin: 'person' }];

/** A server that applies each act with the same rules, answering when the test lets it. */
function slowServer(start: readonly ActionJourney[]) {
	let held: readonly ActionJourney[] = start;
	const waiting: (() => void)[] = [];
	const sent: JourneyAct[] = [];
	const send = vi.fn((act: JourneyAct) => {
		sent.push(act);
		return new Promise<JourneySaveAnswer>((resolve) => {
			waiting.push(() => {
				const outcome = applyJourneyAct(held, act, ids);
				if (outcome.ok) held = outcome.journeys;
				resolve(outcome.ok ? { ok: true, journeys: outcome.journeys } : { ok: false, refusal: outcome.refusal });
			});
		});
	});
	const answerNext = async () => {
		waiting.shift()?.();
		await vi.waitFor(() => undefined);
	};
	return { send, sent, answerNext, held: () => held };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a change to the diagram shows at once and none is lost [criterion:a8a7f1d5]', () => {
	it('shows an arrow before the server answers', () => {
		const server = slowServer(declared);
		const views: (readonly ActionJourney[] | null)[] = [];
		const saves = new JourneySaves({ send: server.send, reread: async () => server.held(), onview: (j) => views.push(j) });
		expect(saves.apply(declared, { kind: 'link', journeyId: 'j', from: 'a', to: 'b' }, ids)).toBeNull();
		expect(views.at(-1)?.[0].links).toEqual([{ from: 'a', to: 'b' }]);
		expect(saves.waiting).toBe(1);
	});

	it('saves the changes made in a row one after the other, in order, none dropped', async () => {
		const server = slowServer(declared);
		let shown: readonly ActionJourney[] = declared;
		const saves = new JourneySaves({ send: server.send, reread: async () => server.held(), onview: (j) => (shown = j ?? declared) });
		saves.apply(shown, { kind: 'link', journeyId: 'j', from: 'a', to: 'b' }, ids);
		saves.apply(shown, { kind: 'link', journeyId: 'j', from: 'b', to: 'c' }, ids);
		saves.apply(shown, { kind: 'move', journeyId: 'j', actionId: 'c', x: 40, y: 80 }, ids);
		expect(shown[0].links).toHaveLength(2);
		expect(server.send).toHaveBeenCalledTimes(1);
		for (let i = 0; i < 3; i++) {
			await server.answerNext();
			await flush();
		}
		expect(server.sent.map((a) => a.kind)).toEqual(['link', 'link', 'move']);
		expect(server.held()[0].links).toEqual([{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]);
		expect(shown).toEqual(server.held());
		expect(saves.waiting).toBe(0);
	});

	it('sends nothing for a change the rules refuse, and says why', () => {
		const server = slowServer(declared);
		const saves = new JourneySaves({ send: server.send, reread: async () => server.held(), onview: () => {} });
		const looped: ActionJourney[] = [{ ...declared[0], links: [{ from: 'a', to: 'b' }] }];
		expect(saves.apply(looped, { kind: 'link', journeyId: 'j', from: 'b', to: 'a' }, ids)).toMatch(/.+/);
		expect(server.send).not.toHaveBeenCalled();
	});

	it('reads again what is saved and says the refusal when the server refuses a change', async () => {
		const reread = vi.fn(async () => declared);
		const onview = vi.fn();
		const send = vi
			.fn<(act: JourneyAct) => Promise<JourneySaveAnswer>>()
			.mockResolvedValueOnce({ ok: false, refusal: 'This journey is not on the feature any more.' });
		const saves = new JourneySaves({ send, reread, onview });
		saves.apply(declared, { kind: 'link', journeyId: 'j', from: 'a', to: 'b' }, ids);
		saves.apply(declared, { kind: 'link', journeyId: 'j', from: 'b', to: 'c' }, ids);
		await vi.waitFor(() => expect(reread).toHaveBeenCalled());
		await flush();
		expect(send).toHaveBeenCalledTimes(1);
		expect(onview).toHaveBeenLastCalledWith(declared, 'This journey is not on the feature any more.');
		expect(saves.waiting).toBe(0);
	});

	it('counts every change in the Saving indicator until it settles', async () => {
		let tracked = 0;
		const track = <T,>(save: Promise<T>): Promise<T> => {
			tracked += 1;
			return save;
		};
		const send = vi.fn(async (act: JourneyAct): Promise<JourneySaveAnswer> => {
			const outcome = applyJourneyAct(declared, act, ids);
			return outcome.ok ? { ok: true, journeys: outcome.journeys } : { ok: false, refusal: outcome.refusal };
		});
		const saves = new JourneySaves({ send, reread: async () => null, onview: () => {}, track });
		saves.apply(declared, { kind: 'link', journeyId: 'j', from: 'a', to: 'b' }, ids);
		await vi.waitFor(() => expect(saves.waiting).toBe(0));
		expect(tracked).toBe(1);
	});
});
