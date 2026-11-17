const LOCAL_CONTROL = 'a,button,input,select,textarea,label,summary,[role="button"],[role="link"],[role="checkbox"],[role="menuitem"],[contenteditable]:not([contenteditable="false"]),[data-row-isolated]';

/** Extend the existing native action to plain row content, without covering text or local controls. */
export function activateRow(node: HTMLElement, disabled = false) {
	function open(event: MouseEvent) {
		if (disabled || event.defaultPrevented || event.button !== 0 || node.ownerDocument.getSelection()?.isCollapsed === false) return;
		const origin = event.target;
		if (!(origin instanceof Element) || origin.closest(LOCAL_CONTROL)) return;
		const target = node.querySelector<HTMLAnchorElement | HTMLButtonElement>('[data-row-open]');
		if (!target || target.matches(':disabled,[aria-disabled="true"]')) return;
		// Forward once to the real link/button: its router, modifiers and existing click behavior stay authoritative.
		target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: node.ownerDocument.defaultView, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey }));
	}
	node.addEventListener('click', open);
	return {
		update(value: boolean) { disabled = value; },
		destroy() { node.removeEventListener('click', open); }
	};
}
