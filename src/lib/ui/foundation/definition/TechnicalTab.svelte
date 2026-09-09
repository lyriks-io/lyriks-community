<script lang="ts">
	import { page } from '$app/state';
	import { Button, Field, Icon, MultiSelect, SectionCard, Select, TextInput } from '$ui/design-system';
	import {
		API_KINDS,
		AVAILABILITY_LEVELS,
		COMPATIBILITIES,
		CRITICALITY_LEVELS,
		INTEGRATION_DIRECTIONS,
		PERFORMANCE_UNITS
	} from '$domain/foundation';
	import SourceCitations from '$ui/documents/SourceCitations.svelte';
	import type { DefinitionStore } from '../definition-store.svelte';

	interface Props {
		store: DefinitionStore;
		/** Active sub-section, driven by the second-level nav (SubTabBar). */
		active?: 'runtime' | 'apis' | 'performance' | 'custom';
	}
	let { store, active = 'runtime' }: Props = $props();

	const t = $derived(store.draft.technical);
	const availabilityOptions = [
		{ code: '', label: '-' },
		...AVAILABILITY_LEVELS.map((v) => ({ code: v, label: v }))
	];
	// The stack, schema and reference docs are Architecture concerns, not product
	// definition — point there instead of duplicating them here.
	const architectureHref = $derived(
		page.params.projectId ? `/projects/${page.params.projectId}/infrastructure#architecture` : undefined
	);
</script>

<div class="space-y-6">
	{#if architectureHref}
		<p class="flex items-center gap-1.5 rounded-field border border-line bg-surface px-3 py-2 text-[11.5px] text-ink-500">
			<Icon name="server" size={13} class="shrink-0 text-info-500" />
			The tech stack, data schema and reference docs live in
			<a href={architectureHref} class="font-semibold text-brand-600 hover:underline">Data &amp; Architecture</a>
			(here you only frame what the PRODUCT needs from the tech).
		</p>
	{/if}

	<SectionCard
		icon="server"
		color="blue"
		title="Product technical expectations"
		eyebrow="what it must work with, talk to, and feel like"
	>
	<div class="@container space-y-7">
		{#if active === 'runtime'}
		<!-- Compatibilities -->
		<Field label="Where must it run?" hint="browsers, OS and devices your users actually have">
			<MultiSelect
				values={t.compatibilities}
				options={COMPATIBILITIES}
				allowCustom={false}
				tone="brand"
				onchange={store.setCompatibilities}
			/>
		</Field>
		{/if}

		{#if active === 'apis'}
		<!-- Integrations -->
		<Field label="What must it connect to?" hint="systems the product is useless without">
			{#if store.draft.technical.integrations.length > 0}
				<div class="overflow-x-auto rounded-card border border-line">
					<div class="grid min-w-136 grid-cols-[1.5fr_140px_140px_auto] gap-3 border-b border-line bg-surface-sunken px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
						<span>System</span>
						<span>Direction</span>
						<span>Criticality</span>
						<span></span>
					</div>
					{#each store.draft.technical.integrations as it, i (i)}
						<div class="grid min-w-136 grid-cols-[1.5fr_140px_140px_auto] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
							<TextInput value={it.system} placeholder="Stripe" oninput={(v) => store.updateIntegration(i, 'system', v)} />
							<Select
								value={it.direction}
								options={INTEGRATION_DIRECTIONS}
								onchange={(v) =>
									store.updateIntegration(i, 'direction', v as (typeof INTEGRATION_DIRECTIONS)[number]['code'])}
							/>
							<Select
								value={it.criticality}
								options={CRITICALITY_LEVELS}
								onchange={(v) =>
									store.updateIntegration(i, 'criticality', v as (typeof CRITICALITY_LEVELS)[number]['code'])}
							/>
							<button
								type="button"
								onclick={() => store.removeIntegration(i)}
								class="rounded p-1 text-ink-400 hover:bg-danger-50 hover:text-danger-500"
								aria-label="Remove integration"
							>
								<Icon name="x" size={14} />
							</button>
						</div>
					{/each}
				</div>
			{/if}
			<Button variant="ghost" size="sm" onclick={() => store.addIntegration()}>
				<Icon name="plus" size={14} /> Integration
			</Button>
			<p class="mt-2 flex items-center gap-1.5 text-[11px] text-ink-400">
				<Icon name="shield" size={12} class="shrink-0 text-info-500" />
				Authentication & SSO are captured in Security → Authentication; list only non-identity systems here.
			</p>
		</Field>

		<!-- APIs expose / consume -->
		<div class="grid gap-6 @lg:grid-cols-2">
			<Field label="APIs to expose" hint="how others will build on this product">
				<MultiSelect
					values={t.apisExpose}
					options={API_KINDS}
					allowCustom={false}
					tone="brand"
					onchange={store.setApisExpose}
				/>
			</Field>
			<Field label="APIs to consume" hint="external services the product relies on">
				<MultiSelect
					values={t.apisConsume}
					options={API_KINDS}
					allowCustom={false}
					tone="brand"
					onchange={store.setApisConsume}
				/>
			</Field>
		</div>
		{/if}

		{#if active === 'performance'}
		<!-- Performance targets -->
		<Field label="How fast must it feel?" hint="user-perceived targets per key action">
			{#if store.draft.technical.performance.length > 0}
				<div class="overflow-x-auto rounded-card border border-line">
					<div class="grid min-w-136 grid-cols-[1fr_1fr_140px_auto] gap-3 border-b border-line bg-surface-sunken px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
						<span>Action</span>
						<span>Target</span>
						<span>Unit</span>
						<span></span>
					</div>
					{#each store.draft.technical.performance as pt, i (i)}
						<div class="grid min-w-136 grid-cols-[1fr_1fr_140px_auto] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
							<TextInput value={pt.action} placeholder="Invoice list load" oninput={(v) => store.updatePerformanceTarget(i, 'action', v)} />
							<TextInput
								value={Number.isFinite(pt.target) ? String(pt.target) : ''}
								placeholder="200"
								oninput={(v) => store.updatePerformanceTarget(i, 'target', Number.parseFloat(v) || 0)}
							/>
							<Select
								value={pt.unit}
								options={PERFORMANCE_UNITS}
								onchange={(v) =>
									store.updatePerformanceTarget(i, 'unit', v as (typeof PERFORMANCE_UNITS)[number]['code'])}
							/>
							<button
								type="button"
								onclick={() => store.removePerformanceTarget(i)}
								class="rounded p-1 text-ink-400 hover:bg-danger-50 hover:text-danger-500"
								aria-label="Remove performance target"
							>
								<Icon name="x" size={14} />
							</button>
						</div>
					{/each}
				</div>
			{/if}
			<Button variant="ghost" size="sm" onclick={() => store.addPerformanceTarget()}>
				<Icon name="plus" size={14} /> Performance target
			</Button>
		</Field>

		<!-- Availability -->
		<div class="grid gap-6 @lg:grid-cols-2">
			<Field label="How available must it be?" hint="the uptime target (SLO); the contractual SLA & penalty live in Business">
				<Select
					value={t.availability}
					options={availabilityOptions}
					onchange={(v) => store.setAvailability(v)}
				/>
			</Field>
		</div>
		{/if}

		{#if active === 'custom'}
		<!-- Custom technical requirements -->
		<Field label="Custom technical requirements" hint="label + value">
			{#if t.custom.length > 0}
				<div class="space-y-2">
					{#each t.custom as row, i (i)}
						<div class="grid grid-cols-[180px_1fr_auto] items-center gap-2">
							<TextInput value={row.label} placeholder="Label" oninput={(v) => store.updateTechCustom(i, 'label', v)} />
							<TextInput value={row.value} placeholder="Value" oninput={(v) => store.updateTechCustom(i, 'value', v)} />
							<button
								type="button"
								onclick={() => store.removeTechCustom(i)}
								class="rounded p-1 text-ink-400 hover:bg-danger-50 hover:text-danger-500"
								aria-label="Remove custom requirement"
							>
								<Icon name="x" size={14} />
							</button>
						</div>
					{/each}
				</div>
			{/if}
			<Button variant="ghost" size="sm" onclick={() => store.addTechCustom()}>
				<Icon name="plus" size={14} /> Add custom technical requirement
			</Button>
		</Field>
		{/if}
	</div>
	</SectionCard>
</div>

<div class="mt-4">
	<SourceCitations
		selected={store.draft.technical.sourceIds}
		onToggle={(sourceId) => store.toggleSectionSource('technical', sourceId)}
		subject="these expectations"
	/>
</div>
