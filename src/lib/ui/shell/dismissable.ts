import { floatingHome } from '$ui/design-system/float-in-view';

/**
 * Closes a menu of the app bar on a click outside it or on Escape. Used as
 * `{@attach dismissable(() => (open = false))}` on the element holding both the
 * trigger and the menu, so a click on the trigger is not "outside". A menu that
 * floats under <body> (floatInView, criterion 5651ca29) still counts as inside
 * the element it was written in.
 */
export function dismissable(close: () => void) {
	return (node: HTMLElement) => {
		// The path the click took, fixed when it happened: a button the click itself removed (a row
		// that closes once acted on) still counts as inside.
		const onClick = (e: MouseEvent) => {
			const path = e.composedPath();
			const inside = path.includes(node) || path.some((t) => {
				const home = floatingHome(t);
				return !!home && node.contains(home);
			});
			if (!inside) close();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close();
		};
		document.addEventListener('click', onClick);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('click', onClick);
			document.removeEventListener('keydown', onKey);
		};
	};
}
