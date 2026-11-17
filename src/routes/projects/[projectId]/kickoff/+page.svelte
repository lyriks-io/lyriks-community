<script lang="ts">
	import PageHeading from '$ui/shell/PageHeading.svelte';
	import { Icon } from '$ui/design-system';
	import { toastNotifier } from '$ui/composition/client-container';
	import { KICKOFF_SOURCES, kickoffPrompt, type KickoffSourceCode } from '$domain/foundation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const foundationHref = $derived(`/projects/${data.projectId}/foundation`);
	const fromCodebase = $derived(data.sourceMode === 'code_to_spec');

	// From scratch: the sources the agent will read through their own MCPs (or
	// the repository); the sentence names exactly the ones ticked.
	let sources = $state<KickoffSourceCode[]>([]);
	function toggleSource(code: KickoffSourceCode, on: boolean) {
		sources = on ? [...new Set([...sources, code])] : sources.filter((c) => c !== code);
	}
	const prompt = $derived(
		kickoffPrompt({
			productName: data.productName,
			projectId: data.projectId,
			sourceMode: data.sourceMode,
			sources
		})
	);

	let copied = $state(false);
	async function copyPrompt() {
		try {
			await navigator.clipboard.writeText(prompt);
			copied = true;
			toastNotifier.notify('info', 'Kickoff line copied. Paste it into your AI agent.');
			setTimeout(() => (copied = false), 2500);
		} catch {
			toastNotifier.notify('error', 'Could not copy to clipboard. Select the text and copy it by hand.');
		}
	}
</script>

<svelte:head>
	<title>{data.productName || 'Project'} · Kickoff · Lyriks</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
	<div class="w-full px-6 py-5">
		<PageHeading eyebrow="Kickoff" />

		<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
			<section class="min-w-0">
				{#if !fromCodebase}
					<div class="mb-4 border border-line bg-surface p-4">
						<p class="font-evo-mono text-xs tracking-[0.08em] text-ink-3 uppercase">What your agent can read</p>
						<p class="mt-1 text-xs text-ink-3">Each one through its own MCP server connected to your agent, or as files of the repository the agent is open in. Nothing ticked: the agent interviews you.</p>
						<div class="mt-3 flex flex-wrap gap-2">
							{#each KICKOFF_SOURCES as source (source.code)}
								{@const on = sources.includes(source.code)}
								<label
									class="cursor-pointer border-[1.5px] px-3 py-2 text-sm font-medium transition {on ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink hover:border-ink'}"
									title={source.hint}
								>
									<input type="checkbox" class="sr-only" checked={on} onchange={(e) => toggleSource(source.code, e.currentTarget.checked)} />
									{source.label}
								</label>
							{/each}
						</div>
					</div>
				{/if}

				<div class="flex items-center justify-between gap-3 border border-b-0 border-night bg-ink px-4 py-2.5">
					<p class="font-evo-mono text-xs tracking-[0.08em] text-ink-4 uppercase">The one line to paste into your AI agent</p>
					<button
						type="button"
						onclick={copyPrompt}
						class="inline-flex items-center gap-1.5 border-[1.5px] border-paper bg-brand-500 px-3 py-1.5 text-xs font-bold tracking-[0.07em] text-paper uppercase shadow-press-paper transition-[transform,box-shadow] duration-75 hover:-translate-px active:translate-[3px] active:shadow-none"
					>
						<Icon name={copied ? 'check' : 'copy'} size={13} />
						{copied ? 'Copied' : 'Copy'}
					</button>
				</div>
				<p class="border border-night bg-ink px-5 py-6 font-mono text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-paper">{prompt}</p>

				<div class="mt-4 space-y-2 border border-line bg-surface p-4 text-sm text-ink-2">
					<p class="font-bold text-ink">Your agent needs the Lyriks MCP of this install, once.</p>
					<p class="text-xs text-ink-3">Skip this if it already lists a server named <code class="bg-surface-sunken px-1 font-evo-mono">lyriks</code>. Endpoint: <code class="bg-surface-sunken px-1 font-evo-mono">{data.mcpUrl}</code></p>
					<dl class="grid gap-1.5 text-xs">
						<div class="flex flex-wrap items-baseline gap-2"><dt class="w-24 shrink-0 font-evo-mono font-bold tracking-[0.04em] text-ink-3 uppercase">Claude Code</dt><dd class="min-w-0"><code class="bg-surface-sunken px-1 font-evo-mono break-all">{data.commands.claudeCode}</code> then <code class="bg-surface-sunken px-1 font-evo-mono">/mcp</code></dd></div>
						<div class="flex flex-wrap items-baseline gap-2"><dt class="w-24 shrink-0 font-evo-mono font-bold tracking-[0.04em] text-ink-3 uppercase">Codex</dt><dd class="min-w-0"><code class="bg-surface-sunken px-1 font-evo-mono break-all">{data.commands.codex}</code> then <code class="bg-surface-sunken px-1 font-evo-mono">codex mcp login lyriks</code></dd></div>
						<div class="flex flex-wrap items-baseline gap-2"><dt class="w-24 shrink-0 font-evo-mono font-bold tracking-[0.04em] text-ink-3 uppercase">Any other</dt><dd class="min-w-0">an HTTP MCP server named <code class="bg-surface-sunken px-1 font-evo-mono">lyriks</code> at the endpoint above</dd></div>
					</dl>
					{#if !fromCodebase}
						<p class="text-xs text-ink-3">The tools you ticked connect the same way, each with its own MCP server (Jira, Notion, Confluence, Figma); BMAD and Spec Kit are files the agent reads in the repository.</p>
					{:else}
						<!-- Every source within reach, nothing to tick (ac-proj-code-sources). -->
						<p class="text-xs text-ink-3">
							Before pasting, connect your other tools to the agent the same way, each with its own MCP server (Jira, Notion, Confluence, Figma or any other). It reads every one it can reach, with the documents of the repository, and cites them beside the code on everything it extracts.
						</p>
					{/if}
				</div>
			</section>

			<aside class="space-y-4">
				<ol class="space-y-3 text-sm text-ink-2">
					<li class="flex gap-3">
						<span class="mt-0.5 grid size-5 shrink-0 place-items-center bg-ink font-evo-mono text-[0.6875rem] font-bold text-orange">1</span>
						{#if fromCodebase}
							<span>Open your agent inside the product's repository: Claude Code, Codex, Gemini CLI or Copilot.</span>
						{:else}
							<span>Open your agent where the Lyriks MCP is registered, with the MCPs of the tools you ticked connected to it too.</span>
						{/if}
					</li>
					<li class="flex gap-3">
						<span class="mt-0.5 grid size-5 shrink-0 place-items-center bg-ink font-evo-mono text-[0.6875rem] font-bold text-orange">2</span>
						{#if fromCodebase}
							<span>Paste the line. The agent loads the Reverse-Specification playbook from this install, reads and adopts the whole codebase (every element traced to the code it comes from) and cites every other source it can reach; on the first run it asks you to sign in to Lyriks in your browser, then to allow each Lyriks tool it uses: allow them for the whole task (or always) and it stops asking.</span>
						{:else}
							<span>Paste the line. The agent loads the build playbook from this install, reads your sources and asks you only what they cannot tell it; on the first run it asks you to sign in to Lyriks in your browser, then to allow each Lyriks tool it uses: allow them for the whole task (or always) and it stops asking.</span>
						{/if}
					</li>
					<li class="flex gap-3">
						<span class="mt-0.5 grid size-5 shrink-0 place-items-center bg-ink font-evo-mono text-[0.6875rem] font-bold text-orange">3</span>
						<span>Come back here: the sections fill in as the agent authors them, and it asks you only for the decisions your sources cannot settle.</span>
					</li>
				</ol>
				<a href={foundationHref} class="pressable inline-flex items-center gap-1.5 border-[1.5px] border-ink px-4 py-2 text-xs font-bold tracking-[0.07em] text-ink uppercase no-underline">
					{fromCodebase ? 'Continue to Foundation' : 'Or specify it by hand in Foundation'} <Icon name="arrow-right" size={13} />
				</a>
				<p class="text-xs text-ink-3">This page stays reachable from the Foundation page, so you can copy the line again later.</p>
			</aside>
		</div>
	</div>
</div>
