<script lang="ts">
	import { tick } from 'svelte';
	import { clickedWithin, floatInView, Icon } from '$ui/design-system';
	import { requiredValidators, samePersonRef, type PersonRef } from '$domain/retrospec';
	import { useValidation } from './validation.svelte';
	import { FIELD, POP } from './page/look';

	let { anchor, title, small = true }: { anchor: string; title: string; small?: boolean } = $props();
	const validation = useValidation();
	let open = $state(false);
	let query = $state('');
	let busy = $state(false);
	let root = $state<HTMLSpanElement | null>(null);
	let panel = $state<HTMLSpanElement | null>(null);
	let search = $state<HTMLInputElement | null>(null);
	const requests = $derived(validation.doc.validationRequests?.[anchor] ?? []);
	const shown = $derived(validation.draft && validation.source.canWrite && !!validation.standing(anchor) && (validation.source.team.length > 0 || requests.length > 0));
	const defaults = $derived.by(() => {
		const element = validation.element(anchor);
		return element ? requiredValidators(element.owner, validation.board.lead, validation.source.team, [], element.id) : [];
	});
	const requested = (person: PersonRef) => requests.some((request) => samePersonRef(request.to, person));
	const isDefault = (person: PersonRef) => defaults.some((candidate) => samePersonRef(candidate, person));
	const people = $derived.by(() => {
		const roster = validation.source.team.map((member) => ({ person: member.person, jobs: member.jobNames ?? member.jobIds, reachable: true }));
		for (const request of requests) if (!roster.some((member) => samePersonRef(member.person, request.to))) {
			roster.push({ person: request.to, jobs: [], reachable: false });
		}
		const text = query.trim().toLowerCase();
		return roster.filter((member) => `${member.person.name} ${member.person.id} ${member.jobs.join(' ')}`.toLowerCase().includes(text));
	});

	async function toggle() {
		open = !open;
		if (open) { await tick(); search?.focus(); }
	}
	async function choose(person: PersonRef) {
		if (busy || isDefault(person)) return;
		busy = true;
		try {
			if (requested(person)) await validation.removeValidationRequest(anchor, person);
			else await validation.requestValidation(anchor, person);
		} finally { busy = false; }
	}
</script>

<svelte:window
	onpointerdown={(event) => open && !clickedWithin(event.target, root, panel) && (open = false)}
	onkeydown={(event) => event.key === 'Escape' && (open = false)}
/>

{#if shown}
	<span class="relative inline-flex" bind:this={root}>
		<button type="button" class="grid {small ? 'size-7' : 'size-9'} place-items-center text-ink-2 hover:bg-toner-1 disabled:opacity-40" aria-label="Request validation: {title}" title="Request validation from a colleague" aria-expanded={open} aria-haspopup="dialog" disabled={validation.source.teamAvailable === false} onclick={toggle}>
			<Icon name="users" size={small ? 14 : 16} />
		</button>
		{#if open}
			<span bind:this={panel} use:floatInView={{ anchor: root, align: 'right' }} role="dialog" aria-label="Who should validate {title}?" class="flex w-80 max-w-[calc(100vw-32px)] flex-col gap-2 {POP} p-3 text-left">
				<span class="text-sm font-semibold text-ink">Request validation</span>
				<span class="text-xs text-ink-3">The lead and topic owners stay required. Add a colleague for this question.</span>
				<input bind:this={search} bind:value={query} class="{FIELD} px-2.5 py-2 text-sm" placeholder="Find a person or role…" aria-label="Find a person or role" />
				<span class="flex max-h-72 flex-col overflow-y-auto">
					{#each people as member (member.person.id)}
						{@const defaultReviewer = isDefault(member.person)}
						{@const selected = defaultReviewer || requested(member.person)}
						<button type="button" class="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-toner-1 disabled:cursor-default" disabled={busy || validation.saving(anchor) || defaultReviewer} aria-pressed={selected} onclick={() => void choose(member.person)}>
							<span class="flex min-w-0 flex-col"><span class="text-sm text-ink">{member.person.name}</span><span class="text-xs text-ink-3">{!member.reachable ? 'No longer has project access' : member.jobs.join(' · ') || 'Project member'}</span></span>
							<span class="flex-none text-xs text-ink-3">{defaultReviewer ? 'Required by role' : busy ? 'Saving…' : selected ? 'Requested · remove' : 'Request'}</span>
						</button>
					{:else}
						<span class="p-2 text-sm text-ink-3">No matching project member.</span>
					{/each}
				</span>
			</span>
		{/if}
	</span>
{/if}
