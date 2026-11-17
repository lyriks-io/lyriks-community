import { describe, expect, it } from 'vitest';
import { earsOfInvariant, earsOfRule, refusalCase } from '$lib/unspa-schema/requirement-sentences';
import { ruleVariableHints } from './rule-variable-hints';

const context = { name: 'Import a project' };
const project = (raw: Record<string, unknown>, language: 'en' | 'fr' = 'en') => {
	const render = (rule: Record<string, unknown>) => earsOfRule(rule, context, {}, language);
	const text = render(raw);
	return { text, hints: ruleVariableHints(raw, render, text, language) };
};
const labels = ({ text, hints }: ReturnType<typeof project>) => hints.map((hint) => ({ label: text.slice(hint.start, hint.end), identifiers: hint.identifiers }));

describe('exact EARS variable identifiers [criterion:7dc9e813]', () => {
	it('locates actual parameters, condition state, effect target and nested computed state without mutating the model', () => {
		const raw = { condition: { kind: 'all', conditions: [{ left: { kind: 'param', name: 'fromFile' }, operator: 'is_true' }, { left: 'archive.fileHoldsKey', operator: 'is_true' }] }, effect: { type: 'set_state', path: 'import.items', value: { kind: 'add', left: { kind: 'state', path: 'archive.items' }, right: { kind: 'param', name: 'extraItems' } } } };
		const before = JSON.stringify(raw);
		expect(labels(project(raw))).toEqual([
			{ label: 'archive file holds key', identifiers: ['archive.fileHoldsKey'] },
			{ label: 'from file', identifiers: ['fromFile'] },
			{ label: 'import items', identifiers: ['import.items'] },
			{ label: 'archive items', identifiers: ['archive.items'] },
			{ label: 'extra items', identifiers: ['extraItems'] }
		]);
		expect(JSON.stringify(raw)).toBe(before);
	});

	it('keeps quoted literal and message occurrences plain even when they repeat the displayed variable label', () => {
		const projected = project({ condition: { left: 'file.key', operator: 'equals', right: { kind: 'literal', value: 'file key' } }, effect: { type: 'block_action', reason: 'file key' } });
		expect(labels(projected)).toEqual([{ label: 'file key', identifiers: ['file.key'] }]);
		expect(projected.text.match(/file key/g)).toHaveLength(3);
	});

	it('does not mistake literal objects for nested reference expressions', () => {
		const projected = project({ effect: { type: 'set_state', path: 'result.record', value: { kind: 'literal', value: { kind: 'state', path: 'not.aReference' } } } });
		expect(labels(projected)).toEqual([{ label: 'result record', identifiers: ['result.record'] }]);
	});

	it('annotates no repeated words in an action name or an effect value the sentence does not display', () => {
		const raw = { condition: { left: 'file.key', operator: 'is_true' }, effect: { type: 'append_to_list', path: 'item.list', value: { kind: 'state', path: 'itemList' } } };
		const render = (rule: Record<string, unknown>) => earsOfRule(rule, { name: 'Read the file key' });
		const text = render(raw);
		expect(text.match(/file key/g)).toHaveLength(2);
		expect(ruleVariableHints(raw, render, text, 'en').map((hint) => hint.identifiers)).toEqual([['file.key'], ['item.list']]);
	});

	it('lists all actual candidates when different identifiers have the same human label', () => {
		const projected = project({ condition: { kind: 'all', conditions: [{ left: 'file.key', operator: 'is_true' }, { left: 'fileKey', operator: 'is_true' }] }, effect: { type: 'allow_action' } });
		expect(labels(projected)).toEqual([{ label: 'file key', identifiers: ['file.key', 'fileKey'] }, { label: 'file key', identifiers: ['file.key', 'fileKey'] }]);
	});

	it('locates each repeated expression reference and switch condition through the canonical projector', () => {
		const projected = project({ effect: { type: 'set_state', path: 'total', value: { kind: 'switch', cases: [{ when: { left: 'cart.ready', operator: 'is_true' }, then: { kind: 'add', left: { kind: 'state', path: 'cart.amount' }, right: { kind: 'state', path: 'cart.amount' } } }], default: { kind: 'state', path: 'cart.fallback' } } } });
		expect(labels(projected).map((hint) => hint.identifiers[0])).toEqual(['total', 'cart.amount', 'cart.amount', 'cart.ready', 'cart.fallback']);
	});

	it('uses positions belonging to the short refusal case and invariants too', () => {
		const raw = { condition: { left: 'account.enabled', operator: 'is_false' }, effect: { type: 'block_action', reason: 'No access.' } };
		const short = refusalCase(raw);
		const hints = ruleVariableHints(raw, refusalCase, short, 'en');
		expect(short.slice(hints[0].start, hints[0].end)).toBe('account enabled');
		const invariant = { condition: { left: 'account.enabled', operator: 'is_true' } };
		const sentence = earsOfInvariant(invariant);
		expect(ruleVariableHints(invariant, earsOfInvariant, sentence, 'en')[0].identifiers).toEqual(['account.enabled']);
	});

	it('preserves French exact names and the special channel parameter reading', () => {
		const raw = { condition: { kind: 'all', conditions: [{ left: { kind: 'param', name: '$channel' }, operator: 'equals', right: 'web' }, { left: 'archive.key', operator: 'is_true' }] }, effect: { type: 'allow_action' } };
		expect(labels(project(raw)).map((hint) => hint.identifiers[0])).toEqual(['archive.key', '$channel']);
		expect(labels(project(raw, 'fr')).map((hint) => hint.identifiers[0])).toEqual(['archive.key', '$channel']);
	});

	it('emits nothing when the marked projector cannot reconstruct the original text exactly', () => {
		const raw = { condition: { left: 'file.key', operator: 'is_true' } };
		expect(ruleVariableHints(raw, () => 'A different sentence.', 'The original sentence.', 'en')).toEqual([]);
	});
});
