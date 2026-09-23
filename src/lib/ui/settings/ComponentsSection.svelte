<script lang="ts">
	import { Icon } from '$ui/design-system';
	import {
		componentsReport,
		firstParty,
		host,
		runtime,
		type ComponentStatus,
		type ComponentVersion
	} from '$domain/system';

	// Read-only inventory of the running install. Everything shown is reported by
	// the component itself; this panel only labels and arranges it.

	interface Props {
		components: ComponentVersion[];
	}
	let { components }: Props = $props();

	const lyriks = $derived(firstParty(components));
	const stack = $derived(runtime(components));
	const machine = $derived(host(components));

	// The machine arrives folded: nobody opens Versions to read their hardware,
	// they open it to read which Lyriks they run. Folding spares the reader and
	// never the copy, which carries the whole panel either way.
	let machineOpen = $state(false);

	const CHIP: Record<ComponentStatus, string> = {
		running: 'bg-success-50 text-success-700',
		reachable: 'bg-success-50 text-success-700',
		unknown: 'bg-surface-sunken text-ink-500',
		'not-configured': 'bg-surface-sunken text-ink-400',
		unreachable: 'bg-warning-50 text-warning-600',
		recorded: 'bg-surface-sunken text-ink-500'
	};
	const CHIP_LABEL: Record<ComponentStatus, string> = {
		running: 'Running',
		reachable: 'Reachable',
		unknown: 'Unknown',
		'not-configured': 'Not configured',
		unreachable: 'Unreachable',
		recorded: 'Recorded at install'
	};

	let copied = $state(false);
	async function copyPanel() {
		try {
			await navigator.clipboard.writeText(componentsReport(components));
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<p class="max-w-prose text-xs text-ink-500">
			Every component reports its own version to this screen. A component that does not report one
			is shown as unknown rather than guessed, and an optional component this install does not use
			reads <em>not configured</em>.
		</p>
		<button
			type="button"
			onclick={copyPanel}
			class="inline-flex shrink-0 items-center gap-1.5 rounded-field border border-line px-2.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-surface-sunken"
		>
			<Icon name={copied ? 'check' : 'copy'} class="h-3.5 w-3.5" />
			{copied ? 'Copied' : 'Copy for a support ticket'}
		</button>
	</div>

	{#snippet row(c: ComponentVersion)}
		<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-field border border-line bg-surface-sunken px-3 py-2.5">
			<span class="text-[13px] font-semibold text-ink-800">{c.name}</span>
			<span class="font-mono text-[13px] text-ink-900">{c.version ?? '—'}</span>
			<span class="rounded-field px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] {CHIP[c.status]}">
				{CHIP_LABEL[c.status]}
			</span>
			<span class="w-full text-xs text-ink-400">{c.detail}</span>
			{#if c.build}
				<dl class="flex w-full flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-ink-400">
					{#each Object.entries(c.build) as [label, value] (label)}
						<div class="flex gap-1.5">
							<dt>{label}</dt>
							<dd class="font-mono text-ink-500">{value}</dd>
						</div>
					{/each}
				</dl>
			{/if}
		</div>
	{/snippet}

	<div class="space-y-2">
		<p class="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">Lyriks components</p>
		{#each lyriks as c (c.id)}{@render row(c)}{/each}
	</div>

	{#if stack.length > 0}
		<div class="space-y-2">
			<p class="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">Runtime</p>
			{#each stack as c (c.id)}{@render row(c)}{/each}
		</div>
	{/if}

	{#if machine.length > 0}
		<div class="rounded-field border border-line">
			<button
				type="button"
				onclick={() => (machineOpen = !machineOpen)}
				aria-expanded={machineOpen}
				aria-controls="versions-host"
				class="flex w-full items-start gap-2 rounded-field px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
			>
				<span class="min-w-0">
					<span class="block text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">
						Host
					</span>
					<span class="block text-xs text-ink-500">
						What Lyriks could gather about the hardware it runs on.
					</span>
				</span>
				<Icon
					name="chevron-down"
					size={16}
					class="ml-auto mt-0.5 shrink-0 text-ink-400 transition-transform {machineOpen
						? 'rotate-180'
						: ''}"
				/>
			</button>
			{#if machineOpen}
				<div id="versions-host" class="space-y-2 px-3 pb-3">
					{#each machine as c (c.id)}{@render row(c)}{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
