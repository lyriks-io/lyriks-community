import { describe, it, expect } from 'vitest';
import { resolveText, resolveRowText, interpolate } from './builder-runtime';

/**
 * P0-6 from the MCP authoring retrospectives: "state interpolation doesn't work
 * in values — setState ['game.finalScore','{game.score}'] writes ''", while
 * row-field `{id}` in the same position works and labels interpolate state fine.
 *
 * These pin what `{x}` actually resolves to in each position, because the report
 * concluded `{x}` "means three different things depending on position" and the
 * fix has to start from what is really true.
 */
describe('{x} in an effect value', () => {
	const collections = { track: [{ id: 't1', name: 'Kashmir' }] };

	it('resolves a dotted state path outside a row template', () => {
		const state = { 'game.score': 240 };
		expect(resolveText('{game.score}', state, {})).toBe('240');
	});

	it('resolves a dotted state path even when a collection exists', () => {
		const state = { 'game.score': 240 };
		expect(resolveText('{game.score}', state, collections)).toBe('240');
	});

	it('yields "" for a state path that does not exist — the reported symptom', () => {
		// This is the whole of the reported bug: interpolation works, but an
		// unknown/unset path resolves to the empty string rather than erroring, so
		// a typo'd or not-yet-seeded path is indistinguishable from "broken
		// interpolation".
		expect(resolveText('{game.finalScore}', {}, {})).toBe('');
		expect(resolveText('{game.sscore}', { 'game.score': 240 }, {})).toBe('');
	});

	it('resolves a row field inside a row template', () => {
		const row = { id: 't1', name: 'Kashmir' };
		expect(resolveRowText('{id}', row, {}, {})).toBe('t1');
	});

	it('reads global state from inside a row template too', () => {
		const row = { id: 't1' };
		expect(resolveRowText('{game.score}', row, { 'game.score': 7 }, {})).toBe('7');
	});

	it('prefers the row field over a same-named state path inside a row', () => {
		const row = { id: 'row-value' };
		expect(resolveRowText('{id}', row, { id: 'state-value' }, {})).toBe('row-value');
	});

	it('falls through to state when the token is not a row field', () => {
		expect(resolveRowText('{other}', { id: 't1' }, { other: 'from-state' }, {})).toBe('from-state');
	});

	it('resolves a collection field, which shadows a same-named state path', () => {
		expect(resolveText('{track.name}', { 'track.name': 'ignored' }, collections)).toBe('Kashmir');
	});

	it('escapes literal braces', () => {
		expect(interpolate('{{game.score}}', { 'game.score': 1 })).toBe('{game.score}');
	});
});
