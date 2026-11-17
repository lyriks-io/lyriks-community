import { describe, expect, it } from 'vitest';
import {
	createEvolutionRequest,
	readCoherence,
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
