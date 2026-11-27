<script lang="ts">
	import { Icon } from '$ui/design-system';
	import NoticePicture from '$ui/shell/NoticePicture.svelte';
	import { LEVEL_WORD, whenSaid } from '$ui/shell/notification-view';
	import { feedLead } from '$domain/activity';
	import type { FeedCard } from '$lib/shared/home-feed';
	import { activateRow } from '$ui/shell/activate-row';
	import { copyPrompt } from '$ui/evolution/copy-prompt';
	import { runCardAction } from './card-action';

	/**
	 * A card of Home's feed (feat-home, criterion 45137624): the bell's card,
	 * larger, with no mark. Its project in bold capitals, what happened in bold
	 * capitals, its level in its tag, then what it found opened by when and
	 * where it happened, its picture without its title, then its action and Got
	 * it or Later, on a white sheet; a CRITICAL card wears a heavy ink frame, a
	 * card already read fades where it is (criterion 7c08bd42).
	 */
	interface Props {
		card: FeedCard;
		unread: boolean;
		/** The reader's own time zone once the page is live on their side (undefined), UTC for the first paint. */
		timeZone?: string;
		onopen: () => void;
		onaside: () => void;
	}
	let { card, unread, timeZone, onopen, onaside }: Props = $props();

	// "Taskora · Evolution": the project first, then the section it belongs to.
	const cut = $derived(card.where.indexOf(' · '));
	const project = $derived(cut < 0 ? card.where : card.where.slice(0, cut));
	const section = $derived(cut < 0 ? '' : card.where.slice(cut + 3));
	const text = $derived(feedLead(whenSaid(card.at, Date.now(), timeZone), section, card.body));

	/** The card's action: what it copies for the person's AI first (Relaunch the analysis, criterion 2012cc93), then where it happened. */
	const act = () => runCardAction(card.action, onopen, copyPrompt);
</script>

<article use:activateRow class="fc cursor-pointer" class:read={!unread} class:critical={card.level === 'critical'} data-level={card.level}>
	<button type="button" data-row-open class="bd" onclick={onopen}>
		<span class="fc-h">
			<span class="fc-hb">
				<span class="ctx">{#if unread}<span class="sr-only">Unread:</span>{/if}{project}</span>
				<strong class="fc-t">{card.title}</strong>
			</span>
			<span class="lv">{LEVEL_WORD[card.level]}</span>
		</span>
		<span class="fc-x">{#each text as run, i (i)}{#if run.strong}<b>{run.text}</b>{:else}{run.text}{/if}{/each}</span>
		{#if card.progress !== undefined}
			<span class="pg" role="progressbar" aria-label="Share read" aria-valuemin={0} aria-valuemax={100} aria-valuenow={card.progress}><span style:width="{card.progress}%"></span></span>
		{/if}
	</button>
	{#if card.visual}<NoticePicture visual={card.visual} feed />{/if}
	{#if card.action || unread}
		<div class="fc-a">
			{#if card.action}
				<button type="button" class="bev" data-own-press onclick={act}>
					<span>
						{#if card.action.icon === 'relaunch'}<Icon name="rotate" size={15} />{/if}
						{card.action.label}
						{#if card.action.icon === 'go'}<Icon name="arrow-right" size={15} />{/if}
					</span>
				</button>
			{/if}
			{#if unread}
				<button type="button" class="aside" title="Mark as read" onclick={onaside}>{card.dismiss}</button>
			{/if}
		</div>
	{/if}
</article>

<style>
	/* The design's feed card (.fc): a sheet on Home's toner, a hard ink shadow while it is unread. */
	.fc {
		display: grid;
		gap: 16px;
		margin-bottom: 24px;
		padding: 20px 24px;
		border: 1px solid var(--hm-line);
		background: var(--color-paper);
		box-shadow: 5px 5px 0 var(--color-ink);
		color: var(--color-ink);
		transition: box-shadow 0.2s;
	}
	.fc.critical {
		border: 2px solid var(--color-ink);
		box-shadow: 7px 7px 0 var(--color-ink);
	}
	.fc.read {
		box-shadow: 3px 3px 0 var(--hm-line);
	}
	.bd {
		display: grid;
		gap: 14px;
		min-width: 0;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.fc-h {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 14px;
		align-items: start;
	}
	.fc-hb {
		display: grid;
		min-width: 0;
	}
	/* The project, at the size a run card's project reads in Running now. */
	.ctx {
		overflow: hidden;
		color: var(--color-ink);
		font: 700 0.9375rem/1.2 var(--font-evo);
		letter-spacing: -0.01em;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.fc-t {
		margin-top: 5px;
		font-size: 1.1875rem;
		font-weight: 700;
		line-height: 1.15;
		letter-spacing: -0.01em;
		text-transform: uppercase;
	}
	.bd:hover .fc-t {
		text-decoration: underline;
		text-decoration-thickness: 2px;
		text-underline-offset: 4px;
	}
	/* The level, always written; CRITICAL filled in ink (criterion e190404f of feat-feedback-docs). */
	.lv {
		padding: 4px 7px;
		border: 1.5px solid var(--color-ink);
		font: 700 0.625rem/1.2 var(--font-evo-mono);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.fc.critical .lv {
		background: var(--color-ink);
		color: var(--hm-paper);
	}
	.fc-x {
		font-size: 0.90625rem;
		line-height: 1.55;
	}
	.fc-x b {
		font-weight: 700;
	}
	.pg {
		display: block;
		height: 6px;
		background: var(--hm-line);
	}
	.pg > span {
		display: block;
		height: 100%;
		background: var(--color-blue);
	}
	.fc-a {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 22px;
	}
	/* The main action: the design's slanted orange button with its hard shadow (.bev). It draws its own press
	   (data-own-press): the app's press sets `transform`, which would take its slant away (criterion 45137624). */
	.bev {
		max-width: 100%;
		padding: 0;
		border: 0;
		--bev-shadow: var(--color-ink);
		background: var(--color-orange);
		box-shadow: 3px 3px 0 var(--bev-shadow);
		color: var(--color-ink);
		cursor: pointer;
		transform: skewX(-12deg);
		transition:
			box-shadow 0.1s,
			translate 0.1s;
	}
	.bev > span {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 44px;
		padding: 0 20px;
		font: 700 0.875rem/1 var(--font-evo);
		transform: skewX(12deg);
	}
	.bev:hover {
		box-shadow: 4px 4px 0 var(--bev-shadow);
		translate: -1px -1px;
	}
	.bev:active {
		box-shadow: 0 0 0 var(--bev-shadow);
		translate: 3px 3px;
	}
	/* Got it or Later, as a link (criterion e190404f of feat-feedback-docs). */
	.aside {
		display: inline-flex;
		align-items: center;
		height: 44px;
		padding: 0 2px;
		border: 0;
		background: none;
		color: var(--color-ink);
		font: 700 0.75rem/1 var(--font-evo-mono);
		letter-spacing: 0.1em;
		text-decoration: underline;
		text-transform: uppercase;
		text-underline-offset: 4px;
		cursor: pointer;
	}
	.aside:hover {
		text-decoration-thickness: 5px;
	}

	/* Read: the card fades where it is, never taken away (criterion 7c08bd42). */
	.fc.read :is(.fc-t, .fc-x, .fc-x b, .ctx) {
		color: var(--color-ink-2);
	}
	.fc.read .fc-t {
		font-weight: 600;
	}
	/* Grey once read, the same shape and the same moves: only its colours change (criterion 45137624). */
	.fc.read .bev {
		--bev-shadow: var(--hm-faded);
		background: var(--hm-line);
	}
	.fc.read :global(.np) {
		opacity: 0.85;
	}

	@media (max-width: 760px) {
		.fc {
			gap: 12px;
			margin: 0 4px 22px 0;
			padding: 16px 14px 14px;
			border: 1.5px solid var(--color-ink);
			box-shadow: 4px 4px 0 var(--color-ink);
		}
		.fc.read {
			border-color: var(--hm-line);
		}
		.fc-h {
			grid-template-columns: minmax(0, 1fr);
			gap: 10px;
		}
		.fc-h .lv {
			grid-column: 1;
			justify-self: start;
			padding: 2px 5px;
			font-size: 0.5625rem;
		}
		.ctx {
			font-size: 0.875rem;
			white-space: normal;
		}
		.fc-t {
			margin-top: 3px;
			font-size: 1rem;
		}
		.fc-x {
			font-size: 0.84375rem;
			line-height: 1.45;
		}
		.fc-a {
			gap: 16px;
		}
		.bev > span {
			padding: 0 14px;
			font-size: 0.8125rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.bev,
		.fc {
			transition: none;
		}
	}
</style>
