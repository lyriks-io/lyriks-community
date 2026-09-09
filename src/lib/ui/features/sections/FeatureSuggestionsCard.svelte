<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { matchCore, type FeatureSuggestion } from '$domain/features';
	import type { FeaturesStore } from '../draft-store.svelte';

	interface Props {
		store: FeaturesStore;
	}
	let { store }: Props = $props();

	// Suggestions come from the AI/MCP seam via /api/features/suggestions — never
	// hardcoded in the component. Dismissed ids are transient (per session).
	let suggestions = $state<FeatureSuggestion[]>([]);
	let dismissed = $state<string[]>([]);

	$effect(() => {
		const pid = store.draft.projectId;
		let cancelled = false;
		fetch(`/api/features/suggestions?projectId=${encodeURIComponent(pid)}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((body) => {
				if (!cancelled) suggestions = (body?.suggestions as FeatureSuggestion[]) ?? [];
			})
			.catch(() => {
				if (!cancelled) suggestions = [];
			});
		return () => {
			cancelled = true;
		};
	});

	// Hide dismissed + any whose title already landed in the tree (after accept).
	const visible = $derived(
		suggestions.filter((s) => {
			if (dismissed.includes(s.id)) return false;
			const t = s.title.trim().toLowerCase();
			return !store.draft.features.some((f) => f.name.trim().toLowerCase() === t);
		})
	);

	/** Resolve the target core: existing keyword match → preferredCore (created) → first core → a new "General". */
	function targetCore(s: FeatureSuggestion): string | null {
		const existing = matchCore(store.draft, s);
		if (existing) return existing.id;
		if (s.preferredCore) return store.addCore({ name: s.preferredCore });
		if (store.draft.cores[0]) return store.draft.cores[0].id;
		return store.addCore({ name: 'General' });
	}

	function accept(s: FeatureSuggestion) {
		const coreId = targetCore(s);
		if (coreId) store.addFeatureToCore(coreId, s.title);
		dismissed = [...dismissed, s.id];
	}
	const dismiss = (id: string) => (dismissed = [...dismissed, id]);
	function acceptAll() {
		for (const s of visible) accept(s);
	}
	const dismissAll = () => (dismissed = [...dismissed, ...visible.map((s) => s.id)]);

	/** Chip showing where an accepted suggestion will land. */
	function coreHint(s: FeatureSuggestion): { label: string; isNew: boolean } | null {
		const existing = matchCore(store.draft, s);
		if (existing) return { label: existing.name || 'Untitled core', isNew: false };
		if (s.preferredCore) return { label: s.preferredCore, isNew: true };
		const first = store.draft.cores[0];
		return first ? { label: first.name || 'Untitled core', isNew: false } : null;
	}
</script>

{#if visible.length > 0}
	<div class="rounded-card border-2 border-brand-200 bg-brand-50/40 p-4 shadow-card">
		<div class="mb-2 flex items-center justify-between gap-2">
			<div class="flex items-center gap-2">
				<Icon name="sparkles" size={15} class="text-brand-500" />
				<span class="text-sm font-semibold text-ink-900">Suggested features</span>
				<span class="rounded-pill bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600">
					{visible.length}
				</span>
			</div>
			<div class="flex items-center gap-1.5">
				<button
					type="button"
					onclick={dismissAll}
					class="rounded-field bg-surface-sunken px-2 py-1 text-[10px] font-medium text-ink-500 hover:text-ink-700"
				>
					Dismiss all
				</button>
				<button
					type="button"
					onclick={acceptAll}
					class="rounded-field bg-brand-500 px-2 py-1 text-[10px] font-semibold text-white hover:bg-brand-600"
				>
					Accept all
				</button>
			</div>
		</div>
		<p class="mb-3 text-[11px] text-ink-500">
			Proposed by Lyriks from your project context. Nothing is created until you click Accept.
		</p>
		<div class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
			{#each visible as s (s.id)}
				{@const hint = coreHint(s)}
				<div class="flex items-stretch gap-2 rounded-field border border-line bg-surface p-3">
					<div class="flex min-w-0 flex-1 flex-col justify-center">
						<p class="truncate text-xs font-semibold text-ink-900">{s.title}</p>
						<p class="mt-0.5 text-[10px] leading-snug text-ink-500">{s.rationale}</p>
						{#if hint}
							<div class="mt-1.5 flex flex-wrap items-center gap-1">
								<span class="text-[9px] font-bold uppercase tracking-widest text-ink-400">
									{hint.isNew ? '+ Will create core' : 'Goes into core'}
								</span>
								<span
									class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-ink-700 {hint.isNew
										? 'border border-dashed border-line bg-surface'
										: 'bg-surface-sunken'}"
								>
									<Icon name={hint.isNew ? 'plus' : 'grid'} size={9} />
									{hint.label}
								</span>
							</div>
						{/if}
					</div>
					<div class="flex shrink-0 flex-col justify-center gap-1">
						<button
							type="button"
							onclick={() => accept(s)}
							class="rounded-field bg-brand-500 px-3 py-1 text-[10px] font-semibold text-white hover:bg-brand-600"
						>
							Accept
						</button>
						<button
							type="button"
							onclick={() => dismiss(s.id)}
							class="rounded-field px-3 py-1 text-[10px] text-ink-400 hover:bg-surface-sunken hover:text-ink-700"
						>
							Dismiss
						</button>
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}
