import { languageTag, NBSP, proseLanguage, quoteName, type SpecLanguage } from './spec-language';

/**
 * Prose written in another language than the spec's (criterion 80ad0a4c).
 *
 * A project that declares its language keeps every piece of prose in its
 * model in that language. This reading finds the pieces that clearly read in
 * another one, so the Control Center and the answer of a behavior batch can
 * say where each one lives. It refuses nothing and rewrites nothing. Only
 * prose is read: the names the code carries (actions, states, events, fields)
 * are never collected, so they are never flagged. A piece too short to tell
 * (fewer than eight marker words) is left alone.
 */

/** Which piece of prose it is. */
export type ProseKind =
	| 'feature-description'
	| 'acceptance-criterion'
	| 'action-description'
	| 'rule-description'
	| 'scenario-name'
	| 'user-message';

/** The named element that carries a piece, when it is not the feature itself. */
export interface ProseHolder {
	readonly kind: 'action' | 'surface';
	readonly name: string;
}

export interface ProsePiece {
	readonly kind: ProseKind;
	readonly text: string;
	/** The feature it lives in, when known. */
	readonly featureId?: string;
	readonly featureName?: string;
	readonly holder?: ProseHolder;
	/** The batch operation that wrote it (`op[3] (add_scenario)`), for a batch answer. */
	readonly op?: string;
}

export interface ProseDrift extends ProsePiece {
	/** The language the piece reads in. */
	readonly readsIn: 'en' | 'fr';
}

/**
 * The pieces that read clearly in another language than the declared one.
 * Nothing is read when no language is declared: an undeclared project is
 * English by default, and its prose is only a hint (see `specLanguage`).
 */
export function proseDrift(declaredLocale: string | null | undefined, pieces: Iterable<ProsePiece>): ProseDrift[] {
	const declared = languageTag(declaredLocale);
	if (!declared) return [];
	const drifts: ProseDrift[] = [];
	for (const piece of pieces) {
		if (!piece.text.trim()) continue;
		const readsIn = proseLanguage([piece.text]);
		if (readsIn && readsIn !== declared) drifts.push({ ...piece, readsIn });
	}
	return drifts;
}

/* ── Where the prose lives ─────────────────────────────────────────────── */

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec | null =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : null;
const list = (value: unknown): Rec[] =>
	Array.isArray(value) ? value.map(rec).filter((v): v is Rec => v !== null) : [];
const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** An acceptance criterion as one text: its title and its Given/When/Then read together. */
function criterionText(criterion: Rec): string {
	return ['title', 'given', 'when', 'then', 'expectedOutcome', 'description']
		.map((key) => str(criterion[key]))
		.filter(Boolean)
		.join(' ');
}

/** The prose a rule, an invariant or an effect carries: its description and the message the end user sees. */
function rulePieces(node: Rec, base: Omit<ProsePiece, 'kind' | 'text'>): ProsePiece[] {
	const pieces: ProsePiece[] = [];
	const push = (kind: ProseKind, text: string) => {
		if (text) pieces.push({ ...base, kind, text });
	};
	push('rule-description', str(node.description));
	push('user-message', str(node.message));
	const effect = rec(node.effect);
	if (effect) {
		push('user-message', str(effect.reason));
		push('user-message', str(effect.message));
	}
	return pieces;
}

/**
 * The prose of the features section: each leaf's description and its
 * acceptance criteria. Takes the draft's shape loosely so the domain module
 * owns no other context's types.
 */
export function featuresDraftProse(draft: {
	readonly features: readonly { id: string; name: string; description?: string }[];
	readonly leafMeta?: Readonly<Record<string, { acceptanceCriteria?: readonly { text: string }[] }>>;
}): ProsePiece[] {
	const pieces: ProsePiece[] = [];
	for (const feature of draft.features) {
		const base = { featureId: feature.id, featureName: feature.name };
		const description = str(feature.description);
		if (description) pieces.push({ ...base, kind: 'feature-description', text: description });
		for (const criterion of draft.leafMeta?.[feature.id]?.acceptanceCriteria ?? []) {
			const text = str(criterion.text);
			if (text) pieces.push({ ...base, kind: 'acceptance-criterion', text });
		}
	}
	return pieces;
}

/**
 * The prose of one behavior feature (a kernel record): acceptance criteria,
 * action descriptions, rule and invariant descriptions, scenario names and
 * every message the end user sees. The feature description is left to the
 * features section, which owns it.
 */
export function behaviorFeatureProse(
	feature: Rec | null | undefined,
	featureId?: string,
	featureName?: string
): ProsePiece[] {
	if (!feature) return [];
	const base = { featureId: featureId ?? str(feature.id), featureName: featureName ?? str(feature.name) };
	const pieces: ProsePiece[] = [];
	for (const criterion of list(feature.acceptanceCriteria)) {
		const text = criterionText(criterion);
		if (text) pieces.push({ ...base, kind: 'acceptance-criterion', text });
	}
	for (const invariant of list(feature.featureInvariants)) pieces.push(...rulePieces(invariant, base));
	for (const surface of list(feature.surfaces)) {
		const onSurface = { ...base, holder: { kind: 'surface' as const, name: str(surface.name) } };
		for (const rule of list(surface.rules)) pieces.push(...rulePieces(rule, onSurface));
		for (const invariant of list(surface.invariants)) pieces.push(...rulePieces(invariant, onSurface));
		for (const action of list(surface.actions)) {
			const onAction = { ...base, holder: { kind: 'action' as const, name: str(action.name) } };
			for (const text of [str(action.intent), str(action.description)])
				if (text) pieces.push({ ...onAction, kind: 'action-description', text });
			for (const rule of list(action.rules)) pieces.push(...rulePieces(rule, onAction));
			for (const invariant of list(action.invariants)) pieces.push(...rulePieces(invariant, onAction));
			for (const effect of [...list(action.effects), ...list(action.onBlockedEffects)]) {
				for (const text of [str(effect.message), str(effect.reason)])
					if (text) pieces.push({ ...onAction, kind: 'user-message', text });
			}
			for (const scenario of list(action.scenarios)) {
				const text = str(scenario.name);
				if (text) pieces.push({ ...onAction, kind: 'scenario-name', text });
			}
		}
	}
	return dedupe(pieces);
}

/** One piece per text and kind within a feature: a criterion mirrored twice is one criterion. */
function dedupe(pieces: readonly ProsePiece[]): ProsePiece[] {
	const seen = new Set<string>();
	return pieces.filter((p) => {
		const key = `${p.featureId ?? ''}|${p.kind}|${p.holder?.name ?? ''}|${p.text}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** The body an op carries: its nested object, its patch, or the op itself (flat form). */
function body(op: Rec, nested: string): Rec {
	return rec(op[nested]) ?? rec(op.patch) ?? op;
}

/**
 * The prose a behavior batch writes, op by op (canonical `kind` spelling).
 * Only what this batch writes: a piece already in the feature is not the
 * author's doing here.
 */
export function behaviorBatchProse(operations: readonly Rec[], featureId?: string): ProsePiece[] {
	const pieces: ProsePiece[] = [];
	operations.forEach((op, i) => {
		const kind = String(op?.kind ?? '');
		const base = { ...(featureId ? { featureId } : {}), op: `op[${i}] (${kind})` };
		if (kind === 'add_action' || kind === 'update_action') {
			const node = body(op, 'action');
			const name = str(node.name) || str(op.name);
			const at = name ? { ...base, holder: { kind: 'action' as const, name } } : base;
			for (const text of [str(node.intent), str(node.description)])
				if (text) pieces.push({ ...at, kind: 'action-description', text });
		} else if (/^(add|update)_(action|surface)_rule$/.test(kind)) {
			pieces.push(...rulePieces(body(op, 'rule'), base));
		} else if (/^(add|update)_(action|surface|feature|project)_invariant$/.test(kind)) {
			pieces.push(...rulePieces(body(op, 'invariant'), base));
		} else if (kind === 'add_effect' || kind === 'update_effect') {
			const node = body(op, 'effect');
			for (const text of [str(node.message), str(node.reason)])
				if (text) pieces.push({ ...base, kind: 'user-message', text });
		} else if (kind === 'add_scenario' || kind === 'update_scenario') {
			const text = str(body(op, 'scenario').name);
			if (text) pieces.push({ ...base, kind: 'scenario-name', text });
		} else if (kind === 'add_acceptance_criterion' || kind === 'update_acceptance_criterion') {
			const text = criterionText(body(op, 'criterion'));
			if (text) pieces.push({ ...base, kind: 'acceptance-criterion', text });
		} else if (kind === 'update_feature') {
			const text = str(body(op, 'feature').description);
			if (text) pieces.push({ ...base, kind: 'feature-description', text });
		}
	});
	return pieces;
}

/* ── What is said about it ─────────────────────────────────────────────── */

const LANGUAGE_IN: Readonly<Record<SpecLanguage, Readonly<Record<string, string>>>> = {
	en: { en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese', nl: 'Dutch' },
	fr: { en: 'anglais', fr: 'français', de: 'allemand', es: 'espagnol', it: 'italien', pt: 'portugais', nl: 'néerlandais' }
};

/** A language's name as a sentence in `lang` says it; the tag itself when unknown. */
export function languageName(lang: SpecLanguage, tag: string): string {
	return LANGUAGE_IN[lang][tag] ?? tag;
}

const KIND_TEXT: Readonly<Record<SpecLanguage, Readonly<Record<ProseKind, string>>>> = {
	en: {
		'feature-description': 'description',
		'acceptance-criterion': 'acceptance criterion',
		'action-description': 'action description',
		'rule-description': 'rule description',
		'scenario-name': 'scenario name',
		'user-message': 'message the user sees'
	},
	fr: {
		'feature-description': 'description',
		'acceptance-criterion': "critère d'acceptation",
		'action-description': "description d'action",
		'rule-description': 'description de règle',
		'scenario-name': 'nom de scénario',
		'user-message': "message vu par l'utilisateur"
	}
};

/** What the piece is, in words ("scenario name", « nom de scénario »). */
export function proseKindText(lang: SpecLanguage, kind: ProseKind): string {
	return KIND_TEXT[lang][kind];
}

/** Where a piece lives: `Feature "Checkout", action "Pay", scenario name`. */
export function prosePlace(lang: SpecLanguage, piece: ProsePiece): string {
	const fr = lang === 'fr';
	const parts: string[] = [];
	if (piece.op) parts.push(piece.op);
	else if (piece.featureName || piece.featureId)
		parts.push(`${fr ? 'fonctionnalité' : 'feature'} ${quoteName(lang, piece.featureName || piece.featureId || '')}`);
	if (piece.holder?.name) {
		const holder = piece.holder.kind === 'action' ? 'action' : 'surface';
		parts.push(`${holder} ${quoteName(lang, piece.holder.name)}`);
	}
	parts.push(proseKindText(lang, piece.kind));
	const place = parts.join(', ');
	// A sentence starts with a capital; an op reference is code and keeps its spelling.
	return piece.op ? place : place.charAt(0).toUpperCase() + place.slice(1);
}

/** The beginning of a piece, enough to find it. */
export function proseExcerpt(text: string, max = 60): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** One line of the Control Center card: where it lives, the language it reads in, its beginning. */
export function proseDriftLine(lang: SpecLanguage, drift: ProseDrift): string {
	const where = prosePlace(lang, drift);
	const excerpt = quoteName(lang, proseExcerpt(drift.text));
	return lang === 'fr'
		? `${where} (en ${languageName(lang, drift.readsIn)})${NBSP}: ${excerpt}`
		: `${where} (reads in ${languageName(lang, drift.readsIn)}): ${excerpt}`;
}

/**
 * The warning a behavior batch answers with, one per piece it wrote in
 * another language: said, never refused.
 */
export function proseDriftWarning(lang: SpecLanguage, declaredTag: string, drift: ProseDrift): string {
	const where = prosePlace(lang, drift);
	const excerpt = quoteName(lang, proseExcerpt(drift.text));
	const declared = languageName(lang, declaredTag);
	return lang === 'fr'
		? `${where}${NBSP}: ce texte se lit en ${languageName(lang, drift.readsIn)} alors que la spec est écrite en ${declared}${NBSP}: ${excerpt}. ` +
				`Il est enregistré tel quel${NBSP}; réécrivez-le en ${declared} pour que la spec reste dans une seule langue.`
		: `${where}: this text reads in ${languageName(lang, drift.readsIn)} while the spec is written in ${declared}: ${excerpt}. ` +
				`It is saved as is; rewrite it in ${declared} so the spec stays in one language.`;
}
