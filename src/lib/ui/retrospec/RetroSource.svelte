<script lang="ts">
	import { mcpRegistrationCommands } from '$domain/foundation';
	import { untrack } from 'svelte';
	import {
		docsRefusal,
		linkLines,
		modeOf,
		readsCode,
		readsDocs,
		retrospecPrompt,
		scopeOptions,
		sortLinks,
		type ComplementaryPrompt,
		type DocsFrom,
		type DocsLocation,
		type RetrospecMode,
		type RetrospecScope
	} from '$domain/retrospec';
	import { Icon } from '$ui/design-system';
	import { copyPrompt } from '$ui/evolution/copy-prompt';
	import LlmConnection from './LlmConnection.svelte';
	import { APPROVALS_AHEAD } from '$ui/ai-session/approvals';

	/**
	 * What the AI reads (the code, the documentation, or both: the code then
	 * stays the reference), and the one prompt to paste into it. Lyriks reads
	 * neither itself: the person's AI does, through the MCP. The line under the
	 * prompt says whether it connected, live. Nothing asks the person to say
	 * they ran it: the AI says it received the prompt and the page moves on to
	 * the analysis by itself (criterion a6f870af). Once copied, a line says the
	 * approvals the AI client will ask for (ac-ai-session-approvals).
	 * With the documentation ticked, the person says where it is: on this
	 * computer (a folder, else the repository the LLM runs in) or at links the
	 * LLM can open; the prompt follows as they type (criterion b6ad9ca2).
	 */
	interface Props {
		projectId: string;
		productName: string;
		mode: RetrospecMode;
		mcpUrl: string;
		canWrite: boolean;
		/** When the AI last called Lyriks about this project, null when never seen. */
		aiSeenAt: string | null;
		/** Now, ticking, so "connected" ages honestly. */
		now: number;
		onMode: (mode: RetrospecMode) => void;
		/** Where the documentation is, as the run keeps it. */
		docsAt: DocsLocation;
		onDocs: (at: DocsLocation) => void;
		/** The run starts from what is gathered and reads the delta or the whole product again (criteria 8c9bfffe, 98612117). */
		complementary?: ComplementaryPrompt | null;
		/** What a later run reads: what changed or the whole product again. */
		onScope?: (scope: RetrospecScope) => void;
	}
	let { projectId, productName, mode, mcpUrl, canWrite, aiSeenAt, now, onMode, docsAt, onDocs, complementary = null, onScope }: Props = $props();
	const scope = $derived<RetrospecScope>(complementary?.scope ?? 'delta');
	// The same options as the head of Mismatch, Resume analysis after a run closed before its final check (criterion 1f1f4ca8).
	const SCOPES = $derived(scopeOptions(true, !!complementary?.resumable).map((o) => ({ value: o.scope, title: o.title, sub: o.sub })));

	const code = $derived(readsCode(mode));
	const docs = $derived(readsDocs(mode));

	// The fields read as typed and the prompt follows them; the run keeps them when a field is left or a choice made.
	let docsFrom = $state<DocsFrom>(untrack(() => docsAt.from));
	let folder = $state(untrack(() => docsAt.folder));
	let linksText = $state(untrack(() => docsAt.links.join('\n')));
	const typed = $derived<DocsLocation>({ from: docsFrom, folder: folder.trim(), links: linkLines(linksText) });
	const refusedLinks = $derived(sortLinks(typed.links).refused);
	const blocked = $derived(docs ? docsRefusal(typed) : null);
	const keepDocs = () => {
		if (typed.from !== docsAt.from || typed.folder !== docsAt.folder || typed.links.join('\n') !== docsAt.links.join('\n')) onDocs(typed);
	};
	const chooseFrom = (from: DocsFrom) => {
		docsFrom = from;
		keepDocs();
	};
	const PLACES: readonly { value: DocsFrom; title: string; sub: string }[] = [
		{ value: 'computer', title: 'On this computer', sub: 'Files your LLM opens on this machine: a folder, or the repository it runs in.' },
		{ value: 'links', title: 'Links', sub: 'Confluence, Notion, Google Docs, Jira, Figma… Each link must open from your LLM.' }
	];
	const FIELD = 'w-full border border-line bg-paper px-3 py-2 text-[0.8125rem] text-ink placeholder:text-ink-4 focus:border-ink focus:outline-none disabled:cursor-not-allowed';

	const prompt = $derived(retrospecPrompt(mode, productName, projectId, complementary, typed));
	const where = $derived(code && docs ? `Your LLM · the code of ${productName} + your docs` : docs ? 'Your LLM · your documentation' : `Your LLM · the code of ${productName}`);
	let copied = $state(false);
	/** The prompt left the page once: the approvals ahead stay said, whatever is ticked after. */
	let copiedOnce = $state(false);
	$effect(() => {
		void mode;
		void scope;
		void prompt;
		copied = false;
	});
	async function copy() {
		if (blocked) return;
		await copyPrompt(prompt, 'Prompt copied: paste it into your LLM');
		copied = true;
		copiedOnce = true;
	}
	// One box always stays ticked: unticking the last one keeps it.
	const toggleCode = () => (docs ? onMode(modeOf(!code, docs)) : undefined);
	const toggleDocs = () => (code ? onMode(modeOf(code, !docs)) : undefined);

	// The design's choice card (.ly-choice) and checkbox (.ly-check): sand at rest, paper with an ink border when ticked.
	const NUM = 'flex size-6 flex-none items-center justify-center bg-ink font-evo-mono text-xs font-bold text-paper';
	const tile = (on: boolean) =>
		`flex w-full items-start gap-3 p-3.5 text-left text-ink box-border disabled:cursor-not-allowed ${on ? 'border-2 border-ink bg-paper' : 'border border-transparent bg-surface hover:border-line'}`;
	const box = (on: boolean) => `flex size-5 flex-none items-center justify-center border-[1.5px] border-ink text-xs font-extrabold ${on ? 'bg-ink text-paper' : 'bg-transparent'}`;
</script>

<div class="flex animate-[lk-in_0.35s_ease_both] flex-wrap gap-7 border border-evo-line bg-paper p-6">
	<div class="flex max-w-[380px] min-w-0 flex-[1_1_280px] flex-col gap-3">
		<span class="flex items-center gap-2.5"><span class={NUM}>1</span><span class="text-[0.9375rem] font-bold tracking-[-0.01em] text-ink">What should Lyriks read?</span></span>
		<button type="button" role="checkbox" aria-checked={code} class={tile(code)} disabled={!canWrite} onclick={toggleCode}>
			<span aria-hidden="true" class="flex size-[34px] flex-none items-center justify-center border-[1.5px] border-ink bg-paper text-ink">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6"></path><path d="m8 6-6 6 6 6"></path></svg>
			</span>
			<span class="flex min-w-0 flex-auto flex-col gap-0.5">
				<span class="text-[0.9375rem] font-bold">Code repository</span>
				<span class="text-xs leading-[1.45] text-ink-2">The reference for what the product does today.</span>
			</span>
			<span aria-hidden="true" class={box(code)}>{code ? '✓' : ''}</span>
		</button>
		<button type="button" role="checkbox" aria-checked={docs} class={tile(docs)} disabled={!canWrite} onclick={toggleDocs}>
			<span aria-hidden="true" class="flex size-[34px] flex-none items-center justify-center border-[1.5px] border-ink bg-paper text-ink">
				<Icon name="file" size={16} />
			</span>
			<span class="flex min-w-0 flex-auto flex-col gap-0.5">
				<span class="text-[0.9375rem] font-bold">Documentation</span>
				<span class="text-xs leading-[1.45] text-ink-2">PDF, Word, Confluence, Notion, Jira, Figma… even outdated.</span>
			</span>
			<span aria-hidden="true" class={box(docs)}>{docs ? '✓' : ''}</span>
		</button>
		{#if docs}
			<!-- Where the documentation is: on this computer or at links the LLM can open (criterion b6ad9ca2). -->
			<span class="mt-2 text-[0.8125rem] font-bold text-ink">Where is it?</span>
			<div role="radiogroup" aria-label="Where is the documentation?" class="flex flex-col gap-2">
				{#each PLACES as option (option.value)}
					<button type="button" role="radio" aria-checked={docsFrom === option.value} class={tile(docsFrom === option.value)} disabled={!canWrite} onclick={() => chooseFrom(option.value)}>
						<span class="flex min-w-0 flex-auto flex-col gap-0.5">
							<span class="text-[0.9375rem] font-bold">{option.title}</span>
							<span class="text-xs leading-[1.45] text-ink-2">{option.sub}</span>
						</span>
						<span aria-hidden="true" class="flex size-5 flex-none items-center justify-center rounded-full border-[1.5px] border-ink">{#if docsFrom === option.value}<span class="size-2.5 rounded-full bg-ink"></span>{/if}</span>
					</button>
				{/each}
			</div>
			{#if docsFrom === 'computer'}
				<input type="text" class={FIELD} aria-label="Folder on this computer" placeholder="Folder (optional), e.g. ~/Documents/{productName}" disabled={!canWrite} bind:value={folder} onchange={keepDocs} />
			{:else}
				<textarea rows="3" class="{FIELD} resize-y font-evo-mono" aria-label="Links to the documentation" placeholder={'One link per line\nhttps://…'} disabled={!canWrite} bind:value={linksText} onchange={keepDocs}></textarea>
				{#each refusedLinks as line (line)}
					<span class="text-xs leading-[1.45] text-red-ink [overflow-wrap:anywhere]">Not a web address, left out: {line}. A file of this computer goes with On this computer.</span>
				{/each}
			{/if}
		{/if}
		{#if complementary}
			<!-- A later run reads what changed, the whole product again or where the last run stopped; it erases nothing (EVO-014). -->
			<span class="mt-2 text-[0.8125rem] font-bold text-ink">How much should it read?</span>
			<div role="radiogroup" aria-label="How much should it read?" class="flex flex-col gap-2">
				{#each SCOPES as option (option.value)}
					<button type="button" role="radio" aria-checked={scope === option.value} class={tile(scope === option.value)} disabled={!canWrite || !onScope} onclick={() => onScope?.(option.value)}>
						<span class="flex min-w-0 flex-auto flex-col gap-0.5">
							<span class="text-[0.9375rem] font-bold">{option.title}</span>
							<span class="text-xs leading-[1.45] text-ink-2">{option.sub}</span>
						</span>
						<span aria-hidden="true" class="flex size-5 flex-none items-center justify-center rounded-full border-[1.5px] border-ink">{#if scope === option.value}<span class="size-2.5 rounded-full bg-ink"></span>{/if}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
	<div class="flex min-w-0 flex-[2_1_420px] flex-col gap-3">
		<span class="flex items-center gap-2.5">
			<span class={NUM}>2</span><span class="text-[0.9375rem] font-bold tracking-[-0.01em] text-ink">Paste this prompt in your LLM</span>
			<button
				type="button"
				class="grid size-7 flex-none place-items-center text-ink-3 hover:text-ink"
				aria-label="Copy the command that connects the Lyriks MCP"
				title="No Lyriks MCP in your LLM yet? Register it once ({mcpUrl}). Click to copy the Claude Code command."
				onclick={() => copyPrompt(mcpRegistrationCommands(mcpUrl).claudeCode, 'Command copied: run it once in your terminal, then /mcp in Claude Code')}
			>
				<Icon name="info" size={15} />
			</button>
		</span>
		<div class="flex flex-col overflow-hidden bg-ink">
			<div class="flex items-center gap-2 border-b border-night py-2.5 pr-3 pl-3.5">
				<span aria-hidden="true" class="flex gap-1.5"><span class="size-2.5 bg-red"></span><span class="size-2.5 bg-orange"></span><span class="size-2.5 bg-green"></span></span>
				<span class="min-w-0 flex-auto truncate font-evo-mono text-xs text-ink-4">{where}</span>
				<button type="button" class="min-h-[30px] flex-none border-[1.5px] border-paper bg-transparent px-3 text-xs font-bold tracking-[0.07em] text-paper uppercase shadow-press-paper transition-[transform,box-shadow] duration-75 hover:-translate-px active:translate-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50" disabled={!!blocked} title={blocked ?? undefined} onclick={copy}>{copied ? 'Copied ✓' : 'Copy the prompt'}</button>
			</div>
			<div class="px-[18px] py-4 font-evo-mono text-[0.8125rem] leading-[1.65] whitespace-pre-wrap text-paper [overflow-wrap:anywhere]"><span class="text-orange">&gt; </span>{prompt}</div>
		</div>
		{#if blocked}
			<span role="note" class="flex items-start gap-2 text-[0.8125rem] leading-normal text-ink-2"><Icon name="info" size={15} class="mt-0.5 flex-none text-blue-ink" />{blocked}</span>
		{/if}
		{#if copiedOnce}
			<span role="note" class="flex animate-[lk-in_0.25s_ease_both] items-start gap-2 text-[0.8125rem] leading-normal text-ink-2"><Icon name="info" size={15} class="mt-0.5 flex-none text-blue-ink" />{APPROVALS_AHEAD}</span>
		{/if}
		<LlmConnection {aiSeenAt} {now} class="pt-1" />
	</div>
</div>
