import { describe, expect, it } from 'vitest';
import { MEMBERS_LISTED_AFTER_AT, insertMemberName, memberMentionsIn, memberQueryAt, membersNamedIn, membersToName } from './member-mentions';

const TEAM = [
	{ id: 'ada@x.io', name: 'Ada Lovelace' },
	{ id: 'adb@x.io', name: 'Ada Byron' },
	{ id: 'eloise@x.io', name: 'Éloïse Durand' },
	{ id: 'bob@x.io', name: 'Bob' }
];

describe('the members a comment names with @ [criterion:b5833eb5]', () => {
	it('names a member by their full name or their first name, the full name winning over a first name', () => {
		expect(membersNamedIn('Can @Ada Lovelace check?', TEAM)).toEqual(['ada@x.io']);
		expect(membersNamedIn('@Ada, a look?', TEAM).sort()).toEqual(['ada@x.io', 'adb@x.io']);
		expect(membersNamedIn('@ada byron and @Bob', TEAM)).toEqual(['adb@x.io', 'bob@x.io']);
	});

	it('names nobody through an email, a longer word or a name no member bears', () => {
		expect(membersNamedIn('write to bob@x.io', TEAM)).toEqual([]);
		expect(membersNamedIn('@Bobby agreed', TEAM)).toEqual([]);
		expect(membersNamedIn('@Zed agreed', TEAM)).toEqual([]);
	});

	it('never names the writer of the message', () => {
		expect(membersNamedIn('@Bob, as I said', TEAM, 'bob@x.io')).toEqual([]);
	});

	it('says where each name stands, so the page marks it', () => {
		const text = 'Ask @Ada Lovelace and @Bob.';
		expect(memberMentionsIn(text, TEAM).map((m) => text.slice(m.start, m.end))).toEqual(['@Ada Lovelace', '@Bob']);
	});
});

describe('the list of members to name after @ [action:60847e98]', () => {
	it('reads the name being typed after an @ that opens one', () => {
		expect(memberQueryAt('Ask @lov', 8)).toEqual({ start: 4, query: 'lov' });
		expect(memberQueryAt('Ask @', 5)).toEqual({ start: 4, query: '' });
		expect(memberQueryAt('mail bob@x', 10)).toBeNull();
		expect(memberQueryAt('@Ada Lovelace ', 14)).toBeNull();
	});

	it('offers the members with a word of their name or their email starting with it, the writer aside, by name [rule:25aeb107]', () => {
		expect(membersToName(TEAM, 'lov', 'bob@x.io').map((m) => m.name)).toEqual(['Ada Lovelace']);
		expect(membersToName(TEAM, 'ada', 'bob@x.io').map((m) => m.name)).toEqual(['Ada Byron', 'Ada Lovelace']);
		expect(membersToName(TEAM, 'elo', 'bob@x.io').map((m) => m.name)).toEqual(['Éloïse Durand']);
		expect(membersToName(TEAM, 'adb', 'bob@x.io').map((m) => m.name)).toEqual(['Ada Byron']);
		expect(membersToName(TEAM, '', 'bob@x.io').map((m) => m.name)).not.toContain('Bob');
	});

	it('shows six members at most, and nobody where the writer works alone [rule:960f7161]', () => {
		const many = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}@x.io`, name: `Pat ${i}` }));
		expect(membersToName(many, 'pat', 'me@x.io')).toHaveLength(MEMBERS_LISTED_AFTER_AT);
		expect(membersToName([{ id: 'me@x.io', name: 'Me' }], '', 'me@x.io')).toEqual([]);
	});

	it('writes @ and the name picked where it was being typed, a space after it', () => {
		expect(insertMemberName('Ask @lov now', 4, 8, TEAM[0])).toEqual({ text: 'Ask @Ada Lovelace now', caret: 17 });
		expect(insertMemberName('Ask @lov', 4, 8, TEAM[0])).toEqual({ text: 'Ask @Ada Lovelace ', caret: 18 });
	});
});
