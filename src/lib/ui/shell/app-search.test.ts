import { describe, expect, it } from 'vitest';
import { pageEntries, searchResults, type SearchEntry } from './app-search';

describe('app search', () => {
	it('lists Home alone without a project, and the project tabs with one', () => {
		expect(pageEntries(null).map((e) => e.t)).toEqual(['Home']);
		expect(pageEntries('fac').map((e) => e.href).slice(0, 4)).toEqual(['/', '/projects/fac/evolution', '/projects/fac/retrospec', '/projects/fac/spec']);
		expect(pageEntries('fac').find((e) => e.t === 'Data map')).toEqual({ t: 'Data map', k: 'Knowledge', href: '/projects/fac/spec/tech/data-map' });
	});

	it('matches the title or the kind, closest titles first, eight at most', () => {
		const index: SearchEntry[] = [
			{ t: 'Credit notes', k: 'Invoicing', href: 'a' },
			{ t: 'Invoice', k: 'Glossary', href: 'b' },
			{ t: 'Invoicing', k: 'Feature', href: 'c' },
			{ t: 'Payments', k: 'Invoicing', href: 'd' }
		];
		expect(searchResults(index, 'invoic').map((e) => e.href)).toEqual(['b', 'c', 'a', 'd']);
		expect(searchResults(index, '  ')).toEqual([]);
		const many = Array.from({ length: 12 }, (_, i) => ({ t: `Rule ${i}`, k: 'Rule', href: String(i) }));
		expect(searchResults(many, 'rule')).toHaveLength(8);
	});
});
