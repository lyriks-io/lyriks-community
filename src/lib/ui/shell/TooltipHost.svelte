<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { tooltipDelay, warmUntilAfter } from './tooltip-timing';

	/**
	 * The app's tooltips: the `title` of what the reader points at, or reaches
	 * by the keyboard, shows in a light bubble of the app's own, after the
	 * system's own delay; it opens below what it describes, out of the way of what the
	 * reader looks at (above only where the window has no room below), springs
	 * in toward it and slips away on leave.
	 * A title the element's own text already says shows no bubble (saidAlready).
	 * The title is held aside while its bubble may show, so the browser draws
	 * none, and given back after (kept up to date if the page changes it
	 * meanwhile); the bubble describes its element while it shows. A touch
	 * screen keeps no tooltip, as before. Mounted once, in the root layout.
	 */

	// Away from what it describes, and from the window's edges.
	const GAP_PX = 8;
	const EDGE_PX = 8;
	// The arrow stays this far inside the bubble's rounded corners.
	const ARROW_INSET_PX = 12;
	const ID = 'app-tooltip';
	// Words a title may add without telling more than the text the element shows.
	const FILLER = new Set(['a', 'an', 'the', 'this', 'that', 'it', 'its', 'to', 'of', 'for', 'on', 'in', 'and', 'or', 'you', 'your', 'element', 'item', 'here', 'now', 'click']);
	const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
	// Two forms of one word (validate, validated) once they share this many letters.
	const STEM = 5;

	/**
	 * Whether the element's own text already says what its title does: then
	 * no bubble shows. A title shows where the element has no text (an icon),
	 * where its text is cut short, or where it says more than the text does.
	 */
	function saidAlready(el: HTMLElement, title: string): boolean {
		const shown = el.innerText?.trim() ?? '';
		if (!shown) return false;
		const cut = [el, ...el.querySelectorAll<HTMLElement>('*')].some((n) => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).textOverflow === 'ellipsis');
		if (cut) return false;
		const has = words(shown);
		const same = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= STEM && (a.startsWith(b) || b.startsWith(a)));
		return words(title)
			.filter((w) => !FILLER.has(w))
			.every((w) => has.some((h) => same(h, w)));
	}

	let text = $state('');
	let shown = $state(false);
	let below = $state(false);
	let left = $state(0);
	let top = $state(0);
	let arrow = $state(0);
	let bubble = $state<HTMLElement | null>(null);

	onMount(() => {
		let owner: HTMLElement | null = null;
		let timer = 0;
		let described = false;
		let warmUntil = 0;
		// A page that sets the title again while it is held (Svelte, after a change): hold the new one, show it.
		const watch = new MutationObserver(() => {
			const fresh = owner?.getAttribute('title');
			if (!owner || fresh == null) return;
			owner.dataset.tip = fresh;
			owner.removeAttribute('title');
			text = fresh;
			if (!shown) return;
			if (saidAlready(owner, fresh)) shown = false;
			else void place(owner);
		});
		const giveBack = () => {
			if (!owner) return;
			watch.disconnect();
			if (owner.dataset.tip !== undefined && !owner.hasAttribute('title')) owner.setAttribute('title', owner.dataset.tip);
			delete owner.dataset.tip;
			if (described) owner.removeAttribute('aria-describedby');
			described = false;
		};
		// Left for nothing, a shown tooltip keeps the next one warm a moment; a press, a scroll or Escape does not.
		const hide = (cold = false) => {
			window.clearTimeout(timer);
			warmUntil = warmUntilAfter(shown, performance.now(), cold, warmUntil);
			shown = false;
			giveBack();
			owner = null;
		};
		const rest = () => hide(true);
		const place = async (el: HTMLElement) => {
			await tick();
			if (!bubble || owner !== el || !el.isConnected) return;
			const r = el.getBoundingClientRect();
			const b = bubble.getBoundingClientRect();
			below = r.bottom + GAP_PX + b.height <= window.innerHeight - EDGE_PX;
			top = below ? r.bottom + GAP_PX : r.top - GAP_PX - b.height;
			left = Math.min(Math.max(r.left + r.width / 2 - b.width / 2, EDGE_PX), window.innerWidth - b.width - EDGE_PX);
			arrow = Math.min(Math.max(r.left + r.width / 2 - left, ARROW_INSET_PX), b.width - ARROW_INSET_PX);
		};
		const take = (el: HTMLElement) => {
			if (el === owner) return;
			// The first tooltip of a while waits as the system's do; a neighbour of one just shown comes at once (criterion 9da8bb6e).
			const delay = tooltipDelay(shown, performance.now(), warmUntil);
			hide();
			const title = el.getAttribute('title');
			if (!title?.trim()) return;
			owner = el;
			el.dataset.tip = title;
			el.removeAttribute('title');
			watch.observe(el, { attributes: true, attributeFilter: ['title'] });
			// Held aside all the same, so the browser shows none either.
			if (saidAlready(el, title)) return;
			timer = window.setTimeout(async () => {
				if (owner !== el || !el.isConnected) return;
				text = el.dataset.tip ?? title;
				await place(el);
				if (owner !== el) return;
				if (!el.hasAttribute('aria-describedby')) {
					el.setAttribute('aria-describedby', ID);
					described = true;
				}
				shown = true;
			}, delay);
		};
		const titled = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>('[title], [data-tip]') : null);
		const onOver = (e: PointerEvent) => {
			if (e.pointerType === 'touch') return;
			const el = titled(e.target);
			if (el) take(el);
			else if (owner && !(e.target instanceof Node && owner.contains(e.target))) hide();
		};
		const onFocus = (e: FocusEvent) => {
			const el = titled(e.target);
			if (el && e.target instanceof Element && e.target.matches(':focus-visible')) take(el);
		};
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && rest();
		// Focus leaves an element the page is removing (a dialog closing) in the middle of its update: hide after it.
		const onFocusOut = () => queueMicrotask(() => hide());
		const listen: [EventTarget, string, EventListener, boolean?][] = [
			[document, 'pointerover', onOver as EventListener],
			[document, 'pointerdown', rest],
			[document, 'focusin', onFocus as EventListener],
			[document, 'focusout', onFocusOut],
			[document, 'keydown', onKey as EventListener],
			[document, 'scroll', rest, true],
			[window, 'blur', rest]
		];
		for (const [target, type, fn, capture] of listen) target.addEventListener(type, fn, capture);
		return () => {
			hide();
			for (const [target, type, fn, capture] of listen) target.removeEventListener(type, fn, capture);
		};
	});
</script>

<div
	bind:this={bubble}
	id={ID}
	role="tooltip"
	class="app-tooltip pointer-events-none fixed top-0 left-0 z-[100] max-w-[260px] border border-night bg-ink px-2.5 py-1.5 font-evo-mono text-xs leading-snug font-medium whitespace-pre-line text-paper"
	data-shown={shown || undefined}
	data-below={below || undefined}
	style="translate: {left}px {top}px; --arrow: {arrow}px"
>
	{text}
	<span aria-hidden="true" class="app-tooltip-arrow"></span>
</div>
