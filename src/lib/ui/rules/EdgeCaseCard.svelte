<script lang="ts">
	import { page } from '$app/state';
	import { Icon } from '$ui/design-system';
	import { EDGE_OUTCOMES, type EdgeCase, type EdgeOutcome } from '$domain/rules';
	import type { RulesStore } from './draft-store.svelte';

	/**
	 * One Given / When / Then acceptance criterion, edited where it is read: in
	 * the acceptance criteria of the feature it tests, or in the product-wide
	 * block when it names no feature. It carries the outcome expected, the gap it
	 * covers, and the feature it sits on, which moves it.
	 */
	interface Props {
		store: RulesStore;
		edgeCase: EdgeCase;
		/** The features a case can be moved to. */
		features: readonly { id: string; name: string }[];
	}
	let { store, edgeCase: ec, features }: Props = $props();
	// The solver is an Enterprise capability: elsewhere nothing names it.
	const proofs = $derived((page.data as { proofs?: boolean }).proofs === true);

	// The coherence gaps a case can cover (missing rule / unhandled edge) live in
	// What Lyriks noticed; here they are only a link target. A stale link keeps
	// its option so it stays visible instead of silently reading as unlinked.
	const coverableGaps = $derived(
		store.draft.issues.filter(
			(i) =>
				i.id === ec.relatedIssueId || i.kind === 'missing_rule' || i.kind === 'unhandled_edge'
		)
	);

	const LABEL = 'mb-0.5 block text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-ink-400';
	const FIELD =
		'w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700 outline-none';
	const PICK = 'rounded-field border border-line bg-surface px-1.5 py-0.5 text-ink-600';
</script>

<article data-anchor={ec.id} class="rounded-card border border-line bg-surface p-3.5">
	<div class="flex items-center gap-2">
		<span class="grid size-7 shrink-0 place-items-center rounded-lg bg-info-50 text-info-600">
			<Icon name="target" size={14} />
		</span>
		<input
			value={ec.title}
			oninput={(e) => store.updateEdgeCase(ec.id, 'title', e.currentTarget.value)}
			placeholder="e.g. A declined card can be retried"
			class="min-w-0 flex-1 border-none bg-transparent text-sm font-semibold text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-300"
		/>
		<!-- Text with no condition: the solver checks the behavior model's rules and scenarios, not this. -->
		{#if proofs}
			<span
				class="shrink-0 rounded-pill bg-surface-sunken px-2 py-0.5 text-[0.625rem] font-medium text-ink-500"
				title="An edge case is text: the solver checks the rules and scenarios of the behavior model, not this."
			>
				Not checked by the solver
			</span>
		{/if}
		<label class="flex shrink-0 items-center gap-1 text-[0.6875rem] text-ink-400">
			<input type="checkbox" checked={ec.covered} onchange={() => store.toggleCovered(ec.id)} />
			covered
		</label>
		<button
			type="button"
			onclick={() => store.removeEdgeCase(ec.id)}
			class="shrink-0 text-ink-300 hover:text-danger-500"
			title="Remove"
			aria-label="Remove this criterion"><Icon name="x" size={15} /></button
		>
	</div>

	<div class="mt-3 grid gap-2 sm:grid-cols-3">
		<label class="block">
			<span class={LABEL}>Given</span>
			<input
				value={ec.given}
				oninput={(e) => store.updateEdgeCase(ec.id, 'given', e.currentTarget.value)}
				placeholder="the starting situation"
				class={FIELD}
			/>
		</label>
		<label class="block">
			<span class={LABEL}>When</span>
			<input
				value={ec.whenText}
				oninput={(e) => store.updateEdgeCase(ec.id, 'whenText', e.currentTarget.value)}
				placeholder="the user does / this happens"
				class={FIELD}
			/>
		</label>
		<label class="block">
			<span class={LABEL}>Then</span>
			<input
				value={ec.then}
				oninput={(e) => store.updateEdgeCase(ec.id, 'then', e.currentTarget.value)}
				placeholder="the product should…"
				class={FIELD}
			/>
		</label>
	</div>

	<div class="mt-2 flex flex-wrap items-center gap-2 text-[0.6875rem]">
		<span class="font-semibold uppercase tracking-[0.1em] text-ink-400">Outcome</span>
		<select
			value={ec.expectedOutcome}
			onchange={(e) => store.setEdgeOutcome(ec.id, e.currentTarget.value as EdgeOutcome)}
			class={PICK}
		>
			{#each EDGE_OUTCOMES as o (o.code)}
				<option value={o.code}>{o.label}</option>
			{/each}
		</select>
		<span class="font-semibold uppercase tracking-[0.1em] text-ink-400">Covers gap</span>
		<select
			value={ec.relatedIssueId ?? ''}
			onchange={(e) => store.linkEdgeToIssue(ec.id, e.currentTarget.value || null)}
			class="{PICK} max-w-56"
		>
			<option value="">- none -</option>
			{#each coverableGaps as issue (issue.id)}
				<option value={issue.id}>{issue.title || 'gap'}</option>
			{/each}
		</select>
		<span class="font-semibold uppercase tracking-[0.1em] text-ink-400">Tests</span>
		<select
			value={ec.relatedFeatureId ?? ''}
			onchange={(e) => store.moveEdgeCase(ec.id, e.currentTarget.value || null)}
			class="{PICK} max-w-56"
			aria-label="The feature this criterion tests"
		>
			<!-- A criterion always tests a feature (spec: criterion ac-leaf-ac-rules-edge-on-feature):
			     an unattached one shows this prompt until a feature is picked, and none is never offered. -->
			{#if !ec.relatedFeatureId}
				<option value="" disabled>Pick the feature it tests</option>
			{/if}
			{#each features as f (f.id)}
				<option value={f.id}>{f.name || 'Untitled feature'}</option>
			{/each}
		</select>
	</div>
</article>
