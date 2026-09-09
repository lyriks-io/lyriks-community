<script lang="ts">
	import type { Snippet } from 'svelte';
	import { presetSize, fitWithin, type DeviceKind } from '$domain/experience';
	import type { ExperienceStore } from '../draft-store.svelte';
	import BrowserChrome, { type DeviceOption } from './BrowserChrome.svelte';

	type PresetKind = Exclude<DeviceKind, 'auto' | 'custom'>;

	interface Props {
		store: ExperienceStore;
		url: string;
		onNavigate: (value: string) => void;
		/** Inline style for the page surface (bg/font/color). */
		surfaceStyle: string;
		initW: number;
		initH: number;
		children: Snippet;
	}
	let { store, url, onNavigate, surfaceStyle, initW, initH, children }: Props = $props();

	let deskW = $state(0);
	let deskH = $state(0);
	let win = $state({ x: 0, y: 0, w: 0, h: 0, placed: false });
	let activeDevice = $state<PresetKind | null>(null);

	// Fit + center the window (horizontally and vertically) once the desktop measures.
	$effect(() => {
		if (deskW > 0 && deskH > 0 && !win.placed) {
			const f = fitWithin(initW, initH, deskW - 48, deskH - 96);
			win = {
				w: f.w,
				h: f.h,
				x: Math.round((deskW - f.w) / 2),
				y: Math.max(36, Math.round((deskH - f.h) / 2)),
				placed: true
			};
		}
	});

	const DEVICES: DeviceOption[] = [
		{ id: 'mobile', icon: 'smartphone', label: 'Mobile' },
		{ id: 'tablet', icon: 'tablet', label: 'Tablet' },
		{ id: 'desktop', icon: 'monitor', label: 'Desktop' },
		{ id: 'tv', icon: 'tv', label: 'TV' }
	];
	function setRatio(kind: PresetKind) {
		const p = presetSize(kind);
		const f = fitWithin(p.w, p.h, deskW - 32, deskH - 80);
		activeDevice = kind;
		win = {
			...win,
			w: f.w,
			h: f.h,
			x: Math.min(win.x, Math.max(8, deskW - f.w - 8)),
			y: Math.min(win.y, Math.max(40, deskH - f.h - 8))
		};
	}

	// ── drag / resize (pointer events + capture, so touch and pen work too) ──
	let mode: 'move' | 'resize' | null = null;
	let startRef = { mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0 };
	const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
	function onDown(m: 'move' | 'resize', e: PointerEvent) {
		mode = m;
		startRef = { mx: e.clientX, my: e.clientY, x: win.x, y: win.y, w: win.w, h: win.h };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		e.preventDefault();
	}
	function onMove(e: PointerEvent) {
		if (!mode) return;
		const dx = e.clientX - startRef.mx;
		const dy = e.clientY - startRef.my;
		if (mode === 'move') {
			// Keep at least 120px of the window reachable on every side.
			win = {
				...win,
				x: clamp(startRef.x + dx, 120 - win.w, deskW - 120),
				y: clamp(startRef.y + dy, 32, deskH - 40)
			};
		} else {
			win = {
				...win,
				w: clamp(startRef.w + dx, 280, deskW - 16),
				h: clamp(startRef.h + dy, 220, deskH - 48)
			};
		}
	}
	function onUp() {
		mode = null;
	}

	// live clock for the menu bar (client only)
	let clock = $state('');
	$effect(() => {
		const tick = () => {
			const d = new Date();
			clock = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) +
				'  ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
		};
		tick();
		const id = setInterval(tick, 30000);
		return () => clearInterval(id);
	});
</script>

<div
	bind:clientWidth={deskW}
	bind:clientHeight={deskH}
	class="relative h-full w-full overflow-hidden select-none"
	style="background:linear-gradient(160deg,#3b6ea5 0%,#5a4b8a 45%,#9b5d8a 100%)"
>
	<!-- desktop menu bar (deliberately generic and inert — no fake OS menus) -->
	<div class="absolute inset-x-0 top-0 z-30 flex h-7 items-center gap-4 bg-black/25 px-3 text-xs font-medium text-white backdrop-blur-md">
		<span class="font-semibold">{store.productName || 'Simulator'}</span>
		<span class="ml-auto tabular-nums opacity-90">{clock}</span>
	</div>

	<!-- the browser window -->
	<div
		class="absolute overflow-hidden rounded-xl border border-black/20 bg-white shadow-2xl"
		style="left:{win.x}px;top:{win.y}px;width:{win.w}px;height:{win.h}px"
	>
		<!-- title bar (drag to move) -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			role="toolbar"
			tabindex="-1"
			aria-label="Window title bar - drag to move"
			onpointerdown={(e) => onDown('move', e)}
			onpointermove={onMove}
			onpointerup={onUp}
			class="cursor-grab touch-none active:cursor-grabbing"
		>
			<BrowserChrome
				{url}
				{onNavigate}
				devices={DEVICES}
				{activeDevice}
				onPickDevice={(id) => setRatio(id as PresetKind)}
			/>
		</div>

		<!-- page content -->
		<div class="h-[calc(100%-2.25rem)] overflow-auto p-3" style={surfaceStyle}>
			{@render children()}
		</div>

		<!-- resize handle (bottom-right) -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			role="separator"
			aria-label="Resize window"
			onpointerdown={(e) => onDown('resize', e)}
			onpointermove={onMove}
			onpointerup={onUp}
			class="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none"
			style="background:linear-gradient(135deg,transparent 50%,rgba(0,0,0,0.25) 50%)"
		></div>
	</div>

	<!-- dock hint (decorative) -->
	<div class="absolute inset-x-0 bottom-2 z-20 flex justify-center" aria-hidden="true">
		<div class="flex items-center gap-3 rounded-2xl bg-white/20 px-4 py-2 shadow-lg backdrop-blur-md">
			<span class="size-5 rounded-md bg-white/35"></span>
			<span class="size-5 rounded-md bg-white/35"></span>
			<span class="size-5 rounded-md bg-white/35"></span>
		</div>
	</div>
</div>
