<script lang="ts">
	import { noteAuthorLine, noteCta, type EditorialNote, type NoteItem } from './editorial-note';

	/**
	 * The editorial note at the top of a step (ac-evo-form-step-note), in the
	 * design's voice of the LLM: who wrote it, what was taken, what is suggested
	 * to double-check, what to do now. Read, it folds to one line for this reader
	 * in this browser, until what it sums up changes (ac-evo-form-step-note-read).
	 */
	interface Props {
		note: EditorialNote;
		/** The note as it reads now (noteReadKey): a note that reads otherwise opens again. */
		readKey: string;
		/** Opens the element a line names. */
		onGo: (target: string) => void;
	}
	let { note, readKey, onGo }: Props = $props();

	const STORE = 'lyriks.evolution.notes-read';
	// The newest folds are kept: the note of a request long closed is not worth the room.
	const KEPT = 300;
	let folded = $state<string[]>([]);
	$effect(() => {
		try {
			folded = JSON.parse(localStorage.getItem(STORE) ?? '[]') as string[];
		} catch {
			folded = [];
		}
	});
	const read = $derived(folded.includes(readKey));
	function keep(next: string[]) {
		folded = next.slice(-KEPT);
		try {
			localStorage.setItem(STORE, JSON.stringify(folded));
		} catch {
			// A browser that keeps nothing shows the note open again next time: nothing is lost.
		}
	}
	const fold = () => keep([...folded.filter((k) => k !== readKey), readKey]);
	const unfold = () => keep(folded.filter((k) => k !== readKey));

	const author = $derived(noteAuthorLine(note));
	// The LLM's voice, in the design's violet: its label (.ly-label), its tiles on paper, its lines in Plex Sans.
	const KICKER = 'font-evo-mono text-xs font-medium tracking-[0.08em] uppercase';
	const PANEL = 'flex min-w-0 flex-[1_1_220px] flex-col gap-3 rounded-evo-btn px-[18px] py-4';
	const LINE = 'font-evo text-base leading-[1.35] text-ink';
</script>

{#snippet sparkle(size: number)}
	<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
		<path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z"></path>
		<path d="M19 18l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"></path>
	</svg>
{/snippet}

{#snippet items(list: readonly NoteItem[], suggested: boolean)}
	{#each list as item (`${item.ref} ${item.text}`)}
		<button type="button" class="flex items-baseline gap-2.5 text-left" onclick={() => onGo(item.target)}>
			<span class="min-w-[26px] flex-none border-b-[1.5px] font-evo-mono text-xs font-bold {suggested ? 'border-violet text-violet-ink' : 'border-violet/40 text-ink-3'}">{item.ref}</span>
			<span class={LINE}>{item.text}</span>
		</button>
	{/each}
{/snippet}

{#if read}
	<div class="flex flex-wrap items-center gap-3 rounded-evo-card border border-transparent bg-violet-tint px-3.5 py-2.5 shadow-[inset_6px_0_0_var(--color-violet)]">
		<span aria-hidden="true" class="flex size-[26px] flex-none items-center justify-center bg-violet-ink text-paper">{@render sparkle(13)}</span>
		<span class="{KICKER} text-violet-ink">{author} · READ ✓</span>
		<span class="flex-[1_1_240px] font-evo text-[0.9375rem] text-ink-2 italic">{note.title}</span>
		<button type="button" class="font-evo text-sm font-semibold text-ink underline decoration-[1.5px] underline-offset-4 hover:decoration-[3px]" onclick={unfold}>Read again</button>
	</div>
{:else}
	<article aria-label="Note from Lyriks" class="flex animate-[lk-in_0.35s_ease_both] flex-col gap-[18px] rounded-evo-card border border-transparent bg-violet-tint px-6 py-[22px] shadow-[inset_6px_0_0_var(--color-violet)]">
		<div class="flex flex-wrap items-center gap-4">
			<span aria-hidden="true" class="flex size-10 flex-none items-center justify-center bg-violet-ink text-paper">{@render sparkle(18)}</span>
			<div class="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
				<span class="{KICKER} text-violet-ink">{author}</span>
				<span class="font-evo text-[1.375rem] leading-tight font-bold tracking-[-0.02em] text-ink">{note.title} <span class="font-normal tracking-normal text-ink-2 italic">{note.lede}</span></span>
			</div>
			<button type="button" class="pressable min-h-11 flex-none border-[1.5px] border-ink bg-evo-violet px-[18px] text-xs font-bold tracking-[0.07em] text-paper uppercase" onclick={fold}>{noteCta(note)}</button>
		</div>
		<div class="flex flex-wrap items-stretch gap-3">
			{#if note.taken.length > 0}
				<div class="{PANEL} bg-paper/70">
					<span class="{KICKER} text-ink-3">{note.takenLabel}</span>
					{@render items(note.taken, false)}
				</div>
			{/if}
			{#if note.suggested.length > 0}
				<div class="{PANEL} border-[1.5px] border-dashed border-violet bg-paper/70">
					<span class="{KICKER} text-violet-ink">{note.suggestedLabel}</span>
					{@render items(note.suggested, true)}
				</div>
			{/if}
			<div class="{PANEL} border-[1.5px] border-ink bg-paper">
				<span class="{KICKER} text-violet-ink">WHAT YOU NEED TO DO NOW</span>
				<!-- A step done stays in place, checked in the green of what holds (ac-evo-form-step-note). -->
				{#each note.todo as step, i (step.text)}
					<div class="flex items-center gap-2.5">
						{#if step.done}
							<span class="flex size-[22px] flex-none items-center justify-center bg-green text-ink" aria-hidden="true">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>
							</span>
							<span class="font-evo text-base leading-[1.35] font-semibold text-ink-3">{step.text}<span class="sr-only"> Done.</span></span>
						{:else}
							<span class="flex size-[22px] flex-none items-center justify-center bg-violet-ink font-evo-mono text-xs font-bold text-paper">{i + 1}</span>
							<span class="{LINE} font-semibold">{step.text}</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</article>
{/if}
