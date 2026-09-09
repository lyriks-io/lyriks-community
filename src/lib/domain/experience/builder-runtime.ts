/**
 * Run-mode engine for the Experience Builder — ephemeral, never persisted. Pure
 * functions that interpret a screen's node tree as a runnable wireframe:
 * navigation + setState transitions, Given/When/Then scenario assertions
 * (surfaced as real-time errors), persona gating, and binding preconditions.
 * Every operation returns a fresh RunState so the UI re-renders reactively.
 */
import type {
	AssertOp,
	BuilderElementNode,
	CallSpec,
	ElementScenario,
	ElementTransition,
	ExperienceBuilder,
	PersonaGate,
	ScenarioAssertion,
	TransitionEffect,
	TransitionTrigger,
	ValidationRule,
	VisibilityCondition
} from './builder';
import { fieldStatePath, isFieldBuilderKind, isInteractiveBuilderKind, rowStateKey } from './builder';
import { collectionKey, fakeRecord, fieldKey, findCollection, generateRows } from './backend';
import { hostedSurfacesResolver } from './surface-hosting';

/**
 * The row a bound list is rendering when an interaction fires inside its row
 * template — what makes ONE authored row wire N per-row actions ("connect THIS
 * app"). `key` is the row's stable identity (see `rowStateKey`), used to keep
 * per-row field values (a checkbox in every row) independent.
 */
export interface RowContext {
	row: Record<string, unknown>;
	key: string;
}

/** Build a RowContext from a rendered row and its index. */
export function rowContext(row: Record<string, unknown>, index: number): RowContext {
	return { row, key: rowStateKey(row, index) };
}

export interface RunError {
	nodeId: string | null;
	kind: 'scenario' | 'binding' | 'navigation' | 'validation' | 'permission';
	message: string;
	at: number;
}

/**
 * One line in the run's Activity trace — the visible record that a binding or
 * effect actually fired. `action`/`event` come from an element's binding; `effect`
 * from a transition (navigate / setState / createRecord / print).
 */
export interface ActivityEntry {
	at: number;
	kind: 'action' | 'event' | 'effect';
	label: string;
	detail?: string;
}

/**
 * Namespaced run-state path an action/event binding writes when it fires (a small
 * counter). This is the whole "event bus": emitting just bumps `event.<ref>` in run
 * state, so the existing visibility/scenario comparison engine can observe it — no
 * separate evaluator. e.g. `visibleWhen: { path: 'event.saved', op: 'truthy' }`.
 */
export const signalPath = (kind: 'action' | 'event', ref: string): string => `${kind}.${ref}`;

/**
 * A non-fatal authoring smell noticed while the run executed — real enough to
 * surface, not wrong enough to fail the run (that is what `errors` are for).
 */
export interface RunWarning {
	nodeId: string | null;
	message: string;
	at: number;
}

export interface RunState {
	currentScreenId: string | null;
	/** Live state, keyed by dotted path (flat). */
	state: Record<string, unknown>;
	/** Fake-backend rows by collection key — seeded at init, appended at runtime,
	 *  persistent across navigation until the run is restarted. */
	collections: Record<string, Record<string, unknown>[]>;
	/** Persona the run is performed "as" (Step-03 role id), or null = author/all. */
	activePersonaId: string | null;
	/** Screens visited, for "go back" — pushed on navigate, popped on navigateBack. */
	history: string[];
	errors: RunError[];
	warnings: RunWarning[];
	/** Visible trace of actions/events/effects fired this run (newest last). */
	activity: ActivityEntry[];
	/** Async `call` operations queued by the last interaction, awaiting resolution
	 *  (the live Runner resolves them after each call's latency; `simulate` drains
	 *  them immediately). Transient — repopulated every `fireInteraction`. */
	pendingCalls: CallSpec[];
	seq: number;
}

export interface RunGateResult {
	visible: boolean;
	enabled: boolean;
}

/** Parse a seed/transition literal into boolean | number | string. */
export function parseValue(raw: string | undefined): unknown {
	if (raw === undefined) return undefined;
	const t = raw.trim();
	if (t === 'true') return true;
	if (t === 'false') return false;
	if (t !== '' && !Number.isNaN(Number(t))) return Number(t);
	return raw;
}

export function initRunState(
	b: ExperienceBuilder,
	activePersonaId: string | null,
	startScreenId?: string | null
): RunState {
	const state: Record<string, unknown> = {};
	for (const seed of b.stateSeeds) if (seed.path) state[seed.path] = parseValue(seed.value);
	const collections: Record<string, Record<string, unknown>[]> = {};
	for (const col of b.collections) {
		const key = collectionKey(col.name);
		if (key) collections[key] = generateRows(col);
	}
	return {
		currentScreenId: startScreenId ?? b.entryScreenId ?? null,
		state,
		collections,
		activePersonaId,
		history: [],
		errors: [],
		warnings: [],
		activity: [],
		pendingCalls: [],
		seq: 0
	};
}

/**
 * Resolve a queued async `call`: clear its loading flag and apply the configured
 * outcome (success → resultPath=resultValue; error → errorPath=true). Pure — the
 * live Runner calls this after the call's latency; `simulate` calls it at once.
 */
export function resolveCall(prev: RunState, call: CallSpec): RunState {
	const state = { ...prev.state };
	if (call.loadingPath) state[call.loadingPath] = false;
	if (call.outcome === 'error') {
		if (call.errorPath) state[call.errorPath] = true;
	} else if (call.resultPath) {
		state[call.resultPath] = call.resultValue !== undefined ? parseValue(call.resultValue) : true;
	}
	return {
		...prev,
		state,
		activity: [
			...prev.activity,
			{ at: prev.seq, kind: 'effect', label: `call ${call.outcome ?? 'success'}`, detail: call.label }
		]
	};
}

export function getState(state: Record<string, unknown>, path: string): unknown {
	return state[path];
}

/**
 * Render `{state.path}` placeholders inside a label against the live run state,
 * so display text is dynamic ("Welcome, {session.user}" · "{cart.count} items").
 * Unknown / empty paths resolve to '' so a fresh run shows clean text rather than
 * literal braces. `{{` / `}}` are literal escapes for a real brace.
 */
export function interpolate(template: string, state: Record<string, unknown>): string {
	if (!template || template.indexOf('{') === -1) return template;
	return template
		.replace(/\{\{|\}\}|\{([^{}]+)\}/g, (m, path) => {
			if (m === '{{') return '\u0000OPEN\u0000';
			if (m === '}}') return '\u0000CLOSE\u0000';
			const v = getState(state, (path as string).trim());
			return v === undefined || v === null ? '' : String(v);
		})
		.replace(/\u0000OPEN\u0000/g, '{')
		.replace(/\u0000CLOSE\u0000/g, '}');
}

/**
 * Resolve every dynamic token in a label against the live run, in order:
 *   `{#Collection}`        → live row count
 *   `{Collection.field}`   → a record's field (first row by default)
 *   `{Collection.2.field}` → the Nth (0-based) record's field
 *   `{state.path}`         → live state value (via interpolate)
 * A `{a.b}` whose `a` is not a known collection is left for state interpolation,
 * so flat dotted state paths (e.g. `cart.itemCount`) keep working.
 */
export function resolveText(
	text: string,
	state: Record<string, unknown>,
	collections: Record<string, Record<string, unknown>[]>
): string {
	if (!text || text.indexOf('{') === -1) return text;
	const withCounts = text.replace(/\{#([^{}]+)\}/g, (_m, name) =>
		String((collections[collectionKey(String(name).trim())] ?? []).length)
	);
	const withRecords = withCounts.replace(
		/\{([^{}.]+)\.(?:(\d+)\.)?([^{}.]+)\}/g,
		(m, coll, idx, field) => {
			const rows = collections[collectionKey(String(coll).trim())];
			if (!rows) return m; // not a collection → leave for state interpolation
			const row = rows[idx ? Number(idx) : 0];
			if (!row) return '';
			const v = row[String(field).trim()];
			return v === undefined || v === null ? '' : String(v);
		}
	);
	return interpolate(withRecords, state);
}

/**
 * Resolve a label inside a LIST ROW TEMPLATE: a bare `{Field}` token (no dot)
 * that names a column of the current row resolves to that row's value, so one
 * authored row design repeats with each record's data. Tokens that aren't row
 * fields (`{state.path}`, `{Collection.field}`, `{#Collection}`) fall through to
 * the normal `resolveText`, so a row template can still read global state.
 */
export function resolveRowText(
	text: string,
	row: Record<string, unknown>,
	state: Record<string, unknown>,
	collections: Record<string, Record<string, unknown>[]>
): string {
	if (!text || text.indexOf('{') === -1) return text;
	const withRow = text.replace(/\{([^{}.#]+)\}/g, (m, key) => {
		const k = String(key).trim();
		if (Object.prototype.hasOwnProperty.call(row, k)) {
			const v = row[k];
			return v === undefined || v === null ? '' : String(v);
		}
		return m; // not a row field → leave for state/collection resolution
	});
	return resolveText(withRow, state, collections);
}

/**
 * Filter backend rows by a free-text query — case-insensitive substring across
 * every field value of each row. Empty/blank query ⇒ all rows. Powers a list's
 * live search when an input writes the query into the list's `filterStatePath`.
 */
export function filterRows(
	rows: Record<string, unknown>[],
	query: string
): Record<string, unknown>[] {
	const q = (query ?? '').trim().toLowerCase();
	if (!q) return rows;
	return rows.filter((row) =>
		Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q))
	);
}

/**
 * The rows a bound `list` shows right now: its collection's live records, minus
 * anything filtered out by the search query at `filterStatePath`. Shared by the
 * live Runner and headless `simulate` so both agree on what row N is.
 */
export function listRowsFor(
	node: BuilderElementNode,
	state: Record<string, unknown>,
	collections: Record<string, Record<string, unknown>[]>
): Record<string, unknown>[] {
	const ref = node.wiring.binding?.targetKind === 'entity' ? node.wiring.binding.targetRef : '';
	const key = collectionKey(ref);
	const rows = key ? (collections[key] ?? []) : [];
	if (!node.filterStatePath) return rows;
	return filterRows(rows, String(getState(state, node.filterStatePath) ?? ''));
}

/**
 * The `list` element that renders `surfaceId` as its ROW TEMPLATE, if any. A row
 * template is an ordinary component surface, so this is how an element inside one
 * finds the data it is repeating over.
 */
export function rowTemplateOwner(
	b: ExperienceBuilder,
	surfaceId: string
): BuilderElementNode | null {
	const hosted = hostedSurfacesResolver(b.nodes);
	return (
		Object.values(b.nodes).find(
			(n): n is BuilderElementNode =>
				n.kind === 'element' &&
				n.elementKind === 'list' &&
				Boolean(n.componentId) &&
				// The template surface itself, or any component it embeds in turn.
				hosted(n.componentId as string).has(surfaceId)
		) ?? null
	);
}

/**
 * The choices a `select` offers right now. `optionsFrom` reads them live from a
 * collection's field (optionally narrowed by another field matching a state
 * value — dependent dropdowns: "events of the chosen app"); otherwise the
 * authored `options` list is used. Duplicates and blanks are dropped.
 */
export function selectOptions(
	node: BuilderElementNode,
	state: Record<string, unknown>,
	collections: Record<string, Record<string, unknown>[]>
): string[] {
	const src = node.optionsFrom;
	if (src?.collection && src.field) {
		const rows = collections[collectionKey(src.collection)] ?? [];
		const narrowed =
			src.filterField && src.filterPath
				? rows.filter(
						(r) => String(r[src.filterField as string] ?? '') === String(getState(state, src.filterPath as string) ?? '')
					)
				: rows;
		const values = narrowed
			.map((r) => (r[src.field] === undefined || r[src.field] === null ? '' : String(r[src.field])))
			.filter((v) => v.trim() !== '');
		if (values.length > 0 || rows.length > 0) return [...new Set(values)];
	}
	return [...new Set((node.options ?? []).map((o) => String(o)).filter((o) => o.trim() !== ''))];
}

/**
 * The single comparison primitive shared by scenario assertions and visibility.
 * Inside a list row template a bare `path` naming a FIELD of the current row
 * reads that row's value — so one authored row can show a "Reconnect" button only
 * on the expired ones, or badge the recommended pricing tier.
 */
function compare(
	state: Record<string, unknown>,
	path: string,
	op: AssertOp,
	expected?: string,
	ctx?: RowContext | null
): boolean {
	const val =
		ctx && Object.prototype.hasOwnProperty.call(ctx.row, path)
			? ctx.row[path]
			: getState(state, path);
	switch (op) {
		case 'truthy':
			return Boolean(val);
		case 'falsy':
			return !val;
		case 'eq':
			return val === parseValue(expected) || String(val) === String(expected ?? '');
		case 'neq':
			return !(val === parseValue(expected) || String(val) === String(expected ?? ''));
		default:
			return true;
	}
}

export function evalAssertion(state: Record<string, unknown>, a: ScenarioAssertion): boolean {
	return compare(state, a.path, a.op, a.expected);
}

/** State-driven visibility — true when the condition holds (or is absent/empty). */
export function evalVisibility(
	state: Record<string, unknown>,
	cond: VisibilityCondition | null | undefined,
	ctx?: RowContext | null
): boolean {
	if (!cond || !cond.path) return true;
	return compare(state, cond.path, cond.op, cond.expected, ctx);
}

/**
 * The value that FALSIFIES a visibility condition once written to its path:
 * what "dismiss" means for a `menu` (or any visibleWhen-opened surface) when
 * the user clicks outside instead of an authored close control. Inverse of
 * `compare` for every operator, so dismissal works however the author phrased
 * the condition.
 */
export function visibilityDismissValue(cond: VisibilityCondition): unknown {
	switch (cond.op) {
		case 'falsy':
			return true;
		case 'eq':
			// Any value that no longer equals `expected` (mind an empty expected).
			return cond.expected ? '' : 'dismissed';
		case 'neq':
			return cond.expected ?? '';
		default: // 'truthy'
			return false;
	}
}

/** Persona gating resolution at render time. No gate (or author run) → fully open. */
export function isGatePassing(
	gate: PersonaGate | null,
	activePersonaId: string | null
): RunGateResult {
	if (!gate || activePersonaId === null) return { visible: true, enabled: true };
	const matched = gate.personaIds.includes(activePersonaId);
	const allowed = gate.allow ? matched : !matched;
	return gate.mode === 'visible'
		? { visible: allowed, enabled: true }
		: { visible: true, enabled: allowed };
}

/**
 * Effective render gate for a node: persona gating AND state-driven visibility
 * must both pass. State visibility is persona-independent (it applies in author
 * runs too), so it is evaluated separately and intersected with the persona
 * result — never widening it.
 */
export function resolveGate(
	node: BuilderElementNode,
	activePersonaId: string | null,
	state: Record<string, unknown>,
	ctx?: RowContext | null
): RunGateResult {
	const persona = isGatePassing(node.wiring.gate, activePersonaId);
	const visibleByState = evalVisibility(state, node.wiring.visibleWhen, ctx);
	return { visible: persona.visible && visibleByState, enabled: persona.enabled };
}

export function bindingPreconditionError(node: BuilderElementNode, at: number): RunError | null {
	// Value fields (input/textarea/select/checkbox) are self-binding through their
	// field state path, so they never need an explicit binding — only actuators
	// (button/link/form) do. A transition (navigate/setState/toggle/call/…) is
	// itself wiring: an actuator that fires a transition IS bound to something, so
	// don't flag it. Only a truly inert actuator — no binding AND no transitions.
	if (
		!isFieldBuilderKind(node.elementKind) &&
		isInteractiveBuilderKind(node.elementKind) &&
		!node.wiring.binding &&
		node.wiring.transitions.length === 0
	)
		return { nodeId: node.id, kind: 'binding', message: `"${node.label}" is not bound to anything.`, at };
	return null;
}

/* ── Input values + validation ───────────────────────────────────────── */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRule(value: unknown, rule: ValidationRule, numeric = false): boolean {
	const s = value === undefined || value === null ? '' : String(value);
	switch (rule.kind) {
		case 'required':
			return s.trim().length > 0;
		case 'email':
			return s === '' || EMAIL_RE.test(s); // empty is "not wrong" unless also required
		// On a number input, min/max bound the VALUE (so `min 0` rejects -5); on a
		// text input they bound the LENGTH. Same authored rule, sensible per type.
		case 'min':
			if (s === '') return true;
			return numeric ? Number(s) >= Number(rule.param || 0) : s.length >= Number(rule.param || 0);
		case 'max':
			if (s === '') return true;
			return numeric ? Number(s) <= Number(rule.param || 0) : s.length <= Number(rule.param || 0);
		case 'pattern': {
			if (s === '' || !rule.param) return true;
			try {
				return new RegExp(rule.param).test(s);
			} catch {
				return true;
			}
		}
		default:
			return true;
	}
}

const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const TEL_RE = /^[+]?[-\d\s().]{6,}$/;
const NUM_RE = /^-?\d*\.?\d+$/;

/**
 * Format error implied by the input TYPE (number / date / url / …) — enforced
 * automatically on top of the authored validation rules. Empty is allowed here
 * (a `required` rule handles emptiness).
 */
export function inputTypeError(type: BuilderElementNode['wiring']['inputType'], value: unknown): string | null {
	const s = (value === undefined || value === null ? '' : String(value)).trim();
	if (s === '') return null;
	switch (type) {
		case 'number':
			return NUM_RE.test(s) ? null : 'Enter a number.';
		case 'email':
			return EMAIL_RE.test(s) ? null : 'Enter a valid email address.';
		case 'url':
			return URL_RE.test(s) ? null : 'Enter a valid URL.';
		case 'date':
			return DATE_RE.test(s) ? null : 'Enter a valid date (YYYY-MM-DD).';
		case 'time':
			return TIME_RE.test(s) ? null : 'Enter a valid time (HH:MM).';
		case 'tel':
			return TEL_RE.test(s) ? null : 'Enter a valid phone number.';
		default:
			return null;
	}
}

/** All failing messages for an input's current value: type-format first, then rules. */
export function fieldErrorsFor(node: BuilderElementNode, value: unknown): string[] {
	const out: string[] = [];
	const fmt = inputTypeError(node.wiring.inputType, value);
	if (fmt) out.push(fmt);
	const numeric = node.wiring.inputType === 'number';
	for (const r of node.wiring.validations) if (!validateRule(value, r, numeric)) out.push(r.message);
	return [...new Set(out)]; // dedupe identical messages (e.g. type + email rule)
}

/**
 * Every `{token}` in a template that resolves to nothing.
 *
 * Resolution order is row field → collection field → state path, and an
 * unknown/unset path deliberately renders as '' so a fresh run shows clean text
 * instead of literal braces. That is right for a LABEL and wrong for an effect
 * VALUE: writing '' into state looks exactly like working interpolation over an
 * empty value, which is how a `setState ['game.finalScore','{game.score}']`
 * against a not-yet-seeded path was read as "state interpolation is broken".
 * Callers use this to say which token came up empty.
 */
export function unresolvedTokens(
	template: string,
	state: Record<string, unknown>,
	collections: Record<string, Record<string, unknown>[]>,
	row?: Record<string, unknown> | null
): string[] {
	if (!template || template.indexOf('{') === -1) return [];
	const out: string[] = [];
	// Same token grammar as resolveText/resolveRowText, minus the `{{`/`}}`
	// literal escapes.
	for (const m of template.replace(/\{\{|\}\}/g, '').matchAll(/\{([^{}]+)\}/g)) {
		const token = m[1].trim();
		if (!token) continue;
		const resolved = row
			? resolveRowText(`{${token}}`, row, state, collections)
			: resolveText(`{${token}}`, state, collections);
		// A token that survived verbatim is a `{Collection.field}` whose collection
		// is unknown; '' is a known token with nothing behind it. Both are empty
		// writes the author did not ask for.
		if (resolved === '' || resolved === `{${token}}`) out.push(token);
	}
	return out;
}

/**
 * Resolve an authored literal before it is written to state: `{Field}` against
 * the clicked row (row templates), `{Collection.field}` / `{state.path}` against
 * the run. Values without a `{` are returned untouched, so plain literals
 * ("true", "42", "on") keep their exact meaning.
 *
 * `warn` receives the tokens that resolved to nothing, so an effect that writes
 * an accidental empty string says so instead of failing silently.
 */
function resolveEffectValue(
	value: string | undefined,
	rs: RunState,
	ctx?: RowContext | null,
	warn?: (tokens: string[]) => void
): string | undefined {
	if (value === undefined || value.indexOf('{') === -1) return value;
	if (warn) {
		const empty = unresolvedTokens(value, rs.state, rs.collections, ctx?.row);
		if (empty.length > 0) warn(empty);
	}
	return ctx
		? resolveRowText(value, ctx.row, rs.state, rs.collections)
		: resolveText(value, rs.state, rs.collections);
}

/** Input nodes on a screen that carry validation rules. */
/** What a correctly-filled field of each type looks like. */
const SAMPLE_BY_INPUT_TYPE: Readonly<Record<string, string>> = {
	text: 'Sample',
	email: 'user@example.com',
	password: 'Passw0rd!23',
	number: '42',
	tel: '+33123456789',
	url: 'https://example.com',
	date: '2026-01-01',
	time: '09:00'
};

/**
 * A value that satisfies an input's OWN declared rules, or null when none of the
 * obvious candidates does (a `pattern` nobody can guess from its source).
 *
 * This exists for the derived happy path. Filling a form correctly is part of
 * what a user does to succeed, so a verification that only clicks reports every
 * screen behind a require-valid submit as a dead end. That verdict is not just
 * wrong, it is dangerous: the cheapest way to make it green is to delete the
 * guard from the specification, which is what one real build did on its four
 * form screens. The candidate is validated here rather than trusted, so a field
 * whose rules we cannot satisfy still fails the run and is still reported.
 */
export function sampleInputValue(node: BuilderElementNode): string | null {
	const base = SAMPLE_BY_INPUT_TYPE[node.wiring.inputType ?? 'text'] ?? SAMPLE_BY_INPUT_TYPE.text;
	const min = Number.parseInt(
		String(node.wiring.validations.find((v) => v.kind === 'min')?.param ?? ''),
		10
	);
	// Padding only helps a free-text field: lengthening an email or a date breaks
	// the format rule it would be trying to satisfy.
	const freeText = node.wiring.inputType === undefined || node.wiring.inputType === 'text' || node.wiring.inputType === 'password';
	const padded = freeText && Number.isFinite(min) && min > base.length ? base.padEnd(min, 'x') : null;
	for (const candidate of padded ? [base, padded] : [base])
		if (fieldErrorsFor(node, candidate).length === 0) return candidate;
	return null;
}

/** True when leaving this input empty is what blocks a require-valid submit. */
export function blocksWhenEmpty(node: BuilderElementNode): boolean {
	return fieldErrorsFor(node, '').length > 0;
}

export function inputNodesOfScreen(b: ExperienceBuilder, screenId: string): BuilderElementNode[] {
	return Object.values(b.nodes).filter(
		(n): n is BuilderElementNode =>
			n.kind === 'element' && n.surfaceId === screenId && n.wiring.validations.length > 0
	);
}

export function screenHasInvalid(b: ExperienceBuilder, screenId: string, rs: RunState): boolean {
	return inputNodesOfScreen(b, screenId).some(
		(n) => fieldErrorsFor(n, getState(rs.state, fieldStatePath(n))).length > 0
	);
}

/** Write a typed field value into the run state (live). */
export function setFieldValue(
	rs: RunState,
	node: BuilderElementNode,
	value: string,
	rowKey?: string | null
): RunState {
	// A checkbox holds a real boolean so `truthy`/`falsy` guards work on it; every
	// other field keeps the raw string (a phone number must stay "0612…").
	const v: unknown = node.elementKind === 'checkbox' ? value === 'true' : value;
	return { ...rs, state: { ...rs.state, [fieldStatePath(node, rowKey)]: v } };
}

/** Apply a state-writing effect (setState / toggleState / incrementState) in place. */
function applyStateEffect(
	state: Record<string, unknown>,
	effect: TransitionEffect,
	value: string | undefined
): void {
	const path = effect.target;
	if (!path) return;
	switch (effect.kind) {
		case 'toggleState':
			state[path] = !state[path];
			break;
		case 'incrementState': {
			const step = Number(parseValue(value));
			const by = Number.isFinite(step) ? step : 1;
			state[path] = Number(state[path] ?? 0) + by;
			break;
		}
		default: // setState
			state[path] = parseValue(value);
	}
}

/** All value-field element nodes on a surface (not just validated ones). */
function inputsOnSurface(b: ExperienceBuilder, surfaceId: string): BuilderElementNode[] {
	return Object.values(b.nodes).filter(
		(n): n is BuilderElementNode =>
			n.kind === 'element' && isFieldBuilderKind(n.elementKind) && n.surfaceId === surfaceId
	);
}

/**
 * Build a new backend record from the current screen: a fully-seeded fake row,
 * then each collection field whose name matches an input's label — or whose
 * `fieldMap` entry names an input's label — is overwritten with that input's
 * typed value. So a "Create record" submit captures what the user entered and
 * fills the rest with believable data. Returns how many fields captured an
 * input, so the caller can flag a capture that silently missed everything.
 */
function buildRecordFromInputs(
	b: ExperienceBuilder,
	node: BuilderElementNode,
	col: import('./backend').BackendCollection,
	state: Record<string, unknown>,
	rowIndex: number,
	fieldMap?: Record<string, string>,
	ctx?: RowContext | null
): { record: Record<string, unknown>; captured: number } {
	const record = fakeRecord(col, rowIndex);
	const inputs = inputsOnSurface(b, node.surfaceId);
	const norm = (s: string) => s.trim().toLowerCase();
	let captured = 0;
	for (const f of col.fields) {
		if (!f.name.trim()) continue;
		const wantLabel = norm(fieldMap?.[f.name] ?? f.name);
		const match = inputs.find((i) => norm(i.label) === wantLabel);
		if (!match) continue;
		const v = getState(state, fieldStatePath(match, ctx?.key));
		if (v !== undefined && v !== null && String(v) !== '') {
			record[fieldKey(f)] = v;
			captured++;
		}
	}
	return { record, captured };
}

function applyTransition(
	rs: RunState,
	t: ElementTransition,
	b: ExperienceBuilder,
	node: BuilderElementNode,
	ctx?: RowContext | null
): void {
	if (t.effect.kind === 'navigate') {
		const target = t.effect.target;
		if (target && b.screenRoots[target]) {
			// Remember where we came from so "go back" returns here.
			if (rs.currentScreenId && rs.currentScreenId !== target) rs.history.push(rs.currentScreenId);
			rs.currentScreenId = target;
			rs.activity.push({ at: rs.seq, kind: 'effect', label: 'navigate', detail: target });
		} else
			rs.errors.push({
				nodeId: null,
				kind: 'navigation',
				message: `Transition targets a missing screen.`,
				at: rs.seq
			});
	} else if (t.effect.kind === 'navigateBack') {
		const prev = rs.history.pop();
		if (prev) {
			rs.currentScreenId = prev;
			rs.activity.push({ at: rs.seq, kind: 'effect', label: 'navigate back', detail: prev });
		}
	} else if (t.effect.kind === 'createRecord') {
		const col = findCollection(b.collections, t.effect.target);
		const key = collectionKey(t.effect.target);
		if (!col || !key) {
			rs.errors.push({
				nodeId: node.id,
				kind: 'binding',
				message: `"Create record" targets a missing collection.`,
				at: rs.seq
			});
			return;
		}
		const rows = rs.collections[key] ?? [];
		const built = buildRecordFromInputs(b, node, col, rs.state, rows.length, t.effect.fieldMap, ctx);
		rs.collections[key] = [...rows, built.record];
		rs.activity.push({ at: rs.seq, kind: 'effect', label: 'create record', detail: col.name });
		// A create form whose inputs ALL missed the capture (label ≠ field name)
		// looks like it worked while dropping everything the user typed — say so.
		if (built.captured === 0 && inputsOnSurface(b, node.surfaceId).length > 0) {
			rs.warnings.push({
				nodeId: node.id,
				message:
					`"Create record" on "${col.name}" captured no input values: no input label on this screen ` +
					`matches a "${col.name}" field name. Rename the inputs to match, or set fieldMap ` +
					`{"<field name>":"<input label>"} on the effect.`,
				at: rs.seq
			});
		}
		// Reset the form: clear the inputs on this surface so returning to the
		// screen shows a blank form (a create form that keeps its values reads as
		// "the submit didn't work").
		for (const inp of inputsOnSurface(b, node.surfaceId))
			rs.state[fieldStatePath(inp, ctx?.key)] = inp.elementKind === 'checkbox' ? false : '';
	} else if (t.effect.kind === 'selectRecord') {
		// Row → state: publish the clicked record under a path prefix so the rest of
		// the app can read it (`{selected.app.name}` on the next screen, a guard on
		// `selected.app.status`). This is what turns a list into a real master/detail.
		const prefix = t.effect.target.trim();
		if (!prefix) return;
		if (!ctx) {
			rs.warnings.push({
				nodeId: node.id,
				message:
					`"Select record" fired outside a list row template, so there is no row to capture. ` +
					`Put this element inside the component a list uses as its row template.`,
				at: rs.seq
			});
			return;
		}
		for (const [field, value] of Object.entries(ctx.row)) {
			const seg = field.trim().replace(/[^A-Za-z0-9_]/g, '_');
			if (seg) rs.state[`${prefix}.${seg}`] = value;
		}
		rs.state[prefix] = ctx.key;
		rs.activity.push({ at: rs.seq, kind: 'effect', label: 'select record', detail: `${prefix} = ${ctx.key}` });
	} else if (t.effect.kind === 'call') {
		// Begin an async operation: raise its loading flag now and queue it; the
		// outcome resolves later (Runner: after latency · simulate: immediately).
		const call = t.effect.call;
		if (call) {
			if (call.loadingPath) rs.state[call.loadingPath] = true;
			rs.pendingCalls.push(call);
			rs.activity.push({ at: rs.seq, kind: 'effect', label: 'call', detail: call.label });
		}
	} else if (t.effect.kind === 'print') {
		// Append a line (with `{state.path}` resolved) to a log state path — the
		// console/CLI output primitive. A text element bound to the same path shows it.
		const path = t.effect.target;
		if (path) {
			const line = resolveEffectValue(t.effect.value ?? '', rs, ctx) ?? '';
			const prev = rs.state[path];
			rs.state[path] = (prev === undefined || prev === null || prev === '' ? '' : `${prev}\n`) + line;
			rs.activity.push({ at: rs.seq, kind: 'effect', label: 'print', detail: line });
		}
	} else {
		const value = resolveEffectValue(t.effect.value, rs, ctx, (tokens) =>
			rs.warnings.push({
				nodeId: node.id,
				message:
					`"${node.label || node.elementKind}" writes ${tokens.map((x) => `{${x}}`).join(', ')} into ` +
					`"${t.effect.target}", but ${tokens.length === 1 ? 'that token resolves' : 'those tokens resolve'} ` +
					`to nothing right now, so an empty value is stored. Inside a list row template a bare {Field} ` +
					`reads the clicked row; elsewhere {a.b} reads a collection field, then a state path. Seed the ` +
					`path (builder.stateSeeds) or fix the token.`,
				at: rs.seq
			})
		);
		applyStateEffect(rs.state, t.effect, value);
		rs.activity.push({ at: rs.seq, kind: 'effect', label: t.effect.kind, detail: t.effect.target });
	}
}

/** The interaction pipeline. Returns a fresh RunState. */
export function fireInteraction(
	prev: RunState,
	node: BuilderElementNode,
	trigger: TransitionTrigger,
	b: ExperienceBuilder,
	/** Set when the element lives in a list row template — the row that was clicked. */
	ctx?: RowContext | null
): RunState {
	const rs: RunState = {
		...prev,
		state: { ...prev.state },
		collections: { ...prev.collections },
		history: [...prev.history],
		errors: [...prev.errors],
		warnings: [...prev.warnings],
		activity: [...prev.activity],
		pendingCalls: [], // queued fresh by this interaction's `call` effects
		seq: prev.seq + 1
	};

	// Intentful triggers are the user committing to an action (click / Enter-submit).
	// hover + change are incidental, so they must not surface "unbound" or
	// "complete the form" guard errors — only the user's own value edits + any
	// explicitly-wired hover/change transitions run for them.
	const intentful = trigger === 'click' || trigger === 'submit';

	// 1) binding precondition (soft — still proceed); only on an intentful action.
	const pre = intentful ? bindingPreconditionError(node, rs.seq) : null;
	if (pre) rs.errors.push(pre);

	// 1b) submit guard: a require-valid button is blocked while its screen has
	// invalid inputs — surfaces each field error and applies no transitions.
	if (
		intentful &&
		isInteractiveBuilderKind(node.elementKind) &&
		node.wiring.requireValid &&
		screenHasInvalid(b, node.surfaceId, rs)
	) {
		for (const inp of inputNodesOfScreen(b, node.surfaceId))
			for (const m of fieldErrorsFor(inp, getState(rs.state, fieldStatePath(inp))))
				rs.errors.push({
					nodeId: inp.id,
					kind: 'validation',
					message: `${inp.label || 'Field'}: ${m}`,
					at: rs.seq
				});
		return rs;
	}

	const matches = (when: ElementScenario['whenTrigger']) =>
		when === trigger || (when === 'submit' && trigger === 'click');

	// 2) scenarios — Given (pre-transition); failing Given skips that scenario's Then
	const runnable: ElementScenario[] = [];
	for (const sc of node.wiring.scenarios) {
		if (!matches(sc.whenTrigger)) continue;
		const failedGiven = sc.given.find((a) => !evalAssertion(rs.state, a));
		if (failedGiven)
			rs.errors.push({
				nodeId: node.id,
				kind: 'scenario',
				message: `${sc.title}: precondition not met: ${failedGiven.message || failedGiven.path}`,
				at: rs.seq
			});
		else runnable.push(sc);
	}

	// 3) transitions matching this trigger — a guarded transition (`when`) runs
	// only while its run-state condition holds, so flows can branch (if/else).
	for (const t of node.wiring.transitions)
		if (t.trigger === trigger && evalVisibility(rs.state, t.when, ctx)) applyTransition(rs, t, b, node, ctx);

	// 3b) action / event binding — only on an intentful action. Firing an
	// action-bound or event-bound element bumps a namespaced run-state counter
	// (the "bus") so other elements can observe it via visibleWhen / scenarios,
	// and records a line in the Activity trace.
	const binding = node.wiring.binding;
	if (intentful && binding?.targetRef && (binding.targetKind === 'action' || binding.targetKind === 'event')) {
		const path = signalPath(binding.targetKind, binding.targetRef);
		rs.state[path] = Number(rs.state[path] ?? 0) + 1;
		rs.activity.push({ at: rs.seq, kind: binding.targetKind, label: binding.targetRef });
	}

	// 4) scenarios — Then (post-transition)
	for (const sc of runnable)
		for (const a of sc.then)
			if (!evalAssertion(rs.state, a))
				rs.errors.push({
					nodeId: node.id,
					kind: 'scenario',
					message: `${sc.title}: ${a.message || `expected ${a.path}`}`,
					at: rs.seq
				});

	return rs;
}
