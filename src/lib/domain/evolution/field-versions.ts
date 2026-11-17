import type { Actor, EvolutionRequest, FieldValidation, FieldVersion, FieldVersionSource } from './draft';
import { awaitedAmong, namedOn } from './named-validators';

/**
 * Every value a dossier field held, and who stood behind which one
 * (ac-evo-hist-field-versions, ac-evo-hist-field-validation).
 *
 * A version is never edited and never removed: a later write adds one. A
 * validation names the version it stands behind, so a write after it leaves it
 * in place, outdated, and the field reads as validated again only once someone
 * validates the new version.
 */

/** The key a step description is versioned under. */
export const stepDescriptionKey = (step: string): string => `step.${step}.description`;
/** The key of an answer a step holds after its description (ac-evo-func-prose). */
export const stepAnswerKey = (step: string, question: string): string => `step.${step}.${question}`;

/** The versions of one field, newest first. */
export function versionsOf(request: Pick<EvolutionRequest, 'fieldVersions'>, key: string): FieldVersion[] {
	return request.fieldVersions.filter((v) => v.key === key).reverse();
}

export function latestVersion(request: Pick<EvolutionRequest, 'fieldVersions'>, key: string): FieldVersion | null {
	return versionsOf(request, key)[0] ?? null;
}

/** Where a write came from, read off who made it. */
function sourceOf(actor: Actor, proposalId: string | null): FieldVersionSource {
	if (proposalId) return 'proposal';
	if (actor.channel === 'assistant') return 'assistant';
	return actor.kind === 'ai_client' ? 'ai_client' : 'typed';
}

/**
 * The request with one more version of a field. Writing the value the field
 * already holds adds nothing: a version is a change, not a save.
 */
export function withFieldVersion(
	request: EvolutionRequest,
	input: {
		readonly id: string;
		readonly key: string;
		readonly value: string;
		readonly actor: Actor;
		readonly at: string;
		readonly proposalId?: string | null;
		/** Set for a value found in the field rather than written by the actor. */
		readonly earlier?: boolean;
		/** Set for a text the Functional spec's diagram wrote (ac-evo-func-uml-sync). */
		readonly fromDiagram?: boolean;
	}
): EvolutionRequest {
	const value = input.value.trim();
	const latest = latestVersion(request, input.key);
	if (latest ? latest.value === value : value === '') return request;
	const version: FieldVersion = {
		id: input.id,
		key: input.key,
		value,
		by: input.actor.id,
		byKind: input.actor.kind,
		source: input.earlier ? 'earlier' : input.fromDiagram ? 'diagram' : sourceOf(input.actor, input.proposalId ?? null),
		proposalId: input.proposalId ?? null,
		at: input.at
	};
	return { ...request, fieldVersions: [...request.fieldVersions, version] };
}

/** An action exclusion is a dossier decision; changing its prose does not restore it. */
export const isActionReviewKey = (key: string): boolean => key.startsWith('element.action:');

export type FieldValidationStatus = 'unvalidated' | 'validated' | 'refused' | 'outdated' | 'changed_outside';

export interface FieldValidationReading {
	readonly status: FieldValidationStatus;
	readonly versionCount: number;
	/** Who stands behind the latest version, one validation per person. */
	readonly validations: readonly FieldValidation[];
	/** How many people the request asks to stand behind it (ac-evo-req-validations-per-answer), or the people named on it. */
	readonly needed: number;
	/** How many of the validations count towards `needed`: once people are named, theirs alone (ac-evo-req-named-validators). */
	readonly counted: number;
	/** The people named on the answer; empty when the default rule applies. */
	readonly expected: readonly string[];
	/** The refusal that stands on the latest version, when it is the latest verdict on it (ac-evo-form-question-acts). */
	readonly refusal: FieldValidation | null;
	/** The most recent validation of an older version, when the field moved on since. */
	readonly outdatedValidation: FieldValidation | null;
}

/**
 * Where a field stands. `liveValue` is what the owning section holds now: when
 * it differs from the last version the dossier kept, the field was changed
 * outside the dossier and says so (ac-evo-hist-outside).
 */
export function fieldValidationOf(
	request: Pick<EvolutionRequest, 'fieldVersions' | 'fieldValidations'> & {
		readonly validationsPerAnswer?: number;
		readonly namedValidators?: EvolutionRequest['namedValidators'];
	},
	key: string,
	liveValue?: string
): FieldValidationReading {
	const versions = versionsOf(request, key);
	const latest = versions[0] ?? null;
	const forKey = request.fieldValidations.filter((v) => v.key === key);
	const verdicts = latest ? forKey.filter((v) => v.versionId === latest.id) : [];
	// The same person validating one version twice counts once.
	const validations = verdicts.filter((v, i, all) => v.verdict !== 'refused' && all.findIndex((o) => o.verdict !== 'refused' && o.by === v.by) === i);
	// Once people are named, they are the ones expected, and only them (ac-evo-req-named-validators).
	const expected = namedOn(request, key);
	const counted = expected.length - awaitedAmong(expected, validations.map((v) => v.by)).length;
	const needed = expected.length > 0 ? expected.length : Math.max(1, request.validationsPerAnswer ?? 1);
	// The latest verdict on the current version decides: a validation given after a refusal stands.
	const last = verdicts.at(-1) ?? null;
	const refusal = isActionReviewKey(key)
		? (forKey.at(-1)?.verdict === 'refused' ? forKey.at(-1)! : null)
		: last?.verdict === 'refused' ? last : null;
	const outdatedValidation = latest
		? ([...forKey].reverse().find((v) => v.versionId !== latest.id && v.verdict !== 'refused') ?? null)
		: null;
	const changedOutside =
		latest !== null && liveValue !== undefined && liveValue.trim() !== latest.value;
	const status: FieldValidationStatus = isActionReviewKey(key) && refusal
		? 'refused'
		: changedOutside
		? 'changed_outside'
		: refusal
			? 'refused'
			: (expected.length > 0 ? counted : validations.length) >= needed
				? 'validated'
				: outdatedValidation
					? 'outdated'
					: 'unvalidated';
	return {
		status,
		versionCount: versions.length,
		validations: refusal ? [] : validations,
		needed,
		counted: refusal ? 0 : expected.length > 0 ? counted : validations.length,
		expected,
		refusal,
		outdatedValidation
	};
}
