import { describe, it, expect } from 'vitest';
import {
	emptyBuilder,
	ensureScreenRoot,
	createElementNode,
	addNode,
	simulate
} from '$domain/experience';

/**
 * An effect value whose `{token}` resolves to nothing writes an empty string.
 * That is the documented rendering rule for labels, but as a state WRITE it is
 * indistinguishable from working interpolation over an empty value — which is
 * how `setState ['game.finalScore','{game.score}']` against an unseeded path
 * was read as "state interpolation doesn't work in values".
 *
 * Interpolation itself is fine (see effect-value-interpolation.test.ts); the
 * defect was the silence. These pin the warning.
 */
function buildScoreScreen(seed: Record<string, unknown> = {}) {
	const b = emptyBuilder();
	const screenId = 'scr-game';
	const root = ensureScreenRoot(b, screenId);
	b.entryScreenId = screenId;

	const finish = createElementNode(screenId, root, 'button');
	finish.label = 'Finish';
	finish.wiring.transitions.push({
		id: 't1',
		trigger: 'click',
		effect: { kind: 'setState', target: 'game.finalScore', value: '{game.score}' }
	});
	addNode(b, finish);

	b.stateSeeds = Object.entries(seed).map(([path, value]) => ({ path, value: String(value) }));
	return b;
}

const click = (label: string) => ({ actions: [{ label, trigger: 'click' as const }] });
const emptyValueWarnings = (warnings: readonly { message: string }[]) =>
	warnings.filter((w) => w.message.includes('resolves to nothing'));

describe('an effect value that resolves to nothing', () => {
	it('warns, naming the token and the target path', () => {
		const run = simulate(buildScoreScreen(), click('Finish'));
		const warning = run.warnings.find((w) => w.message.includes('{game.score}'));
		expect(warning).toBeDefined();
		expect(warning!.message).toContain('game.finalScore');
		expect(warning!.message).toContain('resolves to nothing');
	});

	it('still writes the empty value, so behavior is unchanged', () => {
		const run = simulate(buildScoreScreen(), click('Finish'));
		expect(run.state['game.finalScore']).toBe('');
	});

	it('stays quiet when the path is seeded', () => {
		const run = simulate(buildScoreScreen({ 'game.score': 240 }), click('Finish'));
		expect(emptyValueWarnings(run.warnings)).toEqual([]);
		expect(run.state['game.finalScore']).toBe(240);
	});

	it('stays quiet for a plain literal with no tokens', () => {
		const b = emptyBuilder();
		const screenId = 'scr-x';
		const root = ensureScreenRoot(b, screenId);
		b.entryScreenId = screenId;
		const go = createElementNode(screenId, root, 'button');
		go.label = 'Go';
		go.wiring.transitions.push({
			id: 't1',
			trigger: 'click',
			effect: { kind: 'setState', target: 'game.status', value: 'playing' }
		});
		addNode(b, go);
		const run = simulate(b, click('Go'));
		expect(emptyValueWarnings(run.warnings)).toEqual([]);
		expect(run.state['game.status']).toBe('playing');
	});
});
