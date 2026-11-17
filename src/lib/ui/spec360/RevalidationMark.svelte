<script lang="ts">
	import { Icon, clickedWithin, floatInView } from '$ui/design-system';
	import { timeAgo } from '$ui/shell/notification-view';
	import { POP } from './page/look';
	import { useValidation } from './validation.svelte';

	/**
	 * An element of a draft changed after people validated it (criterion
	 * e6029af6): an orange mark, Changed since validated, until everyone it
	 * waits on validated it again; a click opens the version they validated
	 * beside the version now proposed, with who changed it and who is asked to
	 * validate again.
	 */
	let { anchor }: { anchor: string } = $props();
	const validation = useValidation();
	const record = $derived.by(() => {
		const r = validation.doc.revalidations?.[anchor];
		return r && r.proposed && validation.draft && validation.standing(anchor)?.state !== 'ok' ? { ...r, proposed: r.proposed } : null;
	});
	const tip = $derived(record ? `Changed since validated · ${record.by.name}, ${timeAgo(record.at)}: compare the versions` : '');
	const said = (t: { text: string; desc: string }) => [t.text.trim(), t.desc.trim()].filter(Boolean);
	let open = $state(false);
	let root = $state<HTMLSpanElement | null>(null);
	let panel = $state<HTMLSpanElement | null>(null);
	const BOX = 'flex min-w-0 flex-col gap-1 border-[1.5px] px-3 py-2 text-[0.8125rem] leading-snug [overflow-wrap:anywhere]';
	const LABEL = 'font-evo-mono text-[0.625rem] font-bold tracking-[0.06em] uppercase';
</script>

<svelte:window
	onkeydown={(e) => e.key === 'Escape' && (open = false)}
	onpointerdown={(e) => open && !clickedWithin(e.target, root, panel) && (open = false)}
/>

{#if record}
	<span class="relative inline-flex" bind:this={root} data-row-isolated>
		<button type="button" class="grid size-7 place-items-center text-orange-ink hover:bg-toner-1" aria-label={tip} title={tip} aria-expanded={open} data-revalidation onclick={() => (open = !open)}>
			<Icon name="history" size={14} />
		</button>
		{#if open}
			<span bind:this={panel} use:floatInView={{ anchor: root, align: 'right' }} class="animate-lk-in-fast z-30 flex w-[min(560px,calc(100vw-48px))] flex-col gap-2.5 {POP} p-3 text-left" role="dialog" aria-label="Validated version and proposed version">
				<span class="text-xs text-ink-3">
					<b class="text-ink">{record.by.name}</b> changed it {timeAgo(record.at)}{#if record.change === 'child_added'}: something was added under it{/if}.
					{#if record.asked.length}Asked to validate again: {record.asked.map((p) => p.name).join(', ')}.{/if}
				</span>
				<span class="grid grid-cols-2 gap-2 max-[560px]:grid-cols-1">
					<span class="{BOX} border-evo-line bg-surface-sunken text-ink-2">
						<span class="{LABEL} text-ink-3">Validated version</span>
						{#each said(record.validated) as line, i (i)}<span class={i === 0 ? 'font-semibold text-ink' : ''}>{line}</span>{:else}<span class="text-ink-3">Empty</span>{/each}
					</span>
					<span class="{BOX} border-green-ink bg-paper text-ink">
						<span class="{LABEL} text-green-ink">Proposed version</span>
						{#each said(record.proposed) as line, i (i)}<span class={i === 0 ? 'font-semibold' : ''}>{line}</span>{:else}<span class="text-ink-3">Empty</span>{/each}
					</span>
				</span>
			</span>
		{/if}
	</span>
{/if}
