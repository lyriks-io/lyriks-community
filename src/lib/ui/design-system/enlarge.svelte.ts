// Enlarge a diagram (feat-fb747-diagram-fullscreen): a diagram is in its card,
// or in a dialog enlarged to the whole page, closed by its close button or Escape.

export type DiagramDisplay = 'windowed' | 'enlarged';

export type DisplayOutcome = { status: 'success'; display: DiagramDisplay } | { status: 'blocked'; reason: string };

/** enlargeDiagram: open the dialog over the page. */
export function enlargeDiagram(display: DiagramDisplay): DisplayOutcome {
	if (display === 'enlarged') return { status: 'blocked', reason: 'The diagram is already enlarged.' };
	return { status: 'success', display: 'enlarged' };
}

/** closeEnlargedDiagram: back into the card, by the close button or by Escape. */
export function closeEnlargedDiagram(display: DiagramDisplay): DisplayOutcome {
	if (display === 'windowed') return { status: 'blocked', reason: 'No dialog is open.' };
	return { status: 'success', display: 'windowed' };
}

/** Classes for the element holding the diagram: in the dialog it fills the page, inside a small margin. */
export function frameClass(display: DiagramDisplay): string {
	return display === 'enlarged'
		? 'fixed inset-3 z-[60] flex flex-col rounded-card border border-line bg-surface p-3 shadow-2xl sm:inset-6'
		: '';
}

/**
 * Svelte action: while `active`, the element lives under <body>, so no ancestor
 * (a transform, a scroll container) confines the enlarged dialog; it goes back
 * to its place, before an anchor left there, as soon as `active` turns false.
 * An element Svelte already took out of the page is never put back: that is
 * how a dimmed layer outlived its dialog and kept the mouse.
 */
export function portalWhile(node: HTMLElement, active: boolean) {
	const anchor = document.createComment('enlarged-diagram');
	const apply = (on: boolean) => {
		if (on && node.parentNode !== document.body) {
			node.parentNode?.insertBefore(anchor, node);
			document.body.appendChild(node);
		} else if (!on && anchor.parentNode) {
			if (node.parentNode === document.body) anchor.parentNode.insertBefore(node, anchor);
			anchor.remove();
		}
	};
	apply(active);
	return {
		update: apply,
		destroy: () => {
			// Svelte removes the element itself; only the anchor left in the page is ours.
			if (node.parentNode === document.body) node.remove();
			anchor.remove();
		}
	};
}

/** One diagram's display: in its card or enlarged. */
export class DiagramEnlarger {
	display = $state<DiagramDisplay>('windowed');

	get enlarged(): boolean {
		return this.display === 'enlarged';
	}

	/** Listen for Escape while the dialog is open; returns the cleanup for an $effect. */
	attach(): () => void {
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== 'Escape' || !this.enlarged) return;
			event.stopPropagation();
			this.close();
		};
		window.addEventListener('keydown', onKey, true);
		return () => {
			window.removeEventListener('keydown', onKey, true);
			if (this.enlarged) this.close();
		};
	}

	open(): void {
		const outcome = enlargeDiagram(this.display);
		if (outcome.status === 'blocked') return;
		this.display = outcome.display;
		// The page behind the dialog stays where it was.
		document.body.style.overflow = 'hidden';
	}

	close(): void {
		const outcome = closeEnlargedDiagram(this.display);
		if (outcome.status === 'blocked') return;
		this.display = outcome.display;
		document.body.style.overflow = '';
	}

	toggle(): void {
		if (this.enlarged) this.close();
		else this.open();
	}
}
