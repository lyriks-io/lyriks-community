<script lang="ts">
	import { page } from '$app/state';
	import PageHeading from '$ui/shell/PageHeading.svelte';
	import { CAPABILITY_HELP } from '$ui/shell/capability-help';
	import { untrack } from "svelte";
	import { Card, Icon, SideTabPanel, type SubTab } from "$ui/design-system";
	import { IdentityStore } from "$ui/foundation/identity-store.svelte";
	import { DefinitionStore } from "$ui/foundation/definition-store.svelte";
	import { OperationsStore } from "$ui/foundation/operations-store.svelte";
	import OperationsTab from "$ui/foundation/operations/OperationsTab.svelte";
	import { toastNotifier } from '$ui/composition/client-container';
	import SaveBar from "$ui/shell/SaveBar.svelte";
	import { anchorKeyFromUrl, focusField } from '$ui/shell/focus-field';
	import TabBar, { type FoundationTab } from "$ui/foundation/TabBar.svelte";
	import IdentityBar from "$ui/foundation/IdentityBar.svelte";
	import SoftwareTypePicker from "$ui/foundation/SoftwareTypePicker.svelte";
	import BriefSection from "$ui/foundation/sections/BriefSection.svelte";
	// The tabs use migration-era stores while living on this one Foundation page.
	import BusinessObjectiveSection from "$ui/foundation/definition/BusinessObjectiveSection.svelte";
	import BusinessTab from "$ui/foundation/definition/BusinessTab.svelte";
	import CompetitionSection from "$ui/foundation/definition/CompetitionSection.svelte";
	import TechnicalTab from "$ui/foundation/definition/TechnicalTab.svelte";
	import SecurityTab from "$ui/foundation/definition/SecurityTab.svelte";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	const notifier = toastNotifier;
	const store = untrack(
		() => new IdentityStore(data.draft, data.session, notifier, data.revision),
	);
	const definition = untrack(
		() =>
			new DefinitionStore(
				data.definitionDraft,
				data.session,
				notifier,
				data.definitionRevision,
			),
	);
	// Operations — the "Ops" tab (spec: feature aae37f44, hosted on this one
	// Foundation page like the definition tabs). Screens come from the Experience library.
	const operations = untrack(
		() =>
			new OperationsStore(
				data.operationsDraft,
				data.operationsScreens,
				data.session,
				notifier,
				data.operationsRevision,
			),
	);

	// Live-sync: re-hydrate each store when a fresh server `load` lands.
	$effect(() => {
		store.hydrate(data.draft, data.revision);
	});
	$effect(() => {
		definition.hydrate(data.definitionDraft, data.definitionRevision);
	});
	$effect(() => {
		operations.hydrate(data.operationsDraft, data.operationsRevision);
	});
	// Migration only matters when the project replaces an existing system — a
	// greenfield build has nothing to roll over, so the Ops tab hides the section
	// and the coherence score stops expecting a roll-out strategy.
	$effect(() => {
		operations.migrationExpected = store.draft.sourceMode !== "greenfield";
	});

	const projectName = $derived(
		store.draft.productName.trim() || "Untitled project",
	);

	// Shared personas (Users & Permissions roles), read-only for the Business
	// section's pain-point picker. Kept in local state so a freshly created role
	// shows instantly, and re-synced whenever a fresh server load lands.
	let usersRoles = $state(untrack(() => data.usersRoles));
	$effect(() => {
		usersRoles = data.usersRoles;
	});

	// "Create a user" from a pain point → append a real shared role to Users &
	// Permissions and return its id. Optimistically adds it to the local list so
	// the chip renders before the next load arrives.
	async function createSharedRole(name: string): Promise<string | null> {
		const trimmed = name.trim();
		if (!trimmed) return null;
		try {
			const res = await fetch("/api/draft/users/role", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ projectId: page.params.projectId, name: trimmed }),
			});
			if (!res.ok) throw new Error(await res.text());
			const { role } = (await res.json()) as {
				role: (typeof usersRoles)[number];
			};
			if (!usersRoles.some((r) => r.id === role.id)) usersRoles = [...usersRoles, role];
			return role.id;
		} catch {
			notifier.notify("error", "Couldn't create the user. Try again.");
			return null;
		}
	}

	const tabs: readonly FoundationTab[] = [
		{
			key: "brief",
			label: "Brief",
			desc: "Identity, raw idea & form factor",
			icon: "lightbulb",
		},
		{
			key: "business",
			label: "Business",
			desc: "Objective, expectations & risks",
			icon: "target",
		},
		{
			key: "technical",
			label: "Technical",
			desc: "Integrations, performance, reach",
			icon: "server",
		},
		{
			key: "security",
			label: "Security",
			desc: "Trust, compliance, retention",
			icon: "shield",
		},
		{
			key: "ops",
			label: "Ops",
			desc: "i18n, quality, fixtures",
			icon: "sliders",
		},
	];
	// Deep links land on a tab, not just on the page: "Fix now" from Project
	// health, a knowledge-graph node link and the retired legacy routes all
	// arrive as `?tab=<key>`, with `#anchor` (or `?node=`) naming the field to
	// scroll to and flash. Read on init too, so the server renders the target tab
	// instead of flashing Brief first. No `tab` = leave the user where they were.
	const tabInUrl = (url: URL): FoundationTab["key"] | null =>
		tabs.find((t) => t.key === url.searchParams.get("tab"))?.key ?? null;

	let activeTab = $state<FoundationTab["key"]>(
		untrack(() => tabInUrl(page.url)) ?? "brief",
	);
	$effect(() => {
		const target = tabInUrl(page.url);
		if (target) activeTab = target;
	});
	const focusKey = $derived(anchorKeyFromUrl(page.url));

	// Second-level nav (spec: image-2 full-width bar). Each heavy tab shows one
	// sub-section at a time instead of stacking everything at once. State is local
	// per tab — reopening a tab lands on its first sub-section.
	let businessSub = $state<"objective" | "requirements" | "competition">(
		"objective",
	);
	let technicalSub = $state<"runtime" | "apis" | "performance" | "custom">(
		"runtime",
	);
	let securitySub = $state<"access" | "data" | "compliance" | "custom">(
		"access",
	);

	const businessSubs = $derived<SubTab[]>([
		{
			id: "objective",
			label: "Objective",
			desc: "Problem, outcome & KPIs",
			icon: "target",
			count:
				definition.draft.businessObjective.painPoints.length +
				definition.draft.businessObjective.kpis.length +
				definition.draft.businessObjective.successCriteria.length +
				definition.draft.businessObjective.failureCriteria.length,
		},
		{
			id: "requirements",
			label: "Requirements",
			desc: "Commitments, constraints & risks",
			icon: "check",
			count:
				definition.draft.business.objectives.length +
				definition.draft.business.slas.length +
				definition.draft.business.contractualConstraints.length +
				definition.draft.business.risks.length +
				definition.draft.business.custom.length,
		},
		{
			id: "competition",
			label: "Competition",
			desc: "Who you fight, why you win",
			icon: "trophy",
			count:
				definition.draft.market.customerSize.length +
				definition.draft.market.industrySectors.length +
				definition.draft.market.regulations.length +
				definition.draft.competition.directCompetitors.length +
				definition.draft.competition.indirectCompetitors.length +
				definition.draft.competition.businessModels.length +
				definition.draft.competition.differentiators.length,
		},
	]);
	const technicalSubs = $derived<SubTab[]>([
		{
			id: "runtime",
			label: "Runtime",
			desc: "Where it must run",
			icon: "monitor",
			count: definition.draft.technical.compatibilities.length,
		},
		{
			id: "apis",
			label: "Integrations & APIs",
			desc: "What it connects to & exposes",
			icon: "layers",
			count:
				definition.draft.technical.integrations.length +
				definition.draft.technical.apisExpose.length +
				definition.draft.technical.apisConsume.length,
		},
		{
			id: "performance",
			label: "Performance",
			desc: "Speed & availability",
			icon: "gauge",
			count:
				definition.draft.technical.performance.length +
				(definition.draft.technical.availability.trim() ? 1 : 0),
		},
		{
			id: "custom",
			label: "Custom",
			desc: "Extra technical requirements",
			icon: "sliders",
			count: definition.draft.technical.custom.length,
		},
	]);
	const securitySubs = $derived<SubTab[]>([
		{
			id: "access",
			label: "Access",
			desc: "Authentication & authorization",
			icon: "lock",
			count:
				definition.draft.security.authentication.length +
				(definition.draft.security.authorization ? 1 : 0),
		},
		{
			id: "data",
			label: "Data protection",
			desc: "Encryption, audit & retention",
			icon: "shield",
			count:
				definition.draft.security.encryption.length +
				(definition.draft.security.auditLogs ? 1 : 0) +
				definition.draft.security.dataRetention.length,
		},
		{
			id: "compliance",
			label: "Compliance",
			desc: "Expected certifications",
			icon: "file-check",
			count: definition.draft.security.expectedCertifications.length,
		},
		{
			id: "custom",
			label: "Custom",
			desc: "Extra security requirements",
			icon: "sliders",
			count: definition.draft.security.custom.length,
		},
	]);
	const saveStatus = $derived(
		activeTab === "brief"
			? store.saveStatus
			: activeTab === "ops"
				? operations.saveStatus
				: definition.saveStatus,
	);
	// SaveBar shows the coherence of whichever store owns the active tab.
	const coherence = $derived(
		activeTab === "brief"
			? store.coherence
			: activeTab === "ops"
				? operations.coherence
				: definition.coherence,
	);

</script>

<svelte:head>
	<title>{projectName} · Foundation · Lyriks</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
	<div class="w-full px-6 py-5" use:focusField={focusKey}>
		<PageHeading
			eyebrow="Foundation"
			title="Capture the raw idea. Frame the territory."
			description="Brief, business, market, technical, security and ops - the six faces of the project in one page. Plain English in, structured spec out. Lyriks does the translation."
			help={CAPABILITY_HELP.foundation}
		/>

		<div class="mb-6">
			<TabBar
				{tabs}
				active={activeTab}
				onSelect={(k) => (activeTab = k)}
			/>
		</div>

		{#if activeTab === "brief"}
			<div class="space-y-6 pb-4">
				{#if store.draft.sourceMode === "code_to_spec"}
					<!-- Started from a codebase: the agent authors, the human watches. Keep the way back to the prompt one click away. -->
					<div class="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-ink-700">
						<p><span class="font-semibold">Specified from an existing codebase.</span> Your AI coding agent authors this spec through the MCP; the sections fill in as it works.</p>
						<a href={`/projects/${store.draft.projectId}/kickoff`} class="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700">Open the kickoff <Icon name="arrow-right" size={13} /></a>
					</div>
				{:else if (data.trlBreakdown?.features?.length ?? 0) === 0}
					<!-- Nothing specified yet: the agent can do it from the backlog and documents, through the MCP. -->
					<div class="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-sunken/40 px-4 py-3 text-sm text-ink-700">
						<p><span class="font-semibold">Nothing specified yet.</span> Your AI agent can specify this product through the MCP, from your backlog and documents, or you author it here.</p>
						<a href={`/projects/${store.draft.projectId}/kickoff`} class="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700">Open the kickoff <Icon name="arrow-right" size={13} /></a>
					</div>
				{/if}
				<IdentityBar
					{store}
					marketType={definition.draft.market.marketType}
					onMarketTypeChange={definition.setMarketType}
				/>
				<BriefSection {store} />
				<Card><SoftwareTypePicker {store} /></Card>
			</div>
		{:else if activeTab === "business"}
			<div class="pb-4">
				<SideTabPanel
					tabs={businessSubs}
					active={businessSub}
					onSwitch={(k) => (businessSub = k as typeof businessSub)}
				>
					{#if businessSub === "objective"}
						<BusinessObjectiveSection store={definition} roles={usersRoles} onCreateRole={createSharedRole} />
					{:else if businessSub === "requirements"}
						<BusinessTab store={definition} />
					{:else}
						<CompetitionSection store={definition} />
					{/if}
				</SideTabPanel>
			</div>
		{:else if activeTab === "technical"}
			<div class="pb-4">
				<SideTabPanel
					tabs={technicalSubs}
					active={technicalSub}
					onSwitch={(k) => (technicalSub = k as typeof technicalSub)}
				>
					<TechnicalTab store={definition} active={technicalSub} />
				</SideTabPanel>
			</div>
		{:else if activeTab === "security"}
			<div class="pb-4">
				<SideTabPanel
					tabs={securitySubs}
					active={securitySub}
					onSwitch={(k) => (securitySub = k as typeof securitySub)}
				>
					<SecurityTab store={definition} active={securitySub} />
				</SideTabPanel>
			</div>
		{:else}
			<div class="pb-4">
				<OperationsTab
					store={operations}
					languages={definition.draft.market.languages}
					onLanguagesChange={definition.setLanguages}
				/>
			</div>
		{/if}
	</div>
</div>

<SaveBar {saveStatus} {coherence} />
