/**
 * Reject behavior ops that carry an unrecognised Expression `kind`.
 *
 * WHY: the engine's `isExpression` treats an object whose `kind` is not in its
 * vocabulary as a plain LITERAL (see its Expression.ts — "anything else … is
 * treated as a literal"), and `normalizeExpression` then wraps it as
 * `{ kind:'literal', value:{ kind:'subtract', … } }`. So a typo'd arithmetic
 * node is accepted, saved, and evaluates to a non-number.
 *
 * That is not a cosmetic bug. `max(0, <that object>)` coincidentally evaluates
 * to `0`, so in one reported build every decrement-to-zero scenario PASSED over
 * a completely inert effect while only decrement-to-nonzero failed — twelve
 * features carrying a dead counter and reporting healthy scenarios. A green
 * verdict over an inert effect is worse than no verdict.
 *
 * Rejecting at write time is the same treatment event names already get, which
 * both build retrospectives singled out as the model to copy: one round trip,
 * zero mystery.
 */

/**
 * The engine's expression vocabulary — mirrored, not imported: only the
 * infrastructure layer may depend on `unspaghettit` (hexagonal boundary), so
 * this is the application layer's anti-corruption copy of its
 * `EXPRESSION_KINDS`. `validate-behavior-expressions.test.ts` pins the list;
 * if the engine adds a kind, both move together.
 */
export const EXPRESSION_KINDS = [
	'literal',
	'state',
	'param',
	'const',
	'add',
	'sub',
	'mul',
	'div',
	'mod',
	'min',
	'max',
	'neg',
	'not',
	'sum',
	'count',
	'sum_pluck',
	'count_where',
	'switch'
] as const;

const KIND_SET: ReadonlySet<string> = new Set(EXPRESSION_KINDS);

/**
 * The engine's CONDITION vocabulary (`RuleCondition`), which is a DIFFERENT
 * value object from Expression, and the reason this walk cannot treat every
 * nested `kind` as an expression.
 *
 * Treating them as one vocabulary cost a real build dearly: an author modelling
 * an existing product could not write a single compound invariant across four
 * domains, because `{ kind:'all', conditions:[…] }` was rejected as an unknown
 * expression. The safety properties a checker exists to prove (one of them "the
 * file is hashed before its metadata is stripped") were downgraded to
 * `count >= 0`, and the tool had made the specification weaker than the truth.
 *
 * Validating them is still required, for the same reason as expressions: the
 * engine's `isCompositeCondition` reads an unrecognised `kind` as a LEAF
 * comparison, so a typo does not fail, it silently means something else.
 */
export const CONDITION_KINDS = ['all', 'any', 'not', 'all_match', 'any_match'] as const;

/**
 * `ReachabilityGoal.kind`, the liveness complement to invariants. Its body is
 * nested under `goal` precisely because its own `kind` would otherwise collide
 * with the operation's, and the builder casts it unchecked, so an unrecognised
 * value reaches the model checker and matches no branch.
 */
export const REACHABILITY_GOAL_KINDS = ['reachable', 'always_reachable'] as const;

/** Which vocabulary a subtree is written in. */
type Grammar = 'expression' | 'condition' | 'goal';

/** Slots whose value is a `RuleCondition`, or a list of them. */
const CONDITION_FIELDS: ReadonlySet<string> = new Set([
	'condition',
	'conditions',
	// The `switch` Expression's per-case guard is a RuleCondition too.
	'when'
]);

/**
 * `where` belongs to two different shapes, so its slot alone does not say which
 * vocabulary it is written in: under a quantifier it is the per-element
 * RuleCondition, while a list effect (`update_list_item`, …) uses it for a
 * `{ field, equals }` comparand whose operand is an ordinary Expression. Only
 * the parent's kind separates them.
 */
const QUANTIFIER_KINDS: ReadonlySet<string> = new Set(['all_match', 'any_match']);

/** Slots inside a condition that return to the expression vocabulary. */
const EXPRESSION_FIELDS: ReadonlySet<string> = new Set(['left', 'right']);

/** Ops whose `goal` (or `patch`) body is a ReachabilityGoal. */
const REACHABILITY_OPS: ReadonlySet<string> = new Set([
	'add_reachability_goal',
	'update_reachability_goal'
]);

interface Vocabulary {
	readonly kinds: ReadonlySet<string>;
	readonly list: readonly string[];
	readonly noun: string;
	/** What the engine does with an unrecognised kind, which is why we reject it. */
	readonly consequence: string;
}

const VOCABULARIES: Readonly<Record<Grammar, Vocabulary>> = {
	expression: {
		kinds: KIND_SET,
		list: EXPRESSION_KINDS,
		noun: 'expression',
		consequence:
			'An unrecognised kind is NOT rejected by the engine: it is stored as a plain literal, ' +
			'so the effect silently computes nothing while its scenarios may still pass.'
	},
	condition: {
		kinds: new Set(CONDITION_KINDS),
		list: CONDITION_KINDS,
		noun: 'condition',
		consequence:
			'An unrecognised kind is NOT rejected by the engine: it is read as a leaf comparison, ' +
			'so the branch silently means something other than what you wrote.'
	},
	goal: {
		kinds: new Set(REACHABILITY_GOAL_KINDS),
		list: REACHABILITY_GOAL_KINDS,
		noun: 'reachability goal',
		consequence:
			'An unrecognised kind reaches the model checker unchecked and matches no branch, ' +
			'so the goal is never actually verified.'
	}
};

/**
 * Near-misses worth naming explicitly. Every one of these is a spelling a
 * competent author actually reaches for first — `subtract` cost two separate
 * builds several hours between them.
 */
const SUGGESTIONS: Readonly<Record<string, string>> = {
	subtract: 'sub',
	minus: 'sub',
	difference: 'sub',
	plus: 'add',
	sum_of: 'add',
	add_to: 'add',
	multiply: 'mul',
	times: 'mul',
	product: 'mul',
	divide: 'div',
	division: 'div',
	quotient: 'div',
	modulo: 'mod',
	remainder: 'mod',
	negate: 'neg',
	negative: 'neg',
	minimum: 'min',
	maximum: 'max',
	value: 'literal',
	constant: 'const',
	statePath: 'state',
	state_path: 'state',
	path: 'state',
	parameter: 'param',
	count_if: 'count_where',
	sum_by: 'sum_pluck',
	case: 'switch',
	cond: 'switch',
	if: 'switch'
};

/**
 * `literal.value` holds an arbitrary author payload — which may itself be an
 * object with a `kind` key (the engine documents wrapping exactly that case).
 * So the walk must never descend into it.
 */
const OPAQUE_FIELDS: ReadonlySet<string> = new Set(['value']);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Near-misses in the CONDITION vocabulary. `implies` has no node of its own and
 * is the one an author reaches for most often when writing an ordering rule, so
 * it gets the encoding rather than a lookalike.
 */
const CONDITION_SUGGESTIONS: Readonly<Record<string, string>> = {
	and: 'all',
	or: 'any',
	every: 'all_match',
	forall: 'all_match',
	each: 'all_match',
	some: 'any_match',
	exists: 'any_match',
	none: 'not'
};

function suggestionFor(kind: string, grammar: Grammar): string {
	const lower = kind.toLowerCase();
	if (grammar === 'condition') {
		if (lower === 'implies' || lower === 'if_then') {
			return ' There is no implication node: write "A implies B" as { kind:"any", conditions:[ { kind:"not", condition: A }, B ] }.';
		}
		const direct = CONDITION_SUGGESTIONS[lower];
		return direct ? ` Did you mean "${direct}"?` : '';
	}
	if (grammar === 'goal') return '';
	const direct = SUGGESTIONS[kind] ?? SUGGESTIONS[lower];
	if (direct) return ` Did you mean "${direct}"?`;
	// A prefix/substring near-miss ("subtr", "multip") still gets a pointer.
	const near = EXPRESSION_KINDS.find((k) => lower.startsWith(k) || k.startsWith(lower));
	return near ? ` Did you mean "${near}"?` : '';
}

/**
 * Which vocabulary a child slot is written in. A condition slot switches the
 * grammar, and `left` / `right` inside a condition switch it back: the left
 * operand may be `{ kind:'param' }` and the right one a whole Expression.
 */
function grammarOf(key: string, parent: Grammar, parentKind: unknown): Grammar {
	if (CONDITION_FIELDS.has(key)) return 'condition';
	if (key === 'where' && typeof parentKind === 'string' && QUANTIFIER_KINDS.has(parentKind)) {
		return 'condition';
	}
	if (parent === 'condition' && EXPRESSION_FIELDS.has(key)) return 'expression';
	// A goal's remaining slots (name, message, description) carry no kind, so
	// anything else under it is read as an ordinary expression slot.
	return parent === 'goal' ? 'expression' : parent;
}

/**
 * Walk one op, collecting every `kind` that is not in the vocabulary its slot
 * is written in, with the JSON path where it sits. Effects are discriminated by
 * `type` and ops by their own top-level `kind`, so a NESTED `kind` always names
 * a node in one of the three grammars: expression, condition, or reachability
 * goal. Which one it is depends on the slot it hangs from, never on the value.
 */
function collectBadKinds(
	node: unknown,
	path: string,
	out: { path: string; kind: string; grammar: Grammar }[],
	atOpRoot: boolean,
	grammar: Grammar
): void {
	if (Array.isArray(node)) {
		node.forEach((child, i) => collectBadKinds(child, `${path}[${i}]`, out, false, grammar));
		return;
	}
	if (!isPlainObject(node)) return;

	const kind = node.kind;
	// The op's own `kind` is the operation name (`add_effect`, …), not a node.
	if (!atOpRoot && typeof kind === 'string' && !VOCABULARIES[grammar].kinds.has(kind)) {
		out.push({ path: `${path}.kind`, kind, grammar });
		// Don't descend: the subtree's meaning is already unknown, and reporting
		// one root cause beats a cascade of derived complaints.
		return;
	}

	// A reachability op nests its goal body, which is where that body's own
	// `kind` becomes readable without colliding with the operation's.
	const goalBody = atOpRoot && typeof kind === 'string' && REACHABILITY_OPS.has(kind);
	const isLiteral = grammar === 'expression' && kind === 'literal';
	for (const [key, child] of Object.entries(node)) {
		if (key === 'kind') continue;
		if (isLiteral && OPAQUE_FIELDS.has(key)) continue;
		const childGrammar =
			goalBody && (key === 'goal' || key === 'patch') ? 'goal' : grammarOf(key, grammar, kind);
		collectBadKinds(child, `${path}.${key}`, out, false, childGrammar);
	}
}

/**
 * One error message per op that carries a bad expression kind. Empty ⇒ the
 * batch's expression trees are all in the engine's vocabulary.
 */
export function expressionKindErrors(
	operations: readonly Record<string, unknown>[]
): string[] {
	const errors: string[] = [];
	operations.forEach((op, i) => {
		if (!isPlainObject(op)) return;
		const bad: { path: string; kind: string; grammar: Grammar }[] = [];
		collectBadKinds(op, `op[${i}]`, bad, true, 'expression');
		for (const { path, kind, grammar } of bad) {
			const vocabulary = VOCABULARIES[grammar];
			errors.push(
				`${path}: unknown ${vocabulary.noun} kind "${kind}".${suggestionFor(kind, grammar)} ` +
					`Supported kinds: ${vocabulary.list.join(', ')}. ` +
					vocabulary.consequence
			);
		}
	});
	return errors;
}
