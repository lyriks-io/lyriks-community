<script lang="ts">
	import { fieldBase, fieldBorder, fieldBorderEmpty } from '$ui/design-system/field';
	import { floatInView } from '$ui/design-system/float-in-view';
	import { insertMention, openMention, type MentionCandidate } from '$lib/domain/evolution';

	/**
	 * A text area where typing @ offers the elements of the product to cite
	 * (ac-evo-func-mention): features, screens, rules and glossary terms. The one
	 * picked becomes the token an AI client writes too, `@[name](kind:id)`.
	 */
	interface Props {
		projectId: string;
		value: string;
		placeholder?: string;
		rows?: number;
		oninput: (value: string) => void;
		/** Whether the caret goes in at once; a list of points gives it to one point at a time. */
		autofocus?: boolean;
		/** Whether typing @ offers the elements of the product to cite. */
		cite?: boolean;
		/** One point of a list: a single line that grows, no taller than its text. */
		compact?: boolean;
		label?: string;
		/** Keys the citation picker does not take (Enter, Backspace…), for the list a point belongs to. */
		onkeydown?: (e: KeyboardEvent) => void;
	}
	let { projectId, value, placeholder, rows = 3, oninput, autofocus = true, cite = true, compact = false, label, onkeydown }: Props = $props();

	let area: HTMLTextAreaElement | undefined = $state();
	// Opened to write: the caret goes in at once, after what is already there.
	$effect(() => {
		if (!area || !autofocus) return;
		area.focus();
		area.setSelectionRange(area.value.length, area.value.length);
	});
	let open = $state<{ start: number; query: string } | null>(null);
	let candidates = $state<MentionCandidate[]>([]);
	let active = $state(0);
	let asked = 0;

	const KIND_WORD: Record<string, string> = { feature: 'Feature', screen: 'Screen', rule: 'Rule', term: 'Term' };

	async function look(query: string) {
		const ticket = ++asked;
		const res = await fetch(`/api/evolution/mentions?projectId=${encodeURIComponent(projectId)}&q=${encodeURIComponent(query)}`);
		if (!res.ok || ticket !== asked) return;
		candidates = ((await res.json()) as { candidates: MentionCandidate[] }).candidates;
		active = 0;
	}

	function track() {
		if (!area || !cite) return;
		open = openMention(area.value, area.selectionStart ?? area.value.length);
		if (open) void look(open.query);
		else candidates = [];
	}

	async function pick(candidate: MentionCandidate) {
		if (!area || !open) return;
		const done = insertMention(area.value, open.start, area.selectionStart ?? area.value.length, candidate.name, candidate.ref);
		oninput(done.text);
		open = null;
		candidates = [];
		area.value = done.text;
		area.focus();
		area.setSelectionRange(done.caret, done.caret);
	}

	function keys(e: KeyboardEvent) {
		if (!open || candidates.length === 0) {
			onkeydown?.(e);
			return;
		}
		if (e.key === 'ArrowDown') active = (active + 1) % candidates.length;
		else if (e.key === 'ArrowUp') active = (active - 1 + candidates.length) % candidates.length;
		else if (e.key === 'Enter' || e.key === 'Tab') void pick(candidates[active]);
		else if (e.key === 'Escape') open = null;
		else return;
		e.preventDefault();
	}
</script>

<div class="relative">
	<textarea
		bind:this={area}
		rows={compact ? 1 : rows}
		{value}
		{placeholder}
		aria-label={label}
		oninput={(e) => {
			oninput(e.currentTarget.value);
			track();
		}}
		onkeydown={keys}
		onclick={track}
		onblur={() => setTimeout(() => (open = null), 150)}
		class="{fieldBase} field-sizing-content resize-none leading-relaxed {compact ? 'min-h-9 px-3 py-1.5' : 'min-h-12 px-3.5 py-2.5'} {value ? fieldBorder : fieldBorderEmpty}"
	></textarea>
	{#if open && candidates.length > 0}
		<ul use:floatInView={{ anchor: area, matchWidth: 'fill' }} class="max-h-60 max-w-md overflow-auto rounded-field border-[1.5px] border-ink bg-paper py-1 shadow-pop" role="listbox" aria-label="Cite an element">
			{#each candidates as candidate, i (candidate.ref)}
				<li role="option" aria-selected={i === active}>
					<button
						type="button"
						class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm {i === active ? 'bg-ink text-paper' : 'text-ink hover:bg-toner-1'}"
						onmousedown={(e) => {
							e.preventDefault();
							void pick(candidate);
						}}
					>
						<span class="w-14 shrink-0 font-evo-mono text-[0.625rem] font-bold uppercase tracking-[0.06em] opacity-70">{KIND_WORD[candidate.kind]}</span>
						<span class="truncate">{candidate.name}</span>
					</button>
				</li>
			{/each}
		</ul>
	{:else if open}
		<p class="mt-1 text-[0.6875rem] text-ink-400">Type a name to cite a feature, a screen, a rule or a glossary term.</p>
	{/if}
</div>
