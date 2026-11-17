/**
 * Anti-corruption coercion for the Experience Builder sub-document. Tolerates
 * partial/garbled payloads: validates node shapes, fills wiring/flex defaults,
 * drops dangling child references and orphan nodes, and synthesizes a screen
 * root group when one is missing. If no builder is present but a legacy
 * prototype carries content, it is migrated in.
 */
import {
	BUILDER_ELEMENT_KINDS,
	coerceBackend,
	coerceSimTheme,
	defaultFlexProps,
	emptyBuilder,
	emptyWiring,
	migratePrototypeToBuilder,
	validationDescription,
	type BuilderElementNode,
	type BuilderGroupNode,
	type BuilderNode,
	type CallSpec,
	type ElementBinding,
	type ElementAppearance,
	type ElementMedia,
	type ElementScenario,
	type ElementTransition,
	type ElementWiring,
	type ExperienceBuilder,
	type ExperiencePrototype,
	type FlexProps,
	type InputType,
	type PersonaGate,
	type ScenarioAssertion,
	type SelectOptionSource,
	type TransitionEffect,
	type ValidationRule,
	type VisibilityCondition
} from '$domain/experience';
import { parseStableRecords } from './parse-stable-records';

const ASSERT_OP_CODES = ['eq', 'neq', 'truthy', 'falsy'];
const EFFECT_CODES = ['navigate', 'setState', 'toggleState', 'incrementState', 'createRecord', 'selectRecord', 'print', 'navigateBack', 'call'];
const TRIGGER_CODES = ['click', 'hover', 'change', 'submit'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const isElementKind = (v: unknown): boolean =>
	typeof v === 'string' && BUILDER_ELEMENT_KINDS.some((k) => k.code === v);
const color = (v: unknown): string | undefined =>
	typeof v === 'string' &&
	(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v) ||
		/^var\(--[a-zA-Z0-9-_]+\)$/.test(v))
		? v
		: undefined;
const finite = (v: unknown, min: number, max: number): number | undefined =>
	typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : undefined;

function coerceAppearance(v: unknown): ElementAppearance | undefined {
	if (!isObj(v)) return undefined;
	const out: ElementAppearance = {};
	if (['auto', 'full', 'fit'].includes(v.width as string))
		out.width = v.width as ElementAppearance['width'];
	if (['auto', 'start', 'center', 'end', 'stretch'].includes(v.align as string))
		out.align = v.align as ElementAppearance['align'];
	if (['left', 'center', 'right'].includes(v.textAlign as string))
		out.textAlign = v.textAlign as ElementAppearance['textAlign'];
	out.fontSize = finite(v.fontSize, 8, 96);
	out.fontWeight = finite(v.fontWeight, 100, 900);
	out.color = color(v.color);
	out.background = color(v.background);
	out.borderColor = color(v.borderColor);
	out.borderWidth = finite(v.borderWidth, 0, 12);
	out.radius = finite(v.radius, 0, 999);
	out.maxWidth = finite(v.maxWidth, 8, 2000);
	out.paddingX = finite(v.paddingX, 0, 96);
	out.paddingY = finite(v.paddingY, 0, 96);
	if (typeof v.shadow === 'boolean') out.shadow = v.shadow;
	out.opacity = finite(v.opacity, 0, 1);
	// The renderer paints `gradient` (wins over `background`), so dropping it here
	// silently downgraded every gradient bar to its flat fallback. Both stops must
	// be valid colors; a half-authored gradient stays out.
	if (isObj(v.gradient)) {
		const from = color(v.gradient.from);
		const to = color(v.gradient.to);
		const angle = finite(v.gradient.angle, 0, 360);
		if (from && to) out.gradient = { from, to, ...(angle !== undefined ? { angle } : {}) };
	}
	return Object.values(out).some((value) => value !== undefined) ? out : undefined;
}

function coerceMedia(v: unknown): ElementMedia | undefined {
	if (!isObj(v) || typeof v.src !== 'string' || !v.src.trim()) return undefined;
	return {
		src: v.src.trim().slice(0, 4096),
		alt: str(v.alt).slice(0, 500),
		fit: ['cover', 'contain', 'fill'].includes(v.fit as string)
			? (v.fit as ElementMedia['fit'])
			: 'cover',
		...(typeof v.aspectRatio === 'string' && /^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(v.aspectRatio)
			? { aspectRatio: v.aspectRatio }
			: {})
	};
}

function coerceFlex(v: unknown): FlexProps {
	const d = defaultFlexProps();
	if (!isObj(v)) return d;
	const dir = v.direction === 'row' || v.direction === 'col' ? v.direction : d.direction;
	const justify = ['start', 'center', 'end', 'between', 'around', 'evenly'].includes(
		v.justify as string
	)
		? (v.justify as FlexProps['justify'])
		: d.justify;
	const align = ['start', 'center', 'end', 'stretch'].includes(v.align as string)
		? (v.align as FlexProps['align'])
		: d.align;
	const num = (n: unknown, f: number) =>
		typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(12, Math.round(n))) : f;
	const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
	const background = typeof v.background === 'string' && HEX.test(v.background) ? v.background : undefined;
	return {
		direction: dir,
		justify,
		align,
		gap: num(v.gap, d.gap),
		wrap: typeof v.wrap === 'boolean' ? v.wrap : d.wrap,
		padding: num(v.padding, d.padding),
		card: typeof v.card === 'boolean' ? v.card : d.card,
		...(background ? { background } : {}),
		maxWidth: ['none', 'sm', 'md', 'lg', 'xl'].includes(v.maxWidth as string)
			? (v.maxWidth as FlexProps['maxWidth'])
			: d.maxWidth
	};
}

function coerceBinding(v: unknown): ElementBinding | null {
	if (!isObj(v)) return null;
	const kinds = ['action', 'state', 'event', 'surface', 'entity'];
	if (!kinds.includes(v.targetKind as string)) return null;
	return { targetKind: v.targetKind as ElementBinding['targetKind'], targetRef: str(v.targetRef) };
}

function coerceTransitions(v: unknown): ElementTransition[] {
	return parseStableRecords(v, 'transition', (t, id) => {
		const when = coerceVisibility(t.when);
		return {
			id,
			trigger: TRIGGER_CODES.includes(t.trigger as string)
				? (t.trigger as ElementTransition['trigger'])
				: 'click',
			effect: isObj(t.effect)
				? {
						kind: EFFECT_CODES.includes(t.effect.kind as string)
							? (t.effect.kind as TransitionEffect['kind'])
							: 'navigate',
						target: str(t.effect.target),
						value: typeof t.effect.value === 'string' ? t.effect.value : undefined,
						...(t.effect.kind === 'call' && isObj(t.effect.call)
							? { call: coerceCall(t.effect.call) }
							: {}),
						...(t.effect.kind === 'createRecord' && isObj(t.effect.fieldMap)
							? { fieldMap: coerceFieldMap(t.effect.fieldMap) }
							: {})
					}
				: { kind: 'navigate', target: '' },
			// Optional branch guard — only attach when present (back-compat shape).
			...(when ? { when } : {})
		};
	});
}

/** createRecord capture map: keep only string→string entries (field name → input label). */
function coerceFieldMap(v: Record<string, unknown>): Record<string, string> {
	return Object.fromEntries(
		Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== '')
	);
}

function coerceCall(v: Record<string, unknown>): CallSpec {
	const latency =
		typeof v.latencyMs === 'number' && Number.isFinite(v.latencyMs)
			? Math.max(0, Math.round(v.latencyMs))
			: undefined;
	return {
		label: str(v.label, 'Operation'),
		endpoint: typeof v.endpoint === 'string' ? v.endpoint : undefined,
		latencyMs: latency,
		loadingPath: typeof v.loadingPath === 'string' ? v.loadingPath : undefined,
		outcome: v.outcome === 'error' ? 'error' : 'success',
		resultPath: typeof v.resultPath === 'string' ? v.resultPath : undefined,
		resultValue: typeof v.resultValue === 'string' ? v.resultValue : undefined,
		errorPath: typeof v.errorPath === 'string' ? v.errorPath : undefined
	};
}

function coerceAssertions(v: unknown): ScenarioAssertion[] {
	return parseStableRecords(v, 'assertion', (a, id) => ({
		id,
		path: str(a.path),
		op: ASSERT_OP_CODES.includes(a.op as string) ? (a.op as ScenarioAssertion['op']) : 'truthy',
		expected: typeof a.expected === 'string' ? a.expected : undefined,
		message: str(a.message)
	}));
}

function coerceVisibility(v: unknown): VisibilityCondition | null {
	if (!isObj(v) || typeof v.path !== 'string' || !v.path) return null;
	return {
		path: v.path,
		op: ASSERT_OP_CODES.includes(v.op as string) ? (v.op as VisibilityCondition['op']) : 'truthy',
		expected: typeof v.expected === 'string' ? v.expected : undefined
	};
}

function coerceScenarios(v: unknown): ElementScenario[] {
	return parseStableRecords(v, 'scenario', (s, id) => ({
		id,
		title: str(s.title, 'Scenario'),
		given: coerceAssertions(s.given),
		whenTrigger: TRIGGER_CODES.includes(s.whenTrigger as string)
			? (s.whenTrigger as ElementScenario['whenTrigger'])
			: 'click',
		then: coerceAssertions(s.then)
	}));
}

function coerceGate(v: unknown): PersonaGate | null {
	if (!isObj(v)) return null;
	return {
		personaIds: Array.isArray(v.personaIds) ? v.personaIds.filter((x) => typeof x === 'string') : [],
		mode: v.mode === 'enabled' ? 'enabled' : 'visible',
		allow: typeof v.allow === 'boolean' ? v.allow : true
	};
}

function coerceValidations(v: unknown): ValidationRule[] {
	const kinds = ['required', 'email', 'min', 'max', 'pattern'];
	return parseStableRecords(v, 'validation', (r, id) => ({
		id,
		kind: kinds.includes(r.kind as string) ? (r.kind as ValidationRule['kind']) : 'required',
		param: typeof r.param === 'string' ? r.param : undefined,
		description:
			typeof r.description === 'string' && r.description.trim()
				? r.description
				: validationDescription(
						kinds.includes(r.kind as string) ? (r.kind as ValidationRule['kind']) : 'required',
						typeof r.param === 'string' ? r.param : undefined
					),
		message: str(r.message)
	}));
}

function coerceWiring(v: unknown): ElementWiring {
	if (!isObj(v)) return emptyWiring();
	const inputTypes = ['text', 'email', 'password', 'number', 'tel', 'url', 'date', 'time'];
	return {
		binding: coerceBinding(v.binding),
		transitions: coerceTransitions(v.transitions),
		scenarios: coerceScenarios(v.scenarios),
		gate: coerceGate(v.gate),
		visibleWhen: coerceVisibility(v.visibleWhen),
		inputType: inputTypes.includes(v.inputType as string) ? (v.inputType as InputType) : undefined,
		validations: coerceValidations(v.validations),
		requireValid: typeof v.requireValid === 'boolean' ? v.requireValid : undefined
	};
}

/** A select's authored choices: non-empty strings, order preserved, capped. */
function coerceOptions(v: unknown): string[] | undefined {
	if (!Array.isArray(v)) return undefined;
	const out = v
		.filter((x): x is string => typeof x === 'string')
		.map((x) => x.slice(0, 200))
		.filter((x) => x.trim() !== '')
		.slice(0, 100);
	return out.length > 0 ? out : undefined;
}

/** A select's live option source (collection + field, optional dependent filter). */
function coerceOptionSource(v: unknown): SelectOptionSource | undefined {
	if (!isObj(v)) return undefined;
	const collection = str(v.collection).trim();
	const field = str(v.field).trim();
	if (!collection || !field) return undefined;
	const filterField = str(v.filterField).trim();
	const filterPath = str(v.filterPath).trim();
	return {
		collection,
		field,
		// A dependent filter needs BOTH halves to mean anything — drop a half-authored one.
		...(filterField && filterPath ? { filterField, filterPath } : {})
	};
}

function coerceNode(v: unknown): BuilderNode | null {
	if (!isObj(v) || typeof v.id !== 'string' || typeof v.surfaceId !== 'string') return null;
	const parentId = typeof v.parentId === 'string' ? v.parentId : null;
	if (v.kind === 'group') {
		const presentation = ['inline', 'overlay', 'tabs', 'sidebar', 'menu'].includes(
			v.presentation as string
		)
			? (v.presentation as BuilderGroupNode['presentation'])
			: undefined;
		const groupVisible = coerceVisibility(v.visibleWhen);
		const g: BuilderGroupNode = {
			id: v.id,
			surfaceId: v.surfaceId,
			parentId,
			kind: 'group',
			label: str(v.label, 'Group'),
			childIds: Array.isArray(v.childIds) ? v.childIds.filter((x) => typeof x === 'string') : [],
			flex: coerceFlex(v.flex),
			...(coerceAppearance(v.appearance) ? { appearance: coerceAppearance(v.appearance) } : {}),
			...(presentation && presentation !== 'inline' ? { presentation } : {}),
			...(typeof v.tabsKey === 'string' && v.tabsKey ? { tabsKey: v.tabsKey } : {}),
			...(typeof v.componentId === 'string' && v.componentId ? { componentId: v.componentId } : {}),
			...(groupVisible ? { visibleWhen: groupVisible } : {})
		};
		return g;
	}
	if (v.kind === 'element' && isElementKind(v.elementKind)) {
		const e: BuilderElementNode = {
			id: v.id,
			surfaceId: v.surfaceId,
			parentId,
			kind: 'element',
			elementKind: v.elementKind as BuilderElementNode['elementKind'],
			label: str(v.label, 'Element'),
			...(typeof v.kernelActionId === 'string' && v.kernelActionId
				? { kernelActionId: v.kernelActionId }
				: {}),
			...(coerceAppearance(v.appearance) ? { appearance: coerceAppearance(v.appearance) } : {}),
			...(coerceMedia(v.media) ? { media: coerceMedia(v.media) } : {}),
			...(typeof v.variant === 'string' && v.variant ? { variant: v.variant } : {}),
			...(typeof v.componentId === 'string' && v.componentId ? { componentId: v.componentId } : {}),
			...(typeof v.filterStatePath === 'string' && v.filterStatePath
				? { filterStatePath: v.filterStatePath }
				: {}),
			...(['stack', 'grid', 'cards'].includes(v.rowLayout as string)
				? { rowLayout: v.rowLayout as BuilderElementNode['rowLayout'] }
				: {}),
			...(finite(v.rowColumns, 1, 4) ? { rowColumns: Math.round(finite(v.rowColumns, 1, 4) as number) } : {}),
			...(coerceOptions(v.options) ? { options: coerceOptions(v.options) } : {}),
			...(coerceOptionSource(v.optionsFrom) ? { optionsFrom: coerceOptionSource(v.optionsFrom) } : {}),
			wiring: coerceWiring(v.wiring)
		};
		return e;
	}
	return null;
}

export function parseExperienceBuilder(
	rawBuilder: unknown,
	prototype: ExperiencePrototype
): ExperienceBuilder {
	if (!isObj(rawBuilder)) {
		// No builder yet: import legacy prototype content if any.
		if (prototype.screens.length > 0) return migratePrototypeToBuilder(prototype);
		return emptyBuilder();
	}

	const b = emptyBuilder();

	// nodes
	const rawNodes = isObj(rawBuilder.nodes) ? rawBuilder.nodes : {};
	for (const [id, raw] of Object.entries(rawNodes)) {
		const node = coerceNode(raw);
		if (node && node.id === id) b.nodes[id] = node;
	}
	// drop dangling childIds + parent links to missing nodes
	for (const node of Object.values(b.nodes)) {
		if (node.kind === 'group') node.childIds = node.childIds.filter((cid) => b.nodes[cid]);
		if (node.parentId && !b.nodes[node.parentId]) node.parentId = null;
	}

	// screenRoots
	if (isObj(rawBuilder.screenRoots)) {
		for (const [screenId, rootId] of Object.entries(rawBuilder.screenRoots)) {
			if (typeof rootId === 'string' && b.nodes[rootId]?.kind === 'group')
				b.screenRoots[screenId] = rootId;
		}
	}
	// synthesize a root for any screenRoot pointing at a missing node is handled
	// lazily by ensureScreenRoot when the screen is opened; nothing to do here.

	b.entryScreenId = typeof rawBuilder.entryScreenId === 'string' ? rawBuilder.entryScreenId : null;
	b.stateSeeds = Array.isArray(rawBuilder.stateSeeds)
		? rawBuilder.stateSeeds
				.filter(isObj)
				.map((s) => ({ path: str(s.path), value: str(s.value) }))
				.filter((s) => s.path)
		: [];
	b.theme = coerceSimTheme(rawBuilder.theme);
	b.collections = coerceBackend(rawBuilder.collections);
	if (isObj(rawBuilder.shell)) {
		b.shell = {
			headerEnabled: rawBuilder.shell.headerEnabled === true,
			footerEnabled: rawBuilder.shell.footerEnabled === true
		};
	}

	// Empty builder but a populated legacy prototype → migrate instead.
	if (Object.keys(b.nodes).length === 0 && prototype.screens.length > 0)
		return migratePrototypeToBuilder(prototype);

	return b;
}
