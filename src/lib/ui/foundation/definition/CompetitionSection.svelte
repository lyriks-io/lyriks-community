<script lang="ts">
	import {
		EditableText,
		Field,
		Icon,
		MultiSelect,
		SectionCard,
		TagInput,
		TextInput,
		Textarea
	} from '$ui/design-system';
	import CriteriaList from '../sections/CriteriaList.svelte';
	import { LIMITS } from '$domain/foundation';
	import { BUSINESS_MODELS, CUSTOMER_SIZES, INDUSTRY_SECTORS, REGULATIONS } from '$domain/foundation';
	import SourceCitations from '$ui/documents/SourceCitations.svelte';
	import type { DefinitionStore } from '../definition-store.svelte';

	interface Props {
		store: DefinitionStore;
	}
	let { store }: Props = $props();
	const c = $derived(store.draft.competition);
	const m = $derived(store.draft.market);

	let differentiator = $state('');

	function addDifferentiator() {
		const t = differentiator.trim();
		if (t.length === 0 || t.length > LIMITS.differentiator || c.differentiators.length >= 5) return;
		store.addDifferentiator(t);
		differentiator = '';
	}
</script>

<div class="mb-4">
	<SectionCard icon="users" color="pink" title="Market segment" eyebrow="who you're building for">
		<!-- @container : Customer size + Industry sector two-up when wide, then
		     Applicable regulations full-width; all stack when narrow. -->
		<div class="@container space-y-6">
			<div class="grid gap-6 @lg:grid-cols-2 @lg:grid-rows-[auto_auto] @lg:gap-x-6 @lg:gap-y-1.5">
				<Field label="Customer size" hint="multi-select" subgrid>
					<MultiSelect
						values={m.customerSize}
						options={CUSTOMER_SIZES}
						allowCustom={false}
						tone="brand"
						onchange={store.setCustomerSizes}
					/>
				</Field>

				<Field label="Industry sector" hint="multi-level taxonomy , pick all that apply" subgrid>
					<MultiSelect
						values={m.industrySectors}
						options={INDUSTRY_SECTORS}
						allowCustom={false}
						tone="brand"
						onchange={store.setSectors}
					/>
				</Field>
			</div>

			<Field label="Applicable regulations" hint="propagated to Security tab">
				<MultiSelect
					values={m.regulations}
					options={REGULATIONS}
					allowCustom={false}
					tone="brand"
					onchange={store.setRegulations}
				/>
			</Field>
		</div>
	</SectionCard>
</div>

<SectionCard
	icon="trophy"
	color="amber"
	title="Competitive landscape"
	eyebrow="who you fight, why you win"
>
	<!-- @container : the paired rows go two-up only when the card is genuinely wide. -->
	<div class="@container space-y-6">
		<!-- direct competitors -->
		<Field label="Direct competitors" hint="Each with its strengths and weaknesses.">
			<div class="space-y-3">
				{#each c.directCompetitors as competitor, i (i)}
					<div class="rounded-card border border-line bg-surface-sunken p-3">
						<div class="mb-2 flex items-center gap-2">
							<span
								class="grid size-7 shrink-0 place-items-center rounded-field bg-brand-100 text-[11px] font-bold uppercase text-brand-600"
							>
								{competitor.name.trim() ? competitor.name.trim().slice(0, 2) : '?'}
							</span>
							<EditableText
								ariaLabel="Competitor name"
								value={competitor.name}
								onCommit={(v) => store.setCompetitorName(i, v)}
								placeholder="Competitor name"
								class="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900"
							/>
							<span class="hidden shrink-0 text-[11px] italic text-ink-400 sm:inline">
								logo auto-fetched in prod
							</span>
							<button
								type="button"
								onclick={() => store.removeCompetitor(i)}
								aria-label="Remove competitor"
								class="shrink-0 text-ink-400 hover:text-danger-500"
							>
								<Icon name="x" size={14} />
							</button>
						</div>
						<div class="grid gap-3 sm:grid-cols-2">
							<div>
								<p class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-success-600">Strengths</p>
								<TagInput
									tags={competitor.strengths}
									placeholder="Strength…"
									tone="success"
									maxLength={LIMITS.competitorNote}
									onadd={(t) => store.addCompetitorStrength(i, t)}
									onremove={(si) => store.removeCompetitorStrength(i, si)}
								/>
							</div>
							<div>
								<p class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-danger-500">Weaknesses</p>
								<TagInput
									tags={competitor.weaknesses}
									placeholder="Weakness…"
									tone="danger"
									maxLength={LIMITS.competitorNote}
									onadd={(t) => store.addCompetitorWeakness(i, t)}
									onremove={(wi) => store.removeCompetitorWeakness(i, wi)}
								/>
							</div>
						</div>
					</div>
				{/each}
				<button
					type="button"
					onclick={() => store.addCompetitor('')}
					class="flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-line py-3 text-sm font-medium text-ink-500 transition-colors hover:border-brand-300 hover:text-brand-600"
				>
					<Icon name="plus" size={16} /> Add competitor
				</button>
			</div>
		</Field>

		<!-- non-software alternatives + business models (mockup: paired 2-up) -->
		<div class="grid gap-6 @lg:grid-cols-2">
			<Field label="Non-software alternatives" hint="what people use today instead">
				<CriteriaList
					items={c.indirectCompetitors}
					tone="brand"
					placeholder="Excel, manual process…"
					onadd={store.addIndirectCompetitor}
					onremove={store.removeIndirectCompetitor}
				/>
			</Field>
			<Field label="Business models in play" hint="how the market monetizes">
				<MultiSelect
					values={c.businessModels}
					options={BUSINESS_MODELS}
					tone="brand"
					placeholder="Pick or add…"
					onchange={store.setBusinessModels}
				/>
			</Field>
		</div>
	</div>
</SectionCard>

<div class="mt-4">
<SectionCard
	icon="sparkles"
	color="violet"
	title="Positioning & moat"
	eyebrow="what makes you undeniably different"
>
	<div class="@container space-y-6">
		<!-- differentiators -->
		<Field label="Differentiators" hint="ordered , max 5 , move with ↑↓">
			<div class="space-y-2">
				{#each c.differentiators as diff, i (i)}
					<div class="group flex items-center gap-2.5 rounded-field border border-line bg-surface-sunken px-2.5 py-2">
						<span
							class="grid size-5 shrink-0 place-items-center rounded-md bg-brand-100 text-[11px] font-bold tabular-nums text-brand-600"
						>
							{i + 1}
						</span>
						<span class="min-w-0 flex-1 break-words text-sm text-ink-700">{diff}</span>
						<div
							class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
						>
							<button
								type="button"
								onclick={() => store.moveDifferentiator(i, -1)}
								disabled={i === 0}
								aria-label="Move up"
								class="grid size-6 place-items-center rounded text-ink-400 hover:bg-surface hover:text-ink-700 disabled:pointer-events-none disabled:opacity-30"
							>
								<Icon name="chevron-down" size={14} class="rotate-180" />
							</button>
							<button
								type="button"
								onclick={() => store.moveDifferentiator(i, 1)}
								disabled={i === c.differentiators.length - 1}
								aria-label="Move down"
								class="grid size-6 place-items-center rounded text-ink-400 hover:bg-surface hover:text-ink-700 disabled:pointer-events-none disabled:opacity-30"
							>
								<Icon name="chevron-down" size={14} />
							</button>
							<button
								type="button"
								onclick={() => store.removeDifferentiator(i)}
								aria-label="Remove differentiator"
								class="grid size-6 place-items-center rounded text-ink-400 hover:bg-danger-50 hover:text-danger-500"
							>
								<Icon name="x" size={14} />
							</button>
						</div>
					</div>
				{/each}
				<div class="flex items-center gap-2">
					<TextInput
						value={differentiator}
						oninput={(v) => (differentiator = v)}
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								addDifferentiator();
							}
						}}
						placeholder="What makes us undeniably different…"
					/>
					<button
						type="button"
						onclick={addDifferentiator}
						disabled={differentiator.trim().length === 0 || c.differentiators.length >= 5}
						class="shrink-0 rounded-field bg-brand-50 px-4 py-2 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-100 disabled:opacity-40"
					>
						Add
					</button>
				</div>
			</div>
		</Field>

		<!-- marketing positioning (multiline) + claimed category (mockup: paired 2-up) -->
		<div class="grid gap-6 @lg:grid-cols-2">
			<Field label="Marketing positioning" hint="one phrase that frames us">
				<TextInput
					value={c.positioning}
					oninput={store.setPositioning}
					placeholder="The fastest X for Y."
				/>
			</Field>
			<Field label="Claimed category" hint="the box we want to own">
				<TextInput
					value={c.claimedCategory}
					oninput={store.setClaimedCategory}
					placeholder="e.g. Invoice-to-cash automation"
					invalid={c.claimedCategory.length > LIMITS.claimedCategory}
				/>
			</Field>
		</div>

		<Field label="Competitive moat" hint="Why the advantage is defensible / hard to copy.">
			<Textarea
				value={c.competitiveMoat}
				oninput={store.setCompetitiveMoat}
				rows={2}
				placeholder="Data network effects, switching costs, regulatory lock-in…"
			/>
		</Field>
	</div>
</SectionCard>
</div>

<div class="mt-4">
	<SourceCitations
		selected={store.draft.competition.sourceIds}
		onToggle={(sourceId) => store.toggleSectionSource('competition', sourceId)}
		subject="this positioning"
	/>
</div>
