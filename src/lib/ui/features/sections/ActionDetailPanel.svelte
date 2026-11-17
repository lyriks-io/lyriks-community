<script lang="ts">
	import { Icon, clickedWithin, floatInView } from '$ui/design-system';
	import { readableName } from '$domain/features';
	import type { FeatureAction } from '$application/specification/index-feature-actions';
	import type { KernelRule } from '$application/specification/index-feature-rules';
	import { nestKernelRules } from '$application/specification/nest-kernel-rules';
	import KernelRuleLines from '$ui/rules/KernelRuleLines.svelte';
	import type { ActionOverview } from '$application/specification/summarize-action';
	import type { ActionImplementationCoverage } from '$application/analysis/load-implementation-coverage';
	import { unspaActionPath, unspaActionElementPath, type ActionElement } from '../unspa-dashboard-url';
	import PanelControls from '../PanelControls.svelte';
	import DigestSummary from '../DigestSummary.svelte';
	import { digestBody } from '../digest-body';
	import type { FeatureDigest } from '$application/ports';

	interface Props {
		projectId: string;
		featureId: string;
		featureName: string;
		action: FeatureAction;
		/** The action's own rules and post-conditions, as EARS sentences. */
		rules: readonly KernelRule[];
		/** The invariants of the screen the action happens on. */
		screenInvariants: readonly KernelRule[];
		coverage?: ActionImplementationCoverage | null;
		expanded?: boolean;
		onExpandedChange?: (expanded: boolean) => void;
		/** Back to the details of the feature the action belongs to. */
		onBack: () => void;
		onClose: () => void;
		/** Opens the behavior editor's dedicated view on `path`. */
		onOpenEditor?: (path?: string | null) => void;
	}
	let {
		projectId,
		featureId,
		featureName,
		action,
		rules,
		screenInvariants,
		coverage = null,
		expanded = false,
		onExpandedChange,
		onBack,
		onClose,
		onOpenEditor
	}: Props = $props();

	const name = $derived(readableName(action.name));
	// The sentence the action's refusals share, found the way the feature tree
	// finds it, so the panel reads the rules exactly as the unfolded action does.
	const refusalLead = $derived(nestKernelRules(rules).surfaces[0]?.actions[0]?.refusalLead ?? null);
	const percent = $derived(coverage?.percent ?? 0);

	// What the kernel holds on the action beyond its rules, read on demand: the
	// tree only carries names, and this is one cheap snapshot fold, no engine run.
	let overview = $state<ActionOverview | null>(null);
	let loading = $state(false);
	$effect(() => {
		const id = action.id;
		overview = null;
		let cancelled = false;
		loading = true;
		fetch(
			`/api/features/action?projectId=${encodeURIComponent(projectId)}&featureId=${encodeURIComponent(featureId)}&actionId=${encodeURIComponent(id)}`
		)
			.then((r) => (r.ok ? r.json() : null))
			.then((body) => {
				if (!cancelled) overview = (body?.action as ActionOverview | null) ?? null;
			})
			.catch(() => {
				if (!cancelled) overview = null;
			})
			.finally(() => {
				if (!cancelled) loading = false;
			});
		return () => {
			cancelled = true;
		};
	});

	// The engine's summary of the action, the digest a feature shows for itself
	// scoped to the action (spec: criterion 3f4ba1b6). It waits on the engine, so
	// it is read when the panel opens on an action, then kept per action.
	let digest = $state<{ actionId: string; markdown: string | null } | null>(null);
	let digestLoading = $state(false);
	$effect(() => {
		const id = action.id;
		const surfaceId = action.surfaceId;
		if (digest?.actionId === id) return;
		let cancelled = false;
		digestLoading = true;
		fetch(
			`/api/features/action/digest?projectId=${encodeURIComponent(projectId)}&featureId=${encodeURIComponent(featureId)}&surfaceId=${encodeURIComponent(surfaceId)}&actionId=${encodeURIComponent(id)}`
		)
			.then((r) => (r.ok ? r.json() : null))
			.then((body) => {
				if (cancelled) return;
				const read = body?.digest as FeatureDigest | null | undefined;
				digest = {
					actionId: id,
					markdown: read?.hasContent ? digestBody(read.markdown, name, action.intent ?? '') || null : null
				};
			})
			.catch(() => {
				if (!cancelled) digest = { actionId: id, markdown: null };
			})
			.finally(() => {
				if (!cancelled) digestLoading = false;
			});
		return () => {
			cancelled = true;
		};
	});
	const digestMarkdown = $derived(digest?.actionId === action.id ? digest.markdown : null);

	/** One item of a wide-view list, and the element of the editor it opens. */
	interface ListItem {
		text: string;
		element: ActionElement | null;
	}
	const elementPath = (element: ActionElement) =>
		unspaActionElementPath(featureId, action.surfaceId, element);

	let menuOpen = $state(false);
	let menuRoot = $state<HTMLElement>();
	let menuPanel = $state<HTMLElement>();
	function onWindowClick(e: MouseEvent): void {
		if (menuOpen && !clickedWithin(e.target, menuRoot, menuPanel)) menuOpen = false;
	}
</script>

<svelte:window onclick={onWindowClick} />

<div class="space-y-4">
	<!-- ── Header: back to the feature, the action's name and the menu ── -->
	<div class="flex items-start gap-3">
		<!-- The back arrow sits in the tile where a feature shows its icon: no kicker
		     to misread (spec: surface 19b787cd). -->
		<button
			type="button"
			onclick={onBack}
			class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-600 hover:bg-brand-200"
			aria-label="Back to {featureName}"
			title="Back to {featureName}"
		>
			<Icon name="arrow-left" size={16} />
		</button>
		<div class="min-w-0 flex-1">
			<!-- What is being read, as a plain label: not a link, so it cannot be taken for one. -->
			<p class="flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-ink-400">
				<Icon name="bolt" size={11} /> Action
			</p>
			<p class="mt-0.5 text-lg font-bold leading-tight text-ink-900">{name}</p>
		</div>
		<div class="flex shrink-0 items-center gap-1">
		{#if onOpenEditor}
			<div bind:this={menuRoot} class="relative shrink-0">
				<button
					type="button"
					onclick={() => (menuOpen = !menuOpen)}
					class="inline-flex items-center rounded-field border border-line bg-surface p-1.5 text-ink-400 hover:bg-surface-sunken hover:text-ink-700"
					aria-label="More actions on this action"
					aria-expanded={menuOpen}
				>
					<Icon name="ellipsis" size={13} />
				</button>
				{#if menuOpen}
					<div bind:this={menuPanel} use:floatInView={{ anchor: menuRoot, align: 'right' }}
						class="min-w-48 rounded-lg border border-line bg-surface py-1 shadow-xl"
					>
						<button
							type="button"
							onclick={() => {
								menuOpen = false;
								onOpenEditor(unspaActionPath(featureId, action.surfaceId, action.id));
							}}
							class="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[0.6875rem] text-ink-700 hover:bg-surface-sunken"
						>
							<Icon name="cpu" size={12} /> Open in behavior editor
						</button>
					</div>
				{/if}
			</div>
		{/if}
			<PanelControls
				{expanded}
				onCollapse={() => onExpandedChange?.(false)}
				{onClose}
			/>
		</div>
	</div>

	<!-- ── Its summary first, in both views (spec: criterion 3f4ba1b6) ── -->
	<DigestSummary
		markdown={digestMarkdown}
		loading={digestLoading || digest?.actionId !== action.id}
		emptyText="The engine has nothing to summarize for this action, or could not be reached."
		loadingLabel="Reading what this action does from the model…"
	/>

	<!-- ── Where the action lives and its code; its purpose reads in the summary alone ── -->
	<div class="space-y-1.5">
		<p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-ink-500">
			<span class="inline-flex items-center gap-1"><Icon name="monitor" size={11} /> {action.surfaceName}</span>
			<span class="inline-flex items-center gap-1 tabular-nums">
				<Icon name="file-check" size={11} />
				Code {percent}%{#if coverage}<span class="text-ink-400">· {coverage.found}/{coverage.expected}</span>{/if}
			</span>
		</p>
	</div>

	<!-- ── Its rules, read exactly as the feature tree reads them under the action ── -->
	{#if rules.length > 0}
		{@render ruleBox(rules, refusalLead, true)}
	{:else}
		<p class="text-[0.6875rem] text-ink-400">No rule on this action.</p>
	{/if}

	{#if expanded}
		<!-- ── Wide view: what it takes and changes, what holds around it and proves it ── -->
		{#if overview}
			<div class="grid gap-4 lg:grid-cols-2">
				<div class="min-w-0 space-y-3">
					<!-- Every item leads to where it is edited (spec: criterion ffef1069). -->
					{@render list(
						'Takes',
						overview.parameters.map((p) => ({
							text: `${p.name}${p.required ? '*' : ''} · ${p.type || 'any'}`,
							element: p.id ? { kind: 'parameter', id: p.id } : null
						}))
					)}
					{@render list(
						'Reads',
						overview.reads.map((path) => ({ text: path, element: { kind: 'state', path } })),
						true
					)}
					{@render list(
						'Writes',
						overview.writes.map((path) => ({ text: path, element: { kind: 'state', path } })),
						true
					)}
					{@render list(
						'Emits',
						overview.events.map((name) => ({ text: name, element: { kind: 'event', name } })),
						true
					)}
					{@render list(
						'Leads to',
						overview.transitions.map((t) => ({
							text: `→ ${t.name}`,
							element: { kind: 'transition', toSurfaceId: t.surfaceId }
						}))
					)}
				</div>
				<div class="min-w-0 space-y-3">
					{#if screenInvariants.length > 0}
						<div>
							<p class="mb-1 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
								Always holds on {action.surfaceName}
							</p>
							{@render ruleBox(screenInvariants, null, false)}
						</div>
					{/if}
					{#if overview.scenarios.length > 0}
						<div>
							<p class="mb-1 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
								Scenarios
							</p>
							<ul class="space-y-1">
								{#each overview.scenarios as scenario, i (scenario.name + i)}
									{@const path = scenario.id ? elementPath({ kind: 'scenario', id: scenario.id }) : null}
									<li class="flex items-start gap-2 text-[0.75rem] text-ink-700">
										<span
											class="mt-0.5 shrink-0 rounded-pill px-1.5 py-px text-[0.5625rem] font-semibold uppercase tracking-wide {scenario.expected ===
											'success'
												? 'bg-success-50 text-success-600'
												: 'bg-warning-50 text-warning-600'}"
										>
											{scenario.expected === 'success' ? 'passes' : scenario.expected}
										</span>
										{#if path && onOpenEditor}
											<button
												type="button"
												onclick={() => onOpenEditor(path)}
												class="min-w-0 text-left font-medium text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline"
												title="Open this scenario in the behavior editor"
											>
												{scenario.name}
											</button>
										{:else}
											<span class="min-w-0">{scenario.name}</span>
										{/if}
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			</div>
		{:else if loading}
			<div class="animate-pulse space-y-1.5" aria-busy="true">
				<div class="h-2 w-1/3 rounded bg-line"></div>
				<div class="h-2 w-2/3 rounded bg-line"></div>
				<div class="h-2 w-1/2 rounded bg-line"></div>
			</div>
		{:else}
			<p class="text-[0.6875rem] text-ink-400">The behavior model of this action could not be read.</p>
		{/if}
	{:else}
		<div class="flex justify-end">
			<button
				type="button"
				onclick={() => onExpandedChange?.(true)}
				class="inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-brand-600 hover:underline"
			>
				<Icon name="maximize" size={12} /> See more
			</button>
		</div>
	{/if}
</div>

{#snippet ruleBox(items: readonly KernelRule[], lead: string | null, underAction: boolean)}
	<div class="overflow-hidden rounded-field border border-line bg-surface-card py-1">
		<KernelRuleLines rules={items} refusalLead={lead} {underAction} {onOpenEditor} />
	</div>
{/snippet}

{#snippet list(label: string, items: readonly ListItem[], mono = false)}
	{#if items.length > 0}
		<div>
			<p class="mb-1 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400">{label}</p>
			<ul class="flex flex-wrap gap-1">
				{#each items as item, i (item.text + i)}
					{@const path = item.element ? elementPath(item.element) : null}
					<li>
						{#if path && onOpenEditor}
							<button
								type="button"
								onclick={() => onOpenEditor(path)}
								class="rounded-pill bg-surface-sunken px-2 py-0.5 text-[0.6875rem] font-medium text-brand-600 underline-offset-2 hover:bg-brand-50 hover:text-brand-700 hover:underline {mono
									? 'font-mono'
									: ''}"
								title="Open in the behavior editor"
							>
								{item.text}
							</button>
						{:else}
							<span
								class="inline-block rounded-pill bg-surface-sunken px-2 py-0.5 text-[0.6875rem] text-ink-700 {mono
									? 'font-mono'
									: ''}"
							>
								{item.text}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
{/snippet}
