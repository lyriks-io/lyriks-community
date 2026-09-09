<script lang="ts">
	import { page } from '$app/state';
	import { Button, Field, Icon, SectionCard, TextInput } from '$ui/design-system';
	import CriteriaList from '../sections/CriteriaList.svelte';
	import SourceCitations from '$ui/documents/SourceCitations.svelte';
	import type { DefinitionStore } from '../definition-store.svelte';

	interface Props {
		store: DefinitionStore;
	}
	let { store }: Props = $props();

	// Detailed rules live in Features › Rules — this tab stays high-level.
	const rulesHref = $derived(
		page.params.projectId ? `/projects/${page.params.projectId}/features?tab=rules` : undefined
	);

	const b = $derived(store.draft.business);
	let contractualConstraintDraft = $state('');
	let addingContractualConstraint = $state(false);

	function commitContractualConstraint() {
		const value = contractualConstraintDraft.trim();
		if (!value) return;
		store.addContractualConstraint(value);
		contractualConstraintDraft = '';
		addingContractualConstraint = false;
	}
</script>

<SectionCard
	icon="target"
	color="violet"
	title="Business requirements"
	eyebrow="high-level expectations: commitments, constraints, risks, documents"
>
	<div class="@container space-y-7">
		<!-- A · Commitments ─────────────────────────────────────────────── -->
		<div class="space-y-4">
			<div
				class="flex items-center gap-1.5 border-b border-line pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500"
			>
				<Icon name="check" size={12} class="text-ink-400" /> A · Commitments
			</div>
			<Field label="Business objectives" hint="What the business commits to.">
				<CriteriaList
					items={b.objectives}
					tone="brand"
					placeholder="Add an objective…"
					onadd={store.addObjective}
					onremove={store.removeObjective}
				/>
			</Field>

			<Field label="Business SLAs" hint="contractual commitment + penalty; the uptime target itself lives in Technical">
				{#if b.slas.length > 0}
					<div class="overflow-hidden rounded-card border border-line">
						<div
							class="grid grid-cols-[1fr_1fr_1.5fr_auto] gap-3 border-b border-line bg-surface-sunken px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-500"
						>
							<span>Metric</span><span>Commitment</span><span>Penalty</span><span></span>
						</div>
						{#each b.slas as sla, i (i)}
							<div
								class="grid grid-cols-[1fr_1fr_1.5fr_auto] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0"
							>
								<TextInput value={sla.metric} placeholder="Uptime" oninput={(v) => store.updateSla(i, 'metric', v)} />
								<TextInput value={sla.commitment} placeholder="99.9%" oninput={(v) => store.updateSla(i, 'commitment', v)} />
								<TextInput
									value={sla.penalty}
									placeholder="5% credit / 0.1% miss"
									oninput={(v) => store.updateSla(i, 'penalty', v)}
								/>
								<button
									type="button"
									onclick={() => store.removeSla(i)}
									class="rounded p-1 text-ink-400 hover:bg-danger-50 hover:text-danger-500"
									aria-label="Remove SLA"
								>
									<Icon name="x" size={14} />
								</button>
							</div>
						{/each}
					</div>
				{/if}
				<Button variant="ghost" size="sm" onclick={() => store.addSla()}>
					<Icon name="plus" size={14} /> SLA
				</Button>
			</Field>

			{#if rulesHref}
				<p class="flex items-center gap-1.5 rounded-field bg-surface-sunken px-3 py-2 text-[11.5px] text-ink-500">
					<Icon name="sliders" size={13} class="shrink-0 text-brand-500" />
					Looking for detailed business rules? They live in
					<a href={rulesHref} class="font-semibold text-brand-600 hover:underline">Features › Rules</a>
					(this tab stays high-level).
				</p>
			{/if}
		</div>

		<!-- B · Constraints ──────────────────────────────────────────────── -->
		<div class="space-y-3">
			<div
				class="flex items-center gap-1.5 border-b border-line pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500"
			>
				<Icon name="shield" size={12} class="text-ink-400" /> B · Constraints
			</div>
			<div>
				<Field label="Contractual constraints" hint="terms we agreed to honor">
					{#if b.contractualConstraints.length > 0}
						<ul class="space-y-1.5">
							{#each b.contractualConstraints as item, i (item + i)}
								<li
									class="group flex items-start gap-2.5 rounded-field bg-surface-sunken px-3 py-2 text-sm text-ink-700"
								>
									<span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500"></span>
									<span class="min-w-0 flex-1 break-words">{item}</span>
									<button
										type="button"
										onclick={() => store.removeContractualConstraint(i)}
										aria-label="Remove contractual constraint"
										class="shrink-0 text-ink-400 opacity-0 transition-opacity hover:text-danger-500 group-hover:opacity-100"
									>
										<Icon name="x" size={14} />
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					{#if addingContractualConstraint}
						<div class="mt-2 flex items-center gap-2">
							<TextInput
								value={contractualConstraintDraft}
								placeholder="Add a constraint…"
								oninput={(v) => (contractualConstraintDraft = v)}
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										commitContractualConstraint();
									}
									if (e.key === 'Escape') {
										contractualConstraintDraft = '';
										addingContractualConstraint = false;
									}
								}}
							/>
							<Button
								variant="outline"
								size="sm"
								disabled={!contractualConstraintDraft.trim()}
								onclick={commitContractualConstraint}
							>
								Add
							</Button>
						</div>
					{:else}
						<Button
							variant="ghost"
							size="sm"
							onclick={() => {
								addingContractualConstraint = true;
							}}
						>
							<Icon name="plus" size={14} /> Constraint
						</Button>
					{/if}
				</Field>
			</div>
		</div>

		<!-- C · Risks & assumptions ──────────────────────────────────────── -->
		<div class="space-y-3">
			<div
				class="flex items-center gap-1.5 border-b border-line pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500"
			>
				<Icon name="flag" size={12} class="text-ink-400" /> C · Risks & assumptions
			</div>
			<Field
				label="Key risks & assumptions"
				hint="what could sink the bet, and what you're taking for granted"
			>
				<CriteriaList
					items={b.risks}
					tone="danger"
					placeholder="e.g. Assumes finance teams will trust auto-approval…"
					onadd={store.addRisk}
					onremove={store.removeRisk}
				/>
			</Field>
		</div>

		<!-- D · Documents & custom ───────────────────────────────────────── -->
		<div class="space-y-3">
			<div
				class="flex items-center gap-1.5 border-b border-line pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500"
			>
				<Icon name="file-check" size={12} class="text-ink-400" /> D · Documents & custom
			</div>

			<Field label="Contract attachment" hint="optional">
				{#if b.contractAttachment}
					<div
						class="flex items-center gap-2 rounded-field border border-line bg-surface-sunken px-3 py-2 text-sm text-ink-700"
					>
						<Icon name="file-check" size={14} />
						<span class="flex-1 truncate">{b.contractAttachment}</span>
						<button
							type="button"
							onclick={() => store.clearContractAttachment()}
							class="text-ink-400 hover:text-danger-500"
							aria-label="Clear attachment"
						>
							<Icon name="x" size={14} />
						</button>
					</div>
				{:else}
					<div
						class="flex items-center justify-center gap-2 rounded-field border border-dashed border-line py-3 text-sm text-ink-400"
					>
						<button
							type="button"
							onclick={() => {
								const name = prompt('Reference (filename or storage key):');
								if (name) store.setContractAttachment(name.trim());
							}}
							class="text-ink-500 hover:text-brand-500"
						>
							<Icon name="plus" size={14} /> Optional contract attachment
						</button>
					</div>
				{/if}
			</Field>

			<Field label="Custom business requirements" hint="label + value">
				{#if b.custom.length > 0}
					<div class="space-y-2">
						{#each b.custom as row, i (i)}
							<div class="grid grid-cols-[180px_1fr_auto] items-center gap-2">
								<TextInput
									value={row.label}
									placeholder="Label"
									oninput={(v) => store.updateCustom(i, 'label', v)}
								/>
								<TextInput
									value={row.value}
									placeholder="Value"
									oninput={(v) => store.updateCustom(i, 'value', v)}
								/>
								<button
									type="button"
									onclick={() => store.removeCustom(i)}
									class="rounded p-1 text-ink-400 hover:bg-danger-50 hover:text-danger-500"
									aria-label="Remove custom requirement"
								>
									<Icon name="x" size={14} />
								</button>
							</div>
						{/each}
					</div>
				{/if}
				<Button variant="ghost" size="sm" onclick={() => store.addCustom()}>
					<Icon name="plus" size={14} /> Add custom business requirement
				</Button>
			</Field>
		</div>
	</div>
</SectionCard>

<div class="mt-4">
	<SourceCitations
		selected={store.draft.business.sourceIds}
		onToggle={(sourceId) => store.toggleSectionSource('business', sourceId)}
		subject="these commitments"
	/>
</div>
