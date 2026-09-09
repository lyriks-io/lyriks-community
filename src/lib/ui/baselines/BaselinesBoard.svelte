<script lang="ts">
	import { Button, Icon, SearchInput, matchesQuery, stageFromScore, stageLabel } from '$ui/design-system';
	import type { BaselinesStore } from './draft-store.svelte';

	interface Props {
		store: BaselinesStore;
		current: { readiness: number; coherence: number; featureCount: number };
	}
	let { store, current }: Props = $props();

	let name = $state('');
	let note = $state('');

	async function capture() {
		await store.capture(name, note);
		name = '';
		note = '';
	}

	// Signed delta between the current spec and a baseline (current − baseline).
	function delta(now: number, then: number): string {
		const d = now - then;
		return d === 0 ? '±0' : d > 0 ? `+${d}` : `${d}`;
	}
	const deltaTone = (now: number, then: number) =>
		now > then ? 'text-success-600' : now < then ? 'text-danger-500' : 'text-ink-400';

	function exportBaseline(id: string) {
		const b = store.draft.baselines.find((x) => x.id === id);
		if (!b) return;
		const slug = (b.name || 'baseline').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
		const blob = new Blob([b.content], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${slug || 'baseline'}.md`;
		a.click();
		URL.revokeObjectURL(url);
	}

	const fmtDate = (iso: string) => (iso ? iso.slice(0, 16).replace('T', ' ') : '');

	/* Baselines accumulate for the life of a project, so the list filters on the
	   three things a reader remembers about one: its name, its note, and roughly
	   when it was taken. */
	let search = $state('');
	const visible = $derived(
		store.draft.baselines.filter((b) => matchesQuery(search, b.name, b.note, fmtDate(b.createdAt)))
	);
</script>

<div class="space-y-5">
	<!-- Capture -->
	<div class="rounded-card border border-line bg-gradient-to-br from-brand-50/30 to-transparent p-4">
		<p class="mb-2 text-sm font-semibold text-ink-900">Capture a baseline</p>
		<div class="flex flex-wrap items-end gap-2">
			<div class="min-w-48 flex-1">
				<label class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400" for="bl-name">Name</label>
				<input
					id="bl-name"
					bind:value={name}
					placeholder="e.g. Design freeze"
					class="w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-300"
				/>
			</div>
			<div class="min-w-48 flex-[2]">
				<label class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-ink-400" for="bl-note">Note</label>
				<input
					id="bl-note"
					bind:value={note}
					placeholder="What this milestone means (optional)"
					class="w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-300"
				/>
			</div>
			<Button size="md" disabled={store.capturing} onclick={capture}>
				<Icon name="flag" size={14} /> {store.capturing ? 'Capturing…' : 'Capture'}
			</Button>
		</div>
		<p class="mt-2 text-[11px] text-ink-400">
			Now: Readiness {stageLabel(stageFromScore(current.readiness))} · Coherence {current.coherence} · {current.featureCount} features.
		</p>
	</div>

	{#if store.draft.baselines.length === 0}
		<div class="rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center">
			<p class="text-sm font-semibold text-ink-700">No baselines yet.</p>
			<p class="mt-1 text-xs text-ink-500">Capture one to freeze the spec and track how it evolves.</p>
		</div>
	{:else}
		<SearchInput
			bind:value={search}
			placeholder="Search a baseline by name, note or date…"
			class="max-w-sm"
			resultLabel="{visible.length} of {store.draft.baselines.length} baselines"
		/>

		{#if visible.length === 0}
			<p class="px-1 py-8 text-center text-sm text-ink-500">No baseline matches the search.</p>
		{:else}
		<ul class="space-y-3">
			{#each visible as b (b.id)}
				<li class="rounded-card border border-line bg-surface p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<input
								value={b.name}
								oninput={(e) => store.updateBaseline(b.id, { name: e.currentTarget.value })}
								class="w-full rounded-field border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-ink-900 outline-none hover:border-line focus:border-brand-300"
							/>
							<p class="px-1 text-[11px] text-ink-400">{fmtDate(b.createdAt)}</p>
						</div>
						<div class="flex shrink-0 items-center gap-1">
							<button
								type="button"
								onclick={() => exportBaseline(b.id)}
								title="Export requirements snapshot (Markdown)"
								class="inline-flex items-center gap-1 rounded-field border border-line px-2 py-1.5 text-[11px] font-medium text-brand-600 hover:bg-surface-sunken"
							>
								<Icon name="download" size={12} /> Export
							</button>
							<button
								type="button"
								onclick={() => store.remove(b.id)}
								aria-label="Delete baseline"
								class="rounded p-1.5 text-ink-400 hover:bg-surface-sunken hover:text-danger-500"
							>
								<Icon name="x" size={14} />
							</button>
						</div>
					</div>

					<!-- Compare vs current -->
					<div class="mt-2 flex flex-wrap gap-4 text-xs">
						{#each [{ label: 'Readiness', then: b.readiness, now: current.readiness }, { label: 'Coherence', then: b.coherence, now: current.coherence }, { label: 'Features', then: b.featureCount, now: current.featureCount }] as m (m.label)}
							<span class="text-ink-500">
								{m.label}: <span class="font-semibold text-ink-700">{m.then}</span>
								<span class={deltaTone(m.now, m.then)}>({delta(m.now, m.then)} vs now)</span>
							</span>
						{/each}
					</div>

					<input
						value={b.note}
						oninput={(e) => store.updateBaseline(b.id, { note: e.currentTarget.value })}
						placeholder="Add a note…"
						class="mt-2 w-full rounded-field border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-300"
					/>
				</li>
			{/each}
		</ul>
		{/if}
	{/if}
</div>
