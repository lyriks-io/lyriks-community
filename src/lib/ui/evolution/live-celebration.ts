import { shortSha, type ChangeNoun, type ClosingChange, type LandingCheck, type VersionStep } from '$domain/evolution';

/**
 * What the success dialog of a live evolution says (ac-evo-verd-live-celebration):
 * the request by its key and title, what became official counted by kind, the
 * version of the Specification 360° it moved to, whether everything it carried
 * is there, and what comes next.
 */

export interface LiveCelebration {
	readonly title: string;
	readonly lead: string;
	readonly figures: readonly { readonly value: number; readonly label: string }[];
	/** Whether everything the request carried is in the specification; null when it could not be read. */
	readonly check: { readonly whole: boolean; readonly text: string } | null;
	readonly next: string;
}

export interface LiveCelebrationInput {
	readonly key: string;
	readonly title: string;
	readonly changes: readonly ClosingChange[];
	readonly version: VersionStep | null;
	readonly check: LandingCheck | null;
	/** The merge that made it live; null when the evolution was closed by hand. */
	readonly merged: { readonly into: string; readonly commit: string } | null;
	/** A merged branch is left to delete. */
	readonly branchLeft: boolean;
	/** Index entries still held for the change; none once the merge report synced the index. */
	readonly heldEntries: number;
}

const NOUNS: readonly ChangeNoun[] = ['feature', 'screen', 'action', 'rule', 'table', 'field'];
const SHOWN = 4;

/** Only what is still to do: the index the merge report already synced is never offered again. */
function nextOf(input: LiveCelebrationInput): string {
	const sync = input.heldEntries > 0;
	if (sync && input.branchLeft) return 'Next: Lyriks syncs the index again and deletes the merged branch, both from What comes next.';
	if (sync) return 'Next: Lyriks syncs the index again, from What comes next.';
	if (input.branchLeft) return 'The index is synced. Left to you: delete the merged branch when you like, from What comes next.';
	return 'The index is synced: nothing is left to do.';
}

export function liveCelebrationOf(input: LiveCelebrationInput): LiveCelebration {
	const figures = NOUNS.map((noun) => {
		const value = input.changes.filter((c) => c.noun === noun).reduce((sum, c) => sum + c.count, 0);
		return { value, label: value === 1 ? noun : `${noun}s` };
	})
		.filter((f) => f.value > 0)
		.slice(0, SHOWN);
	const version = input.version ? ` It moved the specification from ${input.version.from} to ${input.version.to}.` : '';
	const how = input.merged ? `Merged into ${input.merged.into}@${shortSha(input.merged.commit)}, "${input.title}" is` : `"${input.title}" is`;
	const { check } = input;
	return {
		title: `${input.key} is live`,
		lead: `${how} now the official specification.${version}`,
		figures,
		check: check
			? check.found === check.carried
				? { whole: true, text: `Checked in Knowledge: all ${check.carried} changes are there.` }
				: { whole: false, text: `${check.carried - check.found} of ${check.carried} changes are not in Knowledge: What happened lists them.` }
			: null,
		next: nextOf(input)
	};
}
