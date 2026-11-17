<script lang="ts">
	import type { FeatureActionView } from '$application/spec360/features';
	import { whoMayDecide } from '$application/spec360/users-reach';
	import ActionRules from '../features/ActionRules.svelte';
	import { LINK } from '../page/look';
	import ActionReachRow from './ActionReachRow.svelte';

	/**
	 * The last level of a user's page, one action (criterion 6dd2906e): whether
	 * the profile may perform it, said in colour, with its Comment for this user
	 * and, while a draft, Grant or Take back in place; then who may perform it,
	 * the rules of the action that decide who may (its permissions), and the way
	 * to the action on its feature's page, where its other rules read.
	 */
	interface Props {
		profile: string;
		/** The action discussed for this user (permissions:<user>:<capability>). */
		anchor: string;
		action: string;
		access: boolean;
		onTick: (() => void) | null;
		/** The action as its feature's page holds it; null when the behavior model could not be read. */
		view: FeatureActionView | null;
		featureId: string;
		/** The feature's page, brought to this action. */
		featureHref: string;
	}
	let { profile, anchor, action, access, onTick, view, featureId, featureHref }: Props = $props();
	const decided = $derived(view ? whoMayDecide(view) : null);
	const rules = (n: number) => `${n} ${n === 1 ? 'rule' : 'rules'}`;
	const HEAD = 'flex flex-wrap items-center gap-2.5 px-[18px] py-3.5 font-evo-mono text-[0.8125rem] font-bold tracking-[0.06em] uppercase';
	const SUB = 'm-0 font-evo-mono text-[0.6875rem] font-bold tracking-[0.08em] text-ink-3 uppercase';
	const CHIP = 'inline-flex h-[26px] items-center border border-line bg-toner px-2.5 text-[0.8125rem] font-semibold text-ink';
</script>

<div class="flex flex-col gap-5">
	<!-- The answer first, in the colour of its column: green and a check, or grey and a lock. -->
	<section aria-label={access ? 'Access' : 'No access'} class="overflow-hidden border {access ? 'border-green bg-surface' : 'border-toner-2 bg-toner-1'}">
		<h3 class="m-0 {HEAD} {access ? 'bg-green text-ink' : 'bg-toner-2 text-ink-2'}">
			<span aria-hidden="true" class="inline-flex size-[22px] items-center justify-center {access ? 'bg-ink text-green' : 'bg-toner-1 text-ink-3'}">
				{#if access}
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"></path></svg>
				{:else}
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>
				{/if}
			</span>
			{access ? 'Access' : 'No access'}
			<span class="font-evo text-[0.875rem] font-semibold tracking-normal normal-case">{profile} {access ? 'may' : 'may not'} perform {action}</span>
		</h3>
		<ActionReachRow {anchor} {action} {access} title="{profile} · {action}" {onTick} />
	</section>

	<section aria-label="Who may perform it" class="flex flex-col gap-2">
		<h4 class={SUB}>Who may perform it</h4>
		{#if view && view.who.length}
			<div class="flex flex-wrap gap-1.5">{#each view.who as who (who.id)}<span class={CHIP}>{who.name}</span>{/each}</div>
		{:else}
			<p class="m-0 text-sm text-ink-3">Nobody yet: no profile is granted this action.</p>
		{/if}
	</section>

	<section aria-label="The rules that decide who may" class="flex flex-col gap-2">
		<h4 class={SUB}>The rules that decide who may</h4>
		{#if decided && decided.decides.rules.length}
			<ActionRules action={decided.decides} {featureId} />
		{:else}
			<p class="m-0 text-sm text-ink-3">No rule of this action limits who may perform it: every profile granted it may.</p>
		{/if}
	</section>

	<p class="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
		{#if decided && decided.others > 0}<span>{rules(decided.others)} more on what it does, on its feature's page.</span>{/if}
		<a href={featureHref} class={LINK}>Open on its feature page<span aria-hidden="true">→</span></a>
	</p>
</div>
