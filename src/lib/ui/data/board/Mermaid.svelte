<script lang="ts">
	import { mintUuid } from '$ui/shell/mint-id';
	import { browser } from '$app/environment';
	import { DiagramEnlarger, EnlargedBackdrop, DiagramHeader, PanZoom, PanZoomCanvas, frameClass, portalWhile } from '$ui/design-system';

	interface Props {
		code: string;
		/** What the diagram shows, in plain words (ac-diag-title). */
		title: string;
		/** Height of the pannable canvas — any CSS length (px, calc(), max(), …). */
		height?: string;
		/** Evolution draws dots on the actual canvas, leaving its heading and notices plain. */
		dotted?: boolean;
	}
	let { code, title, height = '460px', dotted = false }: Props = $props();

	let canvas = $state<HTMLDivElement | null>(null);
	let error = $state<string | null>(null);

	// The rendered SVG keeps its natural size; the view translates then scales it,
	// so zooming stays crisp (vector) instead of resampling a bitmap.
	const view = new PanZoom();
	const enlarger = new DiagramEnlarger();
	$effect(() => enlarger.attach());

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
					// Mermaid 12 lays diagrams out with ELK and gives several types a
					// `neo` look by default. Keep the dagre layout and classic look these
					// diagrams have always had: no re-layout, no restyle, and no elkjs in
					// the bundle (vite/elkjs-excluded.js).
					layout: 'dagre',
					look: 'classic',
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
			.then((mermaid) => mermaid.render(`er-${mintUuid()}`, source))
			.then(({ svg }) => {
				if (cancelled || !canvas) return;
				canvas.innerHTML = svg;
				const el = canvas.querySelector('svg');
				if (!el) return;
				const [, , w, h] = (el.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
				const natural = { w: w || el.clientWidth, h: h || el.clientHeight };
				el.removeAttribute('style');
				el.setAttribute('width', `${natural.w}`);
				el.setAttribute('height', `${natural.h}`);
				view.setNatural(natural.w, natural.h);
			})
			.catch((e) => {
				if (cancelled) return;
				error = e instanceof Error ? e.message : 'Could not render the diagram.';
			});
		return () => {
			cancelled = true;
		};
	});
</script>

{#if error}
	<div class="rounded-field border border-danger-200 bg-danger-50 px-3 py-2 text-[0.6875rem] text-danger-600">
		Diagram error: {error}
	</div>
{/if}

<EnlargedBackdrop {enlarger} />
<div
	use:portalWhile={enlarger.enlarged}
	class="mermaid-frame {frameClass(enlarger.display)}"
	role={enlarger.enlarged ? 'dialog' : undefined}
	aria-modal={enlarger.enlarged ? 'true' : undefined}
	aria-label={enlarger.enlarged ? `${title}, enlarged` : undefined}
>
	<DiagramHeader {enlarger} {title} class="border-b border-line bg-surface px-3 py-2" />
	<PanZoomCanvas {view} {enlarger} {height} label={title} {dotted}>
		<div bind:this={canvas}></div>
	</PanZoomCanvas>
</div>

<style>
	.mermaid-frame :global(svg) {
		max-width: none;
		display: block;
	}
</style>
