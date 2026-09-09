<script lang="ts">
	/**
	 * Reconciles the behavior model's resources against the infra map.
	 *
	 * Deliberately NOT a second inventory: everything the map already shows is
	 * counted in one line and left there, and only what the map cannot show is
	 * listed, which is a resource declared in the behavior editor or one whose map
	 * object was deleted while a stale mirror kept it in the kernel. Re-listing the
	 * map's own hosts, databases and interfaces here would just be a worse copy of
	 * the map.
	 *
	 * Read-only (same contract as the Rules tab's kernel rules): folding engine
	 * content into the editable draft would mint a duplicate on the next save.
	 */
	import { Card, Icon } from '$ui/design-system';
	import type { KernelResource, KernelResourcesReadModel } from '$application/index-feature-resources';
	import {
		behaviorTabHref,
		unspaDashboardBase,
		unspaFeatureHref,
		unspaFeaturePath
	} from '$ui/features/unspa-dashboard-url';

	interface Props {
		model: KernelResourcesReadModel;
		/** This project, so a resource can link back to its feature inside Lyriks.
		    Undefined only where the route param has not resolved; the in-app link
		    then stays hidden rather than pointing at a broken project. */
		projectId?: string;
	}
	let { model, projectId }: Props = $props();

	const editorBase = unspaDashboardBase();

	// A resource points back at the feature that declares it. The button stays
	// INSIDE Lyriks (the Features section's Behavior tab, its embedded editor
	// opened on that feature); the icon beside it is the one dedicated way out to
	// a tab of its own.
	const inAppHref = (featureId: string): string =>
		behaviorTabHref(projectId ?? '', unspaFeaturePath(featureId));

	// Only what the infra map cannot show. The rest is the map's job.
	const missing = $derived(model.resources.filter((r) => !r.onMap));

	// A row's meta line: only the parts that carry information, so an unset field
	// never leaves a dangling separator.
	const metaOf = (r: KernelResource): string[] =>
		[r.kindLabel, r.provider, r.scopeLabel, r.location].map((s) => s.trim()).filter(Boolean);

	const sensitivityTone = (code: string): string =>
		code === 'restricted'
			? 'bg-danger-50 text-danger-500'
			: code === 'confidential'
				? 'bg-warning-50 text-warning-600'
				: code === 'internal'
					? 'bg-surface-sunken text-ink-500'
					: 'bg-success-50 text-success-600';

	/** Why this row is not on the map, which decides what the reader should do next. */
	const reasonOf = (r: KernelResource): string =>
		r.ownership.kind === 'behavior'
			? 'Declared in the behavior editor'
			: `Was a ${r.ownership.kind} here, no longer on the map`;
</script>

<Card padding={false}>
	<header class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
		<Icon name="database" size={15} class="text-brand-500" />
		<h3 class="text-sm font-semibold text-ink-900">Resources in the behavior model</h3>
		{#if missing.length > 0}
			<span class="rounded-pill bg-warning-50 px-2 py-0.5 text-[10px] font-semibold text-warning-600">
				{missing.length} not on the map
			</span>
		{/if}
	</header>

	{#if !model.hasProject}
		<p class="px-4 py-6 text-sm text-ink-500">
			The behavior model is unavailable right now, so its resources cannot be checked.
		</p>
	{:else if model.total === 0}
		<p class="px-4 py-6 text-sm text-ink-500">
			No resource declared yet. Databases and interfaces you add to the infra map appear in the
			behavior model, and anything declared in the behavior editor is listed here.
		</p>
	{:else if missing.length === 0}
		<!-- The whole point of the panel in the normal case: one line saying nothing
		     is hiding in the behavior model, instead of a duplicate of the map. -->
		<p class="flex items-center gap-2 px-4 py-4 text-sm text-ink-600">
			<Icon name="check" size={15} class="shrink-0 text-success-600" />
			<span>
				All {model.total} resources in the behavior model are on the infra map. Nothing is declared
				only in the behavior editor.
			</span>
		</p>
	{:else}
		<p class="border-b border-line px-4 py-2.5 text-[11px] text-ink-500">
			{model.onMap} of {model.total} resources are on the infra map. These are not, so the map
			cannot show them. They are read-only here: edit them where they are authored.
		</p>
		<ul class="divide-y divide-line">
			{#each missing as r (r.id)}
				{@const meta = metaOf(r)}
				{@const declaringFeatureId = r.declaredBy[0]?.featureId ?? ''}
				{@const editorHref = unspaFeatureHref(declaringFeatureId, editorBase)}
				<li class="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-4 py-3">
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<p class="text-sm font-semibold text-ink-800">{r.name}</p>
							{#if r.sensitivityLabel}
								<span
									class="rounded-pill px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide {sensitivityTone(r.sensitivity)}"
								>
									{r.sensitivityLabel}
								</span>
							{/if}
							{#if r.containsPii}
								<span class="rounded-pill bg-danger-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-danger-500">
									PII
								</span>
							{/if}
						</div>

						{#if meta.length > 0}
							<p class="mt-0.5 text-[11px] text-ink-500">{meta.join(' · ')}</p>
						{/if}
						{#if r.description}
							<p class="mt-1 text-[11px] leading-relaxed text-ink-600">{r.description}</p>
						{/if}

						<p class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-ink-400">
							<span>{reasonOf(r)}</span>
							{#if r.accessModeLabel}<span>{r.accessModeLabel}</span>{/if}
							{#if r.authLabel}<span>Auth: {r.authLabel}</span>{/if}
							{#if r.encryptionAtRest}<span>Encrypted at rest</span>{/if}
							{#if r.encryptionInTransit}<span>Encrypted in transit</span>{/if}
							{#if r.retention}<span>Retention: {r.retention}</span>{/if}
							{#if r.owner}<span>Owner: {r.owner}</span>{/if}
						</p>

						{#if r.complianceTags.length > 0}
							<p class="mt-1 flex flex-wrap gap-1">
								{#each r.complianceTags as tag (tag)}
									<span class="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-500">
										{tag}
									</span>
								{/each}
							</p>
						{/if}

						{#if r.declaredBy.length > 0}
							<p class="mt-1 text-[10px] text-ink-400">
								Declared by {r.declaredBy.map((d) => d.featureName).join(', ')}
							</p>
						{/if}
					</div>

					{#if declaringFeatureId && r.declaredBy.length > 0}
						<span class="inline-flex shrink-0 items-center gap-1">
							{#if projectId}
								<a
									href={inAppHref(declaringFeatureId)}
									class="inline-flex items-center gap-1 rounded-field border border-line bg-surface px-2.5 py-1.5 text-[11px] font-medium text-brand-600 hover:bg-surface-sunken"
								>
									Behavior editor <Icon name="cpu" size={12} />
								</a>
							{/if}
							{#if editorHref}
								<a
									href={editorHref}
									target="_blank"
									rel="noopener noreferrer"
									title="Open in a dedicated tab"
									aria-label="Open {r.name} in a dedicated tab"
									class="inline-flex items-center rounded-field border border-line bg-surface p-1.5 text-ink-400 hover:bg-surface-sunken hover:text-brand-600"
								>
									<Icon name="external-link" size={12} />
								</a>
							{/if}
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</Card>
