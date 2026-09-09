<script lang="ts">
	import { Icon, type Filter } from '$ui/design-system';
	import { kernelRuleRow, type RuleRow } from '../rule-filter';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import type { KernelRule, KernelRulesReadModel } from '$application/index-feature-rules';
	import {
		unspaDashboardBase,
		unspaFeatureHref,
		unspaFeaturePath,
		unspaProjectHref,
		unspaRuleHref,
		unspaRulePath
	} from '$ui/features/unspa-dashboard-url';

	interface Props {
		model: KernelRulesReadModel;
		/** The unspa project id (may differ from the Lyriks id — see back-link). */
		dashboardProjectId: string | null;
		/** Opens the Behavior tab's EMBEDDED editor on `path` (null = the project). */
		onOpenEditor: (path?: string | null) => void;
		/** The Rules panel's filter, shared with the consolidated inventory below. */
		filter?: Filter<RuleRow> | null;
	}
	let { model, dashboardProjectId, onOpenEditor, filter = null }: Props = $props();

	// Resolved once; `null` only during SSR without a configured dashboard URL, in
	// which case links render after hydration (same contract as BehaviorOverview).
	const editorBase = unspaDashboardBase();

	/** Where a group header points — a feature page, or the project for project-wide. */
	const groupHref = (featureId: string | null) =>
		featureId ? unspaFeatureHref(featureId, editorBase) : unspaProjectHref(dashboardProjectId ?? '', editorBase);

	/** Per-rule deep link onto the tab that edits it (rules / invariants / the action), with fallbacks. */
	const ruleHref = (rule: KernelRule) => {
		if (rule.origin.kind === 'project') return unspaProjectHref(dashboardProjectId ?? '', editorBase);
		return unspaRuleHref(rule, editorBase) ?? unspaFeatureHref(rule.origin.featureId ?? '', editorBase);
	};

	/** The same targets as bare paths for the embedded editor; null = the project itself. */
	const groupPath = (featureId: string | null) => (featureId ? unspaFeaturePath(featureId) : null);
	const rulePath = (rule: KernelRule) => {
		if (rule.origin.kind === 'project') return null;
		const feature = rule.origin.featureId;
		return unspaRulePath(rule) ?? (feature ? unspaFeaturePath(feature) : null);
	};

	/** Short "where it lives" label — the action/surface the constraint attaches to. */
	const originLabel = (rule: KernelRule): string => {
		const o = rule.origin;
		if (o.kind === 'action') return `${o.surfaceName} › ${o.actionName}`;
		if (o.kind === 'surface') return `${o.surfaceName} · surface`;
		if (o.kind === 'feature') return 'Feature-wide';
		return 'Project-wide';
	};

	/* Filtering keeps the feature grouping intact: a group survives when at least
	   one of its rules matches, and then shows only the matching rules, so the
	   reader still sees which feature each hit belongs to. A group whose LABEL
	   matches keeps all of its rules, because searching a feature name means
	   "show me that feature's rules". */
	const keeps = (rule: KernelRule): boolean =>
		!filter || filter.matches(kernelRuleRow(rule, originLabel(rule)));
	const visibleGroups = $derived(
		model.groups
			.map((group) =>
				filter && !filter.active ? group : { ...group, rules: group.rules.filter(keeps) }
			)
			.filter((group) => group.rules.length > 0)
	);
	const visibleCount = $derived(visibleGroups.reduce((n, g) => n + g.rules.length, 0));
	const filtering = $derived(Boolean(filter?.active));
</script>

<div class="space-y-4">
	<div class="flex items-start justify-between gap-3">
		<p class="text-xs text-ink-500">
			Every rule and invariant the behavior model enforces (action guards, surface and feature
			invariants, project-wide constraints), folded read-only from the engine. Edit any of them in the
			behavior editor; the link opens it in place.
		</p>
		{#if model.total > 0}
			<span
				class="mt-0.5 shrink-0 rounded-pill bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold text-ink-500"
			>
				{filtering ? `${visibleCount} of ${model.total}` : `${model.total} total`}
			</span>
		{/if}
	</div>

	{#if model.missingDescription > 0}
		<div
			class="flex items-center gap-2 rounded-card border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-700"
		>
			<Icon name="circle-alert" size={14} />
			<span>
				<strong>{model.missingDescription}</strong>
				{model.missingDescription === 1 ? 'rule has' : 'rules have'} no description; they read from their
				raw condition. Open them in the behavior editor to add one.
			</span>
		</div>
	{/if}

	{#if model.total === 0}
		<div class="rounded-card border border-dashed border-line bg-surface-sunken px-6 py-10 text-center">
			<p class="text-sm font-semibold text-ink-700">No behavioral rules authored yet.</p>
			<p class="mt-1 text-xs text-ink-500">
				Add rules and invariants to your actions in the behavior editor; they surface here.
			</p>
		</div>
	{:else if visibleCount === 0}
		<p class="px-1 py-8 text-center text-sm text-ink-500">No behavioral rule matches the filter.</p>
	{:else}
		{#each visibleGroups as group (group.featureId ?? '__project')}
			{@const href = groupHref(group.featureId)}
			<section class="rounded-card border border-line bg-surface">
				<header class="flex items-center gap-2 border-b border-line px-4 py-2.5">
					<span class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
						{group.label}
					</span>
					<span class="rounded-pill bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold text-ink-500">
						{group.rules.length}
					</span>
					<span class="ml-auto inline-flex items-center gap-2">
						<button
							type="button"
							onclick={() => onOpenEditor(groupPath(group.featureId))}
							class="inline-flex items-center gap-1 text-[11px] font-medium text-brand-500 hover:text-brand-600 hover:underline"
						>
							Open in behavior editor <Icon name="cpu" size={12} />
						</button>
						{#if href}
							<a
								{href}
								target="_blank"
								rel="noopener"
								title="Open in a dedicated tab"
								class="inline-flex items-center text-ink-400 hover:text-brand-600"
							>
								<Icon name="external-link" size={12} />
							</a>
						{/if}
					</span>
				</header>
				<ul class="divide-y divide-line">
					{#each group.rules as rule (rule.id)}
						{@const rHref = ruleHref(rule)}
						<li class="flex items-start gap-3 px-4 py-2.5">
							<span
								class="mt-0.5 shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-medium {rule.kind ===
								'invariant'
									? 'bg-info-50 text-info-600'
									: rule.effect === 'block'
										? 'bg-danger-50 text-danger-600'
										: 'bg-brand-50 text-brand-600'}"
							>
								{rule.kind === 'invariant' ? 'Invariant' : rule.effect === 'block' ? 'Blocks' : 'Allows'}
							</span>
							<div class="min-w-0 flex-1">
								<p class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-ink-800">
									<span>{rule.title}</span>
									<span class="text-[10px] font-normal text-ink-400">{originLabel(rule)}</span>
									{#if !rule.hasDescription}
										<span
											class="rounded-pill bg-warning-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-warning-600"
											title="No description, reading the raw condition"
										>
											No description
										</span>
									{/if}
								</p>
								<p class="text-xs text-ink-500"><GlossaryText text={rule.description} /></p>
							</div>
							<span class="mt-0.5 inline-flex shrink-0 items-center gap-1.5">
								<button
									type="button"
									onclick={() => onOpenEditor(rulePath(rule))}
									class="inline-flex items-center gap-1 text-[11px] font-medium text-brand-500 hover:text-brand-600 hover:underline"
								>
									Edit <Icon name="cpu" size={11} />
								</button>
								{#if rHref}
									<a
										href={rHref}
										target="_blank"
										rel="noopener"
										title="Open in a dedicated tab"
										class="inline-flex items-center text-ink-400 hover:text-brand-600"
									>
										<Icon name="external-link" size={11} />
									</a>
								{/if}
							</span>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}
</div>
