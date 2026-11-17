<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { portalWhile } from './enlarge.svelte';
	import { flyOrFade } from './reduced-motion';

	/**
	 * The v2 design's detail drawer: it slides in from the right over a dimmed
	 * page, says what it is (a mono kicker, a title) and closes by its cross,
	 * a click on the dimmed page or Escape. Focus moves into it and returns to
	 * where it was; Tab stays inside while it is open. It lives under <body>:
	 * a page block that rose in (animate-lk-in keeps its transform) would
	 * otherwise hold the fixed drawer inside its own box.
	 */
	interface Props {
		open: boolean;
		onClose: () => void;
		title: string;
		kicker?: string;
		/** The kicker in red: a point to review. */
		alert?: boolean;
		/** What the drawer holds, for assistive tech. */
		label?: string;
		children: Snippet;
		/** Its last line: the way to the feature, Close. */
		foot?: Snippet;
		/** The title as the caller draws it (a field of an Edit mode); `title` still names the drawer. */
		heading?: Snippet;
	}
	let { open, onClose, title, kicker, alert = false, label, children, foot, heading }: Props = $props();

	let panel = $state<HTMLElement | null>(null);
	let back: HTMLElement | null = null;

	$effect(() => {
		if (!open || !panel) return;
		back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		panel.querySelector<HTMLElement>('[data-drawer-close]')?.focus();
		return () => back?.focus?.();
	});

	function keydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onClose();
			return;
		}
		if (e.key !== 'Tab' || !panel) return;
		const all = [...panel.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input, textarea, select, [tabindex]:not([tabindex="-1"])')];
		if (all.length === 0) return;
		const first = all[0];
		const last = all[all.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}
</script>

<div class="contents" use:portalWhile={true}>
{#if open}
	<div class="fixed inset-0 z-50 flex font-evo text-evo-ink" role="presentation" onkeydown={keydown}>
		<button type="button" tabindex="-1" aria-label="Close" class="flex-1 cursor-default border-0 bg-ink/45" data-reduced-fade transition:fade={{ duration: 180 }} onclick={onClose}></button>
		<div
			bind:this={panel}
			role="dialog"
			aria-modal="true"
			aria-label={label ?? title}
			class="box-border h-full w-[min(560px,100%)] overflow-auto border-l-2 border-ink bg-paper p-7"
			data-reduced-fade
			transition:flyOrFade={{ x: 48, duration: 260, easing: cubicOut, opacity: 0 }}
		>
			<div class="flex items-start gap-4">
				<div class="min-w-0 flex-1">
					{#if kicker}<div class="font-evo-mono text-xs tracking-[0.08em] uppercase {alert ? 'text-red-ink' : 'text-ink-3'}">{kicker}</div>{/if}
					<h2 class="m-0 mt-2 text-[1.375rem] leading-[1.3] font-bold tracking-[-0.02em] text-ink">{#if heading}{@render heading()}{:else}{title}{/if}</h2>
				</div>
				<button
					type="button"
					data-drawer-close
					aria-label="Close"
					onclick={onClose}
					class="flex size-10 flex-none cursor-pointer items-center justify-center border-[1.5px] border-line bg-transparent text-ink hover:border-ink"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>
				</button>
			</div>
			<div class="mt-4">{@render children()}</div>
			{#if foot}<div class="mt-7 flex flex-wrap items-center gap-1.5">{@render foot()}</div>{/if}
		</div>
	</div>
{/if}
</div>
