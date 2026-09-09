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
		{#if fromCodebase}
			<PageHeading
				eyebrow="Kickoff"
				title="Start from your codebase."
				description="Lyriks does not read your repository: your AI coding agent does, from inside the repo, and writes the spec here through the MCP. One sentence is enough; the MCP hands the agent the playbook and the rules."
			/>
		{:else}
			<PageHeading
				eyebrow="Kickoff"
				title="Start from what you already have."
				description="Your AI agent specifies the product here through the Lyriks MCP, reading your backlog, wiki and documents through their own MCPs connected to the same agent. Tick what you have; one sentence does the rest, and the agent asks you for what nothing covers."
			/>
		{/if}

		<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
			<section class="min-w-0">
				{#if !fromCodebase}
					<div class="mb-4 rounded-card border border-line bg-surface p-4">
						<p class="text-xs font-semibold uppercase tracking-wide text-ink-500">What your agent can read</p>
						<p class="mt-1 text-xs text-ink-500">Each one through its own MCP server connected to your agent, or as files of the repository the agent is open in. Nothing ticked: the agent interviews you.</p>
						<div class="mt-3 flex flex-wrap gap-2">
							{#each KICKOFF_SOURCES as source (source.code)}
								{@const on = sources.includes(source.code)}
								<label
									class="cursor-pointer rounded-field border px-3 py-2 text-sm transition {on ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-line bg-surface text-ink-700 hover:border-brand-300'}"
									title={source.hint}
								>
									<input type="checkbox" class="sr-only" checked={on} onchange={(e) => toggleSource(source.code, e.currentTarget.checked)} />
									{source.label}
								</label>
							{/each}
						</div>
					</div>
				{/if}

				<div class="flex items-center justify-between gap-3 rounded-t-card border border-b-0 border-line bg-surface px-4 py-2.5">
					<p class="text-xs font-semibold uppercase tracking-wide text-ink-500">The one line to paste into your AI agent</p>
					<button
						type="button"
						onclick={copyPrompt}
						class="inline-flex items-center gap-1.5 rounded-field bg-linear-to-r from-brand-500 to-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
					>
						<Icon name={copied ? 'check' : 'copy'} size={13} />
						{copied ? 'Copied' : 'Copy'}
					</button>
				</div>
				<p class="rounded-b-card border border-line bg-ink-900 px-5 py-6 font-mono text-[15px] leading-relaxed whitespace-pre-wrap text-slate-100">{prompt}</p>

				<div class="mt-4 space-y-2 rounded-card border border-line bg-surface p-4 text-sm text-ink-700">
					<p class="font-semibold text-ink-900">Your agent needs the Lyriks MCP of this install, once.</p>
					<p class="text-xs text-ink-500">Skip this if it already lists a server named <code class="rounded bg-surface-sunken px-1">lyriks</code>. Endpoint: <code class="rounded bg-surface-sunken px-1">{data.mcpUrl}</code></p>
					<dl class="grid gap-1.5 text-xs">
						<div class="flex flex-wrap items-baseline gap-2"><dt class="w-24 shrink-0 font-semibold text-ink-600">Claude Code</dt><dd class="min-w-0"><code class="rounded bg-surface-sunken px-1 break-all">{data.commands.claudeCode}</code> then <code class="rounded bg-surface-sunken px-1">/mcp</code></dd></div>
						<div class="flex flex-wrap items-baseline gap-2"><dt class="w-24 shrink-0 font-semibold text-ink-600">Codex</dt><dd class="min-w-0"><code class="rounded bg-surface-sunken px-1 break-all">{data.commands.codex}</code> then <code class="rounded bg-surface-sunken px-1">codex mcp login lyriks</code></dd></div>
						<div class="flex flex-wrap items-baseline gap-2"><dt class="w-24 shrink-0 font-semibold text-ink-600">Any other</dt><dd class="min-w-0">an HTTP MCP server named <code class="rounded bg-surface-sunken px-1">lyriks</code> at the endpoint above</dd></div>
					</dl>
					{#if !fromCodebase}
						<p class="text-xs text-ink-500">The tools you ticked connect the same way, each with its own MCP server (Jira, Notion, Confluence, Figma); BMAD and Spec Kit are files the agent reads in the repository.</p>
					{/if}
				</div>
			</section>

			<aside class="space-y-4">
				<ol class="space-y-3 text-sm text-ink-700">
					<li class="flex gap-3">
						<span class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-500 text-[11px] font-bold text-white">1</span>
						{#if fromCodebase}
							<span>Open your agent inside the product's repository: Claude Code, Codex, Gemini CLI or Copilot.</span>
						{:else}
							<span>Open your agent where the Lyriks MCP is registered, with the MCPs of the tools you ticked connected to it too.</span>
						{/if}
					</li>
					<li class="flex gap-3">
						<span class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-500 text-[11px] font-bold text-white">2</span>
						{#if fromCodebase}
							<span>Paste the line. The agent loads the retro-spec playbook from this install and reads the whole codebase; on the first run it asks you to sign in to Lyriks in your browser.</span>
						{:else}
							<span>Paste the line. The agent loads the build playbook from this install, reads your sources and asks you only what they cannot tell it; on the first run it asks you to sign in to Lyriks in your browser.</span>
						{/if}
					</li>
					<li class="flex gap-3">
						<span class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-500 text-[11px] font-bold text-white">3</span>
						<span>Come back here: the sections fill in as the agent authors them, and it asks you only for the decisions your sources cannot settle.</span>
					</li>
				</ol>
				<a href={foundationHref} class="inline-flex items-center gap-1.5 rounded-field border border-line px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface">
					{fromCodebase ? 'Continue to Foundation' : 'Or specify it by hand in Foundation'} <Icon name="arrow-right" size={13} />
				</a>
				<p class="text-xs text-ink-500">This page stays reachable from the Foundation page, so you can copy the line again later.</p>
			</aside>
		</div>
	</div>
</div>
