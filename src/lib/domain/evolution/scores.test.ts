import { describe, expect, it } from 'vitest';
import {
	canExcludeFromReadiness,
	canRestoreToReadiness,
	createEvolutionRequest,
	excludeFromReadiness,
	readCoherence,
	readReadiness,
	restoreToReadiness,
	trlFromMaturityScore,
	type Actor,
	type CoherenceFinding
} from './index';

/**
 * The scenarios the specification declares on "Read maturity, coherence and
 * readiness side by side" (feat-evo-three-scores), transcribed. The crossing
 * scenarios live with the gate (`canCrossToImplementation`); what is here is
 * the two readings and the traced exclusion.
 */

const admin: Actor = { id: 'ana', kind: 'person', role: 'admin' };
const designer: Actor = { id: 'lea', kind: 'person', role: 'member' };
const aiClient: Actor = { id: 'mcp-1', kind: 'ai_client', role: 'admin' };

const finding = (over: Partial<CoherenceFinding>): CoherenceFinding => ({
	id: 'f',
	axis: 'semantic',
	severity: 'minor',
	title: 'x',
	requestNodeId: 'a',
	existingNodeId: 'b',
	fixNowTarget: 'capability:glossary/term:import',
	published: true,
	...over
});

describe('the coherence reading', () => {
	it('is the engine score, with the undecided findings weighted by severity per axis', () => {
		const r = createEvolutionRequest({
			coherenceReport: { status: 'ready', projectScore: 82, requestDelta: -4, ranAt: 'now' },
			coherenceFindings: [
				finding({ id: 'f1', axis: 'behavioural', severity: 'blocking' }),
				finding({ id: 'f2', axis: 'behavioural', severity: 'minor' }),
				finding({ id: 'f3', axis: 'semantic', severity: 'major' }),
				finding({ id: 'f4', axis: 'semantic', severity: 'major', published: false })
			]
		});
		const reading = readCoherence(r);
		expect(reading.available).toBe(true);
		expect(reading.overall).toBe(82);
		expect(reading.delta).toBe(-4);
		expect(reading.blockingUndecided).toBe(1);
		// blocking 3 + minor 1 on behavioural, major 2 on semantic; the unpublished one is not undecided.
		expect(reading.perAxis.find((a) => a.axis === 'behavioural')?.weight).toBe(4);
		expect(reading.perAxis.find((a) => a.axis === 'semantic')?.weight).toBe(2);
		expect(reading.undecidedWeight).toBe(6);
	});

	it('has no number before the engine ran', () => {
		const reading = readCoherence(createEvolutionRequest());
		expect(reading.available).toBe(false);
		expect(reading.overall).toBeNull();
	});
});

describe('the readiness reading', () => {
	it('is the average TRL of the touched features, and never typed', () => {
		const r = createEvolutionRequest({ leafIds: ['a', 'b', 'c'] });
		const reading = readReadiness(r, { a: 4, b: 6, c: 8 });
		expect(reading.average).toBe(6);
		expect(reading.available).toBe(true);
	});

	it('projects a maturity score onto the 1-9 scale the badge uses', () => {
		expect(trlFromMaturityScore(0)).toBe(1);
		expect(trlFromMaturityScore(50)).toBe(5);
		expect(trlFromMaturityScore(100)).toBe(9);
	});

	it('leaves a feature with no readable TRL out of the average, and says so', () => {
		const r = createEvolutionRequest({ leafIds: ['a', 'b'] });
		const reading = readReadiness(r, { a: 4 });
		expect(reading.average).toBe(4);
		expect(reading.leaves.find((l) => l.leafId === 'b')?.trl).toBeNull();
		expect(readReadiness(createEvolutionRequest({ leafIds: ['b'] }), {}).available).toBe(false);
	});

	// 08da21ff: an admin excludes a feature with a reason.
	it('lets an admin exclude a touched feature with a reason, and the average moves', () => {
		const r = createEvolutionRequest({ leafIds: ['a', 'b'] });
		expect(
			canExcludeFromReadiness(admin, { touched: true, alreadyExcluded: false, reason: 'Out of scope for v2.0' }).ok
		).toBe(true);
		const excluded = excludeFromReadiness(r, {
			id: 'x1',
			leafId: 'b',
			reason: 'Out of scope for v2.0',
			by: 'ana',
			at: '2026-09-03T10:00:00Z'
		});
		const reading = readReadiness(excluded, { a: 4, b: 8 });
		expect(reading.average).toBe(4);
		expect(reading.excludedCount).toBe(1);
		// The leaf stays listed with its reason: traced, never dropped.
		expect(reading.leaves.find((l) => l.leafId === 'b')?.exclusion?.reason).toBe('Out of scope for v2.0');
		expect(readReadiness(restoreToReadiness(excluded, 'b'), { a: 4, b: 8 }).average).toBe(6);
	});

	// f828e7a4: a designer cannot exclude a feature.
	it('refuses an exclusion from a designer, from the model, without a reason, or twice', () => {
		const ok = { touched: true, alreadyExcluded: false, reason: 'because' };
		expect(canExcludeFromReadiness(designer, ok).ok).toBe(false);
		expect(canExcludeFromReadiness(aiClient, ok).ok).toBe(false);
		expect(canExcludeFromReadiness(admin, { ...ok, reason: '  ' }).ok).toBe(false);
		expect(canExcludeFromReadiness(admin, { ...ok, alreadyExcluded: true }).ok).toBe(false);
		expect(canExcludeFromReadiness(admin, { ...ok, touched: false }).ok).toBe(false);
		expect(canRestoreToReadiness(admin, true).ok).toBe(true);
		expect(canRestoreToReadiness(designer, true).ok).toBe(false);
		expect(canRestoreToReadiness(admin, false).ok).toBe(false);
	});
});
