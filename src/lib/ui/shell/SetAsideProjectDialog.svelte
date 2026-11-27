<script lang="ts">
	/**
	 * Which active project makes room (EVO-016, criterion 601e615e): with every
	 * place the key grants taken, making a project active lists the active ones;
	 * the one picked becomes inactive, and Cancel changes nothing.
	 */
	let {
		activeProjects,
		busy = false,
		onpick,
		oncancel
	}: {
		activeProjects: readonly { readonly id: string; readonly name: string }[];
		busy?: boolean;
		onpick: (projectId: string) => void;
		oncancel: () => void;
	} = $props();

	let picked = $state<string | null>(null);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !busy && oncancel()} />

<div role="dialog" aria-modal="true" aria-label="Set a project aside" tabindex="-1" class="fixed inset-0 z-[85] box-border flex animate-lk-fade items-start justify-center overflow-y-auto bg-ink/45 px-4 py-16 font-evo">
	<div class="box-border flex w-full max-w-[520px] flex-col gap-4 border-2 border-ink bg-paper p-6 text-left text-ink shadow-pop">
		<span class="flex flex-col gap-1">
			<span class="font-evo-mono text-xs tracking-[0.08em] text-ink-3 uppercase">Active projects</span>
			<h2 class="m-0 text-xl font-bold tracking-[-0.02em]">Which active project makes room?</h2>
		</span>
		<p class="m-0 text-[0.875rem] text-ink-2">Every active place the licence holds is taken. The project you pick becomes inactive; nothing in it is deleted.</p>
		<fieldset class="m-0 flex flex-col gap-2 border-0 p-0">
			<legend class="sr-only">Active projects</legend>
			{#each activeProjects as project (project.id)}
				<label class="flex min-h-10 cursor-pointer items-center gap-3 border-[1.5px] px-3 {picked === project.id ? 'border-ink bg-paper' : 'border-line bg-surface'}">
					<input type="radio" name="set-aside" value={project.id} bind:group={picked} class="accent-ink" />
					<span class="text-[0.9375rem] font-semibold">{project.name}</span>
				</label>
			{/each}
		</fieldset>
		<div class="flex flex-wrap items-center justify-end gap-3">
			<button type="button" onclick={oncancel} disabled={busy} class="min-h-10 cursor-pointer border-0 bg-transparent px-3 text-xs font-semibold text-ink underline decoration-[1.5px] underline-offset-[5px]">Cancel</button>
			<button
				type="button"
				aria-disabled={!picked || busy}
				onclick={() => picked && !busy && onpick(picked)}
				class="inline-flex min-h-10 items-center border-[1.5px] px-4 text-xs font-bold tracking-[0.07em] uppercase {picked && !busy ? 'pressable cursor-pointer border-ink bg-evo-violet text-paper' : 'cursor-not-allowed border-evo-grey bg-evo-grey text-evo-ink-3'}"
			>
				Set it aside
			</button>
		</div>
	</div>
</div>
