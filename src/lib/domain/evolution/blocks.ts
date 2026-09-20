import type { CanonicalSection, ImpactSection } from './enums';
import type { EvolutionRequest } from './draft';

/**
 * The blocks of the specification dossier page, and the canonical home of every
 * field on it.
 *
 * Three rules from the specification are encoded here and nowhere else:
 *
 * 1. **The dossier stores nothing it does not own.** Every field names the
 *    section that owns it and the exact path it writes to. The dossier reads and
 *    writes that path; it never keeps a second copy. `canonicalPath` is what
 *    makes that possible, and a field without one cannot be saved at all.
 * 2. **The maturity score is a weighted sum, never a plain average.** A filled
 *    title must not count as much as declared invariants, so each field carries
 *    its own weight and the blocks are weighed by the fields they hold.
 * 3. **Every field asks a question.** A filing-cabinet label does not provoke
 *    writing; a question does. Each field therefore carries the question it
 *    answers, a real example at the expected grain, and why it matters in
 *    review. Those three texts are the whole difference between a form and an
 *    interview.
 *
 * `critical: true` marks a prose field whose emptiness alone keeps the spec out
 * of the Ready tier, which is what the gate reads. A block edited in a
 * capability of its own is a READING and never critical: it is answered by
 * what the report and the sections say, whatever they say, and nothing on it
 * is "to fill".
 *
 * Ten blocks are always shown. Two more, Screens and Edge cases, appear only
 * once the change is known to touch a screen or to carry a rule: no request
 * starts with blocks it will never open.
 */

export interface BlockField {
	/** Path on the dossier page, e.g. `02-problem.value`. Also the maturity id. */
	readonly path: string;
	readonly label: string;
	/** The question the field answers. Shown as the field's heading. */
	readonly question: string;
	/** A real example at the expected grain, shown as the placeholder. */
	readonly example: string;
	/** Why the field matters in review, shown under the question. */
	readonly whyItMatters: string;
	/** The section that owns the value. The dossier is never the owner. */
	readonly section: CanonicalSection;
	/**
	 * The exact path inside the owning section, with `{leaf}` standing for one of
	 * the features the change touches. Resolved by `canonicalPathsFor`.
	 */
	readonly canonicalPath: string;
	/** Relative weight in the maturity sum. Cheap fields weigh less than commitments. */
	readonly weight: number;
	/** A critical field's emptiness alone bars the Ready tier. */
	readonly critical: boolean;
	/**
	 * How the field is authored.
	 *
	 * `inline` values are written from the dossier straight into the section that
	 * owns them: prose and lists Lyriks holds in a section draft. `capability`
	 * values live in an editor of their own (the behaviour kernel, the access
	 * matrix, the data model), so the dossier shows where they are and sends the
	 * reader there rather than offering a second, poorer editor for them.
	 */
	readonly editor: 'inline' | 'capability';
	/** `text` is one value; `list` is many (acceptance criteria, terms). */
	readonly kind: 'text' | 'list';
	readonly multiline?: boolean;
}

/** What makes a block conditional: the dimension the change has to touch for it to appear. */
export type BlockCondition = 'screens' | 'rules';

export interface SpecBlock {
	/** `01` through `12`, the order the page shows them in. */
	readonly id: string;
	readonly title: string;
	readonly purpose: string;
	readonly fields: readonly BlockField[];
	/** Absent on the ten core blocks. Set on the two that appear only when touched. */
	readonly conditional?: BlockCondition;
}

interface Texts {
	readonly question: string;
	readonly example: string;
	readonly why: string;
}

/** A field written from the dossier, into a path a Lyriks section draft holds. */
const inline = (
	path: string,
	label: string,
	section: CanonicalSection,
	canonicalPath: string,
	weight: number,
	critical: boolean,
	texts: Texts,
	extra: { multiline?: boolean; kind?: 'text' | 'list' } = {}
): BlockField => ({
	path,
	label,
	question: texts.question,
	example: texts.example,
	whyItMatters: texts.why,
	section,
	canonicalPath,
	weight,
	critical,
	editor: 'inline',
	kind: extra.kind ?? 'text',
	multiline: extra.multiline
});

/** A field whose home has an editor of its own; the dossier only points at it. */
const elsewhere = (
	path: string,
	label: string,
	section: CanonicalSection,
	canonicalPath: string,
	weight: number,
	critical: boolean,
	texts: Texts
): BlockField => ({
	path,
	label,
	question: texts.question,
	example: texts.example,
	whyItMatters: texts.why,
	section,
	canonicalPath,
	weight,
	critical,
	editor: 'capability',
	kind: 'text'
});

/**
 * The ten core blocks. Fillable in any order: no block is ever a precondition
 * of another, which is why nothing here declares a dependency.
 *
 * Every `canonicalPath` names a location that actually exists in the owning
 * section. A field pointing at a path nothing holds could never be written, and
 * would sit on the page as a hole no one could close.
 */
export const SPEC_BLOCKS: readonly SpecBlock[] = [
	{
		id: '01-origin',
		title: 'Origin and intent',
		purpose: 'What is being asked for, and why now.',
		fields: [
			inline(
				'01-origin.objective',
				'Objective',
				'features',
				'features.leafMeta.{leaf}.objective',
				3,
				true,
				{
					question: 'What is this change meant to achieve for this feature?',
					example: 'Let a key account import 10,000 contacts without a support ticket.',
					why: 'The sentence a reviewer reads six months later to judge whether it worked.'
				},
				{ multiline: true }
			)
		]
	},
	{
		id: '02-problem',
		title: 'Problem and value',
		purpose: 'The pain being removed and what it is worth.',
		fields: [
			inline(
				'02-problem.statement',
				'Problem',
				'features',
				'features.leafMeta.{leaf}.problem',
				3,
				true,
				{
					question: 'What pain does it remove, in the words of whoever feels it?',
					example:
						'Three key accounts said in June that migrating their data blocks their onboarding.',
					why: 'A change with no named pain is a preference; a named pain is what gets it prioritised.'
				},
				{ multiline: true }
			),
			inline(
				'02-problem.value',
				'Value',
				'features',
				'features.leafMeta.{leaf}.value',
				3,
				true,
				{
					question: 'What is it worth, and to whom?',
					example: 'Four key-account deals hinge on this: 180 k EUR of annual revenue by Q4.',
					why: 'Value is what the trade-off is judged against when the scope has to shrink.'
				},
				{ multiline: true }
			),
			inline(
				'02-problem.effect',
				'Measurable effect',
				'features',
				'features.leafMeta.{leaf}.expectedEffect',
				2,
				false,
				{
					question: 'What do you expect to be able to measure afterwards?',
					example: 'Imports that succeed first time above 90 percent; import tickets down 70 percent.',
					why: 'An effect nobody can measure cannot be told from luck at the review.'
				},
				{ multiline: true }
			)
		]
	},
	{
		id: '03-personas',
		title: 'Personas served',
		purpose: 'Who the change is for.',
		fields: [
			elsewhere('03-personas.roles', 'Roles concerned', 'users', 'users.roles', 2, false, {
				question: 'Who sees or uses the change?',
				example: 'Account managers and workspace admins; end users only see the result.',
				why: 'A change with no persona has no acceptance walkthrough: nobody knows whose eyes to use.'
			})
		]
	},
	{
		id: '04-permissions',
		title: 'Roles and permissions',
		purpose: 'Who may do what, once the change ships.',
		fields: [
			elsewhere('04-permissions.grants', 'Access grants', 'users', 'users.permissions', 3, false, {
				question: 'Who may do what, once the change ships?',
				example: 'Admin: create and run imports. Account manager: run. Viewer: read the report.',
				why: 'Grants are where a security review looks first; a hole here ships as an incident.'
			})
		]
	},
	{
		id: '05-functional',
		title: 'Functional specification',
		purpose: 'What the product does, and how you will know it does it.',
		fields: [
			inline(
				'05-functional.acceptance',
				'Acceptance criteria',
				'features',
				'features.leafMeta.{leaf}.acceptanceCriteria',
				4,
				true,
				{
					question: 'How will you know the product does it, one checkable statement per line?',
					example: 'An import of 10,000 rows completes in under 10 minutes without a support ticket.',
					why: 'These statements become the tests; a vague one becomes a test nobody can run.'
				},
				{ kind: 'list' }
			)
		]
	},
	{
		id: '06-behavioural',
		title: 'Behavioural specification',
		purpose: 'The surfaces, actions, guards and invariants the model enforces.',
		fields: [
			elsewhere(
				'06-behavioural.surfaces',
				'Surfaces and actions',
				'features',
				'behavior.{leaf}.surfaces',
				4,
				false,
				{
					question: 'Where does it happen, and through which actions?',
					example: 'The import screen: drop a file, map the columns, confirm.',
					why: 'Surfaces and actions are what the simulator runs; a change with none cannot be simulated.'
				}
			),
			elsewhere('06-behavioural.rules', 'Guards', 'features', 'behavior.{leaf}.rules', 4, false, {
				question: 'What refuses an action, and why?',
				example: 'Refused without the update right on the target collection; refused above 5 MB.',
				why: 'The guards are the product\'s core reading: which rules are active is the first thing a reviewer checks.'
			}),
			elsewhere(
				'06-behavioural.invariants',
				'Invariants',
				'features',
				'behavior.{leaf}.invariants',
				5,
				false,
				{
					question: 'What must hold whatever happens?',
					example: 'A row in error never cancels the valid rows of the same import.',
					why: 'An invariant the engine checks is a promise that survives every later change.'
				}
			)
		]
	},
	{
		id: '07-data',
		title: 'Data touched',
		purpose: 'The entities and fields the change reads or writes.',
		fields: [
			elsewhere('07-data.entities', 'Entities', 'data', 'data.entities', 3, false, {
				question: 'Which entities and fields does it read or write?',
				example:
					'ImportJob (status, rows total, rows in error) and ImportRow (line, payload, error code).',
				why: 'The data touched is what decides whether a migration is implied.'
			})
		]
	},
	{
		id: '08-graph',
		title: 'Dependency graph',
		purpose: 'What the change depends on, and what depends on it.',
		fields: [
			elsewhere(
				'08-graph.dependencies',
				'Depends on',
				'features',
				'features.leafMeta.{leaf}.dependsOn',
				1,
				false,
				{
					question: 'What does it depend on, and what depends on it?',
					example: 'Depends on the billing quota service; the contacts export depends on it.',
					why: 'Cascading dependencies are found here or in production, and here is cheaper.'
				}
			)
		]
	},
	{
		id: '09-technical',
		title: 'Technical specification',
		purpose: 'Where it runs and what it is built on.',
		fields: [
			elsewhere(
				'09-technical.constraints',
				'Constraints',
				'architecture',
				'architecture.constraints',
				3,
				false,
				{
					question: 'What constrains the implementation beyond the behaviour?',
					example:
						'Uploads go straight to object storage; validation in batches of 500 rows; the report is kept 30 days.',
					why: 'Enough detail to size the work, not enough to freeze the implementation.'
				}
			)
		]
	},
	{
		id: '10-security',
		title: 'Security and vocabulary',
		purpose: 'What must not leak, and the words to use for it.',
		fields: [
			elsewhere(
				'10-security.expectations',
				'Security expectations',
				'foundation',
				'foundation.definition.security',
				3,
				false,
				{
					question: 'What must not leak, and what must be traced?',
					example: 'Imported files are purged after 30 days; every import is attributed to a member.',
					why: 'Security expectations stated late are rewrites; stated here they are design.'
				}
			),
			elsewhere('10-security.terms', 'Glossary terms', 'glossary', 'glossary.terms', 2, false, {
				question: 'Which words does this change introduce or reuse?',
				example: 'Import job, import row, mapping. Not batch, not upload.',
				why: 'One agreed word per concept keeps the generated spec and the code speaking the same language.'
			})
		]
	}
];

/**
 * The two blocks that appear only when the change is known to touch their
 * dimension. Both are edited in a capability of their own.
 */
export const CONDITIONAL_BLOCKS: readonly SpecBlock[] = [
	{
		id: '11-screens',
		title: 'Screens',
		purpose: 'What a person sees, and where the change lands on it.',
		conditional: 'screens',
		fields: [
			elsewhere('11-screens.screens', 'Screens touched', 'experience', 'experience.screens', 2, false, {
				question: 'Which screens does the change add or alter?',
				example: 'The import screen and the report screen; the contacts list gains a status column.',
				why: 'A screen named here gets an acceptance walkthrough; one that is not gets discovered by users.'
			})
		]
	},
	{
		id: '12-edge-cases',
		title: 'Edge cases',
		purpose: 'What happens when it fails, times out or is declined.',
		conditional: 'rules',
		fields: [
			elsewhere('12-edge-cases.scenarios', 'Edge cases', 'rules', 'rules.scenarios', 2, false, {
				question: 'What happens when it fails, times out or is declined?',
				example:
					'Given a file over 5 MB, when it is dropped, then the import is refused before upload with the size named.',
				why: 'The failure path is the one usually left unspecified, and the one support meets first.'
			})
		]
	}
];

/**
 * The five acts the page reads in: why, for whom, what it does, what it
 * touches, how it is built. Five named acts read better than twelve numbered
 * blocks, and they order the story the way a reader wants it: the need first,
 * the technique last. Nothing here gates anything; an act is a heading.
 */
export interface SpecAct {
	readonly id: string;
	readonly title: string;
	/** The question the act answers, in the reader's words. */
	readonly question: string;
	readonly blockIds: readonly string[];
}

export const SPEC_ACTS: readonly SpecAct[] = [
	{
		id: 'why',
		title: 'Why',
		question: 'Where does this come from, and what is it worth?',
		blockIds: ['01-origin', '02-problem']
	},
	{
		id: 'who',
		title: 'For whom',
		question: 'Who is it for, and who may do what?',
		blockIds: ['03-personas', '04-permissions']
	},
	{
		id: 'what',
		title: 'What it does',
		question: 'How will you know it works, and what must always hold?',
		blockIds: ['05-functional', '06-behavioural', '12-edge-cases']
	},
	{
		id: 'touches',
		title: 'What it touches',
		question: 'Which data, screens and neighbours move with it?',
		blockIds: ['07-data', '11-screens', '08-graph']
	},
	{
		id: 'how',
		title: 'How it is built',
		question: 'What constrains it, and what must never leak?',
		blockIds: ['09-technical', '10-security']
	}
];

/** The acts of the page for one request, each holding only the blocks shown. */
export function actsFor(blocks: readonly SpecBlock[]): readonly { act: SpecAct; blocks: SpecBlock[] }[] {
	return SPEC_ACTS.map((act) => ({
		act,
		blocks: act.blockIds.map((id) => blocks.find((b) => b.id === id)).filter((b): b is SpecBlock => !!b)
	})).filter((a) => a.blocks.length > 0);
}

/**
 * Which dimensions the change is known to touch, read from the impact report
 * and from what the request already holds. A block that was ever marked or
 * questioned stays shown: hiding it again would hide the author's own work.
 */
export function touchedDimensions(
	request: Pick<EvolutionRequest, 'impactFindings' | 'filledFieldKeys' | 'openQuestionKeys'>
): ReadonlySet<BlockCondition> {
	const touched = new Set<BlockCondition>();
	for (const finding of request.impactFindings) {
		if (finding.section === 'screens_and_journeys') touched.add('screens');
		if (finding.section === 'rules_and_scenarios') touched.add('rules');
	}
	for (const key of [...request.filledFieldKeys, ...request.openQuestionKeys]) {
		for (const block of CONDITIONAL_BLOCKS) {
			if (block.conditional && key.startsWith(`${block.id}.`)) touched.add(block.conditional);
		}
	}
	return touched;
}

/** The blocks the page shows for one request: the ten core ones, plus what the change touches. */
export function blocksFor(
	request: Pick<EvolutionRequest, 'impactFindings' | 'filledFieldKeys' | 'openQuestionKeys'>
): readonly SpecBlock[] {
	const touched = touchedDimensions(request);
	return [
		...SPEC_BLOCKS,
		...CONDITIONAL_BLOCKS.filter((b) => b.conditional && touched.has(b.conditional))
	];
}

/**
 * The impact list that answers a block field: what the change was found to move
 * inside the section that field writes into.
 *
 * A block whose section the report does not cover has none, and the page then
 * says nothing rather than guessing. Behaviour is deliberately left out: the
 * impact list for features names what the change REACHES, which is not what a
 * reader of the behavioural block is looking for, and showing it there would
 * answer a question nobody asked.
 */
export function impactSectionOf(field: BlockField): ImpactSection | null {
	switch (field.section) {
		case 'data':
			return 'entities_and_fields';
		case 'glossary':
			return 'glossary_terms';
		case 'users':
			return 'permissions';
		case 'experience':
			return 'screens_and_journeys';
		case 'rules':
			return 'rules_and_scenarios';
		default:
			return null;
	}
}

/** Exactly ten core blocks. The score covers every block shown or it is not reported at all. */
export const BLOCK_COUNT = SPEC_BLOCKS.length;

const EVERY_BLOCK: readonly SpecBlock[] = [...SPEC_BLOCKS, ...CONDITIONAL_BLOCKS];

const FIELD_BY_PATH = new Map<string, BlockField>(
	EVERY_BLOCK.flatMap((block) => block.fields.map((f) => [f.path, f] as const))
);

export const blockFieldByPath = (path: string): BlockField | undefined => FIELD_BY_PATH.get(path);

export const blockById = (id: string): SpecBlock | undefined =>
	EVERY_BLOCK.find((block) => block.id === id);

/** Every field of the ten core blocks, in block order. */
export const ALL_BLOCK_FIELDS: readonly BlockField[] = SPEC_BLOCKS.flatMap((b) => b.fields);

/** Every field of the given blocks, in block order. Resume walks this list. */
export const fieldsOf = (blocks: readonly SpecBlock[]): readonly BlockField[] =>
	blocks.flatMap((b) => b.fields);

/** True when the field writes somewhere inside a leaf, rather than project-wide. */
export const isLeafScoped = (field: BlockField): boolean => field.canonicalPath.includes('{leaf}');

/**
 * Whether a value fills its field. Prose is filled once it holds anything; a
 * list is filled only once it holds at least one non-empty row. A table of
 * blank lines is not a filled table, and counting it as one is how a
 * completion score starts to lie.
 */
export function holdsValue(field: BlockField, value: string): boolean {
	if (field.kind === 'list') return value.split('\n').some((line) => line.trim() !== '');
	return value.trim() !== '';
}

/**
 * Where a field writes for one request.
 *
 * A change routinely touches several features, so a leaf-scoped field has one
 * home PER leaf rather than one arbitrary home on whichever leaf happened to be
 * named first: the objective of a change to billing and to export is two
 * objectives, and writing one of them over the other would lose half the spec.
 *
 * The list is empty when the field needs a leaf and the request names none. That
 * is not an error state, it is the honest one: a field that cannot say where it
 * belongs is refused rather than stored on the dossier, and the request simply
 * has not found out yet what it touches.
 */
export function canonicalPathsFor(
	field: BlockField,
	leafIds: readonly string[]
): readonly { leafId: string | null; path: string }[] {
	if (!isLeafScoped(field)) return [{ leafId: null, path: field.canonicalPath }];
	return leafIds.map((leafId) => ({
		leafId,
		path: field.canonicalPath.replace('{leaf}', leafId)
	}));
}

/**
 * The key under which a field's presence is tracked. A leaf-scoped field is
 * tracked once per leaf, because it is filled for one feature and empty for
 * another.
 */
export const fieldKey = (fieldPath: string, leafId: string | null = null): string =>
	leafId ? `${fieldPath}@${leafId}` : fieldPath;
