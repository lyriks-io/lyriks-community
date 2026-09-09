/**
 * Headless run of the Experience Builder — folds the pure run-mode engine over a
 * scripted sequence of interactions so an AI/agent (or a test) can drive a
 * prototype end-to-end WITHOUT the browser Runner, and read back exactly what a
 * tester would see: the screen it lands on, the live state, the activity trace,
 * and every error (validation, scenario, broken navigation, unbound action).
 *
 * This is the "verify" half of the MCP authoring loop: `build_screen` authors a
 * layout, `simulate` proves the flow behaves — both speaking the same builder
 * model, with no browser and no persistence (a run is ephemeral by design).
 */
import {
	isFieldBuilderKind,
	isPanelPresentation,
	type BuilderElementNode,
	type BuilderGroupNode,
	type ExperienceBuilder,
	type TransitionTrigger
} from './builder';
import {
	fireInteraction,
	initRunState,
	listRowsFor,
	resolveCall,
	resolveGate,
	rowContext,
	rowTemplateOwner,
	selectOptions,
	setFieldValue,
	type ActivityEntry,
	type RowContext,
	type RunError,
	type RunState,
	type RunWarning
} from './builder-runtime';
import { hostedSurfacesResolver } from './surface-hosting';

/**
 * One scripted action. Reference the target element by `nodeId` (preferred —
 * stable and unambiguous) or by `label` (first element with that label on the
 * current screen, or on an explicit `screenId`). When `type` is set the value is
 * written into the input (no trigger); otherwise the element is interacted with
 * `trigger`.
 */
export interface SimAction {
	nodeId?: string;
	label?: string;
	screenId?: string;
	trigger?: TransitionTrigger;
	/** Write this value into the (input) element instead of firing a trigger. */
	type?: string;
	/**
	 * Target the element AS RENDERED IN ROW N of the list that repeats it (0-based,
	 * over the rows visible after any live search filter). This is how a per-row
	 * action — "connect THIS app", "choose THIS plan" — is driven headlessly: the
	 * row is in scope, so `{Field}` values and `selectRecord` capture that record.
	 */
	rowIndex?: number;
	/**
	 * Switch a `tabs` or `sidebar` GROUP (targeted by `nodeId` or `label`) to
	 * panel N (0-based), exactly as clicking its tab bar / aside menu does: the
	 * group's tabs state path is set to N. The panel must exist; a scripted
	 * proof cannot land on a panel no user could open.
	 */
	tab?: number;
	/**
	 * This step is SUPPOSED to fail (a deliberately blocked click, a guard that
	 * must reject). Errors it raises are recorded on the action but consumed —
	 * they don't fail the run; raising none is itself an error. Lets a scripted
	 * proof assert negative paths without eyeballing `errors[]`.
	 */
	expectError?: boolean;
}

export interface SimActionResult {
	index: number;
	resolvedNodeId: string | null;
	elementKind: string | null;
	label: string | null;
	action: 'interact' | 'type' | 'tab' | 'unresolved' | 'blocked';
	trigger: TransitionTrigger | null;
	screenBefore: string | null;
	screenAfter: string | null;
	/** Errors raised by THIS action (the delta over the running error list). */
	newErrors: RunError[];
	/** Identity of the list row this action targeted (only for `rowIndex` steps). */
	rowKey?: string;
	/** Set when `expectError` was declared and the errors were consumed as expected. */
	expectedErrorMet?: boolean;
}

export interface SimRequest {
	personaId?: string | null;
	startScreenId?: string | null;
	actions?: SimAction[];
}

export interface SimResult {
	startScreenId: string | null;
	finalScreenId: string | null;
	/** Live run state, keyed by dotted path (flat). */
	state: Record<string, unknown>;
	/** Row counts per collection key — full rows omitted to stay token-small. */
	collectionCounts: Record<string, number>;
	/** Screens visited in order (entry first, then each navigation target). */
	visited: string[];
	activity: ActivityEntry[];
	errors: RunError[];
	/** Non-fatal authoring smells (e.g. a createRecord that captured no inputs). */
	warnings: RunWarning[];
	actions: SimActionResult[];
	/** True when the run raised no unexpected error (expectError steps excluded). */
	ok: boolean;
}

/** Resolve a scripted action to a concrete element node, or null if none match. */
function findNode(b: ExperienceBuilder, rs: RunState, a: SimAction): BuilderElementNode | null {
	if (a.nodeId) {
		const n = b.nodes[a.nodeId];
		return n && n.kind === 'element' ? n : null;
	}
	if (a.label) {
		const surface = a.screenId ?? rs.currentScreenId;
		if (!surface) return null;
		// Match on the screen's own nodes AND those of components it hosts —
		// a sidebar's "Search" link is clickable on every screen embedding it.
		const surfaces = hostedSurfacesResolver(b.nodes)(surface);
		const want = a.label.trim().toLowerCase();
		return (
			Object.values(b.nodes).find(
				(n): n is BuilderElementNode =>
					n.kind === 'element' &&
					surfaces.has(n.surfaceId) &&
					n.label.trim().toLowerCase() === want
			) ?? null
		);
	}
	return null;
}

/**
 * Resolve a `tab` action to its tabs/sidebar GROUP, or null: by id, or by label
 * among the panel groups of the current screen and the components it hosts (same
 * hosted-surface scope as element lookup, so a component's tabs are reachable).
 */
function findTabsGroup(b: ExperienceBuilder, rs: RunState, a: SimAction): BuilderGroupNode | null {
	if (a.nodeId) {
		const n = b.nodes[a.nodeId];
		return n && n.kind === 'group' && isPanelPresentation(n.presentation) ? n : null;
	}
	if (a.label) {
		const surface = a.screenId ?? rs.currentScreenId;
		if (!surface) return null;
		const surfaces = hostedSurfacesResolver(b.nodes)(surface);
		const want = a.label.trim().toLowerCase();
		return (
			Object.values(b.nodes).find(
				(n): n is BuilderGroupNode =>
					n.kind === 'group' &&
					isPanelPresentation(n.presentation) &&
					surfaces.has(n.surfaceId) &&
					n.label.trim().toLowerCase() === want
			) ?? null
		);
	}
	return null;
}

/**
 * Resolve `rowIndex` to the actual record: find the list that repeats this
 * element as its row template, take its live rows, and pick the Nth. Returns a
 * message instead when the element isn't in a row template or the row is absent
 * — a silent fallback would let a "per-row" proof pass without a row.
 */
function resolveRowContext(
	b: ExperienceBuilder,
	rs: RunState,
	node: BuilderElementNode,
	rowIndex: number
): { ctx: RowContext } | { error: string } {
	const owner = rowTemplateOwner(b, node.surfaceId);
	if (!owner)
		return {
			error: `"${node.label}" is not inside a list row template, so it has no row ${rowIndex} to act on.`
		};
	const rows = listRowsFor(owner, rs.state, rs.collections);
	const row = rows[rowIndex];
	if (!row)
		return {
			error: `"${owner.label}" is showing ${rows.length} row(s); row ${rowIndex} does not exist.`
		};
	return { ctx: rowContext(row, rowIndex) };
}

/**
 * Run `req.actions` against `b`, returning a full trace. Pure: no IO, no
 * persistence — every step threads a fresh RunState (the same contract the
 * browser Runner relies on), so the result is deterministic for a given draft.
 */
export function simulate(b: ExperienceBuilder, req: SimRequest): SimResult {
	let rs = initRunState(b, req.personaId ?? null, req.startScreenId ?? undefined);
	const startScreenId = rs.currentScreenId;
	const visited: string[] = startScreenId ? [startScreenId] : [];
	const results: SimActionResult[] = [];

	for (const [index, a] of (req.actions ?? []).entries()) {
		const screenBefore = rs.currentScreenId;
		const before = rs.errors.length;
		const node = findNode(b, rs, a);

		// expectError contract: errors this step raised are recorded on the action
		// but consumed from the run (a proven negative path is a pass); raising
		// none when one was promised is itself a failure.
		const finish = (r: SimActionResult): void => {
			if (a.expectError) {
				if (r.newErrors.length > 0) {
					rs = { ...rs, errors: rs.errors.slice(0, before) };
					r.expectedErrorMet = true;
				} else {
					r.expectedErrorMet = false;
					rs = {
						...rs,
						errors: [
							...rs.errors,
							{
								nodeId: r.resolvedNodeId,
								kind: 'scenario',
								message: `Action ${index}: expectError was set but the step raised no error.`,
								at: rs.seq
							}
						]
					};
				}
			}
			results.push(r);
		};

		// Panel switching: drive a `tabs`/`sidebar` group exactly as clicking its
		// tab bar / aside menu does, by setting the group's tabs state path to the
		// panel index. Validated against the group's real panels so a script cannot
		// land on a panel no user could open.
		if (a.tab !== undefined) {
			const group = findTabsGroup(b, rs, a);
			const panels = group
				? group.childIds
						.map((id) => b.nodes[id])
						.filter((n): n is BuilderGroupNode => !!n && n.kind === 'group')
				: [];
			const problem = !group
				? `no tabs/sidebar group matched ${a.nodeId ? `id "${a.nodeId}"` : `label "${a.label ?? ''}"`}`
				: a.tab < 0 || a.tab >= panels.length
					? `"${group.label}" has ${panels.length} panel(s); tab ${a.tab} does not exist`
					: null;
			if (!group || problem) {
				rs = {
					...rs,
					errors: [
						...rs.errors,
						{
							nodeId: group?.id ?? a.nodeId ?? null,
							kind: 'binding',
							message: `Action ${index}: ${problem}.`,
							at: rs.seq
						}
					]
				};
				finish({
					index,
					resolvedNodeId: group?.id ?? null,
					elementKind: null,
					label: group?.label ?? a.label ?? null,
					action: 'unresolved',
					trigger: null,
					screenBefore,
					screenAfter: rs.currentScreenId,
					newErrors: rs.errors.slice(before)
				});
				continue;
			}
			rs = { ...rs, state: { ...rs.state, [group.tabsKey || `tabs.${group.id}`]: a.tab } };
			finish({
				index,
				resolvedNodeId: group.id,
				elementKind: null,
				label: group.label,
				action: 'tab',
				trigger: null,
				screenBefore,
				screenAfter: rs.currentScreenId,
				newErrors: rs.errors.slice(before)
			});
			continue;
		}

		if (!node) {
			rs = {
				...rs,
				errors: [
					...rs.errors,
					{
						nodeId: a.nodeId ?? null,
						kind: 'binding',
						message: `Action ${index}: no element matched ${
							a.nodeId ? `id "${a.nodeId}"` : `label "${a.label ?? ''}"`
						}${a.screenId ? ` on screen ${a.screenId}` : ''}.`,
						at: rs.seq
					}
				]
			};
			finish({
				index,
				resolvedNodeId: null,
				elementKind: null,
				label: a.label ?? null,
				action: 'unresolved',
				trigger: null,
				screenBefore,
				screenAfter: rs.currentScreenId,
				newErrors: rs.errors.slice(before)
			});
			continue;
		}

		// Per-row targeting: bind the action to the record row N is showing.
		let ctx: RowContext | null = null;
		if (a.rowIndex !== undefined) {
			const resolved = resolveRowContext(b, rs, node, a.rowIndex);
			if ('error' in resolved) {
				rs = {
					...rs,
					errors: [
						...rs.errors,
						{ nodeId: node.id, kind: 'binding', message: `Action ${index}: ${resolved.error}`, at: rs.seq }
					]
				};
				finish({
					index,
					resolvedNodeId: node.id,
					elementKind: node.elementKind,
					label: node.label,
					action: 'unresolved',
					trigger: null,
					screenBefore,
					screenAfter: rs.currentScreenId,
					newErrors: rs.errors.slice(before)
				});
				continue;
			}
			ctx = resolved.ctx;
		}

		// Enforce the element's persona gate, exactly as the browser Runner does:
		// a hidden element is never rendered (so never clickable/typeable) and a
		// disabled one never fires its interaction. A scripted nodeId/label must not
		// be a back door around RBAC — block it and record why. Author runs
		// (personaId === null) resolve fully open, so this is a no-op there.
		const gate = resolveGate(node, rs.activePersonaId, rs.state, ctx);
		if (!gate.visible || !gate.enabled) {
			const reason = !gate.visible ? 'is hidden from' : 'is disabled for';
			rs = {
				...rs,
				errors: [
					...rs.errors,
					{
						nodeId: node.id,
						kind: 'permission',
						message: `Action ${index}: "${node.label}" ${reason} persona "${rs.activePersonaId}": interaction blocked by its access gate.`,
						at: rs.seq
					}
				]
			};
			finish({
				index,
				resolvedNodeId: node.id,
				elementKind: node.elementKind,
				label: node.label,
				action: 'blocked',
				trigger:
					a.type !== undefined
						? null
						: (a.trigger ?? (isFieldBuilderKind(node.elementKind) ? 'change' : 'click')),
				screenBefore,
				screenAfter: rs.currentScreenId,
				newErrors: rs.errors.slice(before)
			});
			continue;
		}

		if (a.type !== undefined) {
			// A `select` can only ever hold a value it OFFERS — the browser gives the
			// user a closed list, so a scripted run must not be able to write past it
			// (that would "prove" a dependent picker that no user could reach).
			if (node.elementKind === 'select' && a.type !== '') {
				const offered = selectOptions(node, rs.state, rs.collections);
				if (!offered.includes(a.type))
					rs = {
						...rs,
						errors: [
							...rs.errors,
							{
								nodeId: node.id,
								kind: 'validation',
								message:
									`Action ${index}: "${a.type}" is not offered by "${node.label || 'select'}": ` +
									`its choices are [${offered.join(' · ') || 'none'}].`,
								at: rs.seq
							}
						]
					};
			}
			rs = setFieldValue(rs, node, a.type, ctx?.key);
			finish({
				index,
				resolvedNodeId: node.id,
				elementKind: node.elementKind,
				label: node.label,
				action: 'type',
				trigger: null,
				screenBefore,
				screenAfter: rs.currentScreenId,
				newErrors: rs.errors.slice(before),
				...(ctx ? { rowKey: ctx.key } : {})
			});
			continue;
		}

		const trigger: TransitionTrigger =
			a.trigger ?? (isFieldBuilderKind(node.elementKind) ? 'change' : 'click');
		rs = fireInteraction(rs, node, trigger, b, ctx);
		// Headless: resolve any async `call` immediately so the trace is deterministic.
		if (rs.pendingCalls.length) {
			for (const call of rs.pendingCalls) rs = resolveCall(rs, call);
			rs = { ...rs, pendingCalls: [] };
		}
		const screenAfter = rs.currentScreenId;
		if (screenAfter && screenAfter !== screenBefore) visited.push(screenAfter);
		finish({
			index,
			resolvedNodeId: node.id,
			elementKind: node.elementKind,
			label: node.label,
			action: 'interact',
			trigger,
			screenBefore,
			screenAfter,
			newErrors: rs.errors.slice(before),
			...(ctx ? { rowKey: ctx.key } : {})
		});
	}

	const collectionCounts: Record<string, number> = {};
	for (const [k, rows] of Object.entries(rs.collections)) collectionCounts[k] = rows.length;

	return {
		startScreenId,
		finalScreenId: rs.currentScreenId,
		state: rs.state,
		collectionCounts,
		visited,
		activity: rs.activity,
		errors: rs.errors,
		warnings: rs.warnings,
		actions: results,
		ok: rs.errors.length === 0
	};
}
