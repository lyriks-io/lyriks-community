import { anchorDomId } from '$domain/discussions';

// Every element of the Specification 360° sits in a block carrying its anchor's id.
const BLOCK = `[id^="${anchorDomId('')}"]`;

/**
 * Shows a control only while its own block is pointed at: the block it sits in
 * (`blockId`), and not one of the blocks nested in it (an action's rule), so
 * pointing at a rule does not reveal its action's control. The control keeps
 * its room while hidden, so nothing moves as it shows; app.css draws it
 * (data-reveal-with-block), shown too while reached by the keyboard or while
 * it holds something open, and always on a touch screen, where nothing is
 * pointed at. `{@attach revealWithBlock(id)}` on the control.
 */
export function revealWithBlock(blockId: string) {
	return (control: HTMLElement) => {
		const block = control.closest<HTMLElement>(`#${CSS.escape(blockId)}`);
		if (!block) return;
		control.dataset.revealWithBlock = '';
		const over = (e: PointerEvent) => control.toggleAttribute('data-shown', e.target instanceof Element && e.target.closest(BLOCK) === block);
		const leave = () => control.removeAttribute('data-shown');
		block.addEventListener('pointerover', over);
		block.addEventListener('pointerleave', leave);
		return () => {
			block.removeEventListener('pointerover', over);
			block.removeEventListener('pointerleave', leave);
			delete control.dataset.revealWithBlock;
			control.removeAttribute('data-shown');
		};
	};
}
