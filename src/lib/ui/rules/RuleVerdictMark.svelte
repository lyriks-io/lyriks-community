<script lang="ts">
	/**
	 * What the solver says about one rule, drawn as a small seal on the rule's
	 * meta line. Hovering or focusing it opens the verdict's own card, laid out
	 * like the action and maturity cards and never the browser's tooltip (draft
	 * feat-rules-edge-cases of request eeda5853). The card is moved to the page's
	 * body and placed beside the seal, so a card or a list that clips its content
	 * never cuts it; it opens below, or above when there is no room under it.
	 */
	import type { RuleVerdict } from '$application/analysis/rule-verdicts';
	import { verdictMark } from './verdict-mark';

	interface Props {
		verdict: RuleVerdict;
	}
	let { verdict }: Props = $props();

	const cardId = $props.id();
	const mark = $derived(verdictMark(verdict));

	const WIDTH = 288;
	let open = $state(false);
	let anchor = $state<HTMLButtonElement>();
	let x = $state(0);
	let y = $state(0);
	let above = $state(false);

	function place() {
		if (!anchor) return;
		const r = anchor.getBoundingClientRect();
		const margin = 8;
		x = Math.min(Math.max(margin, r.left), window.innerWidth - WIDTH - margin);
		const below = window.innerHeight - r.bottom;
		above = below < 200 && r.top > below;
		y = above ? r.top - 6 : r.bottom + 6;
	}
	function show() {
		place();
		open = true;
	}
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}
	$effect(() => {
		if (!open) return;
		window.addEventListener('scroll', place, true);
		window.addEventListener('resize', place);
		return () => {
			window.removeEventListener('scroll', place, true);
			window.removeEventListener('resize', place);
		};
	});
</script>

{#snippet seal(size: number)}
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		class="shrink-0"
	>
		{#if mark.shape === 'triangle'}
			<path d="M12 2.6l10 17.6a1.5 1.5 0 01-1.3 2.2H3.3A1.5 1.5 0 012 20.2z" stroke-width="1.5" class={mark.seal} />
		{:else}
			<circle cx="12" cy="12" r="10.75" stroke-width="1.5" class={mark.seal} />
		{/if}
		<g stroke-width="3" class={mark.ink} transform={mark.shape === 'triangle' ? 'translate(0 1.6)' : undefined}>
			{#each mark.glyph as d (d)}<path {d} />{/each}
		</g>
	</svg>
{/snippet}

<span class="relative inline-flex normal-case tracking-normal">
	<button
		bind:this={anchor}
		type="button"
		aria-label="Solver: {verdict.label}"
		aria-describedby={open ? cardId : undefined}
		class="inline-flex cursor-help transition-transform outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-brand-300"
		onpointerenter={show}
		onpointerleave={() => (open = false)}
		onfocus={show}
		onblur={() => (open = false)}
	>
		{@render seal(14)}
	</button>
</span>
{#if open}
	<div
		use:portal
		id={cardId}
		role="tooltip"
		class="pointer-events-none fixed z-[130] rounded-card border border-line bg-surface p-3 text-left text-[0.71875rem] font-normal leading-snug text-ink-700 shadow-xl"
		style="left:{x}px; top:{y}px; width:{WIDTH}px; {above ? 'transform: translateY(-100%);' : ''}"
	>
		<p class="text-[0.59375rem] font-bold uppercase tracking-widest text-ink-400">Solver</p>
		<p class="mt-1.5 flex items-center gap-2 text-[0.78125rem] font-semibold {mark.text}">
			{@render seal(16)}
			{verdict.label}
		</p>
		{#if verdict.detail}
			<p class="mt-1.5 text-ink-600">{verdict.detail}</p>
		{/if}
		{#if verdict.flaw && verdict.fix}
			<p class="mt-2 font-semibold text-ink-800">What to do</p>
			<p class="text-ink-500">{verdict.fix}</p>
		{/if}
	</div>
{/if}
