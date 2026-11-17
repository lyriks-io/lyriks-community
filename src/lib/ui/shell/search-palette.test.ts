import { describe, expect, it } from 'vitest';
import { marked, paletteGroups, parseRecent, remember, rowOf, snippet, RECENT_MAX, type PaletteRow } from './search-palette';

const row = (t: string, href: string): PaletteRow => ({ g: 'Page', t, p: '', href });
const actions: PaletteRow[] = [
	{ g: 'Action', t: 'New evolution', p: '', href: '/projects/kutt/evolution?new=1' },
	{ g: 'Action', t: 'New project', p: '', act: 'new-project' }
];

describe('the search palette lists Recent, the actions and what matches [criterion:e11bf80b]', () => {
	it('lists Recent and the actions while nothing is typed', () => {
		const recent = [row('Glossary', '/g')];
		expect(paletteGroups('', { index: [], actions, projects: [], recent }).map((g) => g.title)).toEqual(['Recent', 'Actions']);
		expect(paletteGroups(' ', { index: [], actions, projects: [], recent: [] }).map((g) => g.title)).toEqual(['Actions']);
	});

	it('groups what matches: in this project, the actions, the other projects', () => {
		const index = [
			{ t: 'Short links', k: 'Feature', href: '/c' },
			{ t: 'New user', k: 'Users and permissions', href: '/u' }
		];
		const projects = [{ g: 'Project', t: 'Newsroom', p: 'Switch project', href: '/projects/n' }];
		const groups = paletteGroups('new', { index, actions, projects, recent: [] });
		expect(groups.map((g) => [g.title, g.rows.map((r) => r.t)])).toEqual([
			['In this project', ['New user']],
			['Actions', ['New evolution', 'New project']],
			['Other projects', ['Newsroom']]
		]);
		expect(paletteGroups('zzz', { index, actions, projects, recent: [] })).toEqual([]);
	});

	it('reads each entry with its kind and where it sits', () => {
		expect(rowOf({ t: 'Short links', k: 'Feature', href: '/a' })).toEqual({ g: 'Area', t: 'Short links', p: 'Features', href: '/a' });
		expect(rowOf({ t: 'Shorten a link', k: 'Short links', href: '/b' })).toMatchObject({ g: 'Feature', p: 'Short links' });
		expect(rowOf({ t: 'Visitor', k: 'Users and permissions', href: '/c' })).toMatchObject({ g: 'User', p: 'Users' });
		expect(rowOf({ t: 'Overview', k: 'Knowledge', href: '/d' })).toMatchObject({ g: 'Page', p: 'Knowledge' });
	});

	it('marks the letters typed', () => {
		expect(marked('Short links', 'LINK')).toEqual({ before: 'Short ', match: 'link', after: 's' });
		expect(marked('Short links', '')).toEqual({ before: 'Short links', match: '', after: '' });
	});

	it('keeps the last five entries opened, newest first, never twice', () => {
		let recent: PaletteRow[] = [];
		for (let i = 0; i < 7; i++) recent = remember(recent, row(`P${i}`, `/p${i}`));
		expect(recent.map((r) => r.t)).toEqual(['P6', 'P5', 'P4', 'P3', 'P2']);
		expect(remember(recent, row('P3 again', '/p3')).map((r) => r.t)).toEqual(['P3 again', 'P6', 'P5', 'P4', 'P2']);
		expect(remember([actions[1]], actions[1])).toHaveLength(1);
		expect(RECENT_MAX).toBe(5);
	});

	it('reads Recent back from the browser, and nothing from anything unreadable', () => {
		expect(parseRecent(JSON.stringify([row('Glossary', '/g'), { g: 'Action', t: 'New project', act: 'new-project' }, { t: 'broken' }]))).toEqual([
			row('Glossary', '/g'),
			{ g: 'Action', t: 'New project', p: '', act: 'new-project' }
		]);
		expect(parseRecent('not json')).toEqual([]);
		expect(parseRecent(null)).toEqual([]);
	});

	it('lists what was added or changed lately between Recent and the actions while nothing is typed', () => {
		const changed = [{ g: 'Feature', t: 'Shorten a link', p: 'Changed 2 h ago', href: '/projects/kutt/spec/features/f1' }];
		expect(paletteGroups('', { index: [], actions, projects: [], recent: [row('Glossary', '/g')], changed }).map((g) => g.title)).toEqual(['Recent', 'Recently changed', 'Actions']);
		expect(paletteGroups('short', { index: [], actions, projects: [], recent: [], changed }).map((g) => g.title)).toEqual([]);
	});

	it('finds a rule anywhere in its words, after the named things, its row its whole name', () => {
		const sentence = 'When the destination URL points to a domain on the block list, the system shall refuse to shorten the link and say the domain is blocked.';
		const index = [
			{ t: sentence, k: 'Rule', href: '/projects/kutt/spec/features/f1#kbt-rule_f1_r1', at: 'Shorten a link · Create a link', body: 'Spam domains hurt the reputation of the short domain.' },
			{ t: 'Blocked domains', k: 'Short links', href: '/projects/kutt/spec/features/f2' }
		];
		const [found] = paletteGroups('block', { index, actions: [], projects: [], recent: [] });
		expect(found.rows.map((r) => r.g)).toEqual(['Feature', 'Rule']);
		expect(found.rows[1]).toMatchObject({ g: 'Rule', p: 'Shorten a link · Create a link', href: '/projects/kutt/spec/features/f1#kbt-rule_f1_r1' });
		// Its name whole, never cut around the words typed, and nothing under it: the name holds the match.
		expect(found.rows[1].t).toBe(sentence);
		expect(found.rows[1].sub).toBeUndefined();
		// Found by its reason alone, the row still reads its name, the reason's words under it.
		const [byReason] = paletteGroups('reputation', { index, actions: [], projects: [], recent: [] });
		expect(byReason.rows).toHaveLength(1);
		expect(byReason.rows[0]).toMatchObject({ t: sentence, sub: 'Spam domains hurt the reputation of the short domain.' });
	});

	it('cuts a long text around the words typed, at word boundaries', () => {
		const text = 'When the destination URL points to a domain on the block list, the system shall refuse to shorten the link and say the domain is blocked.';
		const cut = snippet(text, 'refuse', 20);
		expect(cut.startsWith('…')).toBe(true);
		expect(cut.endsWith('…')).toBe(true);
		expect(cut).toContain('refuse');
		expect(cut.length).toBeLessThan(text.length);
		expect(snippet('Short sentence.', 'short')).toBe('Short sentence.');
		expect(snippet(text, 'nothing here')).toBe(text);
	});
});

