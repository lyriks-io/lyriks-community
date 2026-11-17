<script lang="ts">
	import type { Snippet } from 'svelte';
	import { JOINT, controlsLook, tabPath, type FollowPlace } from './controls-follow';

	/**
	 * The tab a long section's controls follow it in (ac-evo-form-controls-follow):
	 * its frame stretched out of its right edge, one outline with the section's
	 * border. It comes in two beats: the material stretches out of the edge on
	 * a spring that overshoots a little and settles, then the icons arrive one
	 * after the other, rising as they fade in. It leaves in one: the whole tab,
	 * its frame and its icons together,
	 * shrinks at once into the middle of the edge, the caller keeping its place
	 * glued to the section meanwhile. Each frame redraws two paths and moves nothing laid
	 * out. Asked for less motion, it is there or gone at once.
	 */
	interface Props {
		open: boolean;
		/** Where it sits against its section, kept up to date while it leaves. */
		place: FollowPlace | null;
		/** The section's frame, so the tab is the same material. */
		frame: { readonly border: string; readonly width: number; readonly bg: string };
		/** The tab's height at full size, measured by the caller from the content. */
		height: number;
		/** Reports the content's height, so the caller places the tab on its real size. */
		onheight: (px: number) => void;
		label: string;
		children: Snippet;
	}
	let { open, place, frame, height, onheight, label, children }: Props = $props();

	/** The strip: one 28 px target plus its padding, and the frame's border. */
	const WIDTH = 36;
	// Springs, in radians a second and damping ratio: let go, the material settles past its mark and back; drawn back,
	// it follows without bouncing.
	const STRETCH = { omega: 18, zeta: 0.5 };
	const RETRACT = { omega: 32, zeta: 1 };
	const LONGEST_FRAME_S = 0.032;
	const REST = 0.002;
	// The icons' beat: each one this long after the one above it.
	const STAGGER_MS = 25;

	let svgLine = $state<SVGPathElement | null>(null);
	let svgFill = $state<SVGPathElement | null>(null);
	let content = $state<HTMLElement | null>(null);
	/** Shown at all: from the first frame out to the last frame back in. */
	let shown = $state(false);
	let stretch = 0;
	let speed = 0;
	let target = 0;
	let frameId = 0;
	let last = 0;
	/** The icons' beat has played since the tab last came out: they follow the material from then on. */
	let iconsIn = false;
	/**
	 * Drawn back in since it last came out: the whole tab shrinks as one piece with its controls, and keeps that shape
	 * if it is called out again on its way, until it has gone.
	 */
	let leaving = false;
	const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	function draw() {
		if (!place) return;
		const { line, fill, top } = tabPath(stretch, { width: WIDTH, height, side: place.side, border: frame.width, leaving });
		for (const [path, d] of [[svgLine, line], [svgFill, fill]] as const) {
			path?.setAttribute('d', d);
			path?.setAttribute('transform', `translate(0 ${top.toFixed(2)})`);
		}
		if (!content) return;
		// The icons are hidden until their beat, then sized by the material: drawn back in, they shrink into the edge.
		const look = controlsLook(stretch);
		content.style.opacity = iconsIn ? String(look.opacity) : '0';
		content.style.transform = look.scale < 1 ? `scale(${look.scale.toFixed(3)})` : '';
		content.style.transformOrigin = place.side === 'out' ? 'left center' : 'right center';
	}
	/** The second beat: the icons one after the other, rising as they fade in. Nothing waits on it, so nothing is left hanging. */
	function iconsArrive() {
		iconsIn = true;
		if (reduced()) return;
		const items = content?.querySelectorAll<HTMLElement>('button, [role="img"], [role="status"]') ?? [];
		items.forEach((el, i) =>
			el.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], {
				duration: 180,
				delay: i * STAGGER_MS,
				easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
				fill: 'backwards'
			})
		);
	}
	function tick(now: number) {
		const dt = Math.min(LONGEST_FRAME_S, (now - last) / 1000);
		last = now;
		const { omega, zeta } = target ? STRETCH : RETRACT;
		speed += (-omega * omega * (stretch - target) - 2 * zeta * omega * speed) * dt;
		stretch += speed * dt;
		// The second beat: the icons once the material is nearly out.
		if (target && !iconsIn && stretch > 0.85) iconsArrive();
		draw();
		if (Math.abs(stretch - target) < REST && Math.abs(speed) < REST * 10) {
			stretch = target;
			frameId = 0;
			if (!target) {
				shown = false;
				iconsIn = false;
				leaving = false;
			}
			draw();
			return;
		}
		frameId = requestAnimationFrame(tick);
	}
	function run() {
		if (frameId) return;
		last = performance.now();
		frameId = requestAnimationFrame(tick);
	}
	$effect(() => {
		const want = open && !!place;
		if (want === !!target) return;
		if (reduced()) {
			target = stretch = want ? 1 : 0;
			speed = 0;
			shown = want;
			iconsIn = want;
			queueMicrotask(draw);
			return;
		}
		// Out: the material first, the icons once it is nearly out (tick). Back in: at once, the icons with it;
		// called back on its way in, it simply stretches out again, icons kept.
		target = want ? 1 : 0;
		if (want) shown = true;
		else leaving = true;
		queueMicrotask(run);
	});
	$effect(() => () => cancelAnimationFrame(frameId));
	// The caller places the tab on the content's real height.
	$effect(() => {
		if (!content) return;
		const watch = new ResizeObserver(() => onheight((content?.offsetHeight ?? 0) + 8));
		watch.observe(content);
		return () => watch.disconnect();
	});
	// A move of the place (a scroll, a resize) redraws at once.
	$effect(() => {
		void place;
		void height;
		draw();
	});

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}
	const svgBox = $derived(
		place
			? {
					left: place.side === 'out' ? place.edge - frame.width - 2 : place.edge - WIDTH * 1.2 - JOINT - 2,
					top: place.top - JOINT - 2,
					width: WIDTH * 1.2 + JOINT + frame.width + 4,
					height: height + 2 * JOINT + 4
				}
			: null
	);
	// The border's centre line, where the outline leaves the section.
	const originX = $derived(place && svgBox ? place.edge - frame.width / 2 - svgBox.left : 0);
</script>

<div use:portal class="pointer-events-none" aria-hidden={!shown}>
	{#if svgBox}
		<svg
			class="fixed z-10 overflow-visible"
			style="left:{svgBox.left}px; top:{svgBox.top}px; width:{svgBox.width}px; height:{svgBox.height}px; visibility:{shown ? 'visible' : 'hidden'};"
			aria-hidden="true"
		>
			<g transform="translate({originX} {JOINT + 2})">
				<path bind:this={svgFill} fill={frame.bg} />
				<path bind:this={svgLine} fill="none" stroke={frame.border} stroke-width={frame.width} />
			</g>
		</svg>
	{/if}
	<div
		bind:this={content}
		role="toolbar"
		aria-label="{label}: controls"
		inert={!shown}
		data-controls-follow={place?.side ?? 'hidden'}
		data-shown={shown || null}
		class="fixed z-10 flex flex-col items-center opacity-0 {shown ? 'pointer-events-auto' : ''}"
		style:width="{WIDTH - 8}px"
		style:left="{place ? (place.side === 'out' ? place.edge + 3 : place.edge - frame.width - WIDTH + 4) : -9999}px"
		style:top="{place ? place.top + 4 : -9999}px"
		style:visibility={shown ? null : 'hidden'}
	>
		{@render children()}
	</div>
</div>
