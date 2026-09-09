<script lang="ts">
	import { Icon } from '$ui/design-system';
	import type { Collaborator } from '$domain/team/team';
	import type { FeatureActionIndex } from '$application/index-feature-actions';
	import { colorTokens, disciplineLabel, initials } from '$ui/team/team-style';
	import { assignedItemsFor } from '../assigned-items';
	import type { FeaturesStore } from '../draft-store.svelte';

	interface Props {
		store: FeaturesStore;
		/** The project team (from loadTeam — local residue or the back). */
		collaborators: Collaborator[];
		/** Action names per feature — same input the Delivery board reads. */
		featureActions: FeatureActionIndex;
		/** Email of the signed-in user, to default the "viewing as" selector. */
		currentEmail?: string | null;
	}
	let { store, collaborators, featureActions, currentEmail = null }: Props = $props();

	const roleTitle = disciplineLabel; // one shared source for the discipline label

	// Count = the SAME assigned set the Delivery board uses (owner + contributor),
	// so a person's My-work total can never drift from their Delivery total.
	const countFor = (id: string) => assignedItemsFor(store.draft, featureActions, id).length;

	// "Viewing as": default to the signed-in user if they are on the team, else the
	// first collaborator. Never auto-changes once the user picks someone.
	const defaultId = $derived(
		collaborators.find((c) => currentEmail && c.email.toLowerCase() === currentEmail.toLowerCase())
			?.id ??
			collaborators[0]?.id ??
			null
	);
	let picked = $state<string | null>(null);
	const selectedId = $derived(picked ?? defaultId);
	const selected = $derived(collaborators.find((c) => c.id === selectedId) ?? null);

	const featureName = (id: string | undefined) =>
		store.draft.features.find((f) => f.id === id)?.name || 'Untitled feature';

	// My work IS Delivery filtered to one person — identical source of truth.
	const mine = $derived(selectedId ? assignedItemsFor(store.draft, featureActions, selectedId) : []);
	const myFeatures = $derived(mine.filter((i) => i.kind === 'feature'));
	const myActions = $derived(mine.filter((i) => i.kind === 'action'));
</script>

<div class="grid gap-4 @3xl:grid-cols-[16rem_1fr]">
	<!-- ── Team roster: click a person to view their queue ─────────────── -->
	<aside class="space-y-2">
		<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
			Team · {collaborators.length}
		</p>
		{#if collaborators.length === 0}
			<p class="rounded-card border border-dashed border-line bg-surface px-3 py-4 text-[12px] text-ink-400">
				No collaborator yet.
			</p>
		{:else}
			<div class="space-y-1">
				{#each collaborators as c (c.id)}
					{@const active = c.id === selectedId}
					<button
						type="button"
						onclick={() => (picked = c.id)}
						class="flex w-full items-center gap-2.5 rounded-field border px-2.5 py-2 text-left transition {active
							? 'border-brand-300 bg-brand-50/60'
							: 'border-line bg-surface hover:bg-surface-sunken'}"
					>
						<span
							class="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
							style="background:{colorTokens(c.color).solid}"
						>
							{initials(c.name || c.email)}
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[13px] font-semibold text-ink-900">
								{c.name || c.email}
							</span>
							<span class="block text-[10px] font-medium uppercase tracking-wide text-ink-400">
								{roleTitle(c)}
							</span>
						</span>
						<span class="shrink-0 rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-600">
							{countFor(c.id)}
						</span>
					</button>
				{/each}
			</div>
		{/if}
	</aside>

	<!-- ── Selected person's queue ─────────────────────────────────────── -->
	<div class="space-y-4">
		<div class="rounded-card border border-line bg-surface p-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex items-center gap-3">
					{#if selected}
						<span
							class="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
							style="background:{colorTokens(selected.color).solid}"
						>
							{initials(selected.name || selected.email)}
						</span>
						<div>
							<p class="text-sm font-bold text-ink-900">{selected.name || selected.email}</p>
							<p class="text-[11px] font-medium uppercase tracking-wide text-ink-400">
								{roleTitle(selected)} · {myFeatures.length} feature{myFeatures.length === 1 ? '' : 's'} · {myActions.length}
								action{myActions.length === 1 ? '' : 's'}
							</p>
						</div>
					{:else}
						<p class="text-sm text-ink-400">Select a teammate to see their work.</p>
					{/if}
				</div>
				<!-- Viewing-as selector (mirrors the roster, handy on narrow layouts) -->
				<label class="flex items-center gap-1.5 text-[11px] text-ink-400">
					Viewing as
					<select
						value={selectedId ?? ''}
						onchange={(e) => (picked = e.currentTarget.value || null)}
						class="rounded-field border border-line bg-surface px-2 py-1 text-[12px] font-medium text-ink-800 outline-none focus:border-brand-300"
					>
						{#each collaborators as c (c.id)}
							<option value={c.id}>{c.name || c.email} · {roleTitle(c)}</option>
						{/each}
					</select>
				</label>
			</div>
		</div>

		{#if !selected}
			<!-- nothing -->
		{:else if mine.length === 0}
			<p class="rounded-card border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-400">
				Nothing assigned to {selected.name || selected.email} yet.
			</p>
		{:else}
			{#if myFeatures.length > 0}
				<div>
					<p class="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
						<Icon name="grid" size={12} class="text-brand-500" /> Features · {myFeatures.length}
					</p>
					<div class="space-y-1">
						{#each myFeatures as a (a.key)}
							<button
								type="button"
								onclick={() => {
									store.switchTab('tree');
									store.selectFeature(a.featureId);
								}}
								class="flex w-full items-center gap-2 rounded-field border border-line bg-surface px-3 py-2 text-left hover:bg-surface-sunken"
							>
								<Icon name="grid" size={13} class="shrink-0 text-brand-500" />
								<span class="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-800">{a.name}</span>
								<span
									class="shrink-0 rounded-pill px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide {a.relation ===
									'Owner'
										? 'bg-brand-50 text-brand-600'
										: 'bg-surface-sunken text-ink-500'}"
								>
									{a.relation}
								</span>
								{#if a.core}
									<span class="shrink-0 rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
										{a.core}
									</span>
								{/if}
								<Icon name="chevron-right" size={13} class="shrink-0 text-ink-300" />
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if myActions.length > 0}
				<div>
					<p class="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
						<Icon name="cpu" size={12} class="text-brand-500" /> Actions · {myActions.length}
					</p>
					<div class="space-y-1">
						{#each myActions as a (a.key)}
							<button
								type="button"
								onclick={() => {
									store.switchTab('tree');
									store.selectFeature(a.featureId);
								}}
								class="flex w-full items-center gap-2 rounded-field border border-line bg-surface px-3 py-2 text-left hover:bg-surface-sunken"
							>
								<Icon name="cpu" size={12} class="shrink-0 text-ink-400" />
								<span class="min-w-0 flex-1 truncate text-[13px] text-ink-700">
									{a.name}
									<span class="ml-1 text-[11px] text-ink-400">· {featureName(a.featureId)}</span>
								</span>
								<span
									class="shrink-0 rounded-pill px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide {a.relation ===
									'Owner'
										? 'bg-brand-50 text-brand-600'
										: 'bg-surface-sunken text-ink-500'}"
								>
									{a.relation}
								</span>
								<Icon name="chevron-right" size={13} class="shrink-0 text-ink-300" />
							</button>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>
