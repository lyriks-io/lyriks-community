import { describe, expect, it } from 'vitest';
import type { DiscussionThread } from '$domain/discussions';
import { userLine, type MatrixGroup, type MatrixRow } from './users';
import {
	OTHER_CORE_ID,
	actionOfUserAnchor,
	coreEntries,
	entryMeta,
	featureEntries,
	levelOfAction,
	openTopicsOfUser,
	reachAction,
	reachLevel,
	reachTree,
	silentCores,
	userActionAnchor,
	whoMayDecide
} from './users-reach';
import type { FeatureActionView } from './features';
import { actionCapabilityId, actionOfActionCapability } from '$domain/users';

const row = (capabilityId: string, featureId: string, roleIds: string[]): MatrixRow => ({ capabilityId, featureId, action: capabilityId, roleIds });
const groups: MatrixGroup[] = [
	{ heading: 'Links · Shorten a link', featureId: 'shorten', rows: [row('cap-shorten', 'shorten', ['guest', 'user'])] },
	{ heading: 'Links · Manage my links', featureId: 'manage', rows: [row('cap-see', 'manage', ['user']), row('cap-delete', 'manage', [])] },
	{ heading: 'Admin · Ban a user', featureId: 'ban', rows: [row('cap-ban', 'ban', ['admin'])] },
	{ heading: 'Lost core · Export my data', featureId: 'export', rows: [row('cap-export', 'export', ['user'])] }
];
const outline = [
	{ id: 'links', name: 'Links', features: [{ id: 'shorten', name: 'Shorten a link' }, { id: 'manage', name: 'Manage my links' }, { id: 'stats', name: 'See the stats' }] },
	{ id: 'admin', name: 'Admin', features: [{ id: 'ban', name: 'Ban a user' }] },
	{ id: 'empty', name: 'Settings', features: [{ id: 'theme', name: 'Pick a theme' }] }
];
const tree = reachTree(outline, groups);
const holdsFor = (userId: string) => (r: MatrixRow) => r.roleIds.includes(userId);

describe("a user's page walks what the user can reach: core features, then features, then actions [criterion:1ca9b3b4]", () => {
	it('lists, per core feature, its features that declare an action and names the others apart', () => {
		expect(tree.map((c) => [c.id, c.features.map((f) => f.id), c.silent])).toEqual([
			['links', ['shorten', 'manage'], ['See the stats']],
			['admin', ['ban'], []],
			['empty', [], ['Pick a theme']],
			// A feature whose core feature the outline does not hold is not lost.
			[OTHER_CORE_ID, ['export'], []]
		]);
		expect(tree.at(-1)?.features[0].name).toBe('Export my data');
		expect(silentCores(tree)).toEqual(['Settings']);
	});

	it('opens a core feature when the user can perform any action of it, counted in features', () => {
		const user = coreEntries(tree, holdsFor('user'));
		expect(user.map((e) => [e.id, e.open, e.reached, e.total])).toEqual([
			['links', true, 2, 2],
			['admin', false, 0, 1],
			[OTHER_CORE_ID, true, 1, 1]
		]);
		expect(entryMeta(user[0], 'feature')).toBe('2 of 2 features');
		expect(entryMeta(user[1], 'feature')).toBe('1 feature');
	});

	it('opens a feature when the user can perform any of its actions, counted in actions', () => {
		const guest = featureEntries(tree[0], holdsFor('guest'));
		expect(guest.map((e) => [e.id, e.open, e.reached, e.total])).toEqual([
			['shorten', true, 1, 1],
			['manage', false, 0, 2]
		]);
		expect(entryMeta(guest[0], 'action')).toBe('1 of 1 action');
		expect(entryMeta(guest[1], 'action')).toBe('2 actions');
	});

	it('reads a cell ticked but not read back yet as the page passes it', () => {
		const ticked = (r: MatrixRow) => r.capabilityId === 'cap-ban' || r.roleIds.includes('guest');
		expect(coreEntries(tree, ticked).find((e) => e.id === 'admin')?.open).toBe(true);
	});

	it("reads the level from the page's address, a feature alone finding its core feature, an unknown id one level up", () => {
		expect(reachLevel(tree, null, null)).toEqual({ core: null, feature: null });
		expect(reachLevel(tree, 'links', null).core?.id).toBe('links');
		const both = reachLevel(tree, 'links', 'manage');
		expect([both.core?.id, both.feature?.id]).toEqual(['links', 'manage']);
		const alone = reachLevel(tree, null, 'ban');
		expect([alone.core?.id, alone.feature?.id]).toEqual(['admin', 'ban']);
		expect(reachLevel(tree, 'nowhere', null)).toEqual({ core: null, feature: null });
		const stale = reachLevel(tree, 'links', 'gone');
		expect([stale.core?.id, stale.feature]).toEqual(['links', null]);
	});
});

describe("an action is commented for one user on that user's page [criterion:ddd20a3e]", () => {
	const thread = (anchor: string, state: 'open' | 'resolved'): DiscussionThread => ({ id: anchor, anchor, state }) as unknown as DiscussionThread;

	it('holds the discussion apart from the action and from the user, and finds its action back', () => {
		const anchor = userActionAnchor('user', 'action:manage:delete');
		expect(anchor).toBe('permissions:user:action:manage:delete');
		expect(actionOfUserAnchor(anchor, 'user')).toBe('action:manage:delete');
		expect(actionOfUserAnchor(anchor, 'guest')).toBeNull();
		expect(actionOfUserAnchor('permissions', 'user')).toBeNull();
		expect(actionOfUserAnchor('role:user', 'user')).toBeNull();
	});

	it("opens the level of the action a link to its discussion names", () => {
		expect(levelOfAction(tree, 'cap-delete')).toEqual({ coreId: 'links', featureId: 'manage' });
		expect(levelOfAction(tree, 'cap-gone')).toBeNull();
	});

	it("counts on the user's head its open topics and those of its actions, nobody else's", () => {
		const threads = [
			thread('role:user', 'open'),
			thread('role:user', 'resolved'),
			thread(userActionAnchor('user', 'cap-see'), 'open'),
			thread(userActionAnchor('guest', 'cap-see'), 'open'),
			thread('permissions', 'open'),
			thread('action:manage:cap-see', 'open')
		];
		expect(openTopicsOfUser(threads, 'user')).toBe(2);
		expect(openTopicsOfUser(threads, 'guest')).toBe(1);
	});
});

describe('Users and permissions lists its users with a bar of what each can do [criterion:4146848b]', () => {
	it("reads a user's description as its first sentence, cut at a word past 72 characters", () => {
		expect(userLine('The registered person on the phone the account belongs to')).toBe('The registered person on the phone the account belongs to');
		expect(userLine('Someone who opens a short link. Has no account.')).toBe('Someone who opens a short link');
		expect(userLine('Someone with a verified account (role USER): shortens links')).toBe('Someone with a verified account (role USER)');
		expect(userLine('Version 1.2 reader')).toBe('Version 1.2 reader');
		const long = userLine('Someone installing Signal with no account on this device yet, or re-registering a deregistered number again and again');
		expect(long.length).toBeLessThanOrEqual(72);
		expect(long.endsWith('…')).toBe(true);
		expect(userLine('')).toBe('');
	});
});

describe("a user's page goes down to one action [criterion:6dd2906e]", () => {
	const hit = actionCapabilityId('crash', 'hit');
	const crash = { id: 'crash', name: 'Crash and game over', rows: [{ capabilityId: hit, featureId: 'crash', action: 'Hit an obstacle', roleIds: ['player'] }] };

	it('opens the action the address names inside the feature opened, and none it does not hold', () => {
		expect(reachAction(crash, 'hit')?.action).toBe('Hit an obstacle');
		expect(reachAction(crash, 'jump')).toBeNull();
		expect(reachAction(null, 'hit')).toBeNull();
		expect(reachAction(crash, null)).toBeNull();
	});

	it('reads the action an action row stands for, and nothing for another capability', () => {
		expect(actionOfActionCapability(hit)).toBe('hit');
		expect(actionOfActionCapability('cap-shorten')).toBeNull();
		expect(actionOfActionCapability('action:crash:')).toBeNull();
	});

	it('keeps the rules of the permissions category as what decides who may, and counts the others', () => {
		const rule = (id: string, category?: string) => ({ id, text: `The system shall ${id}`, kind: 'rule' as const, blocks: true, ...(category ? { category } : {}) });
		const action: FeatureActionView = {
			id: 'hit',
			name: 'Hit an obstacle',
			description: '',
			who: [],
			rulesCount: '3 rules',
			refusalLead: null,
			rules: [rule('only-players', 'permissions'), rule('while-running', 'validation'), rule('touching')]
		};
		const { decides, others } = whoMayDecide(action);
		expect(decides.rules.map((r) => r.id)).toEqual(['only-players']);
		expect(others).toBe(2);
	});
});
