import { describe, it, expect } from 'vitest';
import { matchesQuery, normalizeSearch, searchTokens } from './search';
import { createFilter, NONE_VALUE } from './filter.svelte';

interface Row {
	name: string;
	note: string;
	status: string;
	tags: string[];
	owner: string | null;
	urgent: boolean;
}

const row = (over: Partial<Row> = {}): Row => ({
	name: 'Refund a payment',
	note: 'The operator refunds a captured payment',
	status: 'todo',
	tags: ['billing'],
	owner: 'ana',
	urgent: false,
	...over
});

describe('matchesQuery', () => {
	it('matches everything when the query is blank', () => {
		expect(matchesQuery('', 'anything')).toBe(true);
		expect(matchesQuery('   ', null)).toBe(true);
	});

	it('ignores case and diacritics both ways', () => {
		expect(matchesQuery('securite', 'Sécurité renforcée')).toBe(true);
		expect(matchesQuery('SÉCURITÉ', 'securite renforcee')).toBe(true);
	});

	it('ANDs the tokens in any order, across fields', () => {
		expect(matchesQuery('stripe card', 'Card declined', 'by Stripe')).toBe(true);
		expect(matchesQuery('card stripe', 'Card declined', 'by Stripe')).toBe(true);
		expect(matchesQuery('stripe refund', 'Card declined', 'by Stripe')).toBe(false);
	});

	it('does not let a token straddle two fields', () => {
		expect(matchesQuery('abcdef', 'abc', 'def')).toBe(false);
	});

	it('skips nullish fields', () => {
		expect(matchesQuery('card', null, undefined, 'Card declined')).toBe(true);
	});

	it('normalizes and tokenizes predictably', () => {
		expect(normalizeSearch('Éxãmple')).toBe('example');
		expect(searchTokens('  two   words ')).toEqual(['two', 'words']);
		expect(searchTokens('   ')).toEqual([]);
	});
});

describe('Filter', () => {
	const make = () =>
		createFilter<Row>({
			noun: 'rows',
			fields: (r) => [r.name, r.note],
			facets: [
				{ key: 'status', label: 'Status', value: (r) => r.status },
				{ key: 'tags', label: 'Tags', value: (r) => r.tags },
				{ key: 'owner', label: 'Owner', value: (r) => r.owner, noneLabel: 'Unassigned' },
				{ key: 'urgent', label: 'Urgent only', kind: 'toggle', value: (r) => r.urgent }
			]
		});

	it('is inert until something is set', () => {
		const f = make();
		const rows = [row(), row({ name: 'Void an invoice' })];
		expect(f.active).toBe(false);
		expect(f.apply(rows)).toEqual(rows);
	});

	it('ORs the values within one facet', () => {
		const f = make();
		const rows = [row({ status: 'todo' }), row({ status: 'doing' }), row({ status: 'done' })];
		f.toggle('status', 'todo');
		expect(f.apply(rows)).toHaveLength(1);
		f.toggle('status', 'done');
		expect(f.apply(rows)).toHaveLength(2);
	});

	it('ANDs across facets, and with the text box', () => {
		const f = make();
		const rows = [
			row({ name: 'Refund', note: '', status: 'todo', owner: 'ana' }),
			row({ name: 'Refund', note: '', status: 'todo', owner: 'bo' }),
			row({ name: 'Void', note: '', status: 'todo', owner: 'ana' })
		];
		f.toggle('status', 'todo');
		f.toggle('owner', 'ana');
		expect(f.apply(rows)).toHaveLength(2);
		f.query = 'refund';
		expect(f.apply(rows)).toHaveLength(1);
	});

	it('matches a multi-valued attribute on any of its values', () => {
		const f = make();
		const rows = [row({ tags: ['billing', 'ops'] }), row({ tags: ['ops'] }), row({ tags: [] })];
		f.toggle('tags', 'billing');
		expect(f.apply(rows)).toHaveLength(1);
		f.clearFacet('tags');
		f.toggle('tags', 'ops');
		expect(f.apply(rows)).toHaveLength(2);
	});

	it('treats an empty value as "not set" and offers it only when present', () => {
		const f = make();
		const owner = f.facets.find((x) => x.key === 'owner')!;
		const withGap = [row({ owner: 'ana' }), row({ owner: null })];
		expect(f.optionsFor(owner, withGap).map((o) => o.value)).toContain(NONE_VALUE);
		expect(f.optionsFor(owner, [row({ owner: 'ana' })]).map((o) => o.value)).not.toContain(
			NONE_VALUE
		);
		f.toggle('owner', NONE_VALUE);
		expect(f.apply(withGap)).toHaveLength(1);
	});

	it('reads a toggle facet as a flag', () => {
		const f = make();
		const rows = [row({ urgent: true }), row({ urgent: false })];
		f.toggle('urgent', 'on');
		expect(f.apply(rows)).toHaveLength(1);
	});

	it('derives options from the data in first-seen order', () => {
		const f = make();
		const status = f.facets.find((x) => x.key === 'status')!;
		const rows = [row({ status: 'doing' }), row({ status: 'todo' }), row({ status: 'doing' })];
		expect(f.optionsFor(status, rows).map((o) => o.value)).toEqual(['doing', 'todo']);
	});

	it('counts an option against the OTHER facets, not its own', () => {
		const f = make();
		const status = f.facets.find((x) => x.key === 'status')!;
		const rows = [
			row({ status: 'todo', owner: 'ana' }),
			row({ status: 'done', owner: 'ana' }),
			row({ status: 'done', owner: 'bo' })
		];
		f.toggle('status', 'todo');
		// Its own selection must not zero the sibling option, or the pills lie.
		expect(f.countFor(status, { value: 'done', label: 'done' }, rows)).toBe(2);
		f.toggle('owner', 'ana');
		expect(f.countFor(status, { value: 'done', label: 'done' }, rows)).toBe(1);
	});

	it('clears text and facets together', () => {
		const f = make();
		f.query = 'refund';
		f.toggle('status', 'todo');
		expect(f.activeFacetCount).toBe(1);
		f.clear();
		expect(f.active).toBe(false);
		expect(f.query).toBe('');
		expect(f.activeFacetCount).toBe(0);
	});
});
