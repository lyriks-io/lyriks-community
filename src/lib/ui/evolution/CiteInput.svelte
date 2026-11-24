<script lang="ts">
	import { insertMention, openMention, type MentionCandidate } from '$lib/domain/evolution';
	import { floatInView } from '$ui/design-system';

	/**
	 * One line of the Functional spec where typing @ and a few letters offers the
	 * features, screens, rules and glossary terms of the product to cite
	 * (criterion dd17c1d3, action 0f81ac4e). The one picked becomes the token an
	 * AI client writes too, `@[name](kind:id)`, which the reading shows as a link.
	 */
	interface Props {
		projectId: string;
		value: string;
		label: string;
		placeholder?: string;
		class?: string;
	}
	let { projectId, value = $bindable(), label, placeholder, class: className = '' }: Props = $props();

	const KIND_WORD: Record<MentionCandidate['kind'], string> = { feature: 'Feature', screen: 'Screen', rule: 'Rule', term: 'Term' };
	const listId = $props.id();
	let box: HTMLInputElement | undefined = $state();
	let typed = $state<{ start: number; query: string } | null>(null);
	let candidates = $state<MentionCandidate[]>([]);
	let index = $state(0);
	let asked = 0;

	async function look(query: string) {
		const ticket = ++asked;
		const res = await fetch(`/api/evolution/mentions?projectId=${encodeURIComponent(projectId)}&q=${encodeURIComponent(query)}`).catch(() => null);
		if (!res?.ok || ticket !== asked) return;
		candidates = ((await res.json()) as { candidates: MentionCandidate[] }).candidates;
		index = 0;
	}

	function track() {
		if (!box) return;
		const next = openMention(box.value, box.selectionStart ?? box.value.length);
		if (next && (next.start !== typed?.start || next.query !== typed?.query)) void look(next.query);
		if (!next) {
			asked += 1;
			candidates = [];
		}
		typed = next;
	}

	function pick(candidate: MentionCandidate) {
		if (!box || !typed) return;
		const done = insertMention(box.value, typed.start, box.selectionStart ?? box.value.length, candidate.name, candidate.ref);
		value = done.text;
		typed = null;
		candidates = [];
		box.value = done.text;
		box.focus();
		box.setSelectionRange(done.caret, done.caret);
	}

	const listed = $derived(typed !== null && candidates.length > 0);

	function keys(e: KeyboardEvent) {
		if (!listed || e.isComposing) return;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') index = (index + (e.key === 'ArrowDown' ? 1 : -1) + candidates.length) % candidates.length;
		else if (e.key === 'Enter' || e.key === 'Tab') pick(candidates[Math.min(index, candidates.length - 1)]);
		else if (e.key === 'Escape') typed = null;
		else return;
		e.preventDefault();
	}
</script>

<div class="flex min-w-0 flex-[1_1_320px] flex-col">
	<input
		bind:this={box}
		bind:value
		class="{className} w-full"
		aria-label={label}
		{placeholder}
		role="combobox"
		aria-autocomplete="list"
		aria-expanded={listed}
		aria-controls={listed ? listId : undefined}
		aria-activedescendant={listed ? `${listId}-${index}` : undefined}
		oninput={track}
		onclick={track}
		onkeydown={keys}
		onkeyup={(e) => (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') && track()}
		onblur={() => (typed = null)}
	/>
	{#if listed}
		<!-- What the text can cite, floating under the line above the rest of the page: a click or Enter writes the citation, Escape closes the list. -->
		<ul id={listId} role="listbox" aria-label="Cite an element" use:floatInView={{ anchor: box, matchWidth: 'fill' }} class="animate-lk-in-fast m-0 flex max-h-60 list-none flex-col gap-px rounded-lg border-[1.5px] border-evo-control bg-paper p-1 shadow-pop">
			{#each candidates as candidate, at (candidate.ref)}
				<li
					id="{listId}-{at}"
					role="option"
					aria-selected={index === at}
					class="flex min-h-8 cursor-pointer items-baseline gap-2 rounded-md px-2 py-1 text-[0.8125rem] {index === at ? 'bg-blue-tint' : 'hover:bg-evo-sunken'}"
					onmousedown={(e) => {
						// The line keeps the caret: the pick writes where the name was typed.
						e.preventDefault();
						pick(candidate);
					}}
				>
					<span class="w-14 shrink-0 font-evo-mono text-xs text-evo-muted">{KIND_WORD[candidate.kind]}</span>
					<b class="truncate font-semibold text-evo-ink">{candidate.name}</b>
				</li>
			{/each}
		</ul>
	{/if}
</div>
