import { sortByName } from '$domain/shared';
import { readableName } from '$domain/features';
import type { DerivedCapability, ProjectUsersDraft, RoleTone } from '$domain/users';
import { text } from './labels';

/**
 * Users and permissions as the Specification 360° reads them: the personas
 * split into end users and admin users, and who can do what, one row per
 * action a feature declares, under its core feature and feature. A role can do
 * an action when it holds any right on it; the rights themselves are edited in
 * Users & Permissions, never here.
 */

export type UserClass = 'end' | 'admin';

/** The names of the roles of the admin class: a drawing marks a person so named as an admin (ac-evo-func-uml). */
export function adminNamesOf(roles: readonly { readonly name: string; readonly tone: RoleTone | string }[]): string[] {
	return roles.filter((r) => text(r.name) && userClassOf(r.tone) === 'admin').map((r) => text(r.name));
}

/** A name in its plain singular lower case, so "Administrators" and "administrator" are one name. */
const plain = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ').replace(/(?:es|s)$/, '');

/** Whether a person a drawing names is one of those admin roles: case, spaces and a plural aside. */
export function namesAnAdmin(name: string, adminNames: readonly string[]): boolean {
	const p = plain(name);
	return p !== '' && adminNames.some((a) => plain(a) === p);
}

/** Back-office tones (admin, ops, partner) are admin users; customers and visitors are end users. */
export function userClassOf(tone: RoleTone | string): UserClass {
	return tone === 'admin' || tone === 'ops' || tone === 'partner' ? 'admin' : 'end';
}

export interface SpecUser {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly tone: string;
	readonly userClass: UserClass;
}

export interface MatrixRow {
	readonly capabilityId: string;
	readonly featureId: string;
	readonly action: string;
	/** The roles (ids) that hold any right on the action. */
	readonly roleIds: readonly string[];
}

export interface MatrixGroup {
	/** "Core feature · Feature" */
	readonly heading: string;
	readonly featureId: string;
	readonly rows: readonly MatrixRow[];
}

export interface UsersView {
	readonly users: readonly SpecUser[];
	readonly groups: readonly MatrixGroup[];
}

/** The end users first, then the admins, each class from A to Z (criteria c6cca8af, 4b3d2b4d). Pure. */
export function endUsersFirst<T extends { readonly userClass: UserClass; readonly name?: string }>(users: readonly T[]): T[] {
	const byName = (u: T) => u.name ?? '';
	return [...sortByName(users.filter((u) => u.userClass === 'end'), byName), ...sortByName(users.filter((u) => u.userClass === 'admin'), byName)];
}

export function specUsers(draft: ProjectUsersDraft): SpecUser[] {
	return endUsersFirst(
		draft.roles
			.filter((r) => text(r.name))
			.map((r) => ({
				id: r.id,
				name: text(r.name),
				description: text(r.description),
				tone: r.tone,
				userClass: userClassOf(r.tone)
			}))
	);
}

/**
 * Who holds any right on each capability, roles in the roster's order. Built
 * once: a retro-specified project holds hundreds of grants over hundreds of rows.
 */
export function holdersIndex(draft: ProjectUsersDraft): (capabilityId: string) => string[] {
	const byCapability = new Map<string, Set<string>>();
	for (const g of draft.permissions) {
		const set = byCapability.get(g.capabilityId) ?? new Set<string>();
		set.add(g.roleId);
		byCapability.set(g.capabilityId, set);
	}
	return (capabilityId) => {
		const set = byCapability.get(capabilityId);
		return set ? draft.roles.filter((r) => set.has(r.id)).map((r) => r.id) : [];
	};
}

/**
 * The matrix rows: every action row of the feature capabilities, grouped by
 * the feature that declares it, the groups from A to Z by their heading
 * (criterion 4b3d2b4d) and the rows of a group in the order its feature
 * declares its actions. `draft` already carries the grants made before the
 * matrix was per action.
 */
export function permissionMatrix(draft: ProjectUsersDraft, derivedFeatures: readonly DerivedCapability[]): MatrixGroup[] {
	const holders = holdersIndex(draft);
	const groups = new Map<string, { heading: string; featureId: string; rows: MatrixRow[] }>();
	for (const c of derivedFeatures) {
		if (!c.featureId) continue;
		const heading = [text(c.sourceRefLabel), (c.featureLabel ?? '').trim()].filter(Boolean).join(' · ');
		const group = groups.get(c.featureId) ?? { heading, featureId: c.featureId, rows: [] };
		group.rows.push({ capabilityId: c.id, featureId: c.featureId, action: readableName(text(c.label) || c.id), roleIds: holders(c.id) });
		groups.set(c.featureId, group);
	}
	return sortByName([...groups.values()], (g) => g.heading);
}

/** The longest line a user's row gives its description (criterion 4146848b; provisional). */
export const USER_LINE_MAX = 72;

/**
 * A user's description as its row reads it: the first sentence (up to its
 * first full stop or colon), cut at a word with an ellipsis past
 * USER_LINE_MAX characters, so it holds on one line beside its bar. Pure.
 */
export function userLine(description: string): string {
	const text = description.trim().replace(/\s+/g, ' ');
	const first = text.split(/[.:](?:\s|$)/, 1)[0].trim();
	if (first.length <= USER_LINE_MAX) return first;
	return `${first.slice(0, USER_LINE_MAX - 2).replace(/\s+\S*$/, '')}…`;
}

/** From this many users on, the list of users and the matrix's columns get a search (criteria 4146848b, 5787390d: more than 8; provisional). */
export const USER_SEARCH_FROM = 9;

/**
 * How many of the actions of the matrix one user can do (criterion 4146848b),
 * as `holds` reads each (the page passes the cells ticked but not read back
 * yet). Pure.
 */
export function accessCount(groups: readonly MatrixGroup[], holds: (row: MatrixRow) => boolean): { granted: number; total: number } {
	let granted = 0;
	let total = 0;
	for (const g of groups)
		for (const r of g.rows) {
			total += 1;
			if (holds(r)) granted += 1;
		}
	return { granted, total };
}

/** One line of the full matrix: the heading of a feature, or one of its actions. */
export type MatrixLine =
	| { readonly key: string; readonly kind: 'group'; readonly heading: string }
	| { readonly key: string; readonly kind: 'row'; readonly row: MatrixRow };

/** The full matrix as one list of lines, so only the lines in view are drawn (criterion 5787390d). Pure. */
export function matrixLines(groups: readonly MatrixGroup[]): MatrixLine[] {
	return groups.flatMap((g) => [
		{ key: `group:${g.featureId}`, kind: 'group' as const, heading: g.heading },
		...g.rows.map((row) => ({ key: `row:${row.capabilityId}`, kind: 'row' as const, row }))
	]);
}

export function usersView(draft: ProjectUsersDraft, derivedFeatures: readonly DerivedCapability[]): UsersView {
	return { users: specUsers(draft), groups: permissionMatrix(draft, derivedFeatures) };
}
