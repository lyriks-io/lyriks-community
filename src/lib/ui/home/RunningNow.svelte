<script lang="ts">
	import { RUN_STATE_WORD, runGroups, type HomeRunCard } from '$domain/activity';
	import { markRead, readHere } from '$ui/shell/notification-reads.svelte';

	/**
	 * Running now on Home (feat-home, criterion ee8adfec, action 507e4993): what
	 * Lyriks is doing for the reader, one card per run with no mark, INACTIVE
	 * first, grouped under their state past five; each card opens the run's page.
	 * A bar of ten segments in the run's colour, blue for a
	 * Reverse-Specification, orange for an evolution, the segment under way
	 * blinking while it works. Pointed at, a card offers a cross that hides it until
	 * its state changes (action a6a79b22).
	 */
	let { runs }: { runs: readonly HomeRunCard[] } = $props();

	const SEGMENTS = 10;
	const shown = $derived(runs.filter((r) => !r.hideId || !readHere(r.hideId)));
	const groups = $derived(runGroups(shown));
	const hide = (r: HomeRunCard) => r.hideId && void markRead([r.hideId], () => runs);
	const colourOf = (r: HomeRunCard) => (r.kind === 'evolution' ? 'var(--color-orange)' : 'var(--color-blue)');
	function segment(r: HomeRunCard, i: number): { cls: string; bg: string } {
		const full = Math.floor(r.pct / SEGMENTS);
		if (i < full) return { cls: '', bg: colourOf(r) };
		if (i === full && r.state === 'running') return { cls: 'cur', bg: colourOf(r) };
		return { cls: r.state === 'inactive' ? 'x' : '', bg: 'var(--hm-bg)' };
	}
</script>

<aside class="rail" aria-labelledby="rn-title">
	<span class="rl-k">Running now · {shown.length}</span>
	<h2 id="rn-title" class="rl-t">What Lyriks is doing for you.</h2>
	{#each groups as g, gi (g.state ?? gi)}
		{#if g.state}
			<div class="rl-g"><span>{RUN_STATE_WORD[g.state]}</span><span>{g.runs.length}</span></div>
		{/if}
		{#each g.runs as r (r.id)}
			<div class="rk-w">
			<a
				class="rk {r.state}"
				href={r.href}
				aria-label="{r.project}, {r.label}, {RUN_STATE_WORD[r.state].toLowerCase()}, {r.line}, {r.pct} percent. Open the run."
			>
				<span class="rk-p">{r.project}</span>
				<span class="rs {r.state}">{#if r.state === 'waiting'}<i class="blink"></i>{/if}{RUN_STATE_WORD[r.state]}</span>
				<span class="rk-k">{r.label}</span>
				<span class="rk-n">{r.line}</span>
				<span class="rk-bar">
					<span class="rk-seg">
						{#each Array.from({ length: SEGMENTS }) as _, i (i)}
							{@const s = segment(r, i)}
							<i class={s.cls} style:background-color={s.bg}></i>
						{/each}
					</span>
					<span class="rk-pc">{r.pct}%</span>
				</span>
			</a>
			{#if r.hideId}
				<button type="button" class="rk-x" aria-label="Hide {r.project}, {r.label}, until it changes state" title="Hide until it changes state" onclick={() => hide(r)}>✕</button>
			{/if}
			</div>
		{/each}
	{:else}
		<p class="rl-e">Nothing is running right now.</p>
	{/each}
</aside>

<style>
	/* The design's Running now column (.rail, paper theme): a column of paper with an ink edge, run cards on it (.rk). */
	.rail {
		position: sticky;
		top: 0;
		box-sizing: border-box;
		/* The whole height of the window: on a wide screen Home shows no top bar (criterion 8a6a568b). */
		height: calc(100dvh - var(--app-foot-h, 0px));
		padding: 48px 20px 24px;
		overflow-y: auto;
		border-left: 1.5px solid var(--color-ink);
		background: var(--hm-paper);
		color: var(--color-ink);
		scrollbar-color: var(--color-line-strong) transparent;
		scrollbar-width: thin;
	}
	.rl-k {
		display: block;
		color: var(--color-orange-ink);
		font: 700 0.6875rem/1.3 var(--font-evo-mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.rl-t {
		margin: 4px 0 22px;
		font-size: 1.0625rem;
		font-weight: 700;
	}
	/* The cross of a card shows when pointed at or focused, hanging on its corner over the state tag (action a6a79b22). */
	.rk-w {
		position: relative;
	}
	.rk-x {
		position: absolute;
		top: -8px;
		right: -8px;
		display: grid;
		width: 22px;
		height: 22px;
		place-items: center;
		padding: 0;
		border: 1.5px solid var(--color-ink);
		background: var(--color-paper);
		color: var(--color-ink);
		font-size: 0.6875rem;
		line-height: 1;
		cursor: pointer;
		opacity: 0;
		transition: opacity 120ms ease;
	}
	.rk-w:hover .rk-x,
	.rk-x:focus-visible {
		opacity: 1;
	}
	.rk-x:hover {
		background: var(--color-ink);
		color: var(--color-paper);
	}
	@media (hover: none) {
		.rk-x {
			opacity: 1;
		}
	}
	.rl-g {
		display: flex;
		justify-content: space-between;
		margin: 16px 0 8px;
		color: var(--hm-muted);
		font: 700 0.65625rem/1.3 var(--font-evo-mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.rl-e {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 0;
		padding: 18px;
		border: 1.5px dashed var(--color-line-strong);
		color: var(--hm-muted);
		font-size: 0.8125rem;
	}
	.rk {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		column-gap: 10px;
		margin-bottom: 10px;
		padding: 12px 12px 11px;
		border: 2px solid var(--hm-line);
		background: var(--color-paper);
		color: var(--color-ink);
		text-decoration: none;
	}
	.rk:hover {
		background: var(--hm-card);
		color: var(--color-ink);
	}
	/* The project reads at the size a feed card's project does (criterion 45137624). */
	.rk-p {
		grid-row: 1;
		grid-column: 1;
		align-self: end;
		overflow: hidden;
		font-size: 0.9375rem;
		font-weight: 700;
		line-height: 1.1;
		letter-spacing: -0.01em;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}
	/* The kind runs under the state tag, which holds the first row only, so REVERSE-SPECIFICATION reads whole. */
	.rk-k {
		grid-row: 2;
		grid-column: 1 / -1;
		align-self: start;
		margin-top: 1px;
		overflow: hidden;
		color: var(--hm-muted);
		font: 700 0.65625rem/1.1 var(--font-evo-mono);
		letter-spacing: 0.1em;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}
	/* The state, always written (.rs): INACTIVE red, WAITING ink with its blinking square, RUNNING outlined. */
	.rs {
		display: inline-flex;
		grid-row: 1;
		grid-column: 2;
		align-items: center;
		align-self: start;
		gap: 5px;
		padding: 3px 6px;
		border: 1.5px solid var(--color-ink);
		font: 700 0.59375rem/1.2 var(--font-evo-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.rs.inactive {
		border-color: var(--color-red-ink);
		background: var(--color-red-ink);
		color: var(--color-paper);
	}
	.rs.waiting {
		background: var(--color-ink);
		color: var(--color-paper);
	}
	.blink {
		display: inline-block;
		width: 7px;
		height: 7px;
		background: var(--color-orange);
		animation: rn-blink 1s steps(1) infinite;
	}
	.rk-n {
		grid-column: 1 / -1;
		margin-top: 8px;
		color: var(--color-ink-2);
		font-size: 0.8125rem;
		line-height: 1.35;
	}
	.rk-bar {
		display: flex;
		grid-column: 1 / -1;
		align-items: center;
		gap: 10px;
		margin-top: 6px;
	}
	.rk-seg {
		display: grid;
		flex: 1;
		grid-template-columns: repeat(10, minmax(0, 1fr));
		gap: 3px;
	}
	.rk-seg i {
		display: block;
		height: 8px;
	}
	.rk-seg i.cur {
		animation: rn-blink 1s steps(1) infinite;
	}
	.rk-seg i.x {
		background-image: repeating-linear-gradient(45deg, var(--color-red-ink) 0 2px, transparent 2px 5px);
	}
	.rk-pc {
		min-width: 32px;
		font: 700 0.6875rem/1 var(--font-evo-mono);
		text-align: right;
	}
	@keyframes rn-blink {
		50% {
			opacity: 0;
		}
	}
	/* A narrow screen reads Running now above the feed, in the page's flow (criterion 85c17859). */
	@media (max-width: 1100px) {
		.rail {
			position: static;
			height: auto;
			overflow: visible;
			margin: 0 28px;
			padding: 18px 16px;
			border: 1.5px solid var(--color-ink);
		}
	}
	@media (max-width: 760px) {
		.rail {
			margin: 0 16px;
			padding: 12px;
		}
		.rl-t {
			margin-bottom: 12px;
			font-size: 0.9375rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.blink,
		.rk-seg i.cur {
			animation: none;
		}
	}
</style>
