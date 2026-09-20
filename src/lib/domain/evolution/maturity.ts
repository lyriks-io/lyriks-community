import {
	SPEC_BLOCKS,
	fieldKey,
	fieldsOf,
	isLeafScoped,
	type BlockField,
	type SpecBlock
} from './blocks';
import type { BlockState, MaturityTier } from './enums';

/**
 * The maturity score: how far the specification is from having no holes left.
 *
 * Three things the specification insists on, all encoded here:
 *
 * 1. It is a **weighted sum**, never a plain average. A plain average would rate
 *    a filled title as worth as much as declared invariants, so `scoreOf` refuses
 *    that reading by construction: every field carries its own weight.
 * 2. It measures the **absence of holes, not the quality of what fills them**.
 *    `MATURITY_STATEMENT` is that sentence, shown under the number so nobody
 *    reads it as a quality mark.
 * 3. It **never blocks a crossing by itself**. What blocks is the critical empty
 *    field it names; the percentage sits next to it as a reading, and
 *    `MATURITY_NEVER_BLOCKS` says so under the number.
 *
 * An open question is a hole the author declared rather than left: it counts as
 * empty here, in amber on the page, and it is what the guided fill walks. The
 * score covers every block shown or it is not reported at all: a score computed
 * over part of the page would understate the holes rather than name them.
 */

export const MATURITY_STATEMENT =
	'This score measures the absence of holes in the specification, not the quality of what fills them.';

export const MATURITY_NEVER_BLOCKS =
	'It never blocks a crossing by itself: what blocks is the critical empty field it names.';

/**
 * Which values on the dossier page are filled, keyed by `fieldKey`: the bare
 * field path for a project-wide field, and `path@leafId` for a leaf-scoped one.
 */
export type FilledFields = ReadonlySet<string>;

/**
 * Which fields the author marked as open questions, keyed like `FilledFields`.
 * An open question counts as empty whatever its section holds.
 */
export type OpenQuestions = ReadonlySet<string>;

/** True when any home of the field carries an open question. One hole is a hole. */
export function isOpenQuestion(
	field: BlockField,
	open: OpenQuestions,
	leafIds: readonly string[]
): boolean {
	if (!isLeafScoped(field)) return open.has(fieldKey(field.path));
	return leafIds.some((leafId) => open.has(fieldKey(field.path, leafId)));
}

/**
 * A leaf-scoped field is filled only once it is filled for EVERY leaf the
 * request touches. Half a spec is not a spec: a change spanning billing and
 * export with an objective written for billing alone still has a hole.
 *
 * With no leaf named it can never be filled, and that is deliberate. It is what
 * keeps the maturity score honest while the request has not yet found out what
 * it touches, and therefore what keeps the stage 3 gate meaningful without
 * forcing the requester to guess a feature at the door.
 */
function isFieldFilled(
	field: BlockField,
	filled: FilledFields,
	open: OpenQuestions,
	leafIds: readonly string[]
): boolean {
	if (isOpenQuestion(field, open, leafIds)) return false;
	if (!isLeafScoped(field)) return filled.has(fieldKey(field.path));
	if (leafIds.length === 0) return false;
	return leafIds.every((leafId) => filled.has(fieldKey(field.path, leafId)));
}

export interface BlockReading {
	readonly block: SpecBlock;
	readonly state: BlockState;
	readonly percent: number;
	/** How many of the block's fields are filled, for the rail's "filled over total". */
	readonly filled: number;
	/** How many of the block's fields the author marked as open questions. */
	readonly openQuestions: number;
	/**
	 * True when every field of the block is an open question: the block reads as
	 * parked. Derived, never declared; there is no parking act any more.
	 */
	readonly parked: boolean;
}

export interface MaturityReading {
	/** 0 to 100. Reaches 100 only when no critical field is empty. */
	readonly score: number;
	readonly tier: MaturityTier;
	/** The paths of the critical fields still empty, named rather than counted. */
	readonly criticalEmptyFields: readonly string[];
	readonly criticalEmptyCount: number;
	/** How many fields across the page are open questions. */
	readonly openQuestionCount: number;
	/** How many blocks were read: the ten core ones plus whatever the change touches. */
	readonly blocksScored: number;
	readonly statement: string;
	readonly neverBlocks: string;
	readonly perBlock: readonly BlockReading[];
}

/**
 * The tier a score falls into. Always shown with the score, because the number
 * alone says nothing about what is true of the spec. `ready` is never reached on
 * the score alone: a single empty critical field bars it.
 */
export function tierOf(score: number, criticalEmptyCount: number): MaturityTier {
	if (score >= 100 && criticalEmptyCount === 0) return 'ready';
	if (score >= 80) return 'complete';
	if (score >= 55) return 'functional';
	if (score >= 25) return 'framed';
	return 'idea';
}

/** How far one block has got, from what its own fields hold. */
function stateOf(
	block: SpecBlock,
	filled: FilledFields,
	open: OpenQuestions,
	leafIds: readonly string[]
): BlockState {
	const done = block.fields.filter((f) => isFieldFilled(f, filled, open, leafIds)).length;
	if (done === 0) return 'empty';
	return done < block.fields.length ? 'in_progress' : 'complete';
}

/**
 * Weigh the blocks shown and report the score, its tier, and the critical
 * fields still empty by name.
 *
 * `openQuestionKeys` are the fields the author declared they cannot answer yet.
 * Each counts as empty: marking one lowers nothing on the other fields, and it
 * is never held against the author as anything but the hole it is.
 */
export function readMaturity(
	filled: FilledFields,
	openQuestionKeys: readonly string[] = [],
	leafIds: readonly string[] = [],
	blocks: readonly SpecBlock[] = SPEC_BLOCKS
): MaturityReading {
	const open = new Set(openQuestionKeys);
	let earned = 0;
	let available = 0;
	let openQuestionCount = 0;
	const criticalEmptyFields: string[] = [];

	for (const field of fieldsOf(blocks)) {
		const done = isFieldFilled(field, filled, open, leafIds);
		available += field.weight;
		if (done) earned += field.weight;
		if (isOpenQuestion(field, open, leafIds)) openQuestionCount += 1;
		if (field.critical && !done) criticalEmptyFields.push(field.path);
	}

	// Normalised, so whatever the weights the sum cannot report beyond a complete
	// absence of holes.
	const score = available === 0 ? 100 : Math.min(100, Math.round((earned / available) * 100));
	const perBlock = blocks.map((block): BlockReading => {
		const total = block.fields.reduce((n, f) => n + f.weight, 0);
		const got = block.fields.reduce(
			(n, f) => n + (isFieldFilled(f, filled, open, leafIds) ? f.weight : 0),
			0
		);
		const openHere = block.fields.filter((f) => isOpenQuestion(f, open, leafIds)).length;
		return {
			block,
			state: stateOf(block, filled, open, leafIds),
			percent: total === 0 ? 100 : Math.round((got / total) * 100),
			filled: block.fields.filter((f) => isFieldFilled(f, filled, open, leafIds)).length,
			openQuestions: openHere,
			parked: block.fields.length > 0 && openHere === block.fields.length
		};
	});

	return {
		score,
		tier: tierOf(score, criticalEmptyFields.length),
		criticalEmptyFields,
		criticalEmptyCount: criticalEmptyFields.length,
		openQuestionCount,
		blocksScored: blocks.length,
		statement: MATURITY_STATEMENT,
		neverBlocks: MATURITY_NEVER_BLOCKS,
		perBlock
	};
}

/**
 * The first field left empty or open behind the author, read across the whole
 * page in block order. This is where Resume sends the focus; an empty string
 * means no hole is left, and Resume is then not offered at all.
 */
export function firstEmptyFieldPath(
	filled: FilledFields,
	leafIds: readonly string[] = [],
	openQuestionKeys: readonly string[] = [],
	blocks: readonly SpecBlock[] = SPEC_BLOCKS
): string {
	const open = new Set(openQuestionKeys);
	return fieldsOf(blocks).find((f) => !isFieldFilled(f, filled, open, leafIds))?.path ?? '';
}
