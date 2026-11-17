<script lang="ts">
	import { Button, Icon, IconButton, TextInput } from '$ui/design-system';
	import type { DiagramLink, DiagramLinkKind, LinkCandidate } from '$domain/evolution';
	import type { DiagramLinkStatus } from './link-status.svelte';

	/**
	 * The optional link of an element of a diagram to what the product already
	 * has (ac-evo-func-uml-link, ac-evo-tech-uml-link): a feature for a use case
	 * or a component, an action for a step, a table for a store. Searched by
	 * name among the product's own, opened from here, taken back from here.
	 */
	interface Props {
		kind: DiagramLinkKind;
		link: DiagramLink | undefined;
		links: DiagramLinkStatus;
		onchange: (link: DiagramLink | null) => void;
	}
	let { kind, link, links, onchange }: Props = $props();

	const WORDS: Record<DiagramLinkKind, { label: string; offer: string; search: string }> = {
		feature: { label: 'Already in the product', offer: 'Link it to an existing feature', search: 'Search a feature of the product' },
		action: { label: 'Uses an existing process', offer: 'Link it to an existing action', search: 'Search an action, or the feature that holds it' },
		entity: { label: 'Already in the Data model', offer: 'Link it to an existing table', search: 'Search a table of the Data model' }
	};
	const words = $derived(WORDS[kind]);
	const href = $derived(links.hrefOf(link?.ref));

	let searching = $state(false);
	let q = $state('');
	let found = $state<LinkCandidate[]>([]);
	let asked = 0;

	async function look(text: string) {
		q = text;
		const mine = ++asked;
		const candidates = await links.search(kind, text);
		if (mine === asked) found = candidates;
	}
	function open() {
		searching = true;
		void look('');
	}
	function pick(candidate: LinkCandidate) {
		links.remember(candidate);
		onchange({ name: candidate.name, ref: candidate.ref });
		searching = false;
		q = '';
	}
</script>

<div class="space-y-1">
	<span class="font-mono text-[0.6875rem] font-medium tracking-[0.08em] text-ink-500 uppercase">{words.label}</span>
	{#if link}
		<div class="flex items-center gap-2 rounded-field border border-line bg-toner-1 px-2.5 py-1.5 text-xs">
			<Icon name={href === null ? 'alert-triangle' : 'link'} size={12} class={href === null ? 'text-orange-ink' : 'text-ink-400'} />
			{#if href}
				<a {href} class="min-w-0 flex-1 truncate font-semibold text-ink underline decoration-[1.5px] underline-offset-2 hover:decoration-[3px]">{link.name}</a>
			{:else}
				<span class="min-w-0 flex-1 truncate font-medium {href === null ? 'text-orange-ink' : 'text-ink-800'}">{link.name}{href === null ? ': no longer in the product' : ''}</span>
			{/if}
			<IconButton name="x" label="Take the link off" size={12} onclick={() => onchange(null)} />
		</div>
	{:else if searching}
		<TextInput value={q} placeholder={words.search} oninput={look} />
		<ul class="max-h-48 overflow-auto rounded-field border-[1.5px] border-ink bg-paper py-1 shadow-pop" aria-label={words.search}>
			{#each found as candidate (candidate.ref)}
				<li>
					<button type="button" class="flex w-full flex-col px-2.5 py-1 text-left text-xs hover:bg-toner-1" onclick={() => pick(candidate)}>
						<span class="font-medium text-ink-800">{candidate.name}</span>
						{#if candidate.owner}<span class="font-mono text-[0.6875rem] text-ink-500">in {candidate.owner}</span>{/if}
					</button>
				</li>
			{:else}
				<li class="px-2.5 py-1 text-xs text-ink-500 italic">Nothing of that name in the product.</li>
			{/each}
		</ul>
		<Button size="sm" variant="ghost" onclick={() => (searching = false)}>Cancel</Button>
	{:else}
		<Button size="sm" variant="ghost" onclick={open}><Icon name="link" size={12} />{words.offer}</Button>
	{/if}
</div>
