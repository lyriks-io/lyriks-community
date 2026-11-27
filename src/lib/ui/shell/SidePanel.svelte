<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import SideIcon from './SideIcon.svelte';

	/**
	 * A panel that slides out beside the navigation (the design's .pal): the
	 * search, the notifications, the projects, one at a time, over the dimmed
	 * page. Escape, its close button or a press outside it closes it (action
	 * 5f1ce6f1); a press on the navigation button that opened it leaves that
	 * button to toggle it. The focus goes into it, then back where it was.
	 */
	interface Props {
		open: boolean;
		label: string;
		onclose: () => void;
		/** What takes the focus when it opens; the close button otherwise. */
		focus?: () => HTMLElement | null | undefined;
		head: Snippet;
		children: Snippet;
		foot?: Snippet;
		/** Escape is the panel's own (an inline field cancels first). */
		onescape?: (e: KeyboardEvent) => boolean;
	}
	let { open, label, onclose, focus, head, children, foot, onescape }: Props = $props();

	let panel = $state<HTMLElement>();
	let closer = $state<HTMLButtonElement>();

	$effect(() => {
		if (!open) return;
		const before = document.activeElement as HTMLElement | null;
		void tick().then(() => (focus?.() ?? closer)?.focus());
		const onDown = (e: PointerEvent) => {
			const target = e.target as HTMLElement;
			if (panel?.contains(target) || target.closest('[data-panel-trigger]')) return;
			onclose();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape' || e.defaultPrevented) return;
			if (onescape?.(e)) return;
			onclose();
		};
		document.addEventListener('pointerdown', onDown, true);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onDown, true);
			document.removeEventListener('keydown', onKey);
			if (before?.isConnected && panel?.contains(document.activeElement)) before.focus();
		};
	});
</script>

{#if open}
	<div class="lk-pal-scrim" aria-hidden="true"></div>
	<div bind:this={panel} class="lk-pal" role="dialog" aria-label={label}>
		<div class="palh">
			{@render head()}
			<button bind:this={closer} type="button" class="palx" aria-label="Close (Esc)" onclick={onclose}><SideIcon name="close" /></button>
		</div>
		<div class="palb">{@render children()}</div>
		{#if foot}<div class="palf">{@render foot()}</div>{/if}
	</div>
{/if}

<style>
	/* The design's palettes (.pal, .palh, .palb, .palf, .r, .sec, .kbd), shared by the three panels. */
	:global {
		.lk-pal-scrim {
			position: fixed;
			inset: 0 0 0 var(--side-w);
			z-index: 45;
			background: rgb(17 17 20 / 0.3);
			animation: lk-fade 0.15s ease both;
		}
		.lk-pal {
			position: fixed;
			top: 0;
			bottom: 0;
			left: var(--side-w);
			z-index: 46;
			display: flex;
			flex-direction: column;
			box-sizing: border-box;
			width: min(520px, calc(100% - var(--side-w)));
			border-right: 1.5px solid var(--color-ink);
			background: var(--color-paper);
			color: var(--color-ink);
			box-shadow: 4px 0 0 var(--color-toner-2);
			font-family: var(--font-evo);
			font-size: 0.8125rem;
			animation: lk-palin 0.16s ease both;
		}
		.lk-pal .palh {
			display: flex;
			flex: none;
			align-items: center;
			gap: 10px;
			height: 56px;
			padding: 0 10px 0 20px;
			border-bottom: 2px solid var(--color-ink);
			color: var(--color-ink-3);
		}
		.lk-pal .palh input {
			flex: 1;
			min-width: 0;
			height: 100%;
			padding: 0;
			border: 0;
			background: transparent;
			color: var(--color-ink);
			font: 400 0.9375rem var(--font-evo);
			outline: none;
		}
		.lk-pal .palh input::placeholder {
			color: var(--color-ink-4);
		}
		.lk-pal .palx {
			display: inline-flex;
			flex: none;
			align-items: center;
			justify-content: center;
			width: 36px;
			height: 36px;
			padding: 0;
			border: 1.5px solid var(--color-ink);
			background: var(--color-paper);
			color: var(--color-ink);
			cursor: pointer;
		}
		.lk-pal .palx:hover {
			background: var(--color-ink);
			color: var(--color-paper);
		}
		.lk-pal .palb {
			flex: 1;
			min-height: 0;
			padding: 4px 0 12px;
			overflow: auto;
		}
		.lk-pal .sec {
			padding: 16px 20px 6px;
			color: var(--color-ink-4);
			font: 400 0.625rem/1 var(--font-evo-mono);
			letter-spacing: 0.1em;
			text-transform: uppercase;
		}
		.lk-pal .r {
			display: flex;
			align-items: center;
			gap: 12px;
			box-sizing: border-box;
			width: 100%;
			min-height: 40px;
			padding: 0 20px;
			border: 0;
			background: none;
			color: var(--color-ink);
			font: 400 0.8125rem/1.3 var(--font-evo);
			text-align: left;
			cursor: pointer;
		}
		.lk-pal .r.hit {
			background: var(--color-blue-tint);
		}
		.lk-pal .r .g {
			flex: none;
			width: 76px;
			color: var(--color-ink-3);
			font: 400 0.625rem/1 var(--font-evo-mono);
			letter-spacing: 0.08em;
			text-transform: uppercase;
		}
		.lk-pal .r .tx {
			flex: 1;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		/* A rule reads its whole name on as many lines as it takes, then why it was found, then where it holds (criterion e11bf80b). */
		.lk-pal .r.rule {
			align-items: flex-start;
			padding-top: 10px;
			padding-bottom: 10px;
		}
		.lk-pal .r.rule .g {
			padding-top: 3px;
		}
		.lk-pal .r .rc {
			display: grid;
			flex: 1;
			gap: 4px;
			min-width: 0;
		}
		.lk-pal .r .rc .tx {
			line-height: 1.4;
			white-space: normal;
		}
		.lk-pal .r .rc .why {
			color: var(--color-ink-3);
			font-size: 0.75rem;
			line-height: 1.4;
		}
		.lk-pal .r .rc .p {
			max-width: none;
			line-height: 1.3;
		}
		.lk-pal .r .p {
			max-width: 34%;
			overflow: hidden;
			color: var(--color-ink-4);
			font: 400 0.6875rem/1 var(--font-evo-mono);
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.lk-pal .r .kbd {
			visibility: hidden;
		}
		.lk-pal .r.hit .kbd {
			visibility: visible;
		}
		.lk-pal mark {
			background: var(--color-orange-tint);
			color: inherit;
		}
		.lk-pal .e {
			padding: 16px 20px;
			color: var(--color-ink-3);
			font-size: 0.75rem;
		}
		.lk-pal .kbd {
			display: inline-flex;
			align-items: center;
			height: 18px;
			padding: 0 5px;
			border: 1px solid var(--color-line);
			color: var(--color-ink-3);
			font: 600 0.625rem/1 var(--font-evo-mono);
		}
		.lk-pal .palf {
			display: flex;
			flex: none;
			flex-wrap: wrap;
			align-items: center;
			gap: 14px;
			padding: 12px 20px;
			border-top: 2px solid var(--color-ink);
			color: var(--color-ink-3);
			font: 400 0.6875rem/1 var(--font-evo-mono);
		}
		.lk-pal .palf .kbd {
			margin-right: 3px;
		}
		.lk-pal .palf .pals {
			margin-left: auto;
		}
		.lk-pal .palf b {
			color: var(--color-ink);
		}
		.lk-pal .qa {
			display: inline-flex;
			align-items: center;
			height: 26px;
			padding: 0 2px;
			font-size: 0.625rem;
		}
		.lk-pal .qa.blue {
			border-bottom-color: var(--color-blue);
		}
		@media (max-width: 980px) {
			.lk-pal-scrim {
				left: 0;
			}
			.lk-pal {
				left: 0;
				width: 100%;
			}
		}
	}
	@keyframes -global-lk-palin {
		from {
			opacity: 0;
			transform: translateX(-12px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
</style>
