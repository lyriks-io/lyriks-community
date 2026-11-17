<script lang="ts">
	import type { RetroNote } from '$domain/retrospec';

	/**
	 * The note from Lyriks and the person's AI above the summary and the
	 * validation, in the voice of the LLM (the design's plum): what came from
	 * the code, what the AI guessed and should be double-checked, what to do
	 * now. Read, it folds to the one thing to do, for this reader in this
	 * browser, until what it says changes.
	 */
	interface Props {
		note: RetroNote;
		/** The note as it reads now: a note that reads otherwise opens again. */
		readKey: string;
		cta: string;
		onGo: (target: string) => void;
	}
	let { note, readKey, cta, onGo }: Props = $props();

	const STORE = 'lyriks.retrospec.notes-read';
	const KEPT = 200;
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

	const author = $derived(note.author === 'ai' ? 'NOTE FROM LYRIKS × YOUR AI' : 'NOTE FROM LYRIKS');
	const KICKER = 'font-evo-mono text-[0.6875rem] font-semibold tracking-[0.14em]';
	const PANEL = 'flex min-w-0 flex-[1_1_220px] flex-col gap-3 rounded-evo-btn px-[18px] py-4';
	const LINE = 'font-evo text-base leading-[1.35] text-evo-plum-ink';
</script>

{#snippet sparkle(size: number)}
	<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
		<path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z"></path>
		<path d="M19 18l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"></path>
	</svg>
{/snippet}

{#if read}
	<div class="flex flex-wrap items-center gap-3 rounded-evo-card border border-evo-plum-line bg-evo-plum-wash px-3.5 py-2.5">
		<span aria-hidden="true" class="flex size-[26px] flex-none items-center justify-center bg-evo-plum text-white">{@render sparkle(13)}</span>
		<span class="{KICKER} text-evo-plum">WHAT YOU NEED TO DO NOW</span>
		<span class="flex-[1_1_240px] font-evo text-base font-semibold text-evo-plum-ink">{note.todo[0] ?? ''}</span>
		<button type="button" class="font-evo text-[0.9375rem] text-evo-plum underline" onclick={() => keep(folded.filter((k) => k !== readKey))}>Read again</button>
	</div>
{:else}
	<article aria-label="Note from Lyriks" class="flex animate-[lk-in_0.35s_ease_both] flex-col gap-[18px] rounded-evo-card border border-evo-plum-line bg-evo-plum-wash px-6 py-[22px]">
		<div class="flex flex-wrap items-center gap-4">
			<span aria-hidden="true" class="flex size-10 flex-none items-center justify-center bg-evo-plum text-white">{@render sparkle(18)}</span>
			<div class="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
				<span class="{KICKER} text-evo-plum">{author}</span>
				<span class="font-evo text-[1.375rem] leading-tight font-semibold text-evo-plum-ink">{note.title}</span>
			</div>
			<button type="button" class="min-h-11 flex-none bg-evo-plum px-[18px] text-[0.9375rem] font-semibold text-white" onclick={() => keep([...folded.filter((k) => k !== readKey), readKey])}>{cta}</button>
		</div>
		<div class="flex flex-wrap items-stretch gap-3">
			{#if note.taken.length > 0}
				<div class="{PANEL} bg-white/60">
					<span class="{KICKER} text-evo-plum-muted">{note.takenLabel}</span>
					{#each note.taken as line (line.text)}
						<button type="button" class="text-left" onclick={() => onGo(line.target)}><span class={LINE}>{line.text}</span></button>
					{/each}
				</div>
			{/if}
			{#if note.suggested.length > 0}
				<div class="{PANEL} border border-dashed border-evo-plum-dash bg-white/60">
					<span class="{KICKER} text-evo-plum">{note.suggestedLabel}</span>
					{#each note.suggested as line (line.text)}
						<button type="button" class="text-left" onclick={() => onGo(line.target)}><span class={LINE}>{line.text}</span></button>
					{/each}
				</div>
			{/if}
			<div class="{PANEL} border-[1.5px] border-evo-plum bg-white">
				<span class="{KICKER} text-evo-plum">WHAT YOU NEED TO DO NOW</span>
				{#each note.todo as step (step)}<span class="{LINE} font-semibold">{step}</span>{/each}
			</div>
		</div>
	</article>
{/if}
