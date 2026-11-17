import { describe, expect, it, vi } from 'vitest';
import type { ProjectHealth } from '$domain/coherence';

const published = vi.hoisted(() => [] as unknown[]);
vi.mock('./sync-bus.server', () => ({ publishSectionChange: (change: unknown) => published.push(change), subscribeSectionChanges: () => () => {} }));

const { CachedProjectHealth, HEALTH_FRESH_MS } = await import('./cached-project-health.server');

const reading = (score: number) => ({ headline: { score } }) as unknown as ProjectHealth;
/** A reading that lands, or fails, only when the test lets it. */
function deferred() {
	let resolve!: (h: ProjectHealth) => void;
	let reject!: (e: Error) => void;
	const promise = new Promise<ProjectHealth>((res, rej) => ((resolve = res), (reject = rej)));
	return { promise, resolve, reject };
}
type Change = { projectId: string; section: string };
function rig(stored: { model: string; health: ProjectHealth } | null = null) {
	let model = 'm1';
	let now = 1_000;
	let listener: ((change: Change) => void) | null = null;
	const runs: ReturnType<typeof deferred>[] = [];
	const saved: unknown[] = [];
	published.length = 0;
	const health = new CachedProjectHealth(
		{ execute: () => (runs.push(deferred()), runs[runs.length - 1].promise) },
		{ fingerprint: async () => model },
		{
			store: { load: async () => stored, save: async (_id, data) => void saved.push(data) },
			now: () => now,
			subscribe: (fn) => ((listener = fn as (change: Change) => void), () => {})
		}
	);
	return {
		health,
		runs,
		saved,
		write: (section: string) => listener?.({ projectId: 'p', section }),
		setModel: (m: string) => (model = m),
		advance: (ms: number) => (now += ms)
	};
}
const settle = () => new Promise((r) => setTimeout(r, 0));
/** A rig whose first reading (score 40) has landed. */
async function read40() {
	const r = rig();
	await r.health.get('p');
	r.runs[0].resolve(reading(40));
	await settle();
	published.length = 0;
	return r;
}

describe('a page never waits on the reading of Project health [criterion:ac-leaf-ac-score-shown-at-once]', () => {
	it('opens a project never read at once, says its first reading is under way, and tells the pages when it lands', async () => {
		const r = rig();
		expect(await r.health.get('p')).toBeNull();
		expect(r.health.reading('p')).toBe(true);
		r.runs[0].resolve(reading(40));
		await settle();
		expect(r.health.reading('p')).toBe(false);
		expect(published).toEqual([{ projectId: 'p', section: 'project-health', origin: null }]);
		expect(await r.health.get('p')).toEqual(reading(40));
		expect(r.runs).toHaveLength(1);
		expect(r.saved).toHaveLength(1);
	});

	it('shows the last reading after a write to the project, takes the new one behind, and tells the pages', async () => {
		const r = await read40();
		r.write('features');
		expect(await r.health.get('p')).toEqual(reading(40));
		expect(r.runs).toHaveLength(2);
		r.runs[1].resolve(reading(55));
		await settle();
		expect(published).toEqual([{ projectId: 'p', section: 'project-health', origin: null }]);
		expect(await r.health.get('p')).toEqual(reading(55));
	});

	it('is not sent reading again by its own news, nor by a page read within healthFreshFor', async () => {
		const r = await read40();
		r.write('project-health');
		r.advance(HEALTH_FRESH_MS - 1);
		await r.health.get('p');
		expect(r.runs).toHaveLength(1);
		r.advance(2);
		await r.health.get('p');
		expect(r.runs).toHaveLength(2);
	});

	it('reads again when the model changed, one reading at a time, and says nothing when it did not change', async () => {
		const r = await read40();
		r.setModel('m2');
		await r.health.get('p');
		await r.health.get('p');
		expect(r.runs).toHaveLength(2);
		r.runs[1].resolve(reading(40));
		await settle();
		expect(published).toEqual([]);
	});

	it('takes in a write that lands while a reading runs', async () => {
		const r = await read40();
		r.write('rules');
		await r.health.get('p');
		r.write('rules');
		r.runs[1].resolve(reading(50));
		await settle();
		await r.health.get('p');
		expect(r.runs).toHaveLength(3);
	});

	it('serves the reading kept across a restart at once, and refreshes it behind', async () => {
		const r = rig({ model: 'm1', health: reading(70) });
		expect(await r.health.get('p')).toEqual(reading(70));
		expect(r.runs).toHaveLength(1);
	});

	it('keeps the last reading when a new one fails, and tries a failed first reading again only after healthFreshFor', async () => {
		const kept = rig({ model: 'm0', health: reading(70) });
		await kept.health.get('p');
		kept.runs[0].reject(new Error('engine down'));
		await settle();
		expect(await kept.health.get('p')).toEqual(reading(70));

		const fresh = rig();
		await fresh.health.get('p');
		fresh.runs[0].reject(new Error('engine down'));
		await settle();
		expect(await fresh.health.get('p')).toBeNull();
		expect(fresh.runs).toHaveLength(1);
		fresh.advance(HEALTH_FRESH_MS + 1);
		await fresh.health.get('p');
		expect(fresh.runs).toHaveLength(2);
	});
});

describe('the health says a proof is in progress, then lands in place [criterion:5785c1fb]', () => {
	const proving = (score: number) => ({ headline: { score }, proofPending: true }) as unknown as ProjectHealth;
	function provingRig() {
		const later: Array<() => void> = [];
		const runs: ReturnType<typeof deferred>[] = [];
		published.length = 0;
		const health = new CachedProjectHealth(
			{ execute: () => (runs.push(deferred()), runs[runs.length - 1].promise) },
			{ fingerprint: async () => 'm1' },
			{ now: () => 1_000, subscribe: () => () => {}, later: (run) => void later.push(run) }
		);
		return { health, runs, later };
	}

	it('reads again while the proof runs, and stops once it landed', async () => {
		const r = provingRig();
		await r.health.get('p');
		r.runs[0].resolve(proving(40));
		await settle();
		expect(r.later).toHaveLength(1);

		r.later.shift()!();
		await settle();
		expect(r.runs).toHaveLength(2);
		published.length = 0;
		r.runs[1].resolve(reading(55));
		await settle();
		expect(published).toHaveLength(1);
		expect((await r.health.get('p'))?.headline.score).toBe(55);
		expect(r.later).toHaveLength(0);
	});

	it('stops after the recheck limit when the proof never lands', async () => {
		const { PROOF_RECHECK_LIMIT } = await import('./cached-project-health.server');
		const r = provingRig();
		await r.health.get('p');
		r.runs[0].resolve(proving(40));
		await settle();
		for (let i = 1; i <= PROOF_RECHECK_LIMIT; i += 1) {
			r.later.shift()!();
			await settle();
			r.runs[i].resolve(proving(40));
			await settle();
		}
		expect(r.runs).toHaveLength(PROOF_RECHECK_LIMIT + 1);
		expect(r.later).toHaveLength(0);
	});
});
