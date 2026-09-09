<script lang="ts">
	import { browser } from '$app/environment';
	import { Icon } from '$ui/design-system';

	interface Props {
		code: string;
		/** Height of the pannable canvas — any CSS length (px, calc(), max(), …). */
		height?: string;
	}
	let { code, height = '460px' }: Props = $props();

	let viewport = $state<HTMLDivElement | null>(null);
	let canvas = $state<HTMLDivElement | null>(null);
	let error = $state<string | null>(null);

	// Viewport transform: the rendered SVG keeps its natural size and we translate
	// then scale it, so zooming stays crisp (vector) instead of resampling a bitmap.
	let scale = $state(1);
	let tx = $state(0);
	let ty = $state(0);
	let dragging = $state(false);
	let natural = $state({ w: 0, h: 0 });

	const MIN_SCALE = 0.2;
	const MAX_SCALE = 4;
	const PADDING = 16;

	const clamp = (k: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, k));

	/** Scale the diagram down to fit the viewport (never up) and centre it. */
	function fit() {
		if (!viewport || !natural.w || !natural.h) return;
		const vw = viewport.clientWidth - PADDING * 2;
		const vh = viewport.clientHeight - PADDING * 2;
		scale = clamp(Math.min(1, vw / natural.w, vh / natural.h));
		tx = (viewport.clientWidth - natural.w * scale) / 2;
		ty = (viewport.clientHeight - natural.h * scale) / 2;
	}

	/** Zoom keeping the point under (cx, cy) — viewport coordinates — anchored. */
	function zoomAt(factor: number, cx: number, cy: number) {
		const next = clamp(scale * factor);
		if (next === scale) return;
		tx = cx - ((cx - tx) * next) / scale;
		ty = cy - ((cy - ty) * next) / scale;
		scale = next;
	}

	function zoomByButton(factor: number) {
		if (!viewport) return;
		zoomAt(factor, viewport.clientWidth / 2, viewport.clientHeight / 2);
	}

	// Mermaid is heavy and browser-only — load it lazily on first render so it
	// never touches the SSR bundle, and never the network (it ships bundled, no
	// CDN). Cached across re-renders.
	let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
	function loadMermaid() {
		if (!mermaidPromise) {
			mermaidPromise = import('mermaid').then((m) => {
				m.default.initialize({
					startOnLoad: false,
					theme: 'neutral',
					securityLevel: 'strict',
					// The canvas handles sizing — let the SVG keep its natural dimensions.
					er: { useMaxWidth: false }
				});
				return m.default;
			});
		}
		return mermaidPromise;
	}

	$effect(() => {
		const source = code; // track
		if (!browser || !canvas) return;
		let cancelled = false;
		error = null;
		loadMermaid()
			.then((mermaid) => mermaid.render(`er-${crypto.randomUUID()}`, source))
			.then(({ svg }) => {
				if (cancelled || !canvas) return;
				canvas.innerHTML = svg;
				const el = canvas.querySelector('svg');
				if (!el) return;
				const [, , w, h] = (el.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
				natural = { w: w || el.clientWidth, h: h || el.clientHeight };
				el.removeAttribute('style');
				el.setAttribute('width', `${natural.w}`);
				el.setAttribute('height', `${natural.h}`);
				fit();
			})
			.catch((e) => {
				if (cancelled) return;
				error = e instanceof Error ? e.message : 'Could not render the diagram.';
			});
		return () => {
			cancelled = true;
		};
	});

	// Wheel zoom needs preventDefault, which Svelte's `onwheel` cannot do (passive).
	$effect(() => {
		const el = viewport;
		if (!el) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			const rect = el.getBoundingClientRect();
			zoomAt(
				Math.exp(-event.deltaY * 0.002),
				event.clientX - rect.left,
				event.clientY - rect.top
			);
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
	});

	// Pan from clientX/Y deltas, not movementX/Y — movement* is reported in raw
	// device pixels on some browsers, so under display scaling or page zoom the
	// diagram drifts faster or slower than the cursor.
	let last = { x: 0, y: 0 };
	function onPointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		// Stop the browser from starting a text selection on the SVG labels.
		event.preventDefault();
		dragging = true;
		last = { x: event.clientX, y: event.clientY };
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}
	function onPointerMove(event: PointerEvent) {
		if (!dragging) return;
		tx += event.clientX - last.x;
		ty += event.clientY - last.y;
		last = { x: event.clientX, y: event.clientY };
	}
	function onPointerUp(event: PointerEvent) {
		dragging = false;
		(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
	}

	function onKeyDown(event: KeyboardEvent) {
		const step = event.shiftKey ? 80 : 24;
		const moves: Record<string, () => void> = {
			ArrowLeft: () => (tx += step),
			ArrowRight: () => (tx -= step),
			ArrowUp: () => (ty += step),
			ArrowDown: () => (ty -= step),
			'+': () => zoomByButton(1.2),
			'=': () => zoomByButton(1.2),
			'-': () => zoomByButton(1 / 1.2),
			'0': fit
		};
		const move = moves[event.key];
		if (!move) return;
		event.preventDefault();
		move();
	}
</script>

{#if error}
	<div class="rounded-field border border-danger-200 bg-danger-50 px-3 py-2 text-[11px] text-danger-600">
		Diagram error: {error}
	</div>
{/if}

<div class="relative">
	<!-- Pannable / zoomable canvas: drag to pan, wheel to zoom, arrows + / - / 0 via keyboard.
	     It is a custom widget, hence role="application" plus its own key handling; the zoom
	     controls below stay reachable for anyone who cannot drag. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={viewport}
		role="application"
		tabindex="0"
		aria-label="Data model diagram: drag to pan, scroll to zoom"
		class="mermaid-viewport relative w-full touch-none select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
		class:cursor-grabbing={dragging}
		class:cursor-grab={!dragging}
		style="height: {height}"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		ondblclick={fit}
		onkeydown={onKeyDown}
	>
		<div
			bind:this={canvas}
			class="absolute left-0 top-0 origin-top-left"
			style="transform: translate({tx}px, {ty}px) scale({scale})"
		></div>
	</div>

	<div class="absolute right-2 top-2 flex items-center gap-1 rounded-field border border-line bg-surface/90 p-1 shadow-sm backdrop-blur">
		<button
			type="button"
			class="inline-flex h-6 w-6 items-center justify-center rounded-field text-ink-500 hover:bg-surface-sunken hover:text-ink-700"
			aria-label="Zoom out"
			onclick={() => zoomByButton(1 / 1.2)}
		>
			<Icon name="minus" size={14} />
		</button>
		<span class="w-10 text-center font-mono text-[10px] text-ink-500">{Math.round(scale * 100)}%</span>
		<button type="button" class="inline-flex h-6 w-6 items-center justify-center rounded-field text-ink-500 hover:bg-surface-sunken hover:text-ink-700" aria-label="Zoom in" onclick={() => zoomByButton(1.2)}>
			<Icon name="plus" size={14} />
		</button>
		<button type="button" class="inline-flex h-6 w-6 items-center justify-center rounded-field text-ink-500 hover:bg-surface-sunken hover:text-ink-700" aria-label="Fit to view" onclick={fit}>
			<Icon name="maximize" size={14} />
		</button>
	</div>
</div>

<style>
	.mermaid-viewport :global(svg) {
		max-width: none;
		display: block;
	}
</style>
