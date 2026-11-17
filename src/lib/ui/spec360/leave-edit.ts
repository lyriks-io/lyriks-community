import { confirmDialog } from '$ui/design-system';
import type { EditMode } from './edit-mode.svelte';
import type { SpecEdits } from './edits.svelte';

/**
 * Leave the Edit mode (criterion 41514698): at once with nothing held, else
 * after asking. Discard them drops the changes and leaves; dismissing the
 * question stays in the mode, so nothing typed is lost by a slip. Answers
 * whether the mode was left.
 */
export async function leaveEdit(mode: EditMode, edits: SpecEdits): Promise<boolean> {
	if (edits.stagedCount > 0 && !(await askToDiscard(edits))) return false;
	mode.set(false);
	return true;
}

/**
 * What the way out of the mode says, in the head and in its bar alike (criterion 41514698): Cancel editing once a
 * change is held, since leaving then drops it, else Stop editing.
 */
export function leaveLabel(edits: Pick<SpecEdits, 'stagedCount'>): 'Cancel editing' | 'Stop editing' {
	return edits.stagedCount > 0 ? 'Cancel editing' : 'Stop editing';
}

/** Ask whether the changes not saved yet may go; answers yes once they are dropped. */
export async function askToDiscard(edits: SpecEdits): Promise<boolean> {
	const n = edits.stagedCount;
	if (n === 0) return true;
	const ok = await confirmDialog({
		title: n === 1 ? 'Discard your change?' : `Discard your ${n} changes?`,
		message: 'They are not saved yet. Stay to save them with Save, or discard them.',
		confirmLabel: n === 1 ? 'Discard it' : 'Discard them',
		cancelLabel: 'Stay',
		danger: true
	});
	if (ok) edits.discardStaged();
	return ok;
}
