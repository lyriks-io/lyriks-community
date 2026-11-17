<script lang="ts">
	/**
	 * How to update Lyriks: the steps the appliance kit really takes
	 * (docs/deployment/lyriks-appliance/README.md, Update), opened from How to
	 * update in Settings, Versions and in the band (criteria ea3354b2, e7bfe524).
	 * Nothing here can run them: the platform container has no Docker socket.
	 */
	interface Props {
		/** The newer release, when the check found one. */
		latest?: string;
		/** The release this installation runs, when known. */
		current?: string;
		onClose: () => void;
	}
	let { latest, current, onClose }: Props = $props();

	const UPDATE_COMMAND = 'cd ~/lyriks && ./lyriks update';
	let copied = $state(false);

	// Opened from the band and from a Settings panel, both inside stacking
	// contexts: the dialog is moved to <body> so it always sits above the page.
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	async function copyCommand() {
		try {
			await navigator.clipboard.writeText(UPDATE_COMMAND);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* clipboard blocked (no HTTPS, or denied): the command is on screen anyway */
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div
	use:portal
	class="fixed inset-0 z-[90] box-border flex items-start justify-center overflow-y-auto bg-ink/45 px-4 py-16"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onClose()}
>
	<div
		role="dialog"
		aria-modal="true"
		aria-labelledby="update-guide-title"
		class="box-border flex w-full max-w-[600px] animate-lk-in flex-col gap-4 border-2 border-ink bg-paper p-6 shadow-pop"
	>
		<div class="flex items-start justify-between gap-3">
			<div class="flex flex-col gap-1">
				{#if latest}
					<span class="font-evo-mono text-xs tracking-[0.08em] text-blue-ink">
						VERSION {latest} IS AVAILABLE{current ? `, YOU ARE ON ${current}` : ''}
					</span>
				{/if}
				<h2 id="update-guide-title" class="m-0 text-[1.375rem] font-bold tracking-[-0.02em] text-ink">
					How to update Lyriks
				</h2>
			</div>
			<button
				type="button"
				onclick={onClose}
				aria-label="Close"
				class="size-9 flex-none cursor-pointer border-[1.5px] border-line bg-transparent text-lg text-ink">×</button
			>
		</div>

		<ol class="m-0 flex list-none flex-col p-0">
			<li class="flex gap-3.5 border-t border-line py-3.5">
				<span aria-hidden="true" class="flex size-7 flex-none items-center justify-center border-[1.5px] border-ink font-evo-mono text-xs font-bold text-ink">1</span>
				<span class="text-sm leading-normal text-ink-2">On the machine that runs Lyriks, open a terminal as the account that installed it.</span>
			</li>
			<li class="flex gap-3.5 border-t border-line py-3.5">
				<span aria-hidden="true" class="flex size-7 flex-none items-center justify-center border-[1.5px] border-ink font-evo-mono text-xs font-bold text-ink">2</span>
				<span class="flex min-w-0 flex-1 flex-col gap-2 text-sm leading-normal text-ink-2">
					<span>Run this in the folder Lyriks was installed in (<code class="font-mono">~/lyriks</code> by default):</span>
					<span class="flex items-center gap-2">
						<code class="flex-1 overflow-x-auto bg-ink px-3 py-2 font-mono text-xs text-paper">{UPDATE_COMMAND}</code>
						<button
							type="button"
							onclick={copyCommand}
							class="pressable shrink-0 border-[1.5px] border-ink px-3 py-2 text-xs font-bold tracking-[0.07em] text-ink uppercase"
						>
							{copied ? 'Copied' : 'Copy'}
						</button>
					</span>
					<span class="text-xs text-ink-3">
						It updates the kit, takes a verified backup, pulls the new images and restarts. Lyriks is unavailable for a
						few minutes; projects and settings are kept.
					</span>
				</span>
			</li>
			<li class="flex gap-3.5 border-t border-line py-3.5">
				<span aria-hidden="true" class="flex size-7 flex-none items-center justify-center border-[1.5px] border-ink font-evo-mono text-xs font-bold text-ink">3</span>
				<span class="text-sm leading-normal text-ink-2">
					Reload the page once it ends: Versions {latest ? `reads ${latest}` : 'shows the new release'}.
				</span>
			</li>
		</ol>

		<p class="m-0 border-t border-line pt-3.5 text-xs leading-normal text-ink-3">
			If the new version misbehaves, <code class="font-mono">./lyriks rollback</code> restarts the previous one (the data
			rewinds only with <code class="font-mono">./lyriks restore latest --confirm</code>). A machine without Internet
			access updates from the release bundle: extract it over the kit folder, then run
			<code class="font-mono">./lyriks update --offline &lt;images.tar&gt;</code>.
		</p>

		<button
			type="button"
			onclick={onClose}
			class="pressable self-end border-[1.5px] border-ink bg-ink px-3 py-2 text-xs font-bold tracking-[0.07em] text-paper uppercase"
		>
			Close
		</button>
	</div>
</div>
