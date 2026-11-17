/** The place at the foot of the navigation, right above Help & support, where the page's Ask my AI shows (criterion 44aa7b4f). */
export const SIDE_ASK_ID = 'side-ask';

/**
 * Moves the page's Ask my AI into the foot of the navigation and takes it out
 * when the page drops it: the page declares what its question bears on, the
 * navigation shows the one button. Where the app has no navigation, the button
 * stays where the page wrote it. Used as `{@attach intoSideAsk}`.
 */
export function intoSideAsk(node: HTMLElement) {
	return into(SIDE_ASK_ID, node);
}

/**
 * Where the project's own Ask my AI shows while no page put its own above: its
 * question bears on the page itself (rule 8ddf1393). Used as `{@attach intoSideAskElse}`.
 */
export const SIDE_ASK_ELSE_ID = 'side-ask-else';
export function intoSideAskElse(node: HTMLElement) {
	return into(SIDE_ASK_ELSE_ID, node);
}

function into(id: string, node: HTMLElement) {
	const slot = document.getElementById(id);
	if (!slot) return;
	slot.appendChild(node);
	return () => node.remove();
}
