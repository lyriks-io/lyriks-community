<script lang="ts" module>
	import type { DeviceShape } from '$application/spec360/tech';
	import { ICONS } from '$ui/design-system/Icon.svelte';

	const DOT = 'fill="currentColor" stroke="none"';
	// The form factors a box cannot draw, as line drawings on a 24 by 24 grid. Inner markup is static and trusted.
	const DRAWINGS: Readonly<Partial<Record<DeviceShape, string>>> = {
		chat: `<path d="M5 4h14a2 2 0 012 2v9a2 2 0 01-2 2h-8l-4.5 3.5V17H5a2 2 0 01-2-2V6a2 2 0 012-2z"/><circle cx="8" cy="10.5" r="1.1" ${DOT}/><circle cx="12" cy="10.5" r="1.1" ${DOT}/><circle cx="16" cy="10.5" r="1.1" ${DOT}/>`,
		microphone: '<rect x="9" y="2.5" width="6" height="11.5" rx="3"/><path d="M5.5 10.5a6.5 6.5 0 0013 0"/><path d="M12 17v4"/><path d="M8.5 21h7"/>',
		hand: '<path d="M8 14V5.5a1.5 1.5 0 013 0V11"/><path d="M11 10.5V4a1.5 1.5 0 013 0v6.5"/><path d="M14 10.5V5.5a1.5 1.5 0 013 0V11"/><path d="M17 11V8a1.5 1.5 0 013 0v6a7 7 0 01-7 7h-1.6a6 6 0 01-4.3-1.8l-3.4-3.6a1.5 1.5 0 012.2-2.1L8 14"/>',
		eye: `<path d="M2.5 12C5 7.5 8.5 5.5 12 5.5s7 2 9.5 6.5c-2.5 4.5-6 6.5-9.5 6.5s-7-2-9.5-6.5z"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="1" ${DOT}/>`,
		headset: '<path d="M5 7V5.5A1.5 1.5 0 016.5 4h11A1.5 1.5 0 0119 5.5V7"/><path d="M2.5 9a2 2 0 012-2h15a2 2 0 012 2v6.5a2 2 0 01-2 2h-3.6a2 2 0 01-1.7-1l-.9-1.6a1.5 1.5 0 00-2.6 0l-.9 1.6a2 2 0 01-1.7 1H4.5a2 2 0 01-2-2z"/>',
		braces: `<path d="M8 3H7a2 2 0 00-2 2v5a2 2 0 01-2 2 2 2 0 012 2v5a2 2 0 002 2h1"/><path d="M16 3h1a2 2 0 012 2v5a2 2 0 002 2 2 2 0 00-2 2v5a2 2 0 01-2 2h-1"/><circle cx="9" cy="12" r="1.1" ${DOT}/><circle cx="12" cy="12" r="1.1" ${DOT}/><circle cx="15" cy="12" r="1.1" ${DOT}/>`,
		bolt: '<path d="M13 2.5L4.5 13.5H12l-1 8 8.5-11H12z"/>',
		robot: `<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V5"/><circle cx="12" cy="3.6" r="1.4"/><path d="M2 13v3"/><path d="M22 13v3"/><circle cx="9" cy="13" r="1.3" ${DOT}/><circle cx="15" cy="13" r="1.3" ${DOT}/><path d="M10 16.5h4"/>`,
		// The AI agent is drawn with the sparkles every AI action of the product carries.
		sparkles: ICONS.sparkles,
		prompt: '<rect x="2.5" y="7" width="19" height="10" rx="3"/><path d="M7 10v4"/><path d="M12.5 12h5"/><path d="M15.5 9.5L18 12l-2.5 2.5"/>',
		blocks: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" transform="rotate(15 17.25 6.75)"/>',
		'window-in-window': '<rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="M2.5 8.5h19"/><rect x="11" y="11.5" width="7.5" height="5.5" rx="1"/>',
		sensor: '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 000 7"/><path d="M15.5 8.5a5 5 0 010 7"/><path d="M5.6 5.6a9 9 0 000 12.8"/><path d="M18.4 5.6a9 9 0 010 12.8"/>',
		'face-scan': '<path d="M3 8V5a2 2 0 012-2h3"/><path d="M16 3h3a2 2 0 012 2v3"/><path d="M21 16v3a2 2 0 01-2 2h-3"/><path d="M8 21H5a2 2 0 01-2-2v-3"/><path d="M9 9v1.5"/><path d="M15 9v1.5"/><path d="M12 9v4h-1"/><path d="M9 15.5a4 4 0 006 0"/>',
		// Twelve even dashes around the circle: nothing to see, yet it is there.
		ambient: `<circle cx="12" cy="12" r="9" stroke-dasharray="2.356 2.356"/><circle cx="12" cy="12" r="1.3" ${DOT}/>`
	};
	const SIZE = 60;
	// The 2.5px line the boxes are drawn with, in grid units.
	const STROKE = (2.5 * 24) / SIZE;
</script>

<script lang="ts">
	/**
	 * A device drawn in outline under its name, the way the v2 design draws
	 * where a product runs (criterion 4af7cac8): a phone, a tablet, a desktop
	 * screen, a browser window, a terminal, and a drawing for every other form
	 * factor (a speech bubble, braces for an API...), or a server for a machine.
	 */
	interface Props {
		shape: DeviceShape | 'server';
		label: string;
		/** A second line under the name: a machine's kind and place. */
		detail?: string;
	}
	let { shape, label, detail = '' }: Props = $props();
	const LINE = 'box-border border-[2.5px] border-evo-ink';
	// The design's device (.ly-device): an ink outline on paper.
	const PAPER = `${LINE} bg-paper`;
	const drawing = $derived(shape === 'server' ? undefined : DRAWINGS[shape]);
</script>

<span class="flex max-w-[150px] flex-col items-center gap-1.5 text-center text-xs text-ink-2">
	<!-- Centred in its box: a drawing on the 24 grid keeps a margin a box does not, so their centres line up, not their feet. -->
	<span class="flex h-[60px] items-center" aria-hidden="true">
		{#if drawing}
			<svg
				class="block text-evo-ink"
				width={SIZE}
				height={SIZE}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width={STROKE}
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html drawing}
			</svg>
		{:else if shape === 'phone'}
			<span class="{PAPER} block h-[60px] w-[34px]"></span>
		{:else if shape === 'tablet'}
			<span class="{PAPER} block h-[56px] w-[70px]"></span>
		{:else if shape === 'desktop'}
			<span class="flex flex-col items-center">
				<span class="{PAPER} block h-[44px] w-[72px]"></span>
				<span class="block h-2 w-[3px] bg-evo-ink"></span>
				<span class="block h-[3px] w-7 rounded-sm bg-evo-ink"></span>
			</span>
		{:else if shape === 'browser'}
			<span class="{PAPER} flex h-[52px] w-[76px] flex-col">
				<span class="flex h-3 items-center gap-[3px] border-b-2 border-evo-ink px-1"><i class="size-[3px] bg-evo-ink"></i><i class="size-[3px] bg-evo-ink"></i><i class="size-[3px] bg-evo-ink"></i></span>
			</span>
		{:else if shape === 'terminal'}
			<span class="{LINE} flex h-[48px] w-[72px] items-start bg-evo-ink p-1.5 font-evo-mono text-[0.6875rem] leading-none font-bold text-white">&gt;_</span>
		{:else if shape === 'terminal-panel'}
			<!-- A text UI: the terminal holding a framed panel and its list. -->
			<span class="{LINE} flex h-[48px] w-[72px] bg-evo-ink p-1.5">
				<span class="flex flex-1 flex-col justify-center gap-[3px] border-[1.5px] border-white px-1.5">
					<i class="block h-[3px] w-full bg-white"></i>
					<i class="block h-[3px] w-2/3 bg-white/60"></i>
				</span>
			</span>
		{:else}
			<span class="flex flex-col gap-[3px]">
				<span class="{PAPER} flex h-[17px] w-[60px] items-center px-1.5"><i class="size-[4px] bg-evo-ink"></i></span>
				<span class="{PAPER} flex h-[17px] w-[60px] items-center px-1.5"><i class="size-[4px] bg-evo-ink"></i></span>
				<span class="{PAPER} flex h-[17px] w-[60px] items-center px-1.5"><i class="size-[4px] bg-evo-ink"></i></span>
			</span>
		{/if}
	</span>
	<span class="leading-tight">{label}</span>
	{#if detail}<span class="-mt-1 text-xs leading-tight text-evo-muted">{detail}</span>{/if}
</span>
