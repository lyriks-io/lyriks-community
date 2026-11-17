/**
 * Keeps a CSS variable on the document at the element's height, for what is
 * placed against it: the decision log or a toast above the app's foot.
 * Removed with the element. Used as `{@attach heightVar('--app-foot-h')}`.
 */
export function heightVar(name: string) {
	return (node: HTMLElement) => {
		const root = document.documentElement;
		const sizes = new ResizeObserver(() => root.style.setProperty(name, `${node.offsetHeight}px`));
		sizes.observe(node);
		return () => {
			sizes.disconnect();
			root.style.removeProperty(name);
		};
	};
}
