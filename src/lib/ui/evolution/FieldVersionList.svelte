<script lang="ts">
	import { untrack } from 'svelte';
	import { proseStatements, statementCount } from '$domain/evolution';
	import { Icon } from '$ui/design-system';
	import { TONE } from './verdict-tones';

	/**
	 * The versions a field went through, newest first, one line each: its
	 * number counted from the first, its date and who wrote it. A click opens
	 * one version's content, where it came from and who validated it, and an
	 * earlier version opens under a banner saying it is not the answer as it
	 * stands (ac-evo-hist-field-versions).
	 */
	interface FieldVersionView {
		readonly id: string;
		readonly value: string;
		readonly by: string;
		readonly source: string;
		readonly at: string;
		readonly validatedBy: readonly string[];
	}
	interface Props {
		versions: readonly FieldVersionView[];
		nameOf: (id: string) => string;
		/** The version opened at first; none by default. */
		opened?: string | null;
		/**
		 * Set on a field drawn rather than read (a diagram): a version is shown as its
		 * drawing in place of the current one, by the card, instead of unfolding here.
		 */
		drawn?: { readonly shown: string | null; readonly onshow: (id: string | null) => void } | null;
		/** Writes an earlier version again as a new one; offered where the answer may still be written. */
		onrestore?: ((value: string) => void) | null;
	}
	let { versions, nameOf, opened = null, drawn = null, onrestore = null }: Props = $props();

	let openVersion = $state<string | null>(untrack(() => opened));
	const versionDate = (at: string) => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	const SOURCE_LABEL: Record<string, string> = {
		typed: 'typed',
		proposal: 'accepted proposal',
		ai_client: 'written by the assistant',
		earlier: 'found in the field',
		diagram: 'written from the diagram',
		assistant: 'drawn by the built-in assistant'
	};
</script>

<ol class="mt-2 space-y-0.5 border-l-2 border-line pl-2 text-xs">
	{#each versions as version, index (version.id)}
		{@const number = versions.length - index}
		{@const open = drawn ? (drawn.shown ?? versions[0]?.id) === version.id : openVersion === version.id}
		<li>
			<button
				type="button"
				class="flex w-full items-center gap-2 rounded-field px-1.5 py-1 text-left hover:bg-toner-1 {open ? 'bg-toner-1' : ''}"
				aria-expanded={drawn ? undefined : open}
				aria-pressed={drawn ? open : undefined}
				onclick={() => (drawn ? drawn.onshow(index === 0 || open ? null : version.id) : (openVersion = open ? null : version.id))}
			>
				<Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} class="shrink-0 text-ink-400" />
				<span class="font-semibold {index === 0 ? 'text-ink-900' : 'text-ink-600'}">Version {number}</span>
				<span class="font-evo-mono text-ink-500">{versionDate(version.at)}</span>
				<span class="text-ink-500">{nameOf(version.by)}</span>
				{#if index === 0}<span class="ml-auto rounded-pill border-[1.5px] border-ink px-1.5 font-evo-mono text-[0.625rem] font-bold tracking-[0.06em] text-ink uppercase">current</span>{/if}
			</button>
			{#if open && drawn}
				<p class="mb-1 ml-5 mt-0.5 text-[0.6875rem] text-ink-400">
					{index === 0 ? 'Drawn above, as it stands' : 'Drawn above in place of the current one, for you alone'} · {SOURCE_LABEL[version.source] ?? version.source}{#if version.validatedBy.length > 0}<span class={TONE.ok.text}> · validated by {version.validatedBy.map(nameOf).join(', ')}</span>{/if}
				</p>
			{:else if open}
				{@const said = proseStatements(version.value)}
				<div class="mb-1 ml-5 mt-1 space-y-1.5 text-sm leading-relaxed text-ink-800">
					{#if index > 0}
						<!-- An old value never reads as the current one (ac-evo-hist-field-versions). -->
						<p class="flex items-center gap-1.5 rounded-field border border-l-4 px-2.5 py-1.5 text-xs {TONE.before.box}">
							<Icon name={TONE.before.icon} size={12} class="shrink-0 {TONE.before.text}" />
							<span><span class="font-bold text-ink-700">Earlier version</span> {number} of {versions.length}: not the answer as it stands, which is version {versions.length}.</span>
						</p>
					{/if}
					{#if statementCount(said) > 1}
						<div class="space-y-2">
							{#each said as paragraph, p (p)}
								<ul class="space-y-1">
									{#each paragraph as statement, i (i)}
										<li class="flex gap-2"><span class="mt-2 size-1 shrink-0 bg-ink-3"></span><span>{statement}</span></li>
									{/each}
								</ul>
							{/each}
						</div>
					{:else}
						<p class="whitespace-pre-line {index > 0 ? 'text-ink-600' : ''}">{version.value}</p>
					{/if}
					<p class="flex flex-wrap items-center gap-2 text-[0.6875rem] text-ink-400">
						<span>{SOURCE_LABEL[version.source] ?? version.source}{#if version.validatedBy.length > 0}<span class={TONE.ok.text}> · validated by {version.validatedBy.map(nameOf).join(', ')}</span>{/if}</span>
						{#if index > 0 && onrestore}
							<!-- The earlier text comes back as a new version; the one it replaces stays in the list. -->
							<button
								type="button"
								class="pressable ml-auto min-h-8 rounded-field border-[1.5px] border-ink bg-transparent px-2.5 text-xs font-bold tracking-[0.07em] text-ink-900 uppercase"
								onclick={() => onrestore?.(version.value)}>Restore</button
							>
						{/if}
					</p>
				</div>
			{/if}
		</li>
	{:else}
		<li class="text-ink-400">The versions are loading with the history.</li>
	{/each}
</ol>
