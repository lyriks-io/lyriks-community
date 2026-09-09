<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { presetSize } from '$domain/experience';
	import BrowserChrome, { type DeviceOption } from './BrowserChrome.svelte';

	interface Props {
		/** Resolved device kind — initializes the ratio. */
		deviceKind: string;
		/** Full URL shown in the address bar. */
		url: string;
		/** Inline style for the page surface (bg/font/color/radius). */
		surfaceStyle: string;
		/** Editable address bar (run mode): typing a path navigates. */
		onNavigate?: (value: string) => void;
		children: Snippet;
	}
	let { deviceKind, url, surfaceStyle, onNavigate, children }: Props = $props();

	type Ratio = 'fit' | 'mobile' | 'tablet' | 'tv';
	// Seed the ratio from the screen's device once; the selector overrides it after.
	let ratio = $state<Ratio>(
		untrack(() => {
			const d = deviceKind;
			return d === 'mobile' ? 'mobile' : d === 'tablet' ? 'tablet' : d === 'tv' ? 'tv' : 'fit';
		})
	);
	const DEVICES: DeviceOption[] = [
		{ id: 'fit', icon: 'monitor', label: 'Desktop (fill)' },
		{ id: 'mobile', icon: 'smartphone', label: 'Mobile' },
		{ id: 'tablet', icon: 'tablet', label: 'Tablet' },
		{ id: 'tv', icon: 'tv', label: 'TV' }
	];

	const sized = $derived(ratio !== 'fit');
	const preset = $derived(sized ? presetSize(ratio as 'mobile' | 'tablet' | 'tv') : { w: 0, h: 0 });
	// Desktop = fill the available space (tall window). Others = the device ratio, centered.
	const wrapStyle = $derived(sized ? `max-width:${preset.w}px` : '');
	const contentStyle = $derived(
		sized
			? `${surfaceStyle};aspect-ratio:${preset.w} / ${preset.h};overflow:auto`
			: `${surfaceStyle};min-height:68vh;overflow:auto`
	);
</script>

<div class="mx-auto w-full" style={wrapStyle}>
	<div class="overflow-hidden rounded-xl border border-line shadow-card">
		<BrowserChrome
			{url}
			{onNavigate}
			devices={DEVICES}
			activeDevice={ratio}
			onPickDevice={(id) => (ratio = id as Ratio)}
		/>

		<!-- page -->
		<div class="p-3" style={contentStyle}>
			{@render children()}
		</div>
	</div>
</div>
