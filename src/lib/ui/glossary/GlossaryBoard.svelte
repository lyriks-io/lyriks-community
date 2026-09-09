<script lang="ts">
	import { Button, Icon, ScoreRing, type Tone } from '$ui/design-system';
	import { GLOSSARY_LOCALES, type GlossaryLocale } from '$domain/glossary';
	import { countTermUsages } from '$domain/glossary';
	import type { DocumentSource } from '$domain/documents';
	import SourceCitations from '$ui/documents/SourceCitations.svelte';
	import GlossaryText from './GlossaryText.svelte';
	import type { GlossaryStore } from './draft-store.svelte';

	interface Props {
		store: GlossaryStore;
	}
	let { store }: Props = $props();

	const healthTone = (score: number): Tone =>
		score >= 67 ? 'strong' : score >= 34 ? 'at-risk' : 'critical';

	const parseList = (value: string): string[] =>
		value
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
</script>

<div class="space-y-6">
	<!-- Glossary health -->
	{#if store.health.total > 0}
		{@const h = store.health}
		<section class="rounded-card border border-line bg-surface p-4">
			<div class="flex flex-wrap items-center gap-5">
				<div class="flex items-center gap-3">
					<ScoreRing score={h.score} tone={healthTone(h.score)} size={48} />
					<div>
						<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
							Glossary health
						</p>
						<p class="text-sm font-semibold text-ink-800">
							{h.total} term{h.total > 1 ? 's' : ''} governed
						</p>
					</div>
				</div>
				<div class="grid min-w-[260px] flex-1 grid-cols-3 gap-3">
					{#each [{ label: 'Defined', a: h.defined, pct: h.definedPct }, { label: 'Used in specs', a: h.used, pct: h.usedPct }, { label: 'Approved', a: h.approved, pct: h.approvedPct }] as m (m.label)}
						<div>
							<div class="mb-1 flex items-baseline justify-between">
								<span class="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400"
									>{m.label}</span
								>
								<span class="text-[11px] text-ink-500">{m.a}/{h.total}</span>
							</div>
							<div class="h-1.5 overflow-hidden rounded-pill bg-surface-sunken">
								<div class="h-full rounded-pill bg-brand-500" style="width:{m.pct}%"></div>
							</div>
						</div>
					{/each}
				</div>
				<span
					class="shrink-0 rounded-pill px-3 py-1.5 text-xs font-semibold {h.bannedInUse > 0
						? 'bg-danger-50 text-danger-700'
						: 'bg-success-50 text-success-700'}"
				>
					{h.bannedInUse > 0
						? `${h.bannedInUse} banned word${h.bannedInUse > 1 ? 's' : ''} in use`
						: 'No banned words in use'}
				</span>
			</div>
		</section>
	{/if}

	<!-- Suggestions mined from the brief -->
	{#if store.suggestions.length > 0}
		<section class="rounded-card border border-accent-200 bg-accent-50/40 p-4">
			<div class="mb-1.5 flex items-center justify-between gap-3">
				<span class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-600">
					<Icon name="sparkles" size={14} /> Suggested from your brief
				</span>
				<button
					type="button"
					class="text-[11px] font-semibold text-accent-600 hover:text-accent-700"
					onclick={() => store.suggestions.forEach((s) => store.addNamedTerm(s.term))}>Add all</button
				>
			</div>
			<p class="mb-2.5 text-xs text-ink-500">
				Recurring words and proper nouns from your brief that are not governed yet. Add the ones that
				are real domain concepts.
			</p>
			<div class="flex flex-wrap gap-2">
				{#each store.suggestions as s (s.term)}
					<button
						type="button"
						onclick={() => store.addNamedTerm(s.term)}
						class="inline-flex items-center gap-1.5 rounded-field border border-accent-200 bg-surface px-2.5 py-1.5 text-sm text-ink-700 transition hover:border-accent-300 hover:bg-accent-50"
					>
						<Icon name="plus" size={12} /> {s.term}
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Toolbar -->
	<div class="flex flex-wrap items-center gap-3">
		<input
			value={store.filter}
			oninput={(e) => store.setFilter(e.currentTarget.value)}
			placeholder="Search a term, definition or synonym"
			class="min-w-[200px] flex-1 rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-800 outline-none placeholder:text-ink-300"
		/>
		<label class="flex items-center gap-1.5 text-[11px] text-ink-500">
			<input
				type="checkbox"
				checked={store.showAvoidOnly}
				onchange={() => store.toggleAvoidOnly()}
			/>
			with banned synonyms only
		</label>
		<Button variant="outline" size="sm" onclick={() => store.addTerm()}>
			<Icon name="plus" size={14} /> Add term
		</Button>
	</div>

	<p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
		{store.filtered.length} of {store.draft.terms.length} term{store.draft.terms.length !== 1
			? 's'
			: ''}
	</p>

	<!-- Term list -->
	{#if store.draft.terms.length === 0}
		<div class="rounded-card border border-dashed border-line bg-surface-sunken px-6 py-10 text-center">
			<p class="text-sm font-semibold text-ink-700">Start the project dictionary.</p>
			<p class="mx-auto mt-1 max-w-md text-xs text-ink-500">
				One canonical term per concept beats five interchangeable synonyms. An LLM that reads this
				never has to guess which word you really mean.
			</p>
			<div class="mt-3">
				<Button variant="outline" size="sm" onclick={() => store.addTerm()}>
					<Icon name="plus" size={14} /> Add the first term
				</Button>
			</div>
		</div>
	{:else}
		<div class="space-y-2">
			{#each store.filtered as t (t.id)}
				{@const isOpen = store.selectedTermId === t.id}
				{@const usage = t.term.trim() ? countTermUsages(t, store.corpus) : 0}
				<article
					class="rounded-card border bg-surface transition {isOpen
						? 'border-brand-300'
						: 'border-line hover:border-line-strong'}"
				>
					<div class="flex items-center gap-2.5 p-2.5">
						<button
							type="button"
							onclick={() => store.selectTerm(t.id)}
							aria-expanded={isOpen}
							class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
						>
							<Icon
								name="chevron-right"
								size={14}
								class="shrink-0 text-ink-300 transition-transform {isOpen ? 'rotate-90' : ''}"
							/>
							<span class="max-w-[180px] shrink-0 truncate text-sm font-semibold text-ink-900">
								{#if t.term}{t.term}{:else}<span class="font-normal italic text-ink-300"
										>Untitled term</span
									>{/if}
							</span>
							<span
								class="shrink-0 rounded-pill border border-line px-1.5 py-0.5 text-[9px] font-bold text-ink-500"
								>{t.locale.toUpperCase()}</span
							>
							<span class="hidden flex-1 truncate text-xs text-ink-400 sm:block">
								{#if t.definition}{t.definition}{:else}<span class="italic text-ink-300"
										>No definition yet</span
									>{/if}
							</span>
							{#if t.synonymsAvoid.length > 0}
								<span
									class="shrink-0 rounded-pill bg-danger-50 px-1.5 py-0.5 text-[9px] font-bold text-danger-700"
									>{t.synonymsAvoid.length} banned</span
								>
							{/if}
							{#if t.term.trim()}
								<span
									class="shrink-0 rounded-pill px-1.5 py-0.5 text-[9px] font-bold {usage > 0
										? 'bg-info-50 text-info-600'
										: 'bg-surface-sunken text-ink-400'}"
									>{usage > 0 ? `${usage} use${usage > 1 ? 's' : ''}` : 'unused'}</span
								>
							{/if}
						</button>
						{#if t.term.trim()}
							<button
								type="button"
								onclick={() => store.toggleApproved(t.id)}
								title={t.status === 'approved' ? 'Approved - click to set back to draft' : 'Draft - click to approve'}
								class="inline-flex h-6 shrink-0 items-center gap-1 rounded-field px-2 text-[10px] font-bold {t.status ===
								'approved'
									? 'bg-success-50 text-success-700'
									: 'bg-surface-sunken text-ink-500 hover:text-ink-700'}"
							>
								{#if t.status === 'approved'}<Icon name="check" size={11} /> Approved{:else}Draft{/if}
							</button>
						{/if}
						<button
							type="button"
							onclick={() => store.removeTerm(t.id)}
							aria-label="Remove term"
							class="shrink-0 text-ink-300 hover:text-danger-500"><Icon name="x" size={15} /></button
						>
					</div>

					{#if isOpen}
						<div class="space-y-2.5 border-t border-line px-2.5 pb-3 pt-2.5">
							<div class="grid gap-2 md:grid-cols-[200px_1fr_72px]">
								<input
									value={t.term}
									oninput={(e) => store.updateTerm(t.id, 'term', e.currentTarget.value)}
									placeholder="Canonical term"
									class="rounded-field border border-line bg-surface px-2 py-1.5 text-sm font-semibold text-ink-900 outline-none"
								/>
								<input
									value={t.definition}
									oninput={(e) => store.updateTerm(t.id, 'definition', e.currentTarget.value)}
									placeholder="Definition in one sentence"
									class="rounded-field border border-line bg-surface px-2 py-1.5 text-sm text-ink-700 outline-none"
								/>
								<select
									value={t.locale}
									onchange={(e) => store.setLocale(t.id, e.currentTarget.value as GlossaryLocale)}
									class="rounded-field border border-line bg-surface px-2 py-1.5 text-xs font-semibold text-ink-600 outline-none"
								>
									{#each GLOSSARY_LOCALES as l (l.code)}
										<option value={l.code}>{l.label}</option>
									{/each}
								</select>
							</div>
							<div class="grid gap-2 md:grid-cols-2">
								<label class="block">
									<span class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-success-700"
										>Allowed synonyms</span
									>
									<input
										value={t.synonymsAllowed.join(', ')}
										oninput={(e) => store.setAllowedSynonyms(t.id, parseList(e.currentTarget.value))}
										placeholder="comma, separated, list"
										class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700 outline-none"
									/>
								</label>
								<label class="block">
									<span class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-danger-700"
										>Banned synonyms</span
									>
									<input
										value={t.synonymsAvoid.join(', ')}
										oninput={(e) => store.setBannedSynonyms(t.id, parseList(e.currentTarget.value))}
										placeholder="words to avoid"
										class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700 outline-none"
									/>
								</label>
							</div>
							<label class="block">
								<span class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400"
									>Example sentence</span
								>
								<input
									value={t.example}
									oninput={(e) => store.updateTerm(t.id, 'example', e.currentTarget.value)}
									placeholder="e.g. “The invoice is due in 30 days.”"
									class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs italic text-ink-700 outline-none"
								/>
							</label>
							{#if t.example.trim() && t.term.trim()}
								<div class="rounded-field border border-brand-200 bg-brand-50/40 px-2 py-1.5 text-xs text-ink-700">
									<span class="mr-1.5 text-[9px] font-bold uppercase tracking-widest text-brand-600">Preview</span>
									<GlossaryText text={t.example} terms={store.draft.terms} />
								</div>
							{/if}
						<SourceCitations
							selected={t.sourceIds}
							onToggle={(sourceId) => store.toggleTermSource(t.id, sourceId)}
							subject="this term"
						/>
						</div>
					{/if}
				</article>
			{/each}
			{#if store.filtered.length === 0}
				<p class="py-6 text-center text-sm italic text-ink-400">
					No match. Adjust the filter or clear it.
				</p>
			{/if}
		</div>
	{/if}
</div>
