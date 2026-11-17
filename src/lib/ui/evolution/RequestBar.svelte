<script lang="ts" module>
	export interface RequestBarTab {
		readonly id: string;
		readonly label: string;
		readonly ticked: boolean;
		/** Why the step cannot be opened yet. */
		readonly waits: string | null;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import SlideHighlight from '$ui/design-system/SlideHighlight.svelte';
	import { heightVar } from '$ui/shell/height-var';
	import SideIcon from '$ui/shell/SideIcon.svelte';
	import '$ui/spec360/knowledge-rows.css';

	/**
	 * The top of a change request (criterion 595efead), drawn as the rows at the top of Knowledge: its title,
	 * its key and its tools; the tab bar of its six steps (a step done checked, a step not open
	 * yet greyed with why in its tooltip); the band saying where the request stands. In view while the page scrolls.
	 */
	interface Props {
		title: string;
		requestKey: string | null;
		tabs: readonly RequestBarTab[];
		openTab: string;
		onSelect: (tab: string) => void;
		onBack: () => void;
		/** Status words of its pill: 'In progress', 'Cancelled', 'Live'. */
		status: string;
		/** The band reads orange while the request is in progress. */
		inProgress: boolean;
		/** Where it stands, in one line. */
		standing: string;
		tools?: Snippet;
		/** After the tabs, at the end of their row: what the step on screen offers (Prefill). */
		tabEnd?: Snippet;
	}
	let { title, requestKey, tabs, openTab, onSelect, status, inProgress, standing, tools, tabEnd }: Props = $props();

	let strip = $state<HTMLElement>();
	let placed = $state(false);
</script>

<!-- Its height is published (--kb-head-h) for what lands under it (data-sticky-head, landing-mark). -->
<div id="evo-head" class="kbar" data-sticky-head {@attach heightVar('--kb-head-h')}>
	<div class="khead">
		<h1 class="kname">{title}</h1>
		{#if requestKey}<span class="kkey">{requestKey}</span>{/if}
		<span class="ktools">{@render tools?.()}</span>
	</div>
	<nav bind:this={strip} id="request-tabs" class="ktabs" aria-label="Evolution steps">
		<SlideHighlight container={strip} target={`[data-tab="${openTab}"]`} class="kt-hl" radius={0} onPlaced={(placedNow) => (placed = placedNow)} />
		{#each tabs as t (t.id)}
			{@const on = t.id === openTab}
			<button
				type="button"
				class="tab"
				class:on
				class:own={on && !placed}
				class:waits={!!t.waits}
				data-tab={t.id}
				aria-current={on ? 'step' : undefined}
				aria-disabled={t.waits ? 'true' : undefined}
				title={t.waits ?? undefined}
				onclick={() => !on && onSelect(t.id)}
				>{t.label}{#if t.ticked}<span class="chk" title="Done" aria-label="Done"><SideIcon name="check" size={12} strokeWidth={2.4} /></span>{/if}</button
			>
		{/each}
		{#if tabEnd}<span class="kend">{@render tabEnd()}</span>{/if}
	</nav>
	<div class="ksb" class:draft={inProgress} role="status">
		<span class="pill">{status}</span>
		<span class="txt">{standing}</span>
	</div>
</div>

<style>
	/* What the step on screen offers, at the end of the tabs' row. */
	.kend {
		position: sticky;
		right: 0;
		display: inline-flex;
		flex: none;
		align-items: center;
		margin-left: auto;
		padding-left: 12px;
		background: var(--color-paper);
	}
</style>
