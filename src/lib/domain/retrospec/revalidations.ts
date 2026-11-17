import type { PersonRef } from './document';
import type { ElementText } from './spec-edits';

/**
 * An element of a DRAFT specification changed after people validated it
 * (criterion e6029af6 of feat-lyriks-copy-a52881-47): every validation it
 * carried is dropped, the people who gave them are asked to validate it again,
 * and the version they validated is kept beside the one now proposed until it
 * is validated again. One record per element, whatever the number of saves:
 * the first validated version stays, the proposed one moves. Pure.
 */

/** What changed the element: its own text, a child added under it, or its removal. */
export type RevalidationChange = 'edited' | 'child_added' | 'deleted';

export interface Revalidation {
	/** The Specification 360° anchor of the element. */
	readonly itemId: string;
	readonly title: string;
	readonly change: RevalidationChange;
	/** What the element read when it was validated. */
	readonly validated: ElementText;
	/** What it reads now; null once it was deleted. */
	readonly proposed: ElementText | null;
	/** The people whose validation the change dropped, asked to validate again (never the editor). */
	readonly asked: readonly PersonRef[];
	/** When it was first changed after its validation. */
	readonly firstAt: string;
	/** Who changed it last, and when. */
	readonly by: PersonRef;
	readonly at: string;
}

/** What an edit act says of the element it changes, read before and after the write. */
export interface RevalidationInput {
	readonly change: RevalidationChange;
	readonly before: ElementText;
	readonly after: ElementText | null;
}

const samePerson = (a: PersonRef, b: PersonRef) => a.id === b.id;

/**
 * The record once an element changed. `validators` are the people whose validation stood before the change. With
 * nobody's validation standing, an element already followed keeps its validated version and moves its proposed one;
 * one never validated is not followed. A record whose people all validated again starts over from what they
 * validated.
 */
export function recordRevalidation(
	records: Readonly<Record<string, Revalidation>>,
	itemId: string,
	title: string,
	input: RevalidationInput,
	validators: readonly PersonRef[],
	actor: PersonRef,
	now: string
): Record<string, Revalidation> {
	const previous = records[itemId];
	const asked = validators.filter((p) => !samePerson(p, actor));
	const settledAgain = !!previous && validators.length > 0 && previous.asked.every((p) => validators.some((v) => samePerson(v, p)));
	const ongoing = previous && !settledAgain ? previous : null;
	if (!ongoing && validators.length === 0) return { ...records };
	const record: Revalidation = {
		itemId,
		title: title || ongoing?.title || itemId,
		change: input.change === 'deleted' ? 'deleted' : (ongoing?.change ?? input.change),
		validated: ongoing?.validated ?? input.before,
		proposed: input.after,
		asked: [...(ongoing?.asked ?? []), ...asked.filter((p) => !ongoing?.asked.some((q) => samePerson(p, q)))],
		firstAt: ongoing?.firstAt ?? now,
		by: actor,
		at: now
	};
	return { ...records, [itemId]: record };
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const CHANGES: readonly RevalidationChange[] = ['edited', 'child_added', 'deleted'];

function personOf(v: unknown): PersonRef | null {
	const o = obj(v);
	const id = str(o.id).trim();
	return id ? { id, name: str(o.name).trim() || id } : null;
}

function textOf(v: unknown): ElementText {
	const o = obj(v);
	return { text: str(o.text), desc: str(o.desc) };
}

export function parseRevalidations(raw: unknown): Record<string, Revalidation> {
	const out: Record<string, Revalidation> = {};
	for (const [itemId, v] of Object.entries(obj(raw))) {
		const o = obj(v);
		const by = personOf(o.by);
		const at = str(o.at);
		if (!by || !at) continue;
		const change = CHANGES.find((c) => c === o.change) ?? 'edited';
		out[itemId] = {
			itemId,
			title: str(o.title),
			change,
			validated: textOf(o.validated),
			proposed: o.proposed === null ? null : textOf(o.proposed),
			asked: (Array.isArray(o.asked) ? o.asked : []).flatMap((p) => personOf(p) ?? []),
			firstAt: str(o.firstAt) || at,
			by,
			at
		};
	}
	return out;
}
