<script lang="ts">
	import { page } from '$app/state';
	import { lockedSentence, planOpening, PRICING_ADDRESS, PRICING_URL, UPGRADE_PLAN_NAMES, type CommunityLock } from '$domain/licensing';
	import { VIEW_PLANS } from './offer-refusal';

	/**
	 * What a Community installation locks (EVO-001), said where the capability
	 * would be: the offer of the plan that opens it, and View plans, a link to
	 * the plans that opens in a new tab (EVO-006). The link out is drawn only
	 * where the installation allows links out (criterion b4538030); an
	 * air-gapped one shows the address as text.
	 */
	let { lock, title }: { lock: CommunityLock; title?: string } = $props();

	const plan = $derived(UPGRADE_PLAN_NAMES[planOpening(lock)]);
	const online = $derived(!!page.data.onlineHelp);
</script>

<section class="lock animate-lk-in" data-community-lock={lock}>
	{#if title}<h1>{title}</h1>{/if}
	<p class="lead"><span class="plan">{plan}</span>{lockedSentence(lock)}</p>
	{#if online}
		<a class="step" href={PRICING_URL} target="_blank" rel="noopener noreferrer">{VIEW_PLANS}</a>
	{:else}
		<p>The plans: {PRICING_ADDRESS}</p>
	{/if}
</section>

<style>
	.lock {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
		max-width: 640px;
		margin: 24px 0;
		padding: 26px 28px;
		border: 1px solid var(--color-line);
		background: var(--color-paper);
		color: var(--color-ink);
	}
	h1 {
		margin: 0 0 4px;
		font: 700 1.625rem/1.05 var(--font-evo);
		letter-spacing: -0.02em;
	}
	p {
		margin: 0;
		color: var(--color-ink-2);
		font: 400 0.9375rem/1.55 var(--font-evo);
	}
	p.lead {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		color: var(--color-ink);
	}
	.plan {
		padding: 2px 8px;
		border: 1.5px solid var(--color-ink);
		background: var(--color-ink);
		color: var(--color-paper);
		font: 700 0.625rem/1.4 var(--font-evo-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.step {
		display: inline-flex;
		align-items: center;
		min-height: 34px;
		margin-top: 8px;
		padding: 0 14px;
		border: 1.5px solid var(--color-ink);
		background: var(--color-paper);
		box-shadow: 3px 3px 0 var(--color-ink);
		color: var(--color-ink);
		font: 700 0.71875rem/1 var(--font-evo);
		letter-spacing: 0.05em;
		text-decoration: none;
		text-transform: uppercase;
	}
	.step:hover {
		background: var(--color-toner);
	}
</style>
