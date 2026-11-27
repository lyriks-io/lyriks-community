<script lang="ts">
	import type { WorkspaceSummary } from '$application/ports';
	import type { LiveProcess } from '$lib/shared/app-chrome';
	import type { FirstStep } from './first-steps-guide';
	import LiveProcessChip from './LiveProcessChip.svelte';
	import HelpMenu from './HelpMenu.svelte';
	import AccountMenu from './AccountMenu.svelte';
	import { page } from '$app/state';
	import { projectIdOfPath } from './app-nav';
	import { SIDE_ASK_ELSE_ID, SIDE_ASK_ID } from './side-ask';

	/**
	 * The foot of the navigation (criterion 81cc595c): what runs now on the
	 * project, each a row whose bars move while it runs, Ask my AI on every page
	 * (criterion 44aa7b4f): the page's own on a page of the Specification 360°
	 * (moved here by the page, intoSideAsk), else the project's own, asking
	 * about the page itself (intoSideAskElse, rule 8ddf1393), greyed outside a
	 * project; then Help & support and the account, both opening upward. The reader's own AI on the project reads in the top bar
	 * (ac-ai-session-band).
	 */
	interface Props {
		live: readonly LiveProcess[];
		steps: FirstStep[];
		email?: string;
		memberName?: string;
		workspaces?: WorkspaceSummary[];
		activeWorkspace?: string | null;
	}
	let { live, steps, email, memberName, workspaces = [], activeWorkspace = null }: Props = $props();
	const projectId = $derived(projectIdOfPath(page.url.pathname));
</script>

{#snippet spark()}
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" aria-hidden="true"
		><path d="M11 3.5l1.8 5.2 5.2 1.8-5.2 1.8L11 17.5l-1.8-5.2L4 10.5l5.2-1.8z"></path><path d="M18.5 15.5v5M16 18h5"></path></svg
	>
{/snippet}

<div class="sf">
	{#each live as process (process.href)}
		<LiveProcessChip {process} />
	{/each}
	<div id={SIDE_ASK_ID} class="side-ask empty:hidden"></div>
	<!-- Shown while no page put its own Ask my AI above: the project's own, whose question bears on the page itself (rule 8ddf1393). -->
	<div class="side-ask side-ask-else">
		{#if projectId}
			<div id={SIDE_ASK_ELSE_ID}></div>
		{:else}
			<span class="si ask-row" aria-disabled="true" data-tip="Ask my AI: open a project first" title="Open a project to ask your AI about it"
				><span class="lab">{@render spark()}<span class="txt">Ask my AI</span></span></span
			>
		{/if}
	</div>
	<HelpMenu {steps} />
	<AccountMenu {email} {memberName} {workspaces} {activeWorkspace} />
</div>

<style>
	/* The foot of the design's sidebar (.sf) and its menus (.fm). */
	:global {
		.lk-side .sf {
			display: flex;
			flex: none;
			flex-direction: column;
			gap: 2px;
			padding: 6px 0 8px;
			border-top: 1px solid var(--color-night);
		}
		.lk-side .fw {
			position: relative;
		}
		.lk-side .fb .menu-cv {
			flex: none;
			margin-left: auto;
			color: var(--color-ink-4);
			transition: transform 0.12s;
		}
		.lk-side .fb[aria-expanded='true'] {
			background: var(--color-night);
			color: var(--color-paper);
		}
		.lk-side .fb[aria-expanded='true'] .menu-cv {
			transform: rotate(180deg);
		}
		.lk-side .acc2 .an {
			color: var(--color-paper);
			font-weight: 600;
		}
		.lk-side .sav {
			display: inline-flex;
			flex: none;
			align-items: center;
			justify-content: center;
			width: 26px;
			height: 26px;
			background: var(--color-toner-2);
			color: var(--color-ink);
			font: 700 0.625rem/1 var(--font-evo-mono);
		}
		.lk-side .live-row {
			padding-block: 6px;
			color: var(--color-paper);
		}
		/* 'Reverse-Specification paused · 79 %' is wider than the column: it takes a second line, so its figure is never cut (criterion 879950fb). */
		.lk-side:not(.folded) .live-row .txt {
			display: -webkit-box;
			line-height: 1.3;
			white-space: normal;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 2;
			line-clamp: 2;
		}
		/* Ask my AI (criterion 44aa7b4f): a row of the navigation in a thin orange frame, its spark orange; the frame
		   fills orange under the pointer. The page's own, once it is above, hides the one that asks about the product. */
		.lk-side .side-ask {
			padding: 4px 10px 6px;
		}
		.lk-side #side-ask:not(:empty) + .side-ask-else {
			display: none;
		}
		.lk-side .side-ask .ask-row {
			min-height: 36px;
			padding: 0 12px;
			border: 1.5px solid var(--color-orange);
			color: var(--color-paper);
			font-weight: 600;
		}
		.lk-side .side-ask .ask-row svg {
			flex: none;
			color: var(--color-orange);
		}
		.lk-side .side-ask :is(a, button).ask-row:is(:hover, :focus-visible, [aria-expanded='true']) {
			background: var(--color-orange);
			color: var(--color-ink);
			outline: none;
		}
		.lk-side .side-ask :is(a, button).ask-row:is(:hover, :focus-visible, [aria-expanded='true']) svg {
			color: var(--color-ink);
		}
		.lk-side .side-ask span.ask-row[aria-disabled='true'] {
			border-color: var(--color-night);
			color: var(--color-ink-4);
			cursor: default;
		}
		.lk-side .side-ask span.ask-row[aria-disabled='true'] svg {
			color: var(--color-ink-4);
		}
		.lk-side.folded .side-ask {
			padding: 4px 8px 6px;
		}
		.lk-side.folded .side-ask .ask-row {
			padding: 0;
		}
		.lk-side .eq {
			display: inline-flex;
			flex: none;
			align-items: flex-end;
			gap: 2px;
			width: 16px;
			height: 14px;
			color: var(--color-green);
		}
		.lk-side .eq.still {
			color: var(--color-orange);
		}
		.lk-side .eq i {
			flex: 1;
			height: 100%;
			background: currentColor;
			transform: scaleY(0.5);
			transform-origin: bottom;
		}
		.lk-side .eq.live i:nth-child(1) {
			animation: lk-eqa 0.8s steps(4) infinite;
		}
		.lk-side .eq.live i:nth-child(2) {
			animation: lk-eqb 0.7s steps(4) infinite;
		}
		.lk-side .eq.live i:nth-child(3) {
			animation: lk-eqc 0.9s steps(4) infinite;
		}
		.lk-side .fm {
			position: absolute;
			right: 10px;
			bottom: calc(100% + 6px);
			left: 10px;
			z-index: 70;
			display: flex;
			flex-direction: column;
			padding: 4px 0;
			border: 2px solid var(--color-ink);
			background: var(--color-paper);
			color: var(--color-ink);
			box-shadow: 4px 4px 0 var(--color-blue);
			animation: lk-fade 0.12s ease both;
		}
		.lk-side .fm :is(a, button) {
			display: flex;
			align-items: center;
			gap: 10px;
			box-sizing: border-box;
			width: 100%;
			min-height: 38px;
			padding: 0 12px;
			border: 0;
			background: none;
			color: var(--color-ink);
			font: 500 0.8125rem/1.2 var(--font-evo);
			text-align: left;
			text-decoration: none;
			cursor: pointer;
		}
		.lk-side .fm :is(a, button):is(:hover, :focus-visible) {
			background: var(--color-toner-1);
			outline: none;
		}
		.lk-side .fm svg {
			color: var(--color-ink-3);
		}
		.lk-side .fm .mt {
			flex: 1;
			min-width: 0;
		}
		.lk-side .fm .mx {
			display: inline-flex;
			color: var(--color-ink-3);
			font: 400 0.6875rem/1 var(--font-evo-mono);
		}
		.lk-side .fm .mx.ck svg {
			color: var(--color-blue-ink);
		}
		.lk-side .fm .tag {
			display: inline-flex;
			align-items: center;
			height: 18px;
			padding: 0 5px;
			border: 1.5px solid var(--color-blue);
			color: var(--color-blue-ink);
			font: 700 0.59375rem/1 var(--font-evo-mono);
			letter-spacing: 0.06em;
			text-transform: uppercase;
		}
		.lk-side .fmh {
			display: grid;
			gap: 2px;
			margin-bottom: 4px;
			padding: 10px 12px;
			border-bottom: 1px solid var(--color-line);
		}
		.lk-side .fmh strong {
			font-size: 0.84375rem;
		}
		.lk-side .fmh span {
			color: var(--color-ink-3);
			font: 400 0.6875rem/1.3 var(--font-evo-mono);
			overflow-wrap: anywhere;
		}
		.lk-side .fmsep {
			display: block;
			height: 1px;
			margin: 4px 0;
			background: var(--color-line);
		}
		.lk-side .fm .mo {
			color: var(--color-ink-2);
		}
		.lk-side.folded .fm {
			right: auto;
			left: 8px;
			width: 240px;
		}
		.lk-side.folded .acc2 .sav {
			margin: 0;
		}
	}
	@keyframes -global-lk-eqa {
		0%,
		100% {
			transform: scaleY(0.35);
		}
		50% {
			transform: scaleY(1);
		}
	}
	@keyframes -global-lk-eqb {
		0%,
		100% {
			transform: scaleY(1);
		}
		50% {
			transform: scaleY(0.4);
		}
	}
	@keyframes -global-lk-eqc {
		0%,
		100% {
			transform: scaleY(0.6);
		}
		50% {
			transform: scaleY(0.9);
		}
	}
</style>
