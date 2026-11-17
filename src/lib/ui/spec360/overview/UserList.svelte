<script lang="ts">
	import CountMeter from '../page/CountMeter.svelte';
	import { TAG } from '../page/look';
	import { anchorOf } from '$domain/discussions';
	import OwnValidation from './OwnValidation.svelte';
	import { activateRow } from '$ui/shell/activate-row';
	import { useEditMode } from '../edit-mode.svelte';
	import BlockFoot from '../BlockFoot.svelte';
	import { useSources } from '../sources.svelte';

	/**
	 * Who uses the product, read only (criterion 90232fe6): the profiles in one
	 * tinted window, end users first, one line each: its name, its tag (END
	 * USER, or ADMIN in violet) and how many actions it can perform, named, with
	 * no bar (CountMeter, criterion 41a9c9d6). The whole line opens its page;
	 * its description shows on hover. Profiles stay read-only here; Who uses it
	 * offers fresh approval and discussion as a whole. A reviewed line keeps
	 * the reader's own check for withdrawal, beside its link (criterion f2eabcd9).
	 */
	interface Props {
		users: readonly { readonly id: string; readonly name: string; readonly description: string; readonly userClass: 'end' | 'admin' }[];
		/** How many actions each user can perform, by user id. */
		reach: Readonly<Record<string, number>>;
		hrefOf: (id: string) => string;
	}
	let { users, reach, hrefOf }: Props = $props();
	const mode = useEditMode();
	// A profile's sources open at its foot, under its line, as a core feature's do (criterion b0ea9889).
	const sources = useSources();
	const footOpen = (anchor: string) => sources?.openAnchor === anchor;
	const SMALL_TAG = `${TAG} min-h-[22px] px-[7px] text-[0.6875rem]`;
</script>

<!-- As much room above the first line as below the last: each line reads centred (criterion 90232fe6). -->
<ul class="m-0 list-none border border-line bg-toner px-4 py-1" aria-label="Users">
	{#each users as u (u.id)}
		<li use:activateRow={mode.active} class="flex min-w-0 cursor-pointer flex-wrap items-center gap-x-2 border-b border-line last:border-b-0">
			<a
				data-row-open
				href={hrefOf(u.id)}
				title={u.description || undefined}
				class="-mx-1 flex min-h-11 min-w-0 flex-[1_1_220px] items-center gap-3 px-1 py-1.5 text-ink no-underline transition-colors duration-150 hover:bg-toner-1 hover:text-ink"
			>
				<strong class="min-w-0 flex-1 self-center text-[0.84375rem] leading-snug font-semibold tracking-[-0.01em]">{u.name}</strong>
				{#if u.userClass === 'admin'}
					<span class="{SMALL_TAG} border-violet text-violet-ink">Admin</span>
				{:else}
					<span class="{SMALL_TAG} border-ink text-ink">End user</span>
				{/if}
				<CountMeter value={reach[u.id] ?? 0} unit="action" class="w-[92px] flex-none" />
			</a>
			<OwnValidation anchor={anchorOf('role', u.id)} title={u.name} />
			{#if footOpen(anchorOf('role', u.id))}
				<div data-row-isolated class="flex w-full basis-full animate-lk-in-fast flex-col gap-2 pb-2"><BlockFoot anchor={anchorOf('role', u.id)} title={u.name} /></div>
			{/if}
		</li>
	{/each}
</ul>
