import {
	NEED_BLOCK,
	SPEC_BLOCKS,
	fieldKey,
	fieldsOf,
	isAskedOn,
	isLeafScoped,
	subjectKindOf,
	type BlockField,
	type SpecBlock
} from './blocks';
import type { BlockState, MaturityTier } from './enums';
import { touchedLeafIds, type EvolutionRequest } from './draft';
import { needCriticalEmpty, skipOf } from './path';

/**
 * Which touched features ask a leaf-scoped field: a subject is asked only what
 * is its own (ac-evo-form-9). Absent, every touched feature asks every field,
 * which is how a reading without drafts has always been computed.
 */
export type AskedOn = (field: BlockField, leafId: string) => boolean;

const askingLeaves = (field: BlockField, leafIds: readonly string[], asks?: AskedOn): readonly string[] =>
	asks ? leafIds.filter((leafId) => asks(field, leafId)) : leafIds;

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
	leafIds: readonly string[],
	asks?: AskedOn
): boolean {
	leafIds = isLeafScoped(field) ? askingLeaves(field, leafIds, asks) : leafIds;
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
	leafIds: readonly string[],
	asks?: AskedOn
): boolean {
	if (isOpenQuestion(field, open, leafIds, asks)) return false;
	leafIds = isLeafScoped(field) ? askingLeaves(field, leafIds, asks) : leafIds;
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
	leafIds: readonly string[],
	asks?: AskedOn
): BlockState {
	const done = block.fields.filter((f) => isFieldFilled(f, filled, open, leafIds, asks)).length;
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
	blocks: readonly SpecBlock[] = SPEC_BLOCKS,
	asks?: AskedOn,
	/** Answers the request owes outside the blocks read (the Need's critical ones), weighed in the same share. */
	owed: { readonly earned: number; readonly available: number } = { earned: 0, available: 0 }
): MaturityReading {
	const open = new Set(openQuestionKeys);
	// A field no touched feature is asked is not part of this request's page: it
	// is neither a hole nor an answer, so it is left out of the sum entirely.
	const counted = (field: BlockField): boolean =>
		!isLeafScoped(field) || leafIds.length === 0 || askingLeaves(field, leafIds, asks).length > 0;
	const shown = blocks.map((block) => ({ ...block, fields: block.fields.filter(counted) }));
	blocks = shown;
	let earned = owed.earned;
	let available = owed.available;
	let openQuestionCount = 0;
	const criticalEmptyFields: string[] = [];

	for (const field of fieldsOf(blocks)) {
		const done = isFieldFilled(field, filled, open, leafIds, asks);
		available += field.weight;
		if (done) earned += field.weight;
		if (isOpenQuestion(field, open, leafIds, asks)) openQuestionCount += 1;
		if (field.critical && !done) criticalEmptyFields.push(field.path);
	}

	// Normalised, so whatever the weights the sum cannot report beyond a complete
	// absence of holes.
	const score = available === 0 ? 100 : Math.min(100, Math.round((earned / available) * 100));
	const perBlock = blocks.map((block): BlockReading => {
		const total = block.fields.reduce((n, f) => n + f.weight, 0);
		const got = block.fields.reduce(
			(n, f) => n + (isFieldFilled(f, filled, open, leafIds, asks) ? f.weight : 0),
			0
		);
		const openHere = block.fields.filter((f) => isOpenQuestion(f, open, leafIds, asks)).length;
		return {
			block,
			state: stateOf(block, filled, open, leafIds, asks),
			percent: total === 0 ? 100 : Math.round((got / total) * 100),
			filled: block.fields.filter((f) => isFieldFilled(f, filled, open, leafIds, asks)).length,
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
 * The maturity of one request as the gate reads it: the fields each subject is
 * asked, plus the critical questions of the need (ac-evo-gate-need), which
 * belong to the request rather than to any feature.
 */
export function readRequestMaturity(
	request: EvolutionRequest,
	filled: FilledFields,
	blocks: readonly SpecBlock[]
): MaturityReading {
	const asks: AskedOn = (field, leafId) => isAskedOn(field, subjectKindOf(request.drafts, leafId));
	// A question skipped on purpose is settled: it is neither a hole nor critical (ac-evo-form-question-skip).
	const settled = new Set([...filled, ...(request.skippedQuestions ?? []).map((s) => s.key)]);
	const need = needCriticalEmpty(request);
	// The Need's critical answers are answers of the request: they weigh in the share with
	// the touched features' own, so a request missing one never reads 100 (criterion 64443f02).
	const needCritical = skipOf(request, 'need') ? [] : NEED_BLOCK.fields.filter((f) => f.critical);
	const owed = needCritical.reduce(
		(sum, f) => ({ earned: sum.earned + (need.includes(f.path) ? 0 : f.weight), available: sum.available + f.weight }),
		{ earned: 0, available: 0 }
	);
	const reading = readMaturity(settled, request.openQuestionKeys, [...touchedLeafIds(request)], blocks, asks, owed);
	if (need.length === 0) return reading;
	const criticalEmptyFields = [...need, ...reading.criticalEmptyFields];
	return {
		...reading,
		criticalEmptyFields,
		criticalEmptyCount: criticalEmptyFields.length,
		tier: tierOf(reading.score, criticalEmptyFields.length)
	};
}
