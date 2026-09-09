/**
 * Step 05 — Experience Builder (replaces the designless prototype runner).
 *
 * A free-form, per-SURFACE layout designer: each screen owns a TREE of nodes —
 * GROUP nodes (flex containers, nestable arbitrarily deep) and ELEMENT leaves.
 * Elements are "completed" with unspa/Lyriks wiring: a binding (action / state /
 * event / surface / entity), on-click/on-hover transitions, Given/When/Then
 * scenarios, and persona gating. A separate Run engine (builder-runtime.ts)
 * interprets this tree as a runnable wireframe.
 *
 * Storage: a flat `nodes` map keyed by id; order is owned by a group's
 * `childIds`. The tree attaches to the existing LibraryScreen (one tree per
 * screen) via `screenRoots[screenId] = rootGroupNodeId` — the screen IS the
 * surface, so there is no parallel surface concept. Pure data + reducers only.
 */
import type { Option } from '$domain/shared';
import type { BindTargetKind } from './prototype';
import type { ExperiencePrototype } from './prototype';
import { defaultSimTheme, type SimTheme } from './theme';
import type { BackendCollection } from './backend';

/* ── Element kinds (superset of the legacy prototype kinds) ───────────── */
export const BUILDER_ELEMENT_KINDS = [
	{ code: 'heading', label: 'Heading' },
	{ code: 'text', label: 'Text' },
	{ code: 'input', label: 'Input' },
	// Multi-line free text — same value/validation contract as `input`.
	{ code: 'textarea', label: 'Text area (multi-line)' },
	// Single choice from `options` (or `optionsFrom` a collection field).
	{ code: 'select', label: 'Select (dropdown)' },
	// Boolean field: writes true/false into its state path.
	{ code: 'checkbox', label: 'Checkbox / toggle' },
	{ code: 'button', label: 'Button' },
	{ code: 'link', label: 'Link' },
	{ code: 'list', label: 'List' },
	{ code: 'form', label: 'Form' },
	{ code: 'container', label: 'Container' },
	{ code: 'image', label: 'Image' },
	{ code: 'status', label: 'Status (loading/empty/error)' },
	// `label` = the bundled lucide icon name (e.g. "zap", "settings"); air-gap-safe.
	{ code: 'icon', label: 'Icon' },
	// `label` = the value 0–100, interpolatable ("{usage.pct}"); variant "ring" for a gauge.
	{ code: 'meter', label: 'Meter (progress/gauge)' }
] as const satisfies readonly Option[];
export type BuilderElementKind = (typeof BUILDER_ELEMENT_KINDS)[number]['code'];

/**
 * Kinds that hold a user-entered VALUE (and therefore a state path + validation
 * rules), as opposed to actuators (button/link) and display elements. Everything
 * that behaves like `input` must be listed here, or its value stops being live.
 */
export function isFieldBuilderKind(k: BuilderElementKind): boolean {
	return k === 'input' || k === 'textarea' || k === 'select' || k === 'checkbox';
}

/** Kinds that can trigger an interaction in Run mode. */
export function isInteractiveBuilderKind(k: BuilderElementKind): boolean {
	return k === 'button' || k === 'form' || k === 'link' || isFieldBuilderKind(k);
}

/**
 * Feedback-state variant for a `status` element. Pair with `visibleWhen` so the
 * right state appears at the right moment (e.g. a spinner while `loading` is
 * truthy, an error banner while `error` is truthy) — exactly how a real screen's
 * loading / empty / error / success states behave, without bespoke wiring.
 */
export type StatusVariant = 'loading' | 'empty' | 'error' | 'success';
export const STATUS_VARIANTS = [
	{ code: 'loading', label: 'Loading' },
	{ code: 'empty', label: 'Empty' },
	{ code: 'error', label: 'Error' },
	{ code: 'success', label: 'Success' }
] as const satisfies readonly Option[];

/* ── Flex layout props (group nodes) ─────────────────────────────────── */
export type FlexDirection = 'row' | 'col';
export type FlexJustify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
export type FlexAlign = 'start' | 'center' | 'end' | 'stretch';

export const FLEX_DIRECTIONS = [
	{ code: 'col', label: 'Column ↓' },
	{ code: 'row', label: 'Row →' }
] as const satisfies readonly Option[];
export const FLEX_JUSTIFY = [
	{ code: 'start', label: 'Start' },
	{ code: 'center', label: 'Center' },
	{ code: 'end', label: 'End' },
	{ code: 'between', label: 'Space between' },
	{ code: 'around', label: 'Space around' },
	{ code: 'evenly', label: 'Space evenly' }
] as const satisfies readonly Option[];
export const FLEX_ALIGN = [
	{ code: 'start', label: 'Start' },
	{ code: 'center', label: 'Center' },
	{ code: 'end', label: 'End' },
	{ code: 'stretch', label: 'Stretch' }
] as const satisfies readonly Option[];

/** Content-width cap for a group: width is 100% up to this max, then centered. */
export type FlexMaxWidth = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export const FLEX_MAX_WIDTHS = [
	{ code: 'none', label: 'Full width' },
	{ code: 'sm', label: 'Small (420px)' },
	{ code: 'md', label: 'Medium (560px)' },
	{ code: 'lg', label: 'Large (720px)' },
	{ code: 'xl', label: 'XL (960px)' }
] as const satisfies readonly Option[];
const MAXW_PX: Record<FlexMaxWidth, string> = {
	none: '',
	sm: '420px',
	md: '560px',
	lg: '720px',
	xl: '960px'
};
export function flexMaxWidthPx(mw: FlexMaxWidth): string {
	return MAXW_PX[mw] ?? '';
}

export interface FlexProps {
	direction: FlexDirection;
	justify: FlexJustify;
	align: FlexAlign;
	gap: number; // 0..12 (tailwind gap scale)
	wrap: boolean;
	padding: number; // 0..12 (tailwind padding scale)
	/** Render this group as a surface card (background + border + radius + shadow). */
	card: boolean;
	/**
	 * Explicit fill color for this container (hex, e.g. `#eef2ff`). Overrides the
	 * theme's card/surface background. Absent ⇒ the theme default (card surface when
	 * `card`, otherwise transparent). This is what lets a single container be tinted
	 * without re-skinning the whole simulator.
	 */
	background?: string;
	/** Cap content width (centered) so it doesn't stretch across a wide page. */
	maxWidth: FlexMaxWidth;
}

/**
 * How a group presents its children, beyond plain flex layout:
 *   - `inline`  : normal flow (default).
 *   - `overlay` : a modal/drawer — in Run mode it floats centered over a scrim,
 *                 shown only while its `visibleWhen` holds (toggle a state to
 *                 open/close); a close action just flips that state back.
 *   - `tabs`    : its child GROUPS are tab panels; a tab bar (their labels) picks
 *                 the active one, tracked in the `tabsKey` state path.
 *   - `sidebar` : same child-GROUPS-are-panels contract as `tabs`, rendered as an
 *                 aside navigation panel (a vertical menu of the panel labels,
 *                 active item highlighted) beside the active panel: what a real
 *                 app's settings/detail area looks like, without faking it as tabs.
 *   - `menu`    : a dropdown anchored where the group sits (the header-right user
 *                 menu case). Same `visibleWhen` open/close contract as `overlay`,
 *                 but no scrim: clicking outside (or picking an item) dismisses it
 *                 by writing the value that falsifies the condition.
 */
export type GroupPresentation = 'inline' | 'overlay' | 'tabs' | 'sidebar' | 'menu';
export const GROUP_PRESENTATIONS = [
	{ code: 'inline', label: 'Inline (normal)' },
	{ code: 'overlay', label: 'Overlay / modal' },
	{ code: 'tabs', label: 'Tabs' },
	{ code: 'sidebar', label: 'Sidebar (aside nav)' },
	{ code: 'menu', label: 'Dropdown menu' }
] as const satisfies readonly Option[];

/** Presentations whose child GROUPS are exclusive panels picked by `tabsKey`. */
export function isPanelPresentation(p: GroupPresentation | undefined): boolean {
	return p === 'tabs' || p === 'sidebar';
}

export function defaultFlexProps(): FlexProps {
	return {
		direction: 'col',
		justify: 'start',
		align: 'stretch',
		gap: 2,
		wrap: false,
		padding: 3,
		card: false,
		maxWidth: 'none'
	};
}

// Explicit literal class tables so Tailwind's scanner generates them (dynamic
// `gap-${n}` interpolation would be purged in a production build).
const GAP_CLASS: Record<number, string> = {
	0: 'gap-0', 1: 'gap-1', 2: 'gap-2', 3: 'gap-3', 4: 'gap-4', 5: 'gap-5',
	6: 'gap-6', 7: 'gap-7', 8: 'gap-8', 9: 'gap-9', 10: 'gap-10', 11: 'gap-11', 12: 'gap-12'
};
const PAD_CLASS: Record<number, string> = {
	0: 'p-0', 1: 'p-1', 2: 'p-2', 3: 'p-3', 4: 'p-4', 5: 'p-5',
	6: 'p-6', 7: 'p-7', 8: 'p-8', 9: 'p-9', 10: 'p-10', 11: 'p-11', 12: 'p-12'
};
const JUSTIFY_CLASS: Record<FlexJustify, string> = {
	start: 'justify-start', center: 'justify-center', end: 'justify-end',
	between: 'justify-between', around: 'justify-around', evenly: 'justify-evenly'
};
const ALIGN_CLASS: Record<FlexAlign, string> = {
	start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch'
};

/** Deterministic Tailwind class string for a group — used by designer AND runner. */
export function flexClasses(flex: FlexProps): string {
	const clamp = (n: number) => Math.max(0, Math.min(12, Math.round(n)));
	return [
		'flex',
		flex.direction === 'row' ? 'flex-row' : 'flex-col',
		JUSTIFY_CLASS[flex.justify],
		ALIGN_CLASS[flex.align],
		GAP_CLASS[clamp(flex.gap)] ?? 'gap-2',
		// Responsive by default: a ROW always wraps so its children reflow onto the
		// next line instead of overflowing / squishing on a narrow viewport (phones,
		// split panes). This is render-time, so it applies to every design — existing
		// ones included — without a data migration. Columns still honor the flag.
		flex.direction === 'row' || flex.wrap ? 'flex-wrap' : 'flex-nowrap',
		PAD_CLASS[clamp(flex.padding)] ?? 'p-3'
	].join(' ');
}

/* ── Element wiring ──────────────────────────────────────────────────── */
export interface ElementBinding {
	targetKind: BindTargetKind;
	/** Dotted ref: action name, state path ('cart.itemCount'), event, surface id, entity. */
	targetRef: string;
}

export type TransitionTrigger = 'click' | 'hover' | 'change' | 'submit';
export type TransitionEffectKind =
	| 'navigate'
	| 'setState'
	| 'toggleState'
	| 'incrementState'
	| 'createRecord'
	| 'selectRecord'
	| 'print'
	| 'navigateBack'
	| 'call';

export const TRANSITION_TRIGGERS = [
	{ code: 'click', label: 'On click' },
	{ code: 'hover', label: 'On hover' },
	{ code: 'change', label: 'On change' },
	{ code: 'submit', label: 'On submit' }
] as const satisfies readonly Option[];

/** Triggers fired by input events (typing / Enter) rather than pointer events. */
export const INPUT_TRIGGERS: readonly TransitionTrigger[] = ['change', 'submit'];
/** Triggers fired by pointer events on any element. */
export const POINTER_TRIGGERS: readonly TransitionTrigger[] = ['click', 'hover'];
export const TRANSITION_EFFECTS = [
	{ code: 'navigate', label: 'Navigate to screen' },
	{ code: 'setState', label: 'Set state' },
	{ code: 'toggleState', label: 'Toggle state' },
	{ code: 'incrementState', label: 'Increment state' },
	{ code: 'createRecord', label: 'Create record (backend)' },
	{ code: 'selectRecord', label: 'Select record (row → state)' },
	{ code: 'print', label: 'Print to log (console)' },
	{ code: 'navigateBack', label: 'Go back (previous screen)' },
	{ code: 'call', label: 'Call (async operation)' }
] as const satisfies readonly Option[];

/** Effect kinds that read/write a flat state path rather than navigating. */
export const STATE_EFFECT_KINDS: readonly TransitionEffectKind[] = [
	'setState',
	'toggleState',
	'incrementState'
];

/**
 * A simulated async operation — the prototype's stand-in for a real API/IO call,
 * so a flow can feel real (a spinner, then a result or an error) before any
 * backend exists. In the live Runner it runs asynchronously: `loadingPath` goes
 * truthy, then after `latencyMs` the chosen `outcome` resolves (success →
 * `resultPath`=`resultValue`; error → `errorPath`=true) and loading clears.
 * Headless `simulate` resolves the outcome immediately so traces stay
 * deterministic. `endpoint` is a forward-compat hint for the real call.
 */
export interface CallSpec {
	label: string;
	endpoint?: string;
	latencyMs?: number;
	loadingPath?: string;
	outcome?: 'success' | 'error';
	resultPath?: string;
	resultValue?: string;
	errorPath?: string;
}

export interface TransitionEffect {
	kind: TransitionEffectKind;
	/**
	 * navigate → screenId; state effects → the state path to write;
	 * `selectRecord` → the state path PREFIX the clicked row is written under
	 * (`selected.zap` ⇒ `selected.zap.name`, `selected.zap.id`, …).
	 */
	target: string;
	/**
	 * setState → literal value to assign; incrementState → step (default 1);
	 * unused otherwise. Inside a LIST ROW TEMPLATE a `{Field}` token resolves
	 * against the clicked row, so one authored row wires N per-row actions
	 * ("select this app" = setState `catalog.appId` = `{id}`).
	 */
	value?: string;
	/** Config for a `call` effect (the simulated async operation). */
	call?: CallSpec;
	/**
	 * createRecord → explicit capture map, collection field name → input label,
	 * for when labels can't equal field names ("Zap name" → "name"). Fields
	 * absent from the map still match inputs by name (the default rule).
	 */
	fieldMap?: Record<string, string>;
}

export interface ElementTransition {
	readonly id: string;
	trigger: TransitionTrigger;
	effect: TransitionEffect;
	/**
	 * Optional guard: the effect runs only when this run-state condition holds —
	 * so a flow can branch ("navigate to Dashboard WHEN authed, else Login"). Two
	 * transitions on the same trigger with complementary guards model if/else.
	 * Absent ⇒ always runs (back-compat).
	 */
	when?: VisibilityCondition;
}

export type AssertOp = 'eq' | 'neq' | 'truthy' | 'falsy';
export const ASSERT_OPS = [
	{ code: 'eq', label: '= equals' },
	{ code: 'neq', label: '≠ not equals' },
	{ code: 'truthy', label: 'is truthy' },
	{ code: 'falsy', label: 'is falsy' }
] as const satisfies readonly Option[];

export interface ScenarioAssertion {
	readonly id: string;
	path: string;
	op: AssertOp;
	expected?: string;
	message: string;
}

export type ScenarioWhen = TransitionTrigger;

export interface ElementScenario {
	readonly id: string;
	title: string;
	given: ScenarioAssertion[];
	whenTrigger: ScenarioWhen;
	then: ScenarioAssertion[];
}

export type GateMode = 'visible' | 'enabled';
export const GATE_MODES = [
	{ code: 'visible', label: 'Visible to' },
	{ code: 'enabled', label: 'Enabled for' }
] as const satisfies readonly Option[];

export interface PersonaGate {
	/** Step-03 role ids this gate applies to. */
	personaIds: string[];
	mode: GateMode;
	/** true = only listed personas; false = listed personas excluded. */
	allow: boolean;
}

/* ── State-driven visibility (orthogonal to persona gating) ──────────── */
/**
 * Show an element only while a run-state condition holds. Evaluated live in Run
 * mode after every interaction and independent of who the run is performed as —
 * both this and any PersonaGate must pass for the element to render. This is
 * what lets a setState/toggle effect actually drive the UI (e.g. reveal a
 * success banner once `submitted` is truthy).
 */
export interface VisibilityCondition {
	/** State path to read (flat, dotted — same space as state seeds/bindings). */
	path: string;
	op: AssertOp;
	/** Comparison value for eq/neq (ignored by truthy/falsy). */
	expected?: string;
}

export function createVisibilityCondition(): VisibilityCondition {
	return { path: '', op: 'truthy' };
}

/* ── Inputs: type + validation ───────────────────────────────────────── */
export type InputType =
	| 'text'
	| 'email'
	| 'password'
	| 'number'
	| 'tel'
	| 'url'
	| 'date'
	| 'time';
export const INPUT_TYPES = [
	{ code: 'text', label: 'Text' },
	{ code: 'email', label: 'Email' },
	{ code: 'password', label: 'Password' },
	{ code: 'number', label: 'Number' },
	{ code: 'tel', label: 'Phone' },
	{ code: 'url', label: 'URL' },
	{ code: 'date', label: 'Date' },
	{ code: 'time', label: 'Time' }
] as const satisfies readonly Option[];

/** Unspaghettit state-definition type implied by an input type (for the mirror). */
export function unspaStateType(t: InputType | undefined): string {
	switch (t) {
		case 'number':
			return 'number';
		case 'date':
			return 'date';
		case 'time':
			return 'time';
		default:
			return 'string';
	}
}

/**
 * Unspaghettit state type for a VALUE FIELD — the element kind decides first (a
 * checkbox is boolean whatever its input type, a select with literal options is
 * an enum of exactly those options), then the input type.
 */
export function fieldStateType(node: BuilderElementNode): string {
	if (node.elementKind === 'checkbox') return 'boolean';
	if (fieldEnumValues(node)) return 'enum';
	return unspaStateType(node.wiring.inputType);
}

/**
 * The closed set of values a VALUE FIELD can hold, when it has one: a select
 * whose choices are authored literally. A select fed from a collection offers
 * whatever the rows hold, so it stays a plain string. This is what lets a
 * select bound to an enum state project as an enum (the engine types the state
 * bus once; a string writer into it is a type violation), and lets the kernel
 * check the offered values against the state's.
 */
export function fieldEnumValues(node: BuilderElementNode): string[] | undefined {
	if (node.elementKind !== 'select' || node.optionsFrom) return undefined;
	const values = [...new Set((node.options ?? []).map((o) => String(o)).filter((o) => o.trim() !== ''))];
	return values.length > 0 ? values : undefined;
}

export type ValidationKind = 'required' | 'email' | 'min' | 'max' | 'pattern';
export const VALIDATION_KINDS = [
	{ code: 'required', label: 'Required' },
	{ code: 'email', label: 'Valid email' },
	{ code: 'min', label: 'Min length' },
	{ code: 'max', label: 'Max length' },
	{ code: 'pattern', label: 'Matches pattern' }
] as const satisfies readonly Option[];

/** A validation rule on an input. `param` = length for min/max, regex source for pattern. */
export interface ValidationRule {
	readonly id: string;
	kind: ValidationKind;
	param?: string;
	description: string;
	message: string;
}

export function validationDescription(
	kind: ValidationKind,
	param?: string,
	fieldName = 'This field'
): string {
	const name = fieldName.trim() || 'This field';
	if (kind === 'required') return `${name} must be filled before the user can continue.`;
	if (kind === 'email') return `${name} must contain a valid email address.`;
	if (kind === 'min') return `${name} must contain at least ${param || '3'} characters.`;
	if (kind === 'max') return `${name} must contain at most ${param || '3'} characters.`;
	return `${name} must match the expected format${param ? ` (${param})` : ''}.`;
}

export interface ElementWiring {
	binding: ElementBinding | null;
	transitions: ElementTransition[];
	scenarios: ElementScenario[];
	gate: PersonaGate | null;
	/** Run-mode: render only while this state condition holds (absent/null = always). */
	visibleWhen?: VisibilityCondition | null;
	/** Input rendering type (inputs only). */
	inputType?: InputType;
	/** Live validation rules applied to this input's value. */
	validations: ValidationRule[];
	/** Buttons only: block the click (no transitions) while its screen has invalid inputs. */
	requireValid?: boolean;
}

export function emptyWiring(): ElementWiring {
	return { binding: null, transitions: [], scenarios: [], gate: null, validations: [] };
}

export function createValidation(kind: ValidationKind = 'required'): ValidationRule {
	const def: Record<ValidationKind, string> = {
		required: 'This field is required.',
		email: 'Enter a valid email address.',
		min: 'Too short.',
		max: 'Too long.',
		pattern: 'Invalid format.'
	};
	const param = kind === 'min' || kind === 'max' ? '3' : undefined;
	return { id: newId(), kind, param, description: validationDescription(kind, param), message: def[kind] };
}

/**
 * The state path an input writes its typed value to: an explicit `state` binding
 * if present, else a synthetic per-node field path so every input is still live.
 *
 * The synthetic path must be a valid engine state path — dotted segments of
 * `[A-Za-z_][A-Za-z0-9_]*` (see unspaghettit's StatePath). Node ids are UUIDs
 * or `bld-*` slugs that carry hyphens and may start with a digit, so the raw
 * `field.<id>` form is rejected by the behavior engine (poisoning get_spec_gaps
 * and verify). Normalize the id into a safe identifier segment; runtime state is
 * a plain object, so underscores read/write identically to hyphens.
 */
export function fieldStatePath(node: BuilderElementNode, rowKey?: string | null): string {
	const base =
		node.wiring.binding?.targetKind === 'state' && node.wiring.binding.targetRef
			? node.wiring.binding.targetRef
			: `field.${toStatePathSegment(node.id)}`;
	// Inside a list row template one authored field is rendered once per row, so
	// each row needs its OWN value (per-row checkboxes, inline edits). Suffixing
	// the row key keeps them independent while reusing a single authored element.
	return rowKey ? `${base}.${toStatePathSegment(rowKey)}` : base;
}

/**
 * Stable identity of a bound row, used to key per-row field state and to report
 * which row an interaction came from. Prefers the record's own id-ish field so a
 * value survives filtering/reordering; falls back to the render index.
 */
export function rowStateKey(row: Record<string, unknown> | null | undefined, index: number): string {
	if (row) {
		for (const key of Object.keys(row)) {
			if (key.trim().toLowerCase() !== 'id') continue;
			const v = row[key];
			if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
		}
	}
	return `r${index}`;
}

/** Coerce an arbitrary id into a valid state-path segment (`[A-Za-z_][A-Za-z0-9_]*`). */
function toStatePathSegment(id: string): string {
	const safe = id.replace(/[^A-Za-z0-9_]/g, '_');
	return /^[A-Za-z_]/.test(safe) ? safe : `f_${safe}`;
}

/* ── Nodes ───────────────────────────────────────────────────────────── */
export type BuilderNodeKind = 'group' | 'element';

interface BuilderNodeBase {
	readonly id: string;
	surfaceId: string; // = LibraryScreen.id
	parentId: string | null; // null only for a screen root
	kind: BuilderNodeKind;
}

export interface BuilderGroupNode extends BuilderNodeBase {
	kind: 'group';
	label: string;
	childIds: string[];
	flex: FlexProps;
	/**
	 * Optional visual overrides for the whole group (same vocabulary as elements).
	 * This is what makes a dark sidebar, a colored hero band or a tinted banner
	 * expressible — `card` only ever renders the one neutral surface style.
	 */
	appearance?: ElementAppearance;
	/** Presentation beyond flex — modal/overlay or tabs. Absent ⇒ 'inline'. */
	presentation?: GroupPresentation;
	/** For `tabs`: the state path holding the active panel index (default 0). */
	tabsKey?: string;
	/**
	 * Reuse: render the tree of another surface (a LibraryComponent authored once)
	 * in place of / around this group's own children — define a nav bar, card or
	 * list row once and reference it everywhere. The component's tree lives under
	 * `screenRoots[componentId]`, edited like any surface.
	 */
	componentId?: string | null;
	/**
	 * State-driven visibility for the whole group (same engine as element
	 * `visibleWhen`). This is what opens/closes an `overlay`: toggle a state to
	 * `truthy` to show the modal, flip it back to dismiss.
	 */
	visibleWhen?: VisibilityCondition;
}

export interface BuilderElementNode extends BuilderNodeBase {
	kind: 'element';
	elementKind: BuilderElementKind;
	label: string;
	/** Exact engine action id when this element was materialized from Unspa. */
	kernelActionId?: string;
	/**
	 * Optional visual overrides for one element. The simulator keeps these as
	 * structured values (rather than arbitrary CSS) so the visual editor, MCP,
	 * renderer and future exporters share one safe, portable vocabulary.
	 */
	appearance?: ElementAppearance;
	/** Image content. Kept separate from appearance because it is semantic data. */
	media?: ElementMedia;
	/** Free-form variant (e.g. button emphasis, or a `status` element's StatusVariant). */
	variant?: string;
	/**
	 * For a `list`: the LibraryComponent whose tree is the ROW TEMPLATE, rendered
	 * once per bound row with that row's fields in scope (a label `{Name}` resolves
	 * to the row's Name). Absent ⇒ the built-in compact row. The component tree
	 * lives under `screenRoots[componentId]`, like any reusable surface.
	 */
	componentId?: string | null;
	/**
	 * For a `list`: a state path holding a search query. When set, the list shows
	 * only rows that match the live value at this path (case-insensitive substring
	 * across the row's fields) — bind an input to the same path for real search.
	 */
	filterStatePath?: string;
	/**
	 * For a `list`: how the bound rows are laid out. `stack` (default) is the
	 * classic full-width table-ish list; `grid` and `cards` wrap the row template
	 * into columns, which is what a catalog, a pricing table or a dashboard of
	 * tiles actually looks like. `cards` additionally boxes each row.
	 */
	rowLayout?: ListRowLayout;
	/** For a `grid`/`cards` list: columns on a wide viewport (1–4, default 3). */
	rowColumns?: number;
	/** For a `select`: the choices offered (ignored when `optionsFrom` resolves). */
	options?: string[];
	/**
	 * For a `select`: take the choices from a backend collection's field, so the
	 * dropdown stays in sync with the simulated data ("pick a connection" lists the
	 * Connection rows). Falls back to `options` when the collection is missing.
	 */
	optionsFrom?: SelectOptionSource;
	wiring: ElementWiring;
}

/** How a bound `list` arranges its rows. */
export type ListRowLayout = 'stack' | 'grid' | 'cards';
export const LIST_ROW_LAYOUTS = [
	{ code: 'stack', label: 'Stack (rows)' },
	{ code: 'grid', label: 'Grid (columns)' },
	{ code: 'cards', label: 'Cards' }
] as const satisfies readonly Option[];

/** A `select`'s choices, read live from a backend collection's field values. */
export interface SelectOptionSource {
	/** Collection name (same vocabulary as a list's entity binding). */
	collection: string;
	/** Field whose values become the options. */
	field: string;
	/**
	 * Only offer rows whose `filterField` equals the live value at `filterPath` —
	 * this is what makes dependent dropdowns real ("events of the chosen app",
	 * "connections for that app"). Absent ⇒ every row.
	 */
	filterField?: string;
	filterPath?: string;
}

export type BuilderNode = BuilderGroupNode | BuilderElementNode;

export type ElementWidth = 'auto' | 'full' | 'fit';
export type ElementAlign = 'auto' | 'start' | 'center' | 'end' | 'stretch';
export type ElementTextAlign = 'left' | 'center' | 'right';
export type ElementImageFit = 'cover' | 'contain' | 'fill';

export interface ElementAppearance {
	width?: ElementWidth;
	/** Hard pixel cap on the element's width — needed to size an image/thumbnail
	 *  (e.g. a receipt in a list row), which otherwise fills its flex column. */
	maxWidth?: number;
	align?: ElementAlign;
	textAlign?: ElementTextAlign;
	fontSize?: number;
	fontWeight?: number;
	color?: string;
	background?: string;
	/** Linear-gradient background (brand bars, active nav). Wins over `background`
	 *  when both are set, so a plain color can stay as the reduced-fidelity
	 *  fallback authored before gradients existed. */
	gradient?: { from: string; to: string; angle?: number };
	borderColor?: string;
	borderWidth?: number;
	radius?: number;
	paddingX?: number;
	paddingY?: number;
	shadow?: boolean;
	opacity?: number;
}

export interface ElementMedia {
	/**
	 * Local path, bundled asset, data URI, or explicitly-authored remote URL.
	 * No URL is populated by default, preserving the appliance's zero-egress mode.
	 */
	src: string;
	alt: string;
	fit: ElementImageFit;
	aspectRatio?: string;
}

/* ── The persisted builder document ──────────────────────────────────── */
export interface BuilderStateSeed {
	path: string;
	value: string;
}

/** Reserved surface ids for the shared app shell (header / footer trees). */
export const HEADER_SURFACE_ID = '__app_header__';
export const FOOTER_SURFACE_ID = '__app_footer__';

/** Shared chrome wrapped around every screen in Run mode — like a web app layout. */
export interface AppShell {
	headerEnabled: boolean;
	footerEnabled: boolean;
}

export interface ExperienceBuilder {
	nodes: Record<string, BuilderNode>;
	/** screenId (or templateId / shell surface id) → root group node id. */
	screenRoots: Record<string, string>;
	/** Screen the run starts from. */
	entryScreenId: string | null;
	stateSeeds: BuilderStateSeed[];
	/** Simulator design system — skins the canvas + Run-mode player. */
	theme: SimTheme;
	/** Fake backend — named collections the simulator reads (lists) and writes. */
	collections: BackendCollection[];
	/** Shared app chrome (header/footer trees) wrapped around every run screen. */
	shell: AppShell;
}

export function emptyShell(): AppShell {
	return { headerEnabled: false, footerEnabled: false };
}

export function emptyBuilder(): ExperienceBuilder {
	return {
		nodes: {},
		screenRoots: {},
		entryScreenId: null,
		stateSeeds: [],
		theme: defaultSimTheme(),
		collections: [],
		shell: emptyShell()
	};
}

/* ── Creators ────────────────────────────────────────────────────────── */
function newId(): string {
	return crypto.randomUUID();
}

export function createGroupNode(surfaceId: string, parentId: string | null, label = 'Group'): BuilderGroupNode {
	return { id: newId(), surfaceId, parentId, kind: 'group', label, childIds: [], flex: defaultFlexProps() };
}

export function createElementNode(
	surfaceId: string,
	parentId: string,
	kind: BuilderElementKind
): BuilderElementNode {
	const defaultLabel = BUILDER_ELEMENT_KINDS.find((k) => k.code === kind)?.label ?? 'Element';
	// Value fields render their label as the caption/placeholder, so a generic
	// "Input"/"Text area" default would read as real copy — start them blank.
	const label = kind === 'input' || kind === 'textarea' ? '' : defaultLabel;
	return { id: newId(), surfaceId, parentId, kind: 'element', elementKind: kind, label, wiring: emptyWiring() };
}

function cloneNodeData(node: BuilderNode, id: string, surfaceId: string, parentId: string | null): BuilderNode {
	if (node.kind === 'group') {
		return {
			...structuredClone(node),
			id,
			surfaceId,
			parentId,
			childIds: []
		};
	}
	return {
		...structuredClone(node),
		id,
		surfaceId,
		parentId: parentId as string
	};
}

/* ── Selectors (pure) ────────────────────────────────────────────────── */
export function screenRootId(b: ExperienceBuilder, screenId: string): string | null {
	return b.screenRoots[screenId] ?? null;
}

export function group(b: ExperienceBuilder, id: string): BuilderGroupNode | null {
	const n = b.nodes[id];
	return n && n.kind === 'group' ? n : null;
}

/** Resolved child nodes of a group, in order. */
export function childNodes(b: ExperienceBuilder, groupId: string): BuilderNode[] {
	const g = group(b, groupId);
	if (!g) return [];
	return g.childIds.map((id) => b.nodes[id]).filter((n): n is BuilderNode => Boolean(n));
}

/** All descendant node ids of a node (excluding itself). */
export function descendantIds(b: ExperienceBuilder, nodeId: string): string[] {
	const out: string[] = [];
	const walk = (id: string) => {
		const n = b.nodes[id];
		if (n?.kind === 'group') for (const c of n.childIds) { out.push(c); walk(c); }
	};
	walk(nodeId);
	return out;
}

export function isDescendant(b: ExperienceBuilder, nodeId: string, maybeAncestorId: string): boolean {
	return descendantIds(b, maybeAncestorId).includes(nodeId);
}

/* ── Reducers (mutate in place; the store wraps each call with #touch) ──── */

/**
 * Ensure ANY surface (screen OR template) has a root group; returns its id.
 * Surface-agnostic: templates own a layout tree in the same builder document,
 * keyed by `screenRoots[templateId]`, with nodes carrying surfaceId = templateId.
 * Does NOT touch `entryScreenId` — that is a screen-only concept (see
 * `ensureScreenRoot`).
 */
export function ensureSurfaceRoot(b: ExperienceBuilder, surfaceId: string, label = 'Screen'): string {
	const existing = b.screenRoots[surfaceId];
	if (existing && group(b, existing)) return existing;
	const root = createGroupNode(surfaceId, null, label);
	b.nodes[root.id] = root;
	b.screenRoots[surfaceId] = root.id;
	return root.id;
}

/** Ensure a screen has a root group; returns its id (creating one if needed). */
export function ensureScreenRoot(b: ExperienceBuilder, screenId: string): string {
	const isNew = !(b.screenRoots[screenId] && group(b, b.screenRoots[screenId]));
	const rootId = ensureSurfaceRoot(b, screenId, 'Screen');
	if (isNew && b.entryScreenId === null) b.entryScreenId = screenId;
	return rootId;
}

/** True when a surface's tree is empty (root absent or root has no children). */
export function isSurfaceEmpty(b: ExperienceBuilder, surfaceId: string): boolean {
	const rootId = b.screenRoots[surfaceId];
	const root = rootId ? group(b, rootId) : null;
	return !root || root.childIds.length === 0;
}

/**
 * Deep-clone the subtree rooted at `sourceRootId` onto a new surface. Every node
 * gets a fresh id and `surfaceId = targetSurfaceId`; flex props and element
 * wiring are structurally cloned so the copy is fully independent. The new nodes
 * are added to `b.nodes`; the returned root has `parentId = null` and is NOT yet
 * registered in `screenRoots` (the caller decides where it attaches).
 */
export function cloneTreeOnto(
	b: ExperienceBuilder,
	sourceRootId: string,
	targetSurfaceId: string
): string | null {
	if (!b.nodes[sourceRootId]) return null;
	const cloneNode = (oldId: string, parentId: string | null): string => {
		const n = b.nodes[oldId];
		const id = newId();
		if (n.kind === 'group') {
			const g = cloneNodeData(n, id, targetSurfaceId, parentId) as BuilderGroupNode;
			b.nodes[id] = g;
			g.childIds = n.childIds.filter((cid) => b.nodes[cid]).map((cid) => cloneNode(cid, id));
		} else {
			const e = cloneNodeData(n, id, targetSurfaceId, parentId) as BuilderElementNode;
			b.nodes[id] = e;
		}
		return id;
	};
	return cloneNode(sourceRootId, null);
}

/**
 * Duplicate a non-root node immediately after itself. Groups retain their full
 * subtree and every node receives a fresh id, so edits never alias the source.
 */
export function duplicateNode(b: ExperienceBuilder, nodeId: string): string | null {
	const source = b.nodes[nodeId];
	if (!source?.parentId) return null;
	const parent = group(b, source.parentId);
	if (!parent) return null;
	const insertAt = parent.childIds.indexOf(nodeId) + 1;

	const clone = (oldId: string, parentId: string): string => {
		const old = b.nodes[oldId];
		const id = newId();
		const copy = cloneNodeData(old, id, old.surfaceId, parentId);
		b.nodes[id] = copy;
		if (copy.kind === 'group' && old.kind === 'group') {
			copy.childIds = old.childIds.filter((cid) => b.nodes[cid]).map((cid) => clone(cid, id));
		}
		return id;
	};

	const duplicateId = clone(nodeId, source.parentId);
	parent.childIds.splice(insertAt, 0, duplicateId);
	return duplicateId;
}

/**
 * Apply a template's layout to a screen: replace the screen's whole tree with a
 * fresh deep clone of the template's tree. The screen keeps its own id/identity;
 * only its layout nodes are swapped. Returns false if the template has no tree.
 */
export function applyTemplateToScreen(
	b: ExperienceBuilder,
	templateId: string,
	screenId: string
): boolean {
	const tplRoot = b.screenRoots[templateId];
	if (!tplRoot || !group(b, tplRoot)) return false;
	// Tear down the screen's existing tree (root + every descendant).
	const oldRoot = b.screenRoots[screenId];
	if (oldRoot && b.nodes[oldRoot]) {
		for (const id of descendantIds(b, oldRoot)) delete b.nodes[id];
		delete b.nodes[oldRoot];
	}
	const newRoot = cloneTreeOnto(b, tplRoot, screenId);
	if (!newRoot) return false;
	b.screenRoots[screenId] = newRoot;
	return true;
}

export function addNode(b: ExperienceBuilder, node: BuilderNode, index?: number): void {
	b.nodes[node.id] = node;
	if (node.parentId) {
		const parent = group(b, node.parentId);
		if (parent) {
			if (index === undefined || index < 0 || index > parent.childIds.length)
				parent.childIds.push(node.id);
			else parent.childIds.splice(index, 0, node.id);
		}
	}
}

/** Move a node under a new group at an index. Guards cycles / element-parents / root. */
export function moveNode(b: ExperienceBuilder, nodeId: string, newParentId: string, index: number): boolean {
	const node = b.nodes[nodeId];
	const newParent = group(b, newParentId);
	if (!node || !newParent || node.parentId === null) return false; // can't move a root
	if (nodeId === newParentId || isDescendant(b, newParentId, nodeId)) return false; // cycle
	// detach from old parent
	if (node.parentId) {
		const old = group(b, node.parentId);
		if (old) old.childIds = old.childIds.filter((id) => id !== nodeId);
	}
	node.parentId = newParentId;
	const clamped = Math.max(0, Math.min(index, newParent.childIds.length));
	newParent.childIds.splice(clamped, 0, nodeId);
	return true;
}

export function reorderChild(b: ExperienceBuilder, parentId: string, from: number, to: number): void {
	const parent = group(b, parentId);
	if (!parent) return;
	const ids = parent.childIds;
	if (from < 0 || from >= ids.length || to < 0 || to >= ids.length) return;
	const [moved] = ids.splice(from, 1);
	ids.splice(to, 0, moved);
}

/** Remove a node and its whole subtree. */
export function removeNode(b: ExperienceBuilder, nodeId: string): void {
	const node = b.nodes[nodeId];
	if (!node || node.parentId === null) return; // never remove a root here
	for (const id of descendantIds(b, nodeId)) delete b.nodes[id];
	const parent = node.parentId ? group(b, node.parentId) : null;
	if (parent) parent.childIds = parent.childIds.filter((id) => id !== nodeId);
	delete b.nodes[nodeId];
}

export function setFlexProps(b: ExperienceBuilder, groupId: string, patch: Partial<FlexProps>): void {
	const g = group(b, groupId);
	if (g) g.flex = { ...g.flex, ...patch };
}

export function setElementWiring(b: ExperienceBuilder, nodeId: string, patch: Partial<ElementWiring>): void {
	const n = b.nodes[nodeId];
	if (n?.kind === 'element') n.wiring = { ...n.wiring, ...patch };
}

export function createTransition(trigger: TransitionTrigger = 'click'): ElementTransition {
	return { id: newId(), trigger, effect: { kind: 'navigate', target: '' } };
}

/** Default trigger for a new transition on an element of this kind. */
export function defaultTriggerFor(kind: BuilderElementKind): TransitionTrigger {
	return isFieldBuilderKind(kind) ? 'change' : 'click';
}

/** Triggers offered for an element of this kind (input events vs pointer events). */
export function triggersFor(kind: BuilderElementKind): readonly TransitionTrigger[] {
	return isFieldBuilderKind(kind) ? INPUT_TRIGGERS : POINTER_TRIGGERS;
}

/** True when the node has any transition or scenario wired to fire on this trigger. */
export function hasInteractionFor(node: BuilderElementNode, trigger: TransitionTrigger): boolean {
	return (
		node.wiring.transitions.some((t) => t.trigger === trigger) ||
		node.wiring.scenarios.some((s) => s.whenTrigger === trigger)
	);
}

/** True when the element carries an action/event binding (a click bumps its signal). */
export function hasIntentfulBinding(node: BuilderElementNode): boolean {
	const b = node.wiring.binding;
	return !!b?.targetRef && (b.targetKind === 'action' || b.targetKind === 'event');
}

/**
 * True when Run mode must offer this element as a CLICK TARGET. Inherently
 * interactive kinds always are; any other kind (a pill badge, an icon, an image,
 * a stat tile) becomes one the moment it carries click behavior: a click
 * transition or scenario (a `submit` scenario also runs on click, mirroring
 * `fireInteraction`), or an action/event binding (an intentful click bumps its
 * signal counter). Keep in sync with `fireInteraction` or wired behavior turns
 * unreachable in the simulator.
 */
export function isRunClickable(node: BuilderElementNode): boolean {
	if (isInteractiveBuilderKind(node.elementKind) && node.elementKind !== 'input') return true;
	if (hasInteractionFor(node, 'click')) return true;
	if (node.wiring.scenarios.some((s) => s.whenTrigger === 'submit')) return true;
	return hasIntentfulBinding(node);
}

/**
 * True when the element carries ANY authored behavior worth surfacing on the
 * design canvas (transitions, scenarios, or an action/event binding). Display
 * bindings (state/entity) are data, not behavior, so they don't count.
 */
export function isWiredElement(node: BuilderElementNode): boolean {
	return (
		node.wiring.transitions.length > 0 ||
		node.wiring.scenarios.length > 0 ||
		hasIntentfulBinding(node)
	);
}

export function createScenario(): ElementScenario {
	return { id: newId(), title: 'Scenario', given: [], whenTrigger: 'click', then: [] };
}

export function createAssertion(): ScenarioAssertion {
	return { id: newId(), path: '', op: 'truthy', message: '' };
}

/* ── Back-compat: import a legacy prototype into the builder ──────────── */
/**
 * One screen per prototype screen, each a root group laid out as a column; each
 * prototype element becomes an element node. A legacy navigate `onSuccess`
 * handler becomes a click→navigate transition (target = the legacy screen id;
 * callers may remap to a real LibraryScreen id afterwards).
 */
export function migratePrototypeToBuilder(p: ExperiencePrototype): ExperienceBuilder {
	const b = emptyBuilder();
	for (const screen of p.screens) {
		const rootId = ensureScreenRoot(b, screen.id);
		const els = p.elements
			.filter((e) => e.screenId === screen.id)
			.sort((a, c) => a.order - c.order);
		for (const el of els) {
			const kind: BuilderElementKind = (BUILDER_ELEMENT_KINDS.some((k) => k.code === el.kind)
				? el.kind
				: 'text') as BuilderElementKind;
			const node = createElementNode(screen.id, rootId, kind);
			node.label = el.label;
			if (el.bindTargetKind)
				node.wiring.binding = { targetKind: el.bindTargetKind, targetRef: el.bindTargetRef };
			if (el.onSuccess?.kind === 'navigate' && el.onSuccess.value)
				node.wiring.transitions.push({
					id: newId(),
					trigger: 'click',
					effect: { kind: 'navigate', target: el.onSuccess.value }
				});
			addNode(b, node);
		}
	}
	b.entryScreenId = p.entryScreenId ?? p.screens[0]?.id ?? null;
	return b;
}
