<script lang="ts">
	import { Button, CodeBlock, Icon } from '$ui/design-system';
	import { ARTIFACT_KINDS, type ArtifactKind } from '$domain/coherence';
	import type { CoherenceStore } from '../draft-store.svelte';

	interface Props {
		store: CoherenceStore;
	}
	let { store }: Props = $props();

	const kindLabel = (k: ArtifactKind) => ARTIFACT_KINDS.find((x) => x.code === k)?.label ?? k;

	// Which artifact is expanded for inline viewing (null = none).
	let openId = $state<string | null>(null);
	const toggle = (id: string) => (openId = openId === id ? null : id);
</script>

<section class="rounded-card border border-line bg-gradient-to-br from-brand-50/30 to-transparent">
	<div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
		<div>
			<p class="text-sm font-semibold text-ink-900">
				Generate Structured Functional + Technical Specifications
			</p>
			<p class="mt-0.5 text-[11px] text-ink-500">
				Output: 1 functional document · 1 technical document · 1 product requirements document · 1 coherence graph · ready to become
				an AI Generation Contract.
			</p>
		</div>
		<Button
			size="md"
			disabled={!store.canGenerate || store.generating}
			title={store.canGenerate ? 'Generate the specs' : 'Reach the threshold with no blocking gap first'}
			onclick={store.generateSpecs}
		>
			<Icon name="sparkles" size={16} />
			{store.generating ? 'Generating…' : 'Generate specs'}
		</Button>
	</div>

	{#if store.draft.specsGenerated && store.draft.artifacts.length > 0}
		<div class="border-t border-line px-5 py-3">
			<p class="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-success-600">
				Generated {store.draft.generatedAt ? `· ${new Date(store.draft.generatedAt).toLocaleString()}` : ''}
			</p>
			<ul class="space-y-2">
				{#each store.draft.artifacts as art (art.id)}
					{@const open = openId === art.id}
					<li class="overflow-hidden rounded-field border border-line bg-surface">
						<div class="flex items-center gap-2 px-3 py-2 text-xs">
							<button
								type="button"
								onclick={() => toggle(art.id)}
								class="flex min-w-0 flex-1 items-center gap-2 text-left"
								title={open ? 'Hide spec' : 'View spec inline'}
							>
								<Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} />
								<Icon name="file-check" size={13} />
								<span class="truncate font-medium text-ink-800">{art.title}</span>
								<span class="rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[10px] text-ink-500">
									{kindLabel(art.kind)}
								</span>
								<span class="text-[10px] text-ink-400">{art.content.length} chars</span>
							</button>
							<button
								type="button"
								onclick={() => store.copyArtifact(art)}
								class="flex items-center gap-1 rounded-field border border-line px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-surface-sunken"
								title="Copy contents"
							>
								<Icon name="grid" size={12} /> Copy
							</button>
							<button
								type="button"
								onclick={() => store.downloadArtifact(art)}
								class="flex items-center gap-1 rounded-field border border-brand-200 bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-600 hover:bg-brand-100"
								title="Download file"
							>
								<Icon name="external-link" size={12} /> Download
							</button>
						</div>
						{#if open}
							<div class="border-t border-line">
								{#if art.kind === 'coherence_graph'}
									<div class="m-3">
										<CodeBlock code={art.content} language="json" filename={store.artifactFile(art).name} />
									</div>
								{:else}
									<pre class="max-h-80 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[11.5px] leading-relaxed text-ink-700">{art.content}</pre>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>
