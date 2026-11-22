import type { NoticeAction } from '$domain/activity';

/**
 * A card's action: what it copies for the person's AI first, then where it
 * happened (Relaunch the analysis copies the prompt that resumes the run,
 * criterion 2012cc93). The copy is awaited so its toast, or the box a closed
 * clipboard asks for, shows before the page moves.
 */
export async function runCardAction(action: NoticeAction | undefined, open: () => void, copy: (text: string, said: string) => Promise<void>): Promise<void> {
	if (action?.copies) await copy(action.copies.text, action.copies.said);
	open();
}
