<script lang="ts">
	import { Button, Card, Icon, Select, Textarea } from '$ui/design-system';
	import { KPI_UNITS, LIMITS } from '$domain/foundation';
	import CriteriaList from '../sections/CriteriaList.svelte';
	import SourceCitations from '$ui/documents/SourceCitations.svelte';
	import type { DefinitionStore } from '../definition-store.svelte';

	interface Props {
		store: DefinitionStore;
		/** Shared personas from Users & Permissions (read-only projection). */
		roles?: { id: string; name: string; tone: string }[];
		/** Create a real shared role and resolve its id (null on failure/cancel). */
		onCreateRole?: (name: string) => Promise<string | null>;
	}
	let { store, roles = [], onCreateRole }: Props = $props();

	const o = $derived(store.draft.businessObjective);

	// Pain-point ⇄ users linking. The picker lists the same roles as Users &
	// Permissions; typing a new name offers to create one there and link it here.
	let openPickerId = $state<string | null>(null);
	let query = $state('');
	let creating = $state(false);
	const roleName = (id: string) => roles.find((r) => r.id === id)?.name?.trim() || 'Unnamed user';
	const matches = $derived(
		roles.filter((r) => (r.name || '').toLowerCase().includes(query.trim().toLowerCase()))
	);
	const canCreate = $derived(
		!!onCreateRole &&
			query.trim().length > 0 &&
			!roles.some((r) => r.name.trim().toLowerCase() === query.trim().toLowerCase())
	);
	function openPicker(id: string) {
		openPickerId = openPickerId === id ? null : id;
		query = '';
	}
	function addPain(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		const el = e.currentTarget as HTMLInputElement;
		const t = el.value.trim();
		if (!t) return;
		store.addPainPointLink(t);
		el.value = '';
	}
	async function createFor(linkId: string) {
		if (!onCreateRole || !canCreate || creating) return;
		creating = true;
		const id = await onCreateRole(query.trim());
		creating = false;
		if (id) {
			store.attachPainPointRole(linkId, id);
			query = '';
		}
	}
	const kpiUnitOptions = KPI_UNITS.map((u) => ({ code: u, label: u }));

	const numOrNull = (v: string): number | null => {
		if (v.trim() === '') return null;
		const n = Number(v);
		return Number.isFinite(n) ? n : null;
	};
	const show = (v: number | null) => (v === null ? '' : String(v));
	const trackedKpis = $derived(o.kpis.filter((k) => k.name.trim().length > 0));

	// the mockup's "Projected impact" — per KPI improvement % + direction.
	const projected = $derived(
		o.kpis
			.filter((k) => k.name.trim() && k.currentValue !== null && k.targetValue !== null)
			.map((k) => {
				const cur = k.currentValue as number;
				const tgt = k.targetValue as number;
				const dir = tgt > cur ? 'up' : tgt < cur ? 'down' : 'flat';
				const pct = cur === 0 ? null : Math.round((Math.abs(tgt - cur) / Math.abs(cur)) * 100);
				return { name: k.name, unit: k.unit, cur, tgt, dir, pct };
			})
	);
</script>

<!-- @container so every inner grid responds to the card's real width, not the
     viewport — the card can be narrow under a sidebar even on a wide screen. -->
<div class="@container space-y-4" data-anchor="business-objective">
	<!-- Hero · pain → outcome -->
	<Card>
		<div class="grid items-stretch gap-3 @2xl:grid-cols-[1fr_auto_1fr]">
			<div class="space-y-2 rounded-card border border-danger-200 bg-danger-50/60 p-4">
				<div class="flex items-center gap-2">
					<span class="grid size-7 place-items-center rounded-field bg-danger-100 text-danger-600">
						<Icon name="info" size={16} />
					</span>
					<div>
						<p class="text-[10px] font-bold uppercase tracking-[0.14em] text-danger-600">The pain</p>
						<p class="text-[11px] text-ink-400">1-3 sentences - the pain you exist to fix</p>
					</div>
				</div>
				<Textarea
					value={o.mainProblem}
					oninput={store.setMainProblem}
					rows={3}
					placeholder="In one paragraph, what painful situation does this product end?"
					invalid={o.mainProblem.length > LIMITS.mainProblem}
				/>
			</div>

			<div class="hidden items-center justify-center px-1 @2xl:flex">
				<span class="grid size-8 place-items-center rounded-full border border-line bg-surface text-ink-400">
					<Icon name="arrow-right" size={16} />
				</span>
			</div>

			<div class="space-y-2 rounded-card border border-success-200 bg-success-50/60 p-4">
				<div class="flex items-center gap-2">
					<span class="grid size-7 place-items-center rounded-field bg-success-100 text-success-600">
						<Icon name="trophy" size={16} />
					</span>
					<div>
						<p class="text-[10px] font-bold uppercase tracking-[0.14em] text-success-600">
							What winning looks like
						</p>
						<p class="text-[11px] text-ink-400">1-2 sentences - the outcome you commit to</p>
					</div>
				</div>
				<Textarea
					value={o.expectedOutcome}
					oninput={store.setExpectedOutcome}
					rows={3}
					placeholder="MRR target, time saved, NPS lift…"
					invalid={o.expectedOutcome.length > LIMITS.expectedOutcome}
				/>
			</div>
		</div>
	</Card>

	<!-- Context · who's hurting — each pain point carries the users it hurts,
	     picked from (or created into) the shared Users & Permissions roles. -->
	<Card>
		<div class="mb-1 flex items-center gap-2">
			<Icon name="layers" size={16} class="text-brand-500" />
			<h3 class="text-sm font-semibold text-ink-900">Context</h3>
			<span class="text-xs text-ink-400">- who's hurting, and how</span>
		</div>
		<p class="mb-3 text-[11px] text-ink-400">
			Add each pain point, then link the users it hurts. Users are shared with Users &amp;
			Permissions - pick existing ones or create a new one on the spot.
		</p>

		<div class="space-y-2.5">
			{#each o.painPointLinks as link (link.id)}
				<div class="rounded-card border border-line bg-surface p-3">
					<div class="flex items-center gap-2">
						<Icon name="alert-triangle" size={15} class="shrink-0 text-danger-500" />
						<input
							value={link.text}
							oninput={(e) => store.setPainPointText(link.id, e.currentTarget.value)}
							placeholder="Add a pain…"
							maxlength={LIMITS.painPoint}
							class="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-ink-900 hover:border-line focus:border-brand-400 focus:outline-none"
						/>
						<button
							type="button"
							onclick={() => store.removePainPointLink(link.id)}
							aria-label="Remove pain point"
							class="grid size-7 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-danger-50 hover:text-danger-500"
						>
							<Icon name="x" size={14} />
						</button>
					</div>

					<div class="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
						{#each link.roleIds as roleId (roleId)}
							<span
								class="inline-flex items-center gap-1.5 rounded-pill bg-brand-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-brand-700"
							>
								<Icon name="user" size={12} />
								{roleName(roleId)}
								<button
									type="button"
									onclick={() => store.togglePainPointRole(link.id, roleId)}
									aria-label="Unlink user"
									class="text-brand-400 transition-colors hover:text-brand-700"
								>
									<Icon name="x" size={12} />
								</button>
							</span>
						{/each}
						<button
							type="button"
							onclick={() => openPicker(link.id)}
							aria-expanded={openPickerId === link.id}
							class="inline-flex items-center gap-1 rounded-pill border border-dashed border-ink-300 px-2.5 py-1 text-xs font-medium text-ink-500 transition-colors hover:border-brand-400 hover:text-brand-600"
						>
							<Icon name="plus" size={12} /> user
						</button>
					</div>

					{#if openPickerId === link.id}
						<div class="ml-6 mt-2 w-64 overflow-hidden rounded-card border border-line bg-surface shadow-sm">
							<div class="border-b border-line p-1.5">
								<!-- svelte-ignore a11y_autofocus -->
								<input
									bind:value={query}
									autofocus
									placeholder="Search or create a user…"
									class="w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-900 focus:border-brand-400 focus:outline-none"
								/>
							</div>
							<div class="max-h-52 overflow-y-auto py-1">
								{#each matches as r (r.id)}
									{@const checked = link.roleIds.includes(r.id)}
									<button
										type="button"
										onclick={() => store.togglePainPointRole(link.id, r.id)}
										class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-ink-700 hover:bg-surface-sunken"
									>
										<span
											class="grid size-4 shrink-0 place-items-center rounded border {checked
												? 'border-brand-500 bg-brand-500 text-white'
												: 'border-ink-300'}"
										>
											{#if checked}<Icon name="check" size={11} />{/if}
										</span>
										<span class="truncate">{r.name.trim() || 'Unnamed user'}</span>
									</button>
								{/each}
								{#if matches.length === 0 && !canCreate}
									<p class="px-2.5 py-2 text-[11px] italic text-ink-400">
										No users yet. Type a name to create one.
									</p>
								{/if}
							</div>
							{#if canCreate}
								<button
									type="button"
									onclick={() => createFor(link.id)}
									disabled={creating}
									class="flex w-full items-center gap-2 border-t border-line bg-surface-sunken/60 px-2.5 py-2 text-left text-xs font-semibold text-brand-600 transition-colors hover:bg-surface-sunken disabled:opacity-60"
								>
									<Icon name="plus" size={14} /> Create user "{query.trim()}"
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{/each}

			<input
				onkeydown={addPain}
				placeholder="Add a pain…  (Enter)"
				maxlength={LIMITS.painPoint}
				class="w-full rounded-card border border-dashed border-ink-300 bg-transparent px-3 py-2.5 text-sm text-ink-600 placeholder:text-ink-400 hover:border-brand-400 focus:border-brand-500 focus:outline-none"
			/>

			{#if o.affectedPersonas.length > 0}
				<p class="pt-1 text-[11px] text-ink-400">
					Previously listed personas to re-attach: {o.affectedPersonas.join(', ')} - create them as
					users above.
				</p>
			{/if}
		</div>
	</Card>

	<!-- Target KPIs -->
	<Card>
		<div class="mb-3 flex items-center justify-between gap-2">
			<div class="flex items-center gap-2">
				<Icon name="gauge" size={16} class="text-brand-500" />
				<h3 class="text-sm font-semibold text-ink-900">Target KPIs</h3>
				<span class="text-xs text-ink-400">- how you'll measure success</span>
			</div>
			{#if o.kpis.length > 0}
				<span class="text-[11px] font-medium text-ink-400">{trackedKpis.length} tracked</span>
			{/if}
		</div>

		{#if o.kpis.length > 0}
			<div class="overflow-hidden rounded-field border border-line">
				<div
					class="grid grid-cols-[1fr_5rem_5rem_6rem_2rem] items-center gap-2 bg-surface-sunken px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-400"
				>
					<span>KPI name</span><span>Current</span><span>Target</span><span>Unit</span><span></span>
				</div>
				{#each o.kpis as kpi, i (i)}
					<div class="grid grid-cols-[1fr_5rem_5rem_6rem_2rem] items-center gap-2 border-t border-line px-3 py-2">
						<input value={kpi.name} placeholder="e.g. DSO" maxlength={60} oninput={(e) => store.updateKpi(i, 'name', e.currentTarget.value)} class="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-ink-900 hover:border-line focus:border-brand-400" />
						<input value={show(kpi.currentValue)} type="number" placeholder="-" oninput={(e) => store.updateKpi(i, 'currentValue', numOrNull(e.currentTarget.value))} class="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm tabular-nums text-ink-900 hover:border-line focus:border-brand-400" />
						<input value={show(kpi.targetValue)} type="number" placeholder="-" oninput={(e) => store.updateKpi(i, 'targetValue', numOrNull(e.currentTarget.value))} class="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm tabular-nums text-ink-900 hover:border-line focus:border-brand-400" />
						<Select value={kpi.unit} options={kpiUnitOptions} onchange={(v) => store.updateKpi(i, 'unit', v)} />
						<button type="button" onclick={() => store.removeKpi(i)} aria-label="Remove KPI" class="grid size-7 place-items-center rounded-md text-ink-400 hover:bg-danger-50 hover:text-danger-500">
							<Icon name="x" size={14} />
						</button>
					</div>
				{/each}
			</div>
		{/if}
		<div class={o.kpis.length > 0 ? 'mt-2.5' : ''}>
			<Button variant="outline" size="sm" onclick={store.addKpi}><Icon name="plus" size={15} /> KPI</Button>
		</div>

		{#if projected.length > 0}
			<div class="mt-4 border-t border-line pt-3">
				<p class="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Projected impact</p>
				<div class="grid gap-2 @md:grid-cols-2 @2xl:grid-cols-3">
					{#each projected as p (p.name)}
						<div class="flex items-center justify-between rounded-field border border-line bg-surface-sunken px-3 py-2">
							<div class="min-w-0">
								<div class="truncate text-xs font-semibold text-ink-800">{p.name}</div>
								<div class="truncate text-[10px] text-ink-400">
									{p.cur}{p.unit ? ` ${p.unit}` : ''} → {p.tgt}{p.unit ? ` ${p.unit}` : ''}
								</div>
							</div>
							<span
								class="rounded px-2 py-1 text-[11px] font-mono font-bold {p.dir === 'up'
									? 'bg-success-50 text-success-600'
									: p.dir === 'down'
										? 'bg-danger-50 text-danger-600'
										: 'bg-surface text-ink-400'}"
							>
								{p.dir === 'up' ? '↑' : p.dir === 'down' ? '↓' : '='}
								{p.pct !== null ? `${p.pct}%` : '-'}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</Card>

	<!-- Won / Lost -->
	<div class="grid gap-4 @lg:grid-cols-2">
		<Card class="border-success-200 bg-success-50/40">
			<div class="mb-3 flex items-center gap-2">
				<span class="grid size-7 place-items-center rounded-field bg-success-100 text-success-600">
					<Icon name="check" size={16} />
				</span>
				<div>
					<p class="text-[10px] font-bold uppercase tracking-[0.14em] text-success-600">We've won when</p>
					<p class="text-[11px] text-ink-400">measurable business signals that prove the bet paid off; tie each to a KPI above</p>
				</div>
			</div>
			<CriteriaList items={o.successCriteria} tone="success" placeholder="e.g. 40% of quotes go through the product by Q4…" maxLength={LIMITS.criterion} onadd={store.addSuccessCriterion} onremove={store.removeSuccessCriterion} />
		</Card>
		<Card class="border-danger-200 bg-danger-50/40">
			<div class="mb-3 flex items-center gap-2">
				<span class="grid size-7 place-items-center rounded-field bg-danger-100 text-danger-600">
					<Icon name="x" size={16} />
				</span>
				<div>
					<p class="text-[10px] font-bold uppercase tracking-[0.14em] text-danger-600">We should kill it when</p>
					<p class="text-[11px] text-ink-400">alert thresholds that prove users aren't buying it (numbers, not feelings)</p>
				</div>
			</div>
			<CriteriaList items={o.failureCriteria} tone="danger" placeholder="e.g. adoption < 10% of target after 3 months…" maxLength={LIMITS.criterion} onadd={store.addFailureCriterion} onremove={store.removeFailureCriterion} />
		</Card>
	</div>
</div>

<div class="mt-4">
	<SourceCitations
		selected={store.draft.businessObjective.sourceIds}
		onToggle={(sourceId) => store.toggleSectionSource('businessObjective', sourceId)}
		subject="this objective"
	/>
</div>
