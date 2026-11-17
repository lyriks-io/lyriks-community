import type { SpecLanguage } from '$domain/language';
import type { VariableHint } from '$domain/rules';
import { words } from '$lib/unspa-schema/requirement-sentences';

type Node = Record<string, unknown>;
const STATE_EFFECTS = new Set(['set_state', 'append_to_list', 'remove_from_list', 'update_list_item']);

/**
 * Ask the same sentence projector where it placed each actual reference. Only
 * this rule's temporary copy is marked; literals and the stored model stay
 * intact. Reconstitution must equal the original sentence before spans escape.
 */
export function ruleVariableHints(
	raw: Node,
	render: (rule: Node) => string,
	statement: string,
	lang: SpecLanguage
): VariableHint[] {
	let prefix = 'lyriksearsreference';
	const input = JSON.stringify(raw) + statement;
	while (input.includes(prefix)) prefix += 'x';
	const references = new Map<string, { identifier: string; label: string; marker: string; parameter: boolean }>();
	const reference = (identifier: string, parameter = false): string => {
		if (!identifier) return identifier;
		const key = `${parameter ? 'parameter' : 'state'}:${identifier}`;
		let ref = references.get(key);
		if (!ref) {
			const label = parameter && identifier === '$channel' ? (lang === 'fr' ? 'canal' : 'channel') : lang === 'fr' ? identifier : words(identifier);
			ref = { identifier, label, marker: `${prefix}${references.size}end`, parameter };
			references.set(key, ref);
		}
		return ref.marker;
	};
	const mark = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(mark);
		if (!value || typeof value !== 'object') return value;
		const n = value as Node;
		// A literal may itself hold objects resembling expressions.
		if (n.kind === 'literal') return value;
		const next = Object.fromEntries(Object.entries(n).map(([key, child]) => [key, mark(child)]));
		if (n.kind === 'state' && typeof n.path === 'string') next.path = reference(n.path);
		if (n.kind === 'param' && typeof n.name === 'string') next.name = reference(n.name, true);
		if (typeof n.left === 'string' && typeof n.operator === 'string') next.left = reference(n.left);
		if (typeof n.overPath === 'string') next.overPath = reference(n.overPath);
		if (typeof n.type === 'string' && STATE_EFFECTS.has(n.type) && typeof n.path === 'string') next.path = reference(n.path);
		return next;
	};
	const marked = { ...raw, condition: mark(raw.condition), effect: mark(raw.effect) };
	if (!references.size) return [];
	let rendered = render(marked);
	for (const ref of references.values()) {
		// The channel has a dedicated reading rather than the usual input suffix.
		if (ref.parameter && ref.identifier === '$channel') {
			rendered = lang === 'fr'
				? rendered.replaceAll(`le paramètre « ${ref.marker} »`, `le ${ref.marker}`).replaceAll(`le paramètre «\u00a0${ref.marker}\u00a0»`, `le ${ref.marker}`)
				: rendered.replaceAll(`the ${ref.marker} given`, `the ${ref.marker}`);
		}
	}
	const emitted = [...references.values()].filter((ref) => rendered.includes(ref.marker));
	const byMarker = new Map(emitted.map((ref) => [ref.marker, ref]));
	const candidates = new Map<string, string[]>();
	for (const ref of emitted) candidates.set(ref.label, [...new Set([...(candidates.get(ref.label) ?? []), ref.identifier])].sort());
	const hints: VariableHint[] = [];
	const pattern = new RegExp(`${prefix}\\d+end`, 'g');
	let cursor = 0;
	let markedCursor = 0;
	let reconstructed = '';
	for (const match of rendered.matchAll(pattern)) {
		const ref = byMarker.get(match[0]);
		if (!ref) return [];
		const before = rendered.slice(markedCursor, match.index);
		reconstructed += before + ref.label;
		cursor += before.length;
		hints.push({ start: cursor, end: cursor + ref.label.length, identifiers: candidates.get(ref.label)! });
		cursor += ref.label.length;
		markedCursor = match.index! + match[0].length;
	}
	reconstructed += rendered.slice(markedCursor);
	return reconstructed === statement ? hints : [];
}
