import type { PermissionGrant, ProjectUsersDraft, Role, RoleBehaviorValue } from './draft';
import { actionCapabilityId } from './draft';

/**
 * The access matrix read against the guards of the behaviour (criterion
 * 26262450 of feat-access-matrix). A role that says how the behaviour reads it
 * (criterion 8763ca70) is played against the block rules of every action a
 * person fires: a rule refuses the role only when it refuses it whatever the
 * rest of the state, so the conditions are read in three values (true, false,
 * unknown) with the role's values as the only known state.
 *
 * Pure: it reads the behaviour snapshots as plain data, the way the matrix rows
 * are projected from them, and never asks the engine.
 */

/** A leaf feature as the matrix check reads it: its id, its name, its behaviour (loosely typed). */
export interface MatrixGuardLeaf {
	readonly id: string;
	readonly name: string;
	readonly feature: unknown;
}

/** An action whose matrix row and guards disagree on one or more roles. */
export interface ActionDisagreement {
	readonly featureId: string;
	readonly featureName: string;
	readonly actionId: string;
	readonly actionName: string;
	/** Roles the matrix grants the action while one of its rules refuses them, each with that rule. */
	readonly refusedButGranted: readonly { readonly roleId: string; readonly roleName: string; readonly rule: string }[];
	/** Roles the matrix keeps out of the action while it reads their state and no rule refuses them. */
	readonly letInButNotGranted: readonly { readonly roleId: string; readonly roleName: string }[];
	/**
	 * The matrix grants the action (and its feature) to no role at all: it says
	 * nothing about it rather than keeping anyone out. Every such disagreement
	 * comes from one choice, a matrix that grants actions sparingly.
	 */
	readonly grantedToNobody: boolean;
}

/** A feature whose actions read no role at all while the matrix keeps roles out of some of them. */
export interface FeatureReadsNoRole {
	readonly featureId: string;
	readonly featureName: string;
	readonly actions: readonly { readonly actionId: string; readonly actionName: string; readonly keptOut: readonly string[] }[];
}

export interface MatrixGuardReading {
	/** False when no role says how the behaviour reads it: nothing could be compared. */
	readonly compared: boolean;
	/** The matrix grants at least one action row: the comparison has something to read. */
	readonly grantsActions: boolean;
	readonly actions: readonly ActionDisagreement[];
	readonly features: readonly FeatureReadsNoRole[];
}

type Truth = 'T' | 'F' | 'U';
type Env = ReadonlyMap<string, RoleBehaviorValue['value']>;

const EXPRESSION_KINDS = new Set([
	'literal', 'state', 'param', 'const', 'add', 'sub', 'mul', 'div', 'mod', 'min', 'max', 'neg', 'not',
	'sum', 'count', 'sum_pluck', 'count_where', 'switch'
]);

const record = (value: unknown): Record<string, unknown> | null =>
	value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const UNKNOWN = Symbol('unknown');
type Operand = RoleBehaviorValue['value'] | readonly unknown[] | typeof UNKNOWN;

/** The value of a rule's right-hand side, or UNKNOWN when it depends on more than the role. */
function operand(right: unknown, env: Env, constants: ReadonlyMap<string, unknown>): Operand {
	const expression = record(right);
	if (expression && typeof expression.kind === 'string' && EXPRESSION_KINDS.has(expression.kind)) {
		if (expression.kind === 'literal') return primitive(expression.value);
		if (expression.kind === 'const') {
			const name = text(expression.name);
			return constants.has(name) ? primitive(constants.get(name)) : UNKNOWN;
		}
		if (expression.kind === 'state') {
			const path = text(expression.path);
			return env.has(path) ? (env.get(path) as RoleBehaviorValue['value']) : UNKNOWN;
		}
		return UNKNOWN;
	}
	return primitive(right);
}

function primitive(value: unknown): Operand {
	if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
	if (Array.isArray(value)) return value;
	return UNKNOWN;
}

function compare(operator: string, left: RoleBehaviorValue['value'], right: Operand | undefined): Truth {
	switch (operator) {
		case 'is_true':
			return left === true ? 'T' : 'F';
		case 'is_false':
			return left === false ? 'T' : 'F';
		case 'exists':
			return left !== null ? 'T' : 'F';
		case 'does_not_exist':
			return left === null ? 'T' : 'F';
	}
	if (right === undefined || right === UNKNOWN) return 'U';
	switch (operator) {
		case 'equals':
			return left === right ? 'T' : 'F';
		case 'not_equals':
			return left !== right ? 'T' : 'F';
		case 'contains':
			if (Array.isArray(right)) return 'U';
			return typeof left === 'string' && typeof right === 'string' ? (left.includes(right) ? 'T' : 'F') : 'U';
		case 'greater_than':
		case 'greater_or_equal':
		case 'lower_than':
		case 'lower_or_equal': {
			if (typeof left !== 'number' || typeof right !== 'number') return 'U';
			const holds =
				operator === 'greater_than' ? left > right
				: operator === 'greater_or_equal' ? left >= right
				: operator === 'lower_than' ? left < right
				: left <= right;
			return holds ? 'T' : 'F';
		}
		default:
			return 'U';
	}
}

/** A condition read in three values over the role's state alone. */
export function conditionUnderRole(condition: unknown, env: Env, constants: ReadonlyMap<string, unknown>): Truth {
	const c = record(condition);
	if (!c) return 'U';
	if (c.kind === 'all' || c.kind === 'any') {
		const parts = list(c.conditions).map((part) => conditionUnderRole(part, env, constants));
		if (c.kind === 'all') return parts.includes('F') ? 'F' : parts.every((p) => p === 'T') ? 'T' : 'U';
		return parts.includes('T') ? 'T' : parts.every((p) => p === 'F') ? 'F' : 'U';
	}
	if (c.kind === 'not') {
		const inner = conditionUnderRole(c.condition, env, constants);
		return inner === 'T' ? 'F' : inner === 'F' ? 'T' : 'U';
	}
	if (typeof c.left !== 'string' || !env.has(c.left)) return 'U';
	return compare(text(c.operator), env.get(c.left) as RoleBehaviorValue['value'], operand(c.right, env, constants));
}

/** Every state path a condition reads on its left or through a `state` operand. */
function pathsRead(condition: unknown, into: Set<string>): Set<string> {
	const c = record(condition);
	if (!c) return into;
	if (typeof c.left === 'string') into.add(c.left);
	const right = record(c.right);
	if (right?.kind === 'state' && typeof right.path === 'string') into.add(right.path);
	for (const part of list(c.conditions)) pathsRead(part, into);
	if (c.condition !== undefined) pathsRead(c.condition, into);
	return into;
}

interface GuardRule {
	readonly label: string;
	readonly condition: unknown;
}

interface PersonAction {
	readonly id: string;
	readonly name: string;
	readonly guards: readonly GuardRule[];
}

/** The committed actions a person fires, each with the block rules of its surface and its own. */
function personActions(feature: unknown): PersonAction[] {
	const out: PersonAction[] = [];
	for (const surface of list(record(feature)?.surfaces)) {
		const s = record(surface);
		if (!s) continue;
		const surfaceGuards = blockRules(s.rules);
		for (const candidate of list(s.actions)) {
			const action = record(candidate);
			if (!action || action.evolution !== undefined) continue;
			const actor = action.actor ?? (action.triggeredByEvent !== undefined ? 'event' : 'user');
			if (actor !== 'user') continue;
			out.push({ id: text(action.id), name: text(action.name), guards: [...surfaceGuards, ...blockRules(action.rules)] });
		}
	}
	return out;
}

function blockRules(rules: unknown): GuardRule[] {
	return list(rules).flatMap((candidate) => {
		const rule = record(candidate);
		if (!rule || record(rule.effect)?.type !== 'block_action' || rule.condition === undefined) return [];
		const label = text(record(rule.effect)?.reason) || text(rule.description) || text(rule.id);
		return [{ label, condition: rule.condition }];
	});
}

function constantsOf(feature: unknown): Map<string, unknown> {
	const constants = new Map<string, unknown>();
	for (const candidate of list(record(feature)?.constants)) {
		const constant = record(candidate);
		if (constant && typeof constant.name === 'string') constants.set(constant.name, constant.value);
	}
	return constants;
}

const granted = (grants: readonly PermissionGrant[], roleId: string, featureId: string, actionId: string): boolean =>
	grants.some(
		(grant) =>
			grant.roleId === roleId &&
			(grant.capabilityId === actionCapabilityId(featureId, actionId) || grant.capabilityId === featureId)
	);

const valuesOf = (role: Role): RoleBehaviorValue[] => [...(role.behaviorValues ?? [])];

/** The matrix against the guards of every person-fired action of the leaves. */
export function readMatrixAgainstGuards(
	users: Pick<ProjectUsersDraft, 'roles' | 'permissions'>,
	leaves: readonly MatrixGuardLeaf[]
): MatrixGuardReading {
	const grantsActions = users.permissions.some((grant) => grant.capabilityId.startsWith('action:'));
	const roles = users.roles.filter((role) => valuesOf(role).length > 0);
	if (roles.length === 0) return { compared: false, grantsActions, actions: [], features: [] };
	const rolePaths = new Set(roles.flatMap((role) => valuesOf(role).map((v) => v.path)));
	const actions: ActionDisagreement[] = [];
	const features: FeatureReadsNoRole[] = [];
	for (const leaf of leaves) {
		const constants = constantsOf(leaf.feature);
		const blind: FeatureReadsNoRole['actions'][number][] = [];
		for (const action of personActions(leaf.feature)) {
			const read = new Set<string>();
			for (const guard of action.guards) pathsRead(guard.condition, read);
			const readsAnyRole = [...read].some((path) => rolePaths.has(path));
			if (!readsAnyRole) {
				// Nothing in its rules looks at a role: the behaviour lets every role in.
				// Only when the matrix lets some of these roles in and keeps others out:
				// granted to none is the "no user right" check's to say.
				const keptOut = roles.filter((role) => !granted(users.permissions, role.id, leaf.id, action.id));
				if (keptOut.length > 0 && keptOut.length < roles.length) {
					blind.push({ actionId: action.id, actionName: action.name, keptOut: keptOut.map((r) => r.name) });
				}
				continue;
			}
			const refusedButGranted: ActionDisagreement['refusedButGranted'][number][] = [];
			const letInButNotGranted: ActionDisagreement['letInButNotGranted'][number][] = [];
			for (const role of roles) {
				const values = valuesOf(role);
				// A role whose state the action never reads is decided by another dimension.
				if (!values.some((v) => read.has(v.path))) continue;
				const env: Env = new Map(values.map((v) => [v.path, v.value]));
				const refusing = action.guards.find((guard) => conditionUnderRole(guard.condition, env, constants) === 'T');
				const isGranted = granted(users.permissions, role.id, leaf.id, action.id);
				if (refusing && isGranted) refusedButGranted.push({ roleId: role.id, roleName: role.name, rule: refusing.label });
				else if (!refusing && !isGranted) letInButNotGranted.push({ roleId: role.id, roleName: role.name });
			}
			if (refusedButGranted.length > 0 || letInButNotGranted.length > 0) {
				actions.push({
					featureId: leaf.id,
					featureName: leaf.name,
					actionId: action.id,
					actionName: action.name,
					refusedButGranted,
					letInButNotGranted,
					grantedToNobody: !users.roles.some((role) => granted(users.permissions, role.id, leaf.id, action.id))
				});
			}
		}
		if (blind.length > 0) features.push({ featureId: leaf.id, featureName: leaf.name, actions: blind });
	}
	return { compared: true, grantsActions, actions, features };
}
