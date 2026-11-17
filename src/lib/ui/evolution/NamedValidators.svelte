<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Icon } from '$ui/design-system';
	import { personKey, suggestedFor, type NamedStep } from '$domain/evolution';

	/**
	 * Who is expected to validate one answer or one step
	 * (ac-evo-req-named-validators, ac-evo-form-name-validators): the people
	 * named, each with their job and a tick once they validated, "Waiting on
	 * you" for the reader still awaited (ac-evo-req-waiting-on-you), and "Name
	 * who validates" for whoever may validate, the members the step calls for
	 * offered first (ac-evo-req-validator-suggestions).
	 */
	interface Member {
		readonly id: string;
		readonly name: string;
		readonly role?: string;
		readonly jobs?: readonly string[];
		readonly jobIds?: readonly string[];
	}
	interface Props {
		step: NamedStep;
		/** The people named; empty when anyone with access validates. */
		expected: readonly string[];
		/** The people named who left the workspace since: no longer waited on. */
		gone?: readonly string[];
		/** Who validated the current version. */
		given: readonly string[];
		/** The roster; empty where one member is alone. */
		members: readonly Member[];
		actorId: string;
		/** Whether the reader may name: anyone who validates, while it can still be validated. */
		canName: boolean;
		busy?: boolean;
		onname: (people: string[]) => Promise<boolean>;
		/** Only the picker, opened from elsewhere through `picking`: the card's header already shows who is expected. */
		bare?: boolean;
		/** Whether the picker is open. */
		picking?: boolean;
	}
	let { step, expected, gone = [], given, members, actorId, canName, busy = false, onname, bare = false, picking = $bindable(false) }: Props = $props();

	const memberOf = (id: string) => members.find((m) => personKey(m.id) === personKey(id));
	const nameOf = (id: string) => memberOf(id)?.name ?? id;
	const jobOf = (id: string) => memberOf(id)?.jobs?.join(', ') ?? '';
	const validated = (id: string) => given.some((g) => personKey(g) === personKey(id));
	const isSuggested = (m: Member) => suggestedFor(step, m.jobIds ?? []);
	// A viewer reads and comments, and is never named (ac-evo-req-named-validators).
	const eligible = $derived(
		members
			.filter((m) => m.role !== 'viewer')
			.slice()
			.sort((a, b) => Number(isSuggested(b)) - Number(isSuggested(a)) || a.name.localeCompare(b.name))
	);
	const awaitingMe = $derived(expected.some((p) => personKey(p) === personKey(actorId)) && !validated(actorId));
	// Alone, there is nobody to name: only names left from a larger team can be cleared.
	const offered = $derived(canName && (eligible.length > 0 || expected.length > 0 || gone.length > 0));

	let picked = $state<string[]>([]);
	// Opened from outside, the picker starts on the people named, as from its own button.
	$effect(() => {
		if (picking) picked = untrack(() => expected.map(personKey));
	});

	function open() {
		picked = expected.map(personKey);
		picking = true;
	}
	function toggle(id: string) {
		const key = personKey(id);
		picked = picked.includes(key) ? picked.filter((p) => p !== key) : [...picked, key];
	}
	async function save(people: string[]) {
		if (await onname(people)) picking = false;
	}
</script>

{#if !bare && (expected.length > 0 || gone.length > 0 || offered)}
	<span class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
		{#if expected.length > 0}
			<span class="font-evo-mono tracking-[0.06em] text-ink-3 uppercase">Expected:</span>
			{#each expected as id (id)}
				<span class="flex items-center gap-0.5" title={validated(id) ? `${nameOf(id)} validated it` : `Waiting on ${nameOf(id)}`}>
					{#if validated(id)}<Icon name="check" size={11} class="text-success-700" />{/if}
					<span class="text-ink-700">{nameOf(id)}</span>
					{#if jobOf(id)}<span class="text-ink-400">({jobOf(id)})</span>{/if}
				</span>
			{/each}
			{#if awaitingMe}
				<span class="border-[1.5px] border-orange px-1.5 py-0.5 font-evo-mono font-bold tracking-[0.06em] text-orange-ink uppercase">Waiting on you</span>
			{/if}
		{/if}
		{#each gone as id (id)}
			<span class="text-ink-400" title="No longer in the workspace: not waited on">{nameOf(id)} left the workspace</span>
		{/each}
		{#if offered && !picking}
			<button type="button" class="rounded-field px-1.5 py-0.5 font-semibold text-blue-ink hover:bg-toner-1" disabled={busy} onclick={open}>
				{expected.length > 0 ? 'Change who validates' : 'Name who validates'}
			</button>
		{/if}
	</span>
{/if}
{#if picking}
	<div class="basis-full space-y-2 rounded-field border-[1.5px] border-ink bg-paper p-2 text-xs" role="group" aria-label="Name who validates">
		{#if eligible.length > 0}
			<ul class="space-y-1">
				{#each eligible as m (m.id)}
					<li>
						<label class="flex cursor-pointer items-center gap-2">
							<input type="checkbox" checked={picked.includes(personKey(m.id))} onchange={() => toggle(m.id)} />
							<span class="text-ink-800">{m.name}</span>
							{#if m.jobs && m.jobs.length > 0}<span class="text-ink-400">{m.jobs.join(', ')}</span>{/if}
							{#if isSuggested(m)}<span class="bg-toner-2 px-1.5 py-0.5 font-evo-mono font-bold tracking-[0.06em] text-ink-2 uppercase">Suggested</span>{/if}
						</label>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-ink-500">You are alone in the workspace: there is nobody to name.</p>
		{/if}
		<div class="flex flex-wrap items-center gap-2">
			{#if eligible.length > 0}
				<Button size="sm" disabled={busy || picked.length === 0} onclick={() => save(picked)}>Save</Button>
			{/if}
			{#if expected.length > 0 || gone.length > 0}
				<Button size="sm" variant="ghost" disabled={busy} onclick={() => save([])}>Clear the names</Button>
			{/if}
			<Button size="sm" variant="ghost" disabled={busy} onclick={() => (picking = false)}>Cancel</Button>
		</div>
	</div>
{/if}
