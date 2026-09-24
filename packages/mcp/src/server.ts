// MCP server registration.
//
// Creates a McpServer and registers all 5 tools.
// Called once per request in stateless mode — fresh McpServer per POST /mcp.

import { McpServer }            from '@modelcontextprotocol/sdk/server/mcp.js'
import { z }                    from 'zod'
import type { BoundOverlay }    from './enterprise/overlay.js'
import { registerEnterpriseStandIns } from './tools/enterprise-standins.js'
import {
  createProjectWithoutBack,
  deleteProjectWithoutBack,
  getProjectWithoutBack,
  listProjectsWithoutBack,
  listWorkspacesWithoutBack,
  NO_WORKSPACES_NOTE,
  updateProjectWithoutBack,
} from './tools/portfolio-platform.js'
import { LyriksClient }             from './lyriks-client.js'
import { readPortfolio } from './util/portfolio-read.js'
import { getCapabilitiesHandler } from './tools/capabilities.js'
import { getProjectElaborationHandler } from './tools/elaboration.js'
import {
  READABLE_SECTIONS,
  SECTIONS,
  listProjectsHandler as listWizardProjectsHandler,
  createWizardProjectHandler,
  getSectionHandler,
  setSectionHandler,
  patchSectionHandler,
  describeSectionHandler,
  getImplementationContextHandler,
} from './tools/sections.js'
import { INCREMENTAL_OPS } from './util/validate-section-patch.js'
import { buildScreenHandler } from './tools/build_screen.js'
import { listSkillsHandler, getSkillHandler, syncSkillsHandler } from './tools/skills.js'
import { getKnowledgeGraphHandler } from './tools/knowledge_graph.js'
import {
  assessPortfolioCompletenessHandler,
  assessProjectCompletenessHandler,
  auditProjectScopeHandler,
  finishProjectHandler,
} from './tools/completion.js'
import {
  createDomainHandler,
  deleteDomainHandler,
  deleteWizardProjectHandler,
  listDomainsHandler,
  updateDomainHandler,
  updateWizardProjectHandler,
} from './tools/lyriks-portfolio.js'
import { addElementHandler } from './tools/add_element.js'
import { wireElementHandler } from './tools/wire_element.js'
import { getExperienceCoverageHandler, simulateExperienceHandler, verifyExperienceHandler, importDataCollectionsHandler, generateAcceptanceTestsHandler, generateRepoScaffoldHandler } from './tools/experience.js'
import {
  applyBehaviorBatchHandler,
  assessBehaviorFeatureHandler,
  getBehaviorContextHandler,
  getBehaviorOperationsHandler,
  readBehaviorFeatureHandler,
  scoreBehaviorFeatureHandler,
} from './tools/behavior.js'
import { exportBehaviorScenariosHandler } from './tools/behavior_scenarios.js'
import {
  attachSourceHandler,
  classifySourceHandler,
  disposeCandidateHandler,
  finalizeAnalysisHandler,
  flagConflictHandler,
  getProvenanceHandler,
  listSourcesHandler,
  recordSpansHandler,
  removeSourceHandler,
  resetAnalysisHandler,
  resolveConflictHandler,
  stageCandidatesHandler,
} from './tools/adoption.js'
import {
  driftHandler,
  gapsHandler,
  getStatusHandler,
  reportStatusHandler,
  seedIndexHandler,
  syncIndexHandler,
} from './tools/implementation.js'
import {
  applyRoadmapBatchHandler,
  getRoadmapHandler,
  reconcileRoadmapHandler,
} from './tools/roadmap.js'
import { DOSSIER_PARTS, applyEvolutionBatchHandler, getEvolutionHandler } from './tools/evolution.js'
import { capResult } from './util/shape.js'
import { CAP_HINTS, type HintedTool } from './util/cap-hints.js'
import { withWriteLock } from './util/write-lock.js'

// One rule, spelled once. The server instructions used to send every "change to
// an existing product" to Evolution (which plans without building) while the
// The one law, in one place. The instructions, both Evolution tools, the binding
// block and the per-prompt hook carry this same text, so they cannot drift apart:
// a client that reads two of them must not find two different rules.
export const EVOLUTION_IS_THE_DOOR =
  'A product that already EXISTS changes through an Evolution request, always. Adding a capability, ' +
  'changing one, removing one or correcting one opens a dossier FIRST: the dossier carries the change ' +
  'as a draft (add_draft_leaf), the impact and coherence reports read the product AS IT WOULD BE, and ' +
  'the freeze into Verify is what writes the sections. Then the code, then sync_implementation_index. ' +
  'There is NO ' +
  'threshold and nothing for you to judge: never decide a change is too small for a dossier, because a ' +
  'request that disturbs nothing and contradicts nothing crosses its own gates and closes itself in the ' +
  'same act, costing its author nothing but the trace it leaves. Who signs follows the roster, not the ' +
  'size of the change: where one member is alone you carry the request through yourself, proposals ' +
  'included; from two members up a person signs each one. The same door serves a change someone only ' +
  'asks to QUALIFY (what it would involve, an estimate, an impact report, a decision that belongs to ' +
  'someone else): the same dossier, left short of the freeze, so nothing reaches a section either way ' +
  'and there is nothing to ask about which of the two was meant. A project still being written for the ' +
  'FIRST time is not a change to an existing product: lyriks-build authors it directly, and the door ' +
  'binds a project once its specification has been declared finished at least once, or once code is ' +
  'anchored to it.'

// `ee` is the Enterprise overlay bound to the caller, or null on the Community
// edition: the portfolio tools then answer from the platform, and the tools only
// Enterprise serves are registered as stand-ins that say so.
export function createMcpServer(ee: BoundOverlay | null, lyriksToken?: string): McpServer {
  const mcp = new McpServer(
    { name: 'lyriks', version: '1.0.0' },
    {
      // Read by connecting agents on initialize — the contract for using this server.
      instructions:
        'Lyriks project DATA (sections, screens, features, behavior) MUST be authored ' +
        'through these tools — never by editing files or databases directly. Authoring skills ' +
        '(SKILL.md playbooks) ship with the platform and auto-update on ANY agent runtime: at ' +
        'the START of any authoring session call sync_skills with `client` set to what you are ' +
        '(use skill_ids for relevant guides or include_content:false for metadata-only discovery; ' +
        'fetch any deferred guide completely before following it), then supply your client ' +
        '("claude" | "codex" | "gemini" | "copilot" | "generic") and the contentHash frontmatter ' +
        'line of each SKILL.md you already have, then install each returned installContent the ' +
        'way its installTargets entry says (write the file, and merge pointerBlock into ' +
        'pointerPath when there is one), and apply the `binding` the same response carries (the ' +
        'block in the instruction file your runtime always loads, plus the per-prompt hook for Claude ' +
        'Code): it is what keeps the repository bound to its Lyriks project for every later session ' +
        'and every user; then follow the relevant skill — ' +
        'lyriks-build to author a project end-to-end, lyriks-design before building or editing ' +
        'any screen, lyriks-behavior when creating features, lyriks-retrospec when ' +
        'reverse-engineering an EXISTING product or codebase into its spec, lyriks-delivery when ' +
        'the spec meets a tracker (turning features into tickets, and re-syncing once code lands), ' +
        'lyriks-evolution for ANY change to an existing product, whether to make it now or only to ' +
        'qualify it. ' + EVOLUTION_IS_THE_DOOR + ' The whole Evolution dossier is driven through ' +
        'get_evolution / apply_evolution_batch, and nothing it holds reaches a section before the freeze: ' +
        'a feature the change would add lives on the dossier as a DRAFT, and the reports are computed with ' +
        'that draft laid over the specification. ' +
        'THE CONVERSATION STAYS BOUND TO ITS PROJECT: once the user has asked for Lyriks on a product, ' +
        'named a Lyriks project, or the repository carries a Lyriks binding (installed lyriks-* skills, ' +
        'a .unspa.json index), EVERY later request in that conversation about that product goes through ' +
        'this MCP, without the user saying "Lyriks" again: the first request bound the whole conversation. ' +
        'A request that changes what the product does (a capability, a rule, a screen, a field, a state, ' +
        'a flow, a message) is an EVOLUTION REQUEST FIRST: open the dossier in the bound project, carry ' +
        'the change as a draft (add_draft_leaf), read the impact and the coherence, and let the crossing ' +
        'into Verify freeze the spec and write the sections; then write the code, then record where the ' +
        'code implements it (index entries carrying their signature line, sync_implementation_index; ' +
        'lyriks-delivery step 4). The section tools (apply_behavior_batch, patch_section, build_screen, ' +
        'wire_element) are what the dossier writes THROUGH and what a project still being authored for ' +
        'the first time uses directly, never a way round an open request. A request that asks ' +
        'how the product behaves, whether something is right, what is missing or what broke is a SPEC ' +
        'READ FIRST: get_behavior_feature, get_section, get_implementation_status, get_implementation_gaps, ' +
        'get_implementation_drift, simulate_experience or verify_experience before answering from the code ' +
        'or from memory. Only work with no user-visible effect (a refactor, a build or dependency fix, ' +
        'formatting) skips the spec, and you say so in one line. When a request contradicts the spec, say ' +
        'so and let the user decide; never code around the spec silently, and never let the code get ahead ' +
        'of the spec. ' +
        'INGESTING A CODEBASE: a one-line request such as "with the Lyriks MCP, ingest this entire ' +
        'codebase" is lyriks-retrospec end to end, nothing less: sync_skills, install, then follow ' +
        'the skill in full; the user owes you no other instruction. The target project is the one ' +
        'the user names (list_wizard_projects resolves a name or a project id); when none is named, ' +
        'it is the project whose card says sourceMode "code_to_spec" and still holds no features ' +
        '(the one created "From a codebase" in Lyriks); if several qualify ask which, if none ' +
        'create one with source_mode code_to_spec. Author everything into that project, never a ' +
        'second one, and never change its sourceMode. ' +
        'STARTING FROM SCRATCH: a one-line request such as "with the Lyriks MCP, specify the Lyriks ' +
        'project X from scratch, from the Jira backlog and the Notion pages reachable through their ' +
        'MCPs" is lyriks-build end to end, nothing less. Read those sources with the other MCP ' +
        'servers connected to this same client (Jira, Linear, Notion, Confluence, Figma) or as files ' +
        'of the repository (BMAD, Spec Kit), register every source you use in `documents` the moment ' +
        'it gives you something, and interview the user only for what no source can tell you. Same ' +
        'target rule: the project the sentence names, never a second one. ' +
        'A REGISTERED SOURCE STAYS REACHABLE by whoever reads the spec after you: its `url` is a web ' +
        'address anyone can open (the Notion page, the Jira issue, the Figma file, the GitHub file; the ' +
        'tool response you read it through carries it), never a file:// path, a local path or a plain ' +
        'reference, which open for nobody and come back as a coherenceIssues line on the write and a ' +
        'source-unreachable warning at the gate; a source with no address leaves `url` empty and carries ' +
        'what you used, verbatim, in `note`; a code file goes through attach_source so list_sources can ' +
        'read it back. ' +
        'CREATING FROM THE SENTENCE: when it says "create the Lyriks project X" (optionally "in the ' +
        'domain Y"), create it first with create_wizard_project (name X, the domain resolved by name ' +
        'through list_domains, source_mode code_to_spec for an ingestion, greenfield otherwise), unless ' +
        'an empty project of that name already exists, which you reuse; then author into it. ' +
        'The catalog sync_skills/list_skills returns is the AUTHORITY on what this install ' +
        'actually ships: a skill named here that the catalog does not carry is not published by ' +
        'this install (usually an out-of-date appliance); say so instead of retrying or guessing. ' +
        'Section keys are wire ids, not ' +
        'screen labels: call describe_section and quote its `uiLocation` when telling a user ' +
        'where something lives (e.g. `rules` is edited on Features, not on a "Rules" page). ' +
        'For end-to-end work, declare the `scope` section before authoring and keep its external ' +
        'capability inventory current. A section score, Experience coverage, simulation, or ' +
        'generation status NEVER proves whole-product completion: call assess_project_completeness, ' +
        'refresh with audit_project_scope, and only call finish_project when its report has no blockers. ' +
        'EVIDENCE-FIRST, FOR EVERY AGENT: authoring from memory is forbidden. Every value you write ' +
        '(a color token, a tab set, a nav label, a table column, an enum, a guard, a version, a count) ' +
        'must be traceable to a source actually read during the session: a repo file, a registered ' +
        'document, a tool response, or user-supplied material. Re-verify at the moment of writing, ' +
        'not from conversation memory. When specifying an existing product, its code and UI are the ' +
        'only authority and any transcribed screen must be a faithful copy of what the end user sees. ' +
        'If you did not read the source, leave the field empty and say why: empty beats invented. ' +
        'PRODUCT LANGUAGE, ALWAYS: Lyriks captures the PRODUCT, not its implementation. The code ' +
        'is evidence; the product is the subject. Outside the architecture section and provenance ' +
        'spans, every name and description is written in the words the product\'s USERS see and ' +
        'say, never in file, module, component, class or framework vocabulary. A feature is a user ' +
        'capability, never a code module; an entity is a business record named in the Glossary\'s ' +
        'words, never a table or type name. Litmus: a non-engineer who uses the product daily must ' +
        'recognize every name. When adopting a codebase, you are specifying the product it renders, ' +
        'not documenting the code. ' +
        'Rebuild screens top-down like nesting dolls (theme, shared chrome, screen skeletons, tabs, ' +
        'section cards, elements), never in random order, and make every pass content-complete. ' +
        'EXPERIENCE WRITES ARE PER SCREEN: once a project holds screens, never set_section the ' +
        'experience. build_screen builds or rebuilds ONE screen or component, patch_section, ' +
        'wire_element and add_element edit the rest (builder.theme, screens, journeys included). A ' +
        'whole-Experience replacement cannot be verified change by change and is refused by the ' +
        'safety controls of agent runtimes; if such a refusal ever appears, return to per-screen ' +
        'writes instead of narrating a workaround. ' +
        'On an existing codebase, validate the spec against the code with the adoption and ' +
        'implementation tools (record_element_spans, seed_implementation_index, ' +
        'get_implementation_gaps, get_implementation_drift) and proactively offer that validation ' +
        'when you judge it useful. ' +
        'THE MAPPING LAW, ONE CONCEPT (adopt, implement, trace): a spec↔code mapping is only real ' +
        'when the code itself is captured. Never record or report a bare {file, line}; the engine ' +
        'stamps evidence-less locations `unverified` and the dashboard shows them as claims, not ' +
        'verifications. Always go through the evidence flow: attach_source kind:"code" for every ' +
        'analyzed file, record_element_spans for every element, finalize_analysis, then ' +
        'seed_implementation_index + sync_implementation_index (spans carry the code, so evidence ' +
        'is automatic and every index entry gets a real `signature` line). If you must call ' +
        'report_implementation_status directly, every location carries the exact code as `snippet`. ' +
        'Leave zero unverified locations behind; if you cannot capture the code, say so instead of ' +
        'reporting the location.',
    },
  )
  // Sections live in the wizard app (source of truth). Forward
  // the caller's token so the wizard app's auth wall (LYRIKS_AUTH_REQUIRED=1) authorizes us.
  const lyriks = new LyriksClient(lyriksToken)

  // Every tool result passes through capResult — over ~24KB it auto-degrades to
  // a projection/shape + a hint, so no single call can blow the context budget.
  // A capped answer advises how to narrow it; only a tool listed in CAP_HINTS
  // has arguments to advise, so every other one gets the neutral default.
  const json = (result: unknown, tool?: HintedTool) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(capResult(result, { hint: tool && CAP_HINTS[tool] })) }],
  })

  // ── Authoring skills (self-install + self-update playbooks) ───────────────
  // Skill payloads must arrive VERBATIM to be installed, so sync_skills and
  // get_skill deliberately bypass capResult — a degraded projection would
  // silently corrupt a skill. Current skills are well under the cap anyway.
  const uncapped = (result: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  })

  mcp.tool(
    'list_skills',
    'Lists the authoring guides ("skills") that ship with this Lyriks install — the playbooks for building Lyriks projects THROUGH this MCP. Install and follow the relevant one BEFORE authoring: "lyriks-build" to author a project end-to-end (every section + the Experience prototype), "lyriks-design" before ANY screen building (build_screen/wire_element/add_element), "lyriks-behavior" when creating features (apply_behavior_batch depth), "lyriks-retrospec" to reverse-engineer an existing product or ingest a codebase, "lyriks-delivery" to turn a spec into tickets and re-sync the implementation index once code lands. The returned list is the AUTHORITY: a skill named in this description but absent from the response is not published by this install (usually an out-of-date appliance), and get_skill will 404 on it; report that instead of retrying. Returns { skills: [{ id, name, description, sizeBytes, contentHash }] }. To install or refresh, prefer sync_skills (one call reconciles everything); get_skill fetches a single one.',
    {},
    async () => json(await listSkillsHandler({}, lyriks)),
  )

  mcp.tool(
    'sync_skills',
    'Reconcile locally installed Lyriks authoring skills with this server. Works for ANY agent runtime, not just Claude. Set `client` to what you are ("claude" | "codex" | "gemini" | "copilot" | "generic") so the response carries your layout alone; omit it and every layout comes back for you to choose from. First read the `contentHash:` frontmatter line of each installed SKILL.md you have, under `.claude/skills/<id>/` or `.agents/skills/<id>/` (missing file or missing line = omit the hash). Pass them as `installed`; omit or send [] on a fresh machine — everything then comes back as "new". Response: { skills: [{ id, name, description, contentHash, status: "up-to-date"|"update"|"new", installPath, installTargets: [{ client, label, path, pointerPath?, pointerBlock? }], installContent? }], unknown: [ids] }. For each entry that carries `installContent`, take the `installTargets` item matching your runtime and: (1) write `installContent` VERBATIM to `path` (create directories as needed); (2) when the target also has `pointerPath`, merge `pointerBlock` into that file — replace the region between its `<!-- lyriks-skill:<id> -->` and `<!-- /lyriks-skill:<id> -->` markers if present, otherwise append the block, and change NOTHING else in that file (it belongs to the user). An entry is current only when status is "up-to-date". With include_content:false, new/update entries carry contentDeferred:true; fetch their complete content before installing or following them. Use skill_ids to synchronize only the guides relevant to the task. SIZE: one answer carries whole guides while they fit its content budget, and the ones past it come back with contentDeferred:true under `deferredForSize` (fetch each with get_skill, or call sync_skills again naming it in skill_ids); a guide is never cut in half, since an install writes it verbatim. Ids in `unknown` are not published by this server — leave those local skills alone. The response also carries `binding`: what keeps this repository bound to its Lyriks project in every later session, for every user. Take the `binding.targets` item matching your runtime and: (3) merge its `pointerBlock` into `pointerPath` (the instruction file you always load: CLAUDE.md, AGENTS.md, GEMINI.md or .github/copilot-instructions.md), replacing the region between `<!-- lyriks-binding -->` and `<!-- /lyriks-binding -->` if present, appending the block otherwise, touching nothing else; (4) when the target carries `hook` (Claude Code), write `hook.content` VERBATIM to `hook.path` and wire it: if `hook.settingsPath` does not exist write `hook.settingsContent` as is, otherwise add `hook.settingsEntry` under `hooks.UserPromptSubmit[0].hooks` unless a command naming `hook.path` is already there. Then, whatever your runtime: (5) when `binding.tools` is present (the top level of `binding`, the same list for every runtime; an older platform sends none), for each entry write `content` VERBATIM to `path` (create directories as needed), every one of them, side by side under `.lyriks/tools/`, since they import each other. They are plain Node helper scripts for this repository: syncing an index or applying a batch too large to type as a tool argument, and checking the index by signature text instead of by exact line; the `purpose` of each entry says what it does and how to run it. Pass `project_id` (the wizard project slug this repository is specified in) as soon as you know it, so the block names the project; a project created later gets one more sync_skills call with its id. Call this at the START of any session that will author Lyriks project data, before following a skill.',
    {
      skill_ids: z.array(z.string()).optional().describe('Only reconcile these guides; omit for all. Fetch other relevant guides when needed, never follow a partial guide.'),
      include_content: z.boolean().optional().describe('Set false for metadata-only discovery. contentDeferred entries must be fetched with get_skill before installation/use; default true.'),
      installed: z
        .array(z.object({
          id: z.string().describe('Locally installed skill id (the <id> directory name under .claude/skills or .agents/skills)'),
          content_hash: z.string().optional().describe('The `contentHash:` frontmatter value of the installed SKILL.md; omit when the file or the line is missing'),
        }))
        .optional()
        .describe('What is installed locally; omit or [] on a fresh machine'),
      client: z
        .enum(['claude', 'codex', 'gemini', 'copilot', 'generic'])
        .optional()
        .describe('Which agent runtime you are, so only your install layout comes back. Use "generic" when you are none of the named ones; omit to receive every layout'),
      project_id: z
        .string()
        .optional()
        .describe('The Lyriks wizard project this repository is specified in (the slug the section tools address), so the binding block names it. Pass it as soon as it is known; call sync_skills again with it once the project is created'),
    },
    async (args) => uncapped(await syncSkillsHandler(args, lyriks)),
  )

  mcp.tool(
    'get_skill',
    'Returns one authoring skill in full: the authored original in `content`, the INSTALL variant in `installContent` (same file with a `contentHash:` frontmatter line so the installed copy self-reports its version), and `installTargets` — one layout per agent runtime (Claude Code writes `.claude/skills/<id>/SKILL.md` and is done; Codex, Gemini, Copilot and any other agent write `.agents/skills/<id>/SKILL.md` and merge the target\'s `pointerBlock` into its `pointerPath`, e.g. AGENTS.md). Install by following the target matching your runtime, or follow the skill directly this session. Get ids from list_skills. Prefer sync_skills as the entry point — it diffs and returns everything stale or missing in one call.',
    {
      skill_id: z.string().describe('Skill id from list_skills, e.g. "lyriks-build"'),
    },
    async (args) => uncapped(await getSkillHandler(args, lyriks)),
  )

  // ── Project sections (lyriks source of truth) ─────────────────────────────────
  mcp.tool(
    'get_capabilities',
    'Read the canonical permission capability registry for this project. Each row carries capabilityId, capabilitySource and supported actions; copy these exact values into users.permissions. Includes features, journeys, screens, behavioral surfaces, system and off-structure capabilities. Paginated and read-only. A bare screen id is not a surface capability id.',
    {
      project_id: z.string().describe('Lyriks project id (list_wizard_projects, or create_wizard_project first): the registry is derived from ONE project, so it is required and there is nothing to read before a project exists'),
      source: z.enum(['system', 'feature', 'journey', 'surface', 'off_structure']).optional(),
      query: z.string().optional(),
      offset: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async args => json(await getCapabilitiesHandler(args, lyriks), 'get_capabilities'),
  )

  // Everything a user can do in the app's capabilities, over MCP. Writes hit the wizard app's
  // per-section PUT (with sync side-effects); reads hit the wizard app's section read.
  mcp.tool(
    'list_wizard_projects',
    'Lists the Lyriks wizard portfolio (domains + projects) so you can find the projectId to target with the section tools. These are Lyriks project ids (e.g. "bigledger"), distinct from the project UUIDs used by list_projects. Each card carries `sourceMode` (where the project started: `code_to_spec` = created "From a codebase", the target of a codebase ingestion; `greenfield` = from scratch) and `backProjectId` when Enterprise links it to a portfolio record (the UUID-addressed tools accept the wizard slug directly too).',
    {
      query: z.string().optional().describe('Case-insensitive project name or id substring'),
      workspace_id: z.string().optional().describe('Filter cards by owning workspace'),
      limit: z.number().int().min(1).max(50).optional().describe('Projects per page (default 20)'),
      offset: z.number().int().min(0).optional().describe('Continue from nextOffset in the previous response'),
      summary: z.boolean().optional().describe('Return the portfolio shape instead of project cards'),
      paths: z.array(z.string()).optional().describe('Exact dotted subtrees of the original portfolio, e.g. portfolio.unassigned.0'),
    },
    // Best-effort: the overlay stamps each card with what it knows about it.
    async (args) => {
      const portfolio = await listWizardProjectsHandler({}, lyriks)
      return json(readPortfolio(ee ? await ee.portfolio.annotateWizardPortfolio(portfolio) : portfolio, args), 'list_wizard_projects')
    },
  )

  mcp.tool(
    'create_wizard_project',
    'Creates a lyriks WIZARD project you can immediately drive with set_section / build_screen / apply_behavior_batch. Use THIS (not create_project) to start a new project through the MCP: create_project mints a back UUID with no linked Lyriks wizard draft, so section writes 404 under the enterprise auth guard. Runs lyriks\'s real CreateProject use-case (owned + workspace-scoped, so you keep access) and returns `{ projectId, workspaceId }` — `projectId` is the slug the section tools address. `workspace_id` names the owning team; required only when you belong to more than one (list_workspaces).',
    {
      name: z.string().describe('Product / project name'),
      description: z.string().optional().describe('One-line brief, stored as the Foundation brief'),
      workspace_id: z.string().optional().describe('Owning workspace UUID (from list_workspaces) — required when the caller belongs to >1 workspace'),
      domain_id: z.string().optional().describe('Optional domain id to file the project under'),
      stage: z.string().optional().describe('Optional starting portfolio stage (defaults server-side)'),
      source_mode: z
        .enum(['greenfield', 'from_document', 'code_to_spec', 'from_figma', 'ma_dd_audit'])
        .optional()
        .describe('Where the project starts, shown on its card as sourceMode: code_to_spec when you are about to ingest a codebase into it, greenfield (the default) from scratch'),
    },
    async (args) => json(await createWizardProjectHandler(args, lyriks)),
  )

  mcp.tool(
    'update_wizard_project',
    'Updates the real Lyriks wizard project shown in the portfolio and project UI — name, description, domain and/or delivery stage. Use this for a project id returned by list_wizard_projects. This is distinct from update_project, which updates only a bare/back project record.',
    {
      project_id: z.string().describe('Lyriks project id (from list_wizard_projects)'),
      name: z.string().optional().describe('New user-facing project name'),
      description: z.string().optional().describe('New project brief / description'),
      domain_id: z.string().nullable().optional().describe('Portfolio domain id, or null to unassign'),
      stage: z
        .enum(['ideation', 'spec_in_progress', 'mvp_in_progress', 'v1_shipped', 'v2_in_progress'])
        .optional()
        .describe('Portfolio delivery stage'),
    },
    async (args) =>
      json(await withWriteLock(`${args.project_id}:portfolio`, () => updateWizardProjectHandler(args, lyriks))),
  )

  mcp.tool(
    'delete_wizard_project',
    'Permanently deletes the real Lyriks wizard project and all of its traces. The exact current project name is required as confirmation, and authenticated installs also enforce project ownership. Prefer updating or archiving scope unless deletion is explicitly requested.',
    {
      project_id: z.string().describe('Lyriks project id (from list_wizard_projects)'),
      confirm_name: z.string().describe('Exact current project name, typed as destructive-action confirmation'),
    },
    async (args) =>
      json(await withWriteLock(`${args.project_id}:portfolio`, () => deleteWizardProjectHandler(args, lyriks))),
  )

  mcp.tool(
    'list_domains',
    'Lists the lyriks portfolio domains visible to the caller. Use these ids with create_wizard_project or update_wizard_project.',
    {},
    async () => json(await listDomainsHandler({}, lyriks)),
  )

  mcp.tool(
    'create_domain',
    'Creates a lyriks portfolio domain for grouping wizard projects.',
    {
      name: z.string().describe('Domain name'),
      description: z.string().optional().describe('Domain description'),
      icon: z.string().optional().describe('Bundled lucide icon id, e.g. lucide:building-2'),
    },
    async (args) => json(await createDomainHandler(args, lyriks)),
  )

  mcp.tool(
    'update_domain',
    'Updates a visible lyriks portfolio domain.',
    {
      domain_id: z.string().describe('Domain id from list_domains'),
      name: z.string().optional().describe('New domain name'),
      description: z.string().optional().describe('New domain description'),
      icon: z.string().optional().describe('Bundled lucide icon id'),
    },
    async (args) => json(await updateDomainHandler(args, lyriks)),
  )

  mcp.tool(
    'delete_domain',
    'Deletes an empty lyriks portfolio domain. The server refuses while projects still belong to it.',
    { domain_id: z.string().describe('Domain id from list_domains') },
    async (args) => json(await deleteDomainHandler(args, lyriks)),
  )

  mcp.tool(
    'get_section',
    'Reads one section of a project. AVOID the full read for big sections (experience/data/coherence can be 100KB+ — the builder node tree, generated artifacts): pass `summary:true` for a tiny two-level shape (keys + array/object sizes), or `paths` to fetch only specific dotted sub-trees (e.g. ["designSystem","journeys","builder.screenRoots"]). The full document stays in the MCP server; only the requested slice is returned. Omit both for the whole draft (back-compat).',
    {
      project_id: z.string().describe('Lyriks project id (from list_wizard_projects)'),
      section: z.enum(READABLE_SECTIONS).describe('Section to read — a WIRE id, not a screen label; describe_section reports where each one is edited. `evolution` reads the raw dossiers; get_evolution is the one that carries their derived readings'),
      summary: z.boolean().optional().describe('Return a tiny shape summary (keys + sizes) instead of the full draft — start here to discover what to drill into'),
      paths: z.array(z.string()).optional().describe('Return only these dotted sub-trees, e.g. ["designSystem","journeys","builder.screenRoots"]. Keeps huge sub-trees (builder.nodes) out unless explicitly requested'),
    },
    async (args) => json(await getSectionHandler(args, lyriks), 'get_section'),
  )

  mcp.tool(
    'describe_section',
    'Schema of a section so you can author it WITHOUT reading the doc or source: the empty-draft shape (every field + default), a sample item per collection (so array-item fields are visible), the allowed enum codes per field, `uiLocation` (the capability + tab where a user edits it), and authoring notes (id conventions, which write tool to use). Call this before set_section/patch_section/build_screen on an unfamiliar section — and read `uiLocation` before naming the section to a user, since several keys are legacy wire ids that match no on-screen label.',
    {
      section: z.enum(READABLE_SECTIONS).describe('Section to describe, `evolution` included (it is read with get_evolution and written with apply_evolution_batch, never with set_section)'),
    },
    async (args) => json(await describeSectionHandler(args, lyriks)),
  )

  mcp.tool(
    'get_implementation_context',
    'A distilled, high-signal brief of ONE screen for a coder/AI implementing it — NOT raw JSON. Returns markdown: the layout as an indented outline (element kinds + labels + wiring like "→ navigate", "binds state:x", input type, variant — uuids and empty wiring omitted), the journeys/steps that reach the screen, the data entities/fields and events those steps touch, and the design tokens to honor. Use this instead of get_section(experience) when the goal is to build/understand a screen.',
    {
      project_id: z.string().describe('Lyriks project id'),
      screen_id: z.string().describe('LibraryScreen id to brief'),
    },
    async (args) => json(await getImplementationContextHandler(args, lyriks)),
  )

  mcp.tool(
    'get_knowledge_graph',
    'Query a project\'s central knowledge graph — every bounded context (roles, features, journeys, screens, entities, rules, architecture…) plus the unspa behavior model folded into ONE typed node/edge graph (what the in-app graph explorer shows). Read-only derived view; author through the section/behavior tools, not here. DRILL-DOWN FLOW: call with only project_id first — you get whole-graph stats (node/edge counts by context and kind) plus the best-connected hub nodes; then narrow with `contexts`/`kinds` filters or a `q` label search, and expand around one node with `focus_node` (+`depth`) — pass a node id ("kind:rawId"), a bare raw id, or a node label; the response\'s `focusNodeId` reports the node it landed on (an ambiguous label lands on the best-connected match; null = unknown reference, fall back to `q`). The expansion is undirected unless you pass `direction`: "in" keeps what points AT the focus node (what contains, reads, writes, tests or triggers it), "out" what the node points at (what it contains, reads, writes, emits), "both" is the default. Filters and focus combine (intersection). The graph is deduplicated: each concept is ONE node (a screen/feature/entity carries both its wizard facts and its unspa behavior edges — writes/reads/emits/transitions), so follow edges instead of hunting for behavior twins. `limit` caps returned nodes keeping the best-connected; the response flags `truncated` + `matchedNodeCount` so you know to narrow. Contexts: project, foundation, users, features, experience, data, rules, architecture, coherence, behavior, engine. `source`: "merged" (default — wizard projection + behavior, + DPO verdict in Enterprise), "local" (wizard projection alone), "engine" (raw formal-engine substrate, Enterprise-only — errors otherwise). TWO RECIPES over the behavior model, whose actions, states, rules, invariants (kind "rule"), scenarios and events are nodes. `q` reads a node\'s label, detail and id only: a feature by its name or the first 140 characters of its description, a surface by its name, an action by its name or intent, a rule by its description, an invariant by its name, a scenario or an event by its name or description, a state by its path or description. Acceptance criteria are not in the graph. (1) FIND THE FEATURE THAT OWNS A WORD: q:"<word>" lists the nodes that carry it. A rule or scenario hit names its feature in its id ("rule:beh:<featureId>:<ruleId>", "scenario:beh:<featureId>:<scenarioId>"). For a surface, an action or a state a surface declares, call again with focus_node:"<hit id>", depth:2, kinds:["feature"], direction:"in": the feature that contains it comes back (feature contains surface, surface contains action and state). Walking "in" only, a feature that merely declares an event the action EMITS stays out (without direction it comes back beside the owner); one that declares an event TRIGGERING the action still does. (2) WHO READS OR WRITES A STATE PATH: focus_node:"state:<dotted.path>", depth:1, direction:"in". A path is ONE node for the whole project, so its neighbors span every feature that touches it, and each edge kind says how: `writes` from an action (an effect on that path, an operation result, a parameter bound to it), `reads` from an action that requires it or from a rule or invariant whose condition names it (depth:2 adds the action or surface holding that rule), `tests` from a scenario that sets or asserts it, `contains` from each surface that declares it. Every behavior edge of a state node points AT it, so direction:"in" loses nothing at depth:1, and at depth:2 it keeps to the holders (the action or surface of a rule, the surface and the scenarios of an action) where an undirected walk also returns every other state and event those actions touch. Blind spot: a path read only inside an effect\'s value expression, a derived-state formula, a rule\'s own effect or a feature-level invariant has no edge, so an empty answer there is not proof that nothing reads it.',
    {
      project_id: z.string().describe('Lyriks project id (from list_wizard_projects)'),
      source: z.enum(['merged', 'local', 'engine']).optional().describe('Graph source (default "merged"); "engine" is Enterprise-only'),
      contexts: z.array(z.string()).optional().describe('Keep only nodes from these bounded contexts, e.g. ["behavior","data"]'),
      kinds: z.array(z.string()).optional().describe('Keep only these node kinds, e.g. ["feature","entity","screen","action"]'),
      q: z.string().optional().describe('Case-insensitive substring match on node label / detail / id'),
      focus_node: z.string().optional().describe('Expand the neighborhood around one node — a node id ("kind:rawId"), a bare raw id, or a label; check `focusNodeId` in the response for where it landed'),
      depth: z.number().int().positive().optional().describe('Neighborhood radius in hops (default 1, with focus_node); undirected unless `direction` is given'),
      direction: z.enum(['in', 'out', 'both']).optional().describe('With focus_node, which way the expansion follows edges: "in" keeps what points AT the node (what contains, reads, writes, tests or triggers it), "out" what the node points at, "both" (default) the undirected neighborhood'),
      limit: z.number().int().positive().optional().describe('Max nodes returned (best-connected win); also sizes the bare-call overview'),
    },
    async (args) => json(await getKnowledgeGraphHandler(args, lyriks), 'get_knowledge_graph'),
  )

  mcp.tool(
    'set_section',
    'Writes one section\'s full draft for a project — everything a user can do in the capability that owns it. FULL REPLACE: any sub-tree you omit is DROPPED (e.g. `collections` seeded by import_data_collections, or `builder.nodes`) — for targeted edits prefer patch_section, which preserves everything you don\'t touch. When existing non-empty top-level sub-trees are absent from your document, the write still lands but returns `warnings` naming what was dropped. Pass the complete section document (get_section first, modify, then set); a document shaped {__ops:[...]} is treated as a patch_section call. On `experience`, once the project holds screens, NEVER full-replace: build_screen builds or rebuilds ONE screen, patch_section / wire_element / add_element edit the rest; a whole-Experience replacement is unverifiable and is blocked by the safety controls of agent runtimes, a refusal you should never have to work around. projectId is stamped automatically. The write runs lyriks\'s real save use-case + sync side-effects, so it shows in the UI. The answer carries `writeGuard`: "revision-checked" when the write went out under the revision read just before it, "unavailable" on an older platform whose read carries no revision (the write was then NOT protected against concurrent edits, and any `revision` in the answer is the one after the write).',
    {
      project_id: z.string().describe('Lyriks project id'),
      section: z.enum(SECTIONS).describe('Section to write — a WIRE id, not a screen label; describe_section reports where each one is edited'),
      document: z.record(z.unknown()).describe('The full section draft document (validated server-side by the wizard app)'),
      expected_revision: z.number().int().min(0).optional().describe('Revision returned by get_section; a concurrent edit is rejected instead of overwritten.'),
    },
    async (args) => json(await withWriteLock(`${args.project_id}:${args.section}`, () => setSectionHandler(args, lyriks))),
  )

  mcp.tool(
    'patch_section',
    'Targeted edit of a section without resending the whole document: ideal when a section carries large sub-trees (e.g. the Experience builder) you must not retransmit. The MCP server reads the current draft, applies your operations in order, and writes it back through lyriks\'s real save use-case (same sync side-effects as set_section). Operations: {op:"set", path, value} assigns a dotted path, whose segments may be object keys OR array indices (e.g. "activeTab", "designSystem.colors.primary", "builder.collections.7.fields.5.options"); {op:"merge", collection, id, value, insert?} shallow-merges value into the id-keyed array item (journeys/steps/screens/components/elements/templates), or appends it when insert=true and no match; for KEYLESS rows (no id field, e.g. users "permissions") address with match:{field:value,...} instead of id; insert-via-match appends value verbatim with no id injected; {op:"append", collection, value, id?} ADDS one row at the end with NO selector at all, which is the op to reach for whenever the row does not exist yet (merge edits a row that must already be there): pass `id` to stamp one on the new row, leave it out for a keyless collection, and the array is created when the section has none yet; it is idempotent, so an id already present (or a row already held verbatim) reports `unchanged` instead of a duplicate, and you never count existing rows to set an index; {op:"remove", collection, id|match} deletes that array item, or {op:"remove", path} deletes a key at a dotted path (e.g. an object-map entry like "builder.nodes.<id>" or "builder.screenRoots.<id>"). `collection` also accepts a dotted path to a nested array (e.g. "builder.collections"). Together these give full create/update/delete over any section. INCREMENTAL ops add to a list or a text WITHOUT resending the whole value and without erasing what a concurrent writer added to it; prefer them over set/merge whenever you add to something that already exists: {op:"add_to_set", path, value} appends a scalar to the array at path unless it is already there (the array is created when absent), e.g. one more source id in a `sourceIds` list; {op:"remove_from_set", path, value} removes every occurrence; {op:"append_text", path, value, separator?} appends separator (default a blank line) then value to the string at path unless the text already contains value, e.g. one more paragraph in a long description; {op:"replace_text", path, find, value} replaces find by value when find occurs EXACTLY once (zero or several occurrences: the op does not apply and `notApplied` says which, so extend find until it is unique). For these four, `path` may be combined with collection + id|match: it is then read INSIDE that row (e.g. collection:"features", id:"feat-1", path:"sourceIds"), which addresses the row by id rather than by an index another writer can shift. They are idempotent, so a retry cannot duplicate: an op that finds its work already done counts as applied and is listed under `unchanged`, and a retried replace_text either lands there too (its value extends find) or reports that find now occurs 0 times. THE ANSWER: opsApplied/opsTotal, `changed` (the targets of the ops that changed the draft), `unchanged` (found their target, nothing left to change), `notApplied` (each op that found no target, with the reason), and `writeGuard`: "revision-checked" when the write went out under the revision read just before it, "unavailable" on an older platform whose read carries no revision (the write was then NOT protected against concurrent edits, and any `revision` in the answer is the one after the write). With dry_run:true on a platform that has no validation route, the answer says dryRunUnavailable:true with the local match counts, and nothing is saved.',
    {
      project_id: z.string().describe('Lyriks project id'),
      section: z.enum(SECTIONS).describe('Section to patch — a WIRE id, not a screen label; describe_section reports where each one is edited'),
      expected_revision: z.number().int().min(0).optional().describe('Use baseRevision from a preview to reject intervening section changes.'),
      dry_run: z.boolean().optional().describe('Preview on a temporary copy and run existing platform authoring guards without saving; default false. Reports unmatched operations. This is not a reserved or atomic multi-section transaction.'),
      operations: z.array(z.object({
        op: z.enum(['set', 'merge', 'append', 'remove', ...INCREMENTAL_OPS]).describe('"set" a dotted path · "merge" into an id- or match-keyed array item · "append" one new row at the end of a collection (no selector) · "remove" an array item or a path · "add_to_set" / "remove_from_set" one scalar of an array · "append_text" / "replace_text" inside a string (append and the four incremental ops are idempotent)'),
        path: z.string().optional().describe('set/remove and the incremental ops: dotted path (keys and/or array indices), e.g. "designSystem.radiusPx" or "builder.nodes.<id>"; with an incremental op plus collection, the path INSIDE the selected row, e.g. "sourceIds"'),
        collection: z.string().optional().describe('merge/append/remove, optional on the incremental ops: array name, top-level or dotted path, e.g. "journeys", "builder.collections"'),
        id: z.string().optional().describe('With collection: id of the array item (id-keyed collections); on append, the id to STAMP on the new row, omitted for a keyless collection'),
        match: z.record(z.unknown()).optional().describe('With collection: field-equality selector for KEYLESS rows (no id field), e.g. {"roleId":"admin","capabilityId":"cap-x"}'),
        insert: z.boolean().optional().describe('merge: append a new item when none matches (id is stamped only when addressing by id)'),
        value: z.unknown().optional().describe('Required for set/merge/append and the incremental ops (an object for merge/append, a scalar for add_to_set/remove_from_set, a string for append_text/replace_text); omitted for remove'),
        find: z.string().optional().describe('replace_text: the exact text to replace; it must occur exactly once at path'),
        separator: z.string().optional().describe('append_text: what goes between the current text and value (default a blank line)'),
      })).min(1).max(1000).describe('Ordered list of targeted edits; the complete operation shape is validated before applying any edit'),
    },
    async (args) => json(await withWriteLock(`${args.project_id}:${args.section}`, () => patchSectionHandler(args, lyriks))),
  )

  mcp.tool(
    'build_screen',
    'Author a complete Experience-Builder screen layout in one call from a compact nested spec — instead of many low-level builder.nodes set-ops. The server materialises the spec into builder nodes (groups + elements, childIds, screenRoots) for the target surface, REPLACING any previous layout for it, and writes through lyriks (same sync as set_section). The target must already exist — a screen (create via patch_section screens insert:true) OR a reusable component (patch_section components insert:true); build a component\'s tree here once, then reference it from any group via componentId. The `layout` is the root group: { label?, direction?:"row"|"col", justify?, align?, gap?, padding?, wrap?, card?:true (render the group as a surface card — background+border+shadow, so you get real containers without a follow-up patch), maxWidth?:"sm"|"md"|"lg"|"xl" (cap AND centre the column — use for a chat thread, form, or marketing column; "none"=full width), presentation?:"inline"|"overlay"|"tabs"|"sidebar"|"menu" (overlay=modal shown while visibleWhen holds; tabs=child groups become panels; sidebar=SAME child-groups-are-panels contract rendered as an aside navigation menu with the active item highlighted; prefer sidebar over tabs wherever a real product would use an aside nav panel: settings areas, admin consoles, multi-section detail pages; menu=anchored DROPDOWN sharing the overlay visibleWhen contract, no scrim, right-aligned at its slot (appearance.align:"start" opens rightward), dismissed by clicking outside or picking an item, so a header-right user menu is: avatar button with on:[{toggle:"menu.open"}] followed by a group {presentation:"menu",visibleWhen:{path:"menu.open"},children:[...]}), tabsKey?:"<statePath>" (tabs+sidebar: active panel index), componentId?:"<componentId>" (render that component\'s tree here), visibleWhen?:{path,op?,value?} (group-level — opens/closes an overlay), children:[...] }. A child is a group (has `children`) or an element { el:"heading"|"text"|"input"|"textarea"|"select"|"checkbox"|"button"|"link"|"list"|"form"|"container"|"image"|"status"|"icon"|"meter", label? (for el:"icon" the label IS the bundled lucide icon name, e.g. "zap" — unknown names render a placeholder dot; for el:"meter" the label is the value 0-100 and interpolates run state, e.g. "{usage.pct}"), variant?(button emphasis; for el:"status" one of "loading"|"empty"|"error"|"success"; for el:"text" "pill" renders an accent-tinted badge/chip (appearance.background/color override the tint); for el:"meter" "ring" renders a circular gauge instead of a bar; ANY element given click behavior via nav/on/bind, a pill badge or icon included, is a live hover-highlighted click target in Run mode, so put actions directly on badges and tiles instead of adding a redundant button), inputType?, bind?:{kind,ref} (for el:"list", bind:{kind:"entity",ref:"<CollectionName>"} makes the list ITERATE that simulator collection — rows render the collection\'s first two fields, or attach componentId for a full row template; text labels also interpolate {#Collection} = row count and {Collection.field} / {Collection.N.field}), nav?:"<targetScreenId>" (shorthand click→navigate), setState?:["<path>","<value>"] (shorthand click→set state), gate?:{personaIds:["<roleId>"],mode?:"visible"|"enabled",allow?:true} (per-role authorization — persona runs hide/disable the element for excluded roles from the users section), validations?:[{kind:"required"|"email"|"min"|"max"|"pattern",param?,message?}] (input validation — the full catalog), on?:[{trigger?:"click"|"hover"|"change"|"submit" (default "change" for inputs, else "click"), navigate?|setState?:["<path>","<value>"]|toggle?:"<path>"|increment?:"<path>",by?|createRecord?:"<Collection>",fieldMap?:{"<field name>":"<input label>"} (append a fake-backend row: fields whose name matches a same-surface input label — or whose fieldMap entry names one — take that input\'s value, the rest get seeded data, then the form clears; put it on the surface holding the matching inputs. A createRecord that captures NO inputs is reported in simulate_experience `warnings`)|navigateBack?:true|print?:{path,value} (append a line to a log state path)|call?:{label,endpoint?,latencyMs?,loadingPath?,outcome?:"success"|"error",resultPath?,resultValue?,errorPath?} (simulated async op: in Run mode loadingPath goes truthy then after latency resolves — success sets resultPath=resultValue, error sets errorPath; gate a "status" element on loadingPath/errorPath for a spinner/error), when?:{path,op?:"truthy"|"falsy"|"eq"|"neq",value?} (GUARD — the effect fires only while this state condition holds; two transitions on one trigger with complementary guards model if/else branching)}] (explicit triggers+effects — inputs drive state on type/Enter), requireValid?:true (button/link: block the click while its screen has invalid inputs — a submit gate), visibleWhen?:{path,op?:"truthy"|"falsy"|"eq"|"neq",value?} (run-mode: show only while a state condition holds), appearance?:{background,color,borderColor,borderWidth,radius,maxWidth (px cap — needed to size an image/thumbnail in a row),paddingX,paddingY,fontSize,fontWeight,textAlign,align,width,shadow,opacity} (a colored chip/tile in one call), media?:{src,alt,fit:"cover"|"contain"|"fill",aspectRatio} OR src?/alt? shorthand (for el:"image" — a data: URI keeps the appliance air-gapped), componentId?:"<componentId>" (for el:"list" — a component used as the per-row template; labels resolve {Field} from each record), filterStatePath?:"<statePath>" (for el:"list" — live search: shows only rows matching the value an input wrote to this path), rowLayout?:"stack"|"grid"|"cards" + rowColumns?:1-4 (for el:"list" — how the row template repeats; use cards/grid for pricing tiers, app catalogs and tile dashboards instead of hand-duplicating one card per record — it wraps responsively), options?:["A","B"] / optionsFrom?:{collection,field,filterField?,filterPath?} (for el:"select" — a fixed list, or choices read LIVE from a collection field, optionally narrowed by another field matching a state value = dependent picker, e.g. only the connections of the chosen app) }. PER-ROW INTERACTIVITY: author the row-template component once — every element inside it acts on the row it is rendered in. Use on:[{trigger:"click",selectRecord:"<statePrefix>"}] to publish the clicked record to state (readable anywhere as {prefix.field}, plus {prefix} = the row id), and any setState/print `value` may interpolate {Field} from that row; a checkbox/input inside a row template keeps a separate value per row. Prove it with simulate_experience actions carrying rowIndex:<N>. el:"textarea" is multi-line text and el:"checkbox" a boolean (so truthy/falsy guards read it); both validate and fire change-triggers like an input. NOTE el:"container" is an inert dashed PLACEHOLDER — it does NOT interpolate {Field} or honor appearance.background; use el:"text" for a bound or colored chip. An element with both `el` and `children` is rejected (an element can\'t hold children). Duplicate labels among clickable elements are returned as `warnings` (they break label-based targeting). For data-true list/form rows, call import_data_collections first so collections match the real entities from the data section. Mirrors the wizard Flow + Gate tabs.',
    {
      project_id: z.string().describe('Lyriks project id'),
      screen_id: z.string().describe('Existing LibraryScreen id to build the layout for'),
      layout: z.record(z.unknown()).describe('Root group spec (see tool description for the node shape)'),
    },
    async (args) => json(await withWriteLock(`${args.project_id}:experience`, () => buildScreenHandler(args, lyriks))),
  )

  mcp.tool(
    'wire_element',
    'Edit ONE already-built Experience-Builder element by id, WITHOUT rebuilding its screen — the targeted counterpart to build_screen (which replaces a whole surface). It cannot CREATE a node: to append a new element/link to an existing layout use add_element. Use it to add a required/format validation to an input, wire a transition on a button (navigate|setState|toggle|increment|createRecord|navigateBack|print|call), gate an element with visibleWhen, set a submit gate (requireValid), style it (appearance), give an image real content (media), set/clear a binding, or rename it. Full effect + field parity with build_screen, so you never need a raw builder.nodes patch or a full rebuild for a one-element change. Get `node_id` from build_screen\'s `nodes` output or get_section builder.nodes. Only the fields you pass change; `on` transitions are appended unless `replaceTransitions:true`. Writes through lyriks (same sync as build_screen); re-run simulate_experience to confirm.',
    {
      project_id: z.string().describe('Lyriks project id'),
      node_id: z.string().describe('Builder node id to edit (from build_screen `nodes` output or get_section builder.nodes)'),
      label: z.string().optional().describe('Rename the element or group'),
      bind: z
        .object({ kind: z.string(), ref: z.string().optional() })
        .nullable()
        .optional()
        .describe('Set the element binding { kind:"action"|"state"|"event"|"surface"|"entity", ref }; null clears it'),
      visibleWhen: z
        .object({ path: z.string(), op: z.enum(['truthy', 'falsy', 'eq', 'neq']).optional(), value: z.unknown().optional() })
        .nullable()
        .optional()
        .describe('Run-mode: show only while this state condition holds; null clears it (works on elements and group overlays)'),
      gate: z
        .object({
          personaIds: z.array(z.string()).describe('Role ids from the users section (Users & Permissions) the gate applies to'),
          mode: z.enum(['visible', 'enabled']).optional().describe('"visible" hides the element (default), "enabled" only disables it'),
          allow: z.boolean().optional().describe('true (default) = only the listed roles see/use it; false = everyone EXCEPT them'),
        })
        .nullable()
        .optional()
        .describe('Per-role authorization: show/enable this element only for the listed role ids (persona runs enforce it; author runs bypass). Satisfies the verifier\'s "Role gates no element" gap. null clears the gate'),
      validations: z
        .array(z.object({
          kind: z.enum(['required', 'email', 'min', 'max', 'pattern']).describe('The full catalog — anything else would be stored as "required"'),
          param: z.union([z.string(), z.number()]).optional().describe('min/max: the length; pattern: the regex source (stored as a string)'),
          message: z.string().optional(),
        }))
        .optional()
        .describe('Replace an input\'s validations, e.g. [{kind:"required"},{kind:"min",param:3,message:"Too short"}]. Failing inputs raise run errors and block sibling requireValid buttons'),
      on: z
        .array(
          z.object({
            trigger: z.enum(['click', 'hover', 'change', 'submit']).optional(),
            navigate: z.string().optional(),
            // An array, not z.tuple: a tuple serializes as draft-07 array-form `items`,
            // which the Anthropic API rejects, and Claude clients then drop the whole tool.
            setState: z.array(z.unknown()).length(2).optional().describe('[statePath, value]: set this state path to the value'),
            toggle: z.string().optional(),
            increment: z.string().optional(),
            by: z.unknown().optional(),
            createRecord: z.string().optional().describe('Append a fake-backend row to this collection (by name)'),
            selectRecord: z
              .string()
              .optional()
              .describe('State path PREFIX to publish the clicked list row under (<prefix>.<field> for every field, <prefix> = the row id). Only meaningful on an element inside a list row template'),
            navigateBack: z.boolean().optional().describe('Return to the previous screen'),
            print: z
              .union([z.string(), z.object({ path: z.string(), value: z.string().optional() })])
              .optional()
              .describe('Append a line to a log state path'),
            call: z
              .object({
                label: z.string().optional(),
                endpoint: z.string().optional(),
                latencyMs: z.number().optional(),
                loadingPath: z.string().optional(),
                outcome: z.enum(['success', 'error']).optional(),
                resultPath: z.string().optional(),
                resultValue: z.unknown().optional(),
                errorPath: z.string().optional(),
              })
              .optional()
              .describe('Simulated async op (loadingPath → truthy, then resolves)'),
            when: z.object({ path: z.string(), op: z.string().optional(), value: z.unknown().optional() }).optional(),
          }),
        )
        .optional()
        .describe(
          'Transitions to add (trigger + one effect: navigate|setState|toggle|increment|createRecord|selectRecord|navigateBack|print|call, optional `when` guard). Inside a list row template a setState/print `value` may interpolate {Field} from the clicked row',
        ),
      replaceTransitions: z.boolean().optional().describe('Replace the element\'s transitions instead of appending (default: append)'),
      requireValid: z
        .boolean()
        .optional()
        .describe('Button/link: block the click while its screen has invalid inputs (submit gate)'),
      appearance: z
        .record(z.unknown())
        .nullable()
        .optional()
        .describe(
          'Per-element visual overrides {background,color,borderColor,borderWidth,radius,maxWidth(px — sizes an image/thumbnail),paddingX,paddingY,fontSize,fontWeight,textAlign,align,width,shadow,opacity}; null clears',
        ),
      media: z
        .object({
          src: z.string(),
          alt: z.string().optional(),
          fit: z.enum(['cover', 'contain', 'fill']).optional(),
          aspectRatio: z.string().optional(),
        })
        .nullable()
        .optional()
        .describe('Image content for an el:"image" — src (data: URI keeps it air-gapped), alt, fit, aspectRatio; null clears'),
      rowLayout: z
        .enum(['stack', 'grid', 'cards'])
        .optional()
        .describe('el:"list" — how the row template repeats: "stack" (default full-width rows), "grid", or "cards" (boxed, wrapping). Use cards for pricing tiers / app catalogs instead of hand-duplicating one card per record'),
      rowColumns: z.number().int().min(1).max(4).optional().describe('el:"list" — columns for grid/cards on a wide viewport (1-4, default 3); always wraps down responsively'),
      options: z
        .array(z.string())
        .nullable()
        .optional()
        .describe('el:"select" — the authored choices; null/[] clears them'),
      optionsFrom: z
        .object({
          collection: z.string().describe('Simulator collection name'),
          field: z.string().describe('Field whose values become the options'),
          filterField: z.string().optional().describe('Only offer rows whose this field equals the live value at filterPath'),
          filterPath: z.string().optional().describe('State path the filterField is compared against (dependent picker)'),
        })
        .nullable()
        .optional()
        .describe('el:"select" — read the choices LIVE from a collection field, optionally narrowed by another field matching a state value (e.g. only the connections of the chosen app); null clears'),
    },
    async (args) => json(await withWriteLock(`${args.project_id}:experience`, () => wireElementHandler(args, lyriks))),
  )

  mcp.tool(
    'add_element',
    'Add ONE element (or a small group subtree) to an EXISTING screen layout — the way to grow a built screen without a full rebuild. build_screen REPLACES a surface\'s whole layout and wire_element edits an existing node but cannot create one; add_element materialises a single build_screen element spec (same shape: { el, label?, variant?, inputType?, bind?, nav?, setState?, on?, requireValid?, visibleWhen?, gate?, validations?, appearance?, media?/src?, componentId?, filterStatePath?, rowLayout?, rowColumns?, options?, optionsFrom? } — or a group with `children`), hooks it into a parent group\'s childIds at an optional position, and writes through lyriks (same sync as build_screen). Defaults: parent = the screen\'s root group, position = append. Returns the created node id(s) + parentId, so you can immediately wire_element or simulate_experience against them. The screen must already have a layout (build_screen first).',
    {
      project_id: z.string().describe('Lyriks project id'),
      screen_id: z.string().describe('Existing LibraryScreen (or component) id whose layout to extend'),
      parent_id: z
        .string()
        .optional()
        .describe('Group node id to insert under (from build_screen `nodes` output or get_section builder.nodes); default = the screen\'s root group'),
      element: z
        .record(z.unknown())
        .describe('One build_screen element spec (see tool description) — or a group spec with `children`'),
      position: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Index in the parent\'s childIds to insert at (clamped); default = append'),
    },
    async (args) => json(await withWriteLock(`${args.project_id}:experience`, () => addElementHandler(args, lyriks))),
  )

  mcp.tool(
    'get_project_elaboration',
    'Read prioritized project-elaboration questions and next actions, with exact source paths and dependency blockers. Covers recorded brief/outcomes, scope decisions, acceptance criteria and feature work; recommendations are PROPOSALS, never user approval. Fast structural reading by default; include_checks adds the existing completion assessment. No writes, no new UI, no runtime tests. Filter kind and section; page with offset:nextOffset and expected_snapshot:snapshot.key, keeping filters unchanged. A changed or unavailable snapshot must be re-read. An empty result is not proof of completeness; assess_project_completeness remains the completion authority.',
    {
      project_id: z.string(),
      kind: z.enum(['all', 'question', 'action']).optional(),
      section: z.enum(SECTIONS).optional(),
      include_checks: z.boolean().optional().describe('Include the existing, potentially slower completion assessment; default false'),
      offset: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(20).optional().describe('Default 10'),
      expected_snapshot: z.string().optional().describe('snapshot.key from the previous page; a changed project requires restarting pagination'),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (args) => json(await getProjectElaborationHandler(args, lyriks), 'get_project_elaboration'),
  )

  mcp.tool(
    'get_experience_coverage',
    'LOCAL plan-coverage / readiness report for the Experience prototype — the same analysis the Experience tab shows. It verifies only the capabilities already present in the authored model; it cannot detect product capabilities omitted from the external scope and NEVER proves whole-project completion. Returns 0–100 readiness plus dimensions (screens runnable, journeys→screens, features prototyped, roles covered, data used, actions wired, navigation reachable) and a flat list of gaps sorted blocking→warning→info; each gap carries a ref {screenId?, nodeId?} pointing at the exact screen/element to fix. Call it after build_screen / patch_section to find what is still empty, unwired, unreachable or broken, then use assess_project_completeness for the global verdict.',
    {
      project_id: z.string().describe('Lyriks project id (from list_wizard_projects)'),
    },
    async (args) => json(await getExperienceCoverageHandler(args, lyriks)),
  )

  mcp.tool(
    'assess_project_completeness',
    'Reads the deterministic WHOLE-PROJECT completion report. Unlike section scores, it checks the declared external scope inventory, source links, included capability→leaf-feature mappings, approved omissions, every canonical section assessment, global readiness/coherence, per-feature behavior, end-to-end Experience verification and audit freshness. Read `issues` as the blocker list; do not claim completion from any narrower tool.',
    { project_id: z.string().describe('Lyriks project id (from list_wizard_projects)') },
    async (args) => json(await assessProjectCompletenessHandler(args, lyriks)),
  )

  mcp.tool(
    'assess_portfolio_completeness',
    'Runs the whole-project completion gate over every Lyriks wizard project visible to the caller and returns compact status, score and blocker summaries. Use it to resume or audit work in bulk; it is read-only and never marks projects complete.',
    {},
    async () => json(await assessPortfolioCompletenessHandler({}, lyriks)),
  )

  mcp.tool(
    'audit_project_scope',
    'Snapshots the current scope and all project-section revisions, then returns the whole-project completion report. Run only after authoring and resolving current blockers. Any later project save makes this audit stale automatically, so assess again before finishing.',
    { project_id: z.string().describe('Lyriks project id') },
    async (args) =>
      json(await withWriteLock(`${args.project_id}:scope`, () => auditProjectScopeHandler(args, lyriks))),
  )

  mcp.tool(
    'finish_project',
    'Marks the lyriks project globally complete only when the latest scope audit is fresh and the whole-project report has zero blockers. Otherwise it does not mutate completion and returns the exact report explaining what remains. This is the only tool whose success authorizes saying the project is complete.',
    { project_id: z.string().describe('Lyriks project id') },
    async (args) =>
      json(await withWriteLock(`${args.project_id}:scope`, () => finishProjectHandler(args, lyriks))),
  )

  mcp.tool(
    'simulate_experience',
    'Headlessly RUN the prototype to prove a flow works — the verify half of the build loop, no browser. Initialises run state (optionally as a persona, so gates apply; omit for an author run with all gates open) from a start screen (default: the builder entry screen), then applies your ordered `actions` through the real run-mode engine. Each action targets an element by `nodeId` (preferred — from build_screen output / get_section) or by `label` on the current (or `screenId`) screen; set `type` to enter an input value, else the element is interacted with `trigger` (default "change" for inputs, else "click"); set `expectError:true` on a step that is SUPPOSED to fail (a deliberately blocked click, a guard that must reject) — its errors are recorded on the action (`expectedErrorMet`) but consumed, so a proven negative path keeps `ok:true`, and raising no error when one was promised fails instead. Returns: finalScreenId, the live `state` (dotted paths), `visited` screens in order, collection row counts, the activity trace, `errors` (validation / scenario / broken navigation / unbound action) with per-action `newErrors`, `warnings` (non-fatal authoring smells, e.g. a createRecord that captured no input values), plus `ok` (true when no unexpected error) and `persona` {id, gatedElementsTouched}. PROVING A REFUSAL: a run as a role is the way to prove a role may NOT do something. `persona_id` must be a role id the users section declares, and an unknown one is REFUSED rather than run as nobody. The refusal a gate raises is an ordinary error, so the negative path is green with expectError:true. Where none of the elements a persona run touched carries a gate, `gatedElementsTouched` is 0 and a warning says the run proved nothing about permissions: the access rule then lives in the model and nowhere the simulator can enforce it, and wire_element gate {personaIds, mode, allow} is what puts it on the element. Nothing is persisted. PER-ROW: add `rowIndex:<N>` to an action to fire it in row N of the list repeating that element (the action result echoes the `rowKey` it hit), which is the only way to prove "connect THIS app" / "choose THIS plan" flows. TABS/SIDEBAR: add `tab:<N>` to an action targeting a `tabs` or `sidebar` GROUP (by nodeId/label) to switch it to panel N headlessly, the same state write its tab bar / aside menu performs.',
    {
      project_id: z.string().describe('Lyriks project id'),
      persona_id: z.string().optional().describe('Run as this role id from the users section (persona gates apply); a role the project does not declare is refused, never silently ignored. Omit for an author run (all gates open)'),
      start_screen_id: z.string().optional().describe('Screen to start the run on; defaults to the builder entry screen'),
      actions: z.array(z.object({
        nodeId: z.string().optional().describe('Target element id (preferred — stable, unambiguous)'),
        label: z.string().optional().describe('Resolve by element label on the current screen (or `screenId`) instead of id'),
        screenId: z.string().optional().describe('Surface to resolve `label` on (default: the current screen)'),
        trigger: z.enum(['click', 'hover', 'change', 'submit']).optional().describe('Interaction trigger; default "change" for inputs else "click"'),
        type: z.string().optional().describe('Write this value into an input element instead of firing a trigger'),
        expectError: z.boolean().optional().describe('This step must fail: its errors are consumed (run stays ok) and raising none is the failure'),
        rowIndex: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            'Target the element as rendered in ROW N of the list that repeats it (0-based, over the rows currently visible — i.e. after any live search filter). This is how a per-row action is driven: the row is in scope, so {Field} values and selectRecord capture THAT record. Errors if the element is not inside a list row template or the row does not exist.',
          ),
        tab: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            'Switch the targeted `tabs` or `sidebar` GROUP (by nodeId/label) to panel N (0-based), exactly what clicking its tab bar / aside menu does: the group\'s tabs state path is set to N. Errors when the node is not a tabs/sidebar group or panel N does not exist. This is how nested tab/aside navigation is proven headlessly.',
          ),
      })).optional().describe('Ordered interactions to drive the run'),
    },
    async (args) => json(await simulateExperienceHandler(args, lyriks)),
  )

  mcp.tool(
    'verify_experience',
    'Decide whether the prototype is BUILD-READY, and get the acceptance spec the build must satisfy — call this before generating product code. It runs plan-coverage, then SIMULATES every journey\'s derived happy-path (walking the navigation graph between consecutive step screens) and reports whether each ran end-to-end with no errors, and folds in the authored Given/When/Then scenarios as acceptance criteria (also rendered as Gherkin). Returns: `ready` (true only when there are no blocking coverage gaps AND every journey with steps runs clean), `readinessScore`, a `coverage` summary, per-`journeys` proof {reachedFinal, ok, errors, flowGaps}, `blockers` (plain sentences for why not ready — empty when ready), `advisories` (non-gating signals, e.g. unresolved critical spec gaps: worth fixing but they never flip `ready`), and `acceptance` {gherkin, features, criteriaCount}. Use the blockers + per-journey flowGaps to fix the prototype, and the acceptance spec as the contract for the implementation. `engine.specGaps` carries the DETAILED gap list (`items` with entityId/reason/suggestedFix + `totalItems`), filterable/pageable via gap_severity/gap_limit/gap_offset; gaps sitting on wizard-projected mirror entities (journey/screen surfaces the author never touched) are flagged `mirrorDerived`, tallied separately, sorted last, and EXCLUDED from the critical/recommended headline counts — only authored gaps are real spec debt. `engine.degraded` is true when a reading did not come back inside its budget (`engine.incomplete` names which, and `engine.explorationCap` reports a state-space search narrowed for a large model): the verdict then stands on fewer signals, and a missing reading can only make it more permissive, so re-run it before treating a pass as final. Navigation contributed by an embedded reusable component (e.g. a sidebar\'s links) counts for journey flows — no need for redundant direct links on the host screen.',
    {
      project_id: z.string().describe('Lyriks project id (from list_wizard_projects)'),
      gap_severity: z
        .enum(['critical', 'recommended'])
        .optional()
        .describe('Only list engine spec gaps of this severity (counts stay global).'),
      gap_limit: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Page size for the detailed engine.specGaps.items list (default 50).'),
      gap_offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Offset into the filtered spec-gap list — page with gap_limit on a big model.'),
    },
    async (args) => json(await verifyExperienceHandler(args, lyriks), 'verify_experience'),
  )

  mcp.tool(
    'import_data_collections',
    'Raise prototype fidelity by seeding the simulator\'s fake backend from the REAL data model: each entity becomes an editable collection whose fields carry the right generator kind for their declared type, so lists/forms read the shapes the product will actually persist. Imports ALL entities by default, or pass `entity_names` for a subset. Idempotent — an entity already backing a collection (recorded provenance, or name match) keeps the collection it has, and simply GAINS the model fields it was missing, which destroys nothing (authored rows, seed counts and edited fields stay) and is reported under `reconciled` [{entity, addedFields}]; a field the model renamed or re-typed still needs refresh:true. Pass `refresh:true` after the data section changed to also re-sync those existing collections: their name and fields follow the model again, while author demo knobs (seed counts, authored rows) are kept. Returns {imported, updated, reconciled, skipped, total}. Run this before binding lists/forms so the bound data matches the data model instead of generic placeholders.',
    {
      project_id: z.string().describe('Lyriks project id'),
      entity_names: z.array(z.string()).optional().describe('Only import these entity names from the data section (default: all entities)'),
      seed_count: z.number().int().min(0).max(100).optional().describe('Synthetic rows for NEW collections only (default 5). Set 0 to author domain-appropriate fixtures yourself; existing fixtures are never cleared.'),
      refresh: z.boolean().optional().describe('Also refresh existing collections that drifted from the data model (default false = import-once, existing collections untouched)'),
    },
    async (args) => json(await withWriteLock(`${args.project_id}:experience`, () => importDataCollectionsHandler(args, lyriks))),
  )

  // A TargetMap retargets the generated tests onto an EXISTING repo (no git
  // provider needed): real routes, real selectors, explicit state→observable.
  const targetMapShape = z
    .object({
      routes: z.record(z.string()).optional().describe('screen name (or id) → real route, e.g. {"Login":"/auth/sign-in"}'),
      selectors: z.record(z.string()).optional().describe('element label → real CSS selector, e.g. {"Continue":"[data-testid=submit]"}'),
      observables: z
        .record(z.object({ kind: z.enum(['url', 'text', 'visible', 'hidden', 'value']), value: z.string().optional(), selector: z.string().optional() }))
        .optional()
        .describe('state path → how to assert it in the real UI (when the prototype can\'t auto-derive)'),
    })
    .optional()

  mcp.tool(
    'generate_acceptance_tests',
    'Generate runnable acceptance tests from the VERIFIED prototype — the artifact that carries simulator verification into the build, so the product is constrained by tests that already pass against the proven flow. Returns {gherkin, playwright, journeyCount, criteriaCount, boundAssertions, annotatedAssertions}: a Gherkin `.feature` and a Playwright `.spec.ts` that, per journey, gotos the entry route and clicks each navigating element by role+accessible-name asserting the URL advances — AND emits REAL assertions for authored scenarios by mining the prototype (a state a scenario asserts is matched to the element it makes visible / the input it sets / the text it fills); the rest stay as `// acceptance (bind manually)` annotations. Pass `target_map` to retarget onto an EXISTING repo (real routes/selectors/observables) — no git provider needed. Run verify_experience first.',
    {
      project_id: z.string().describe('Lyriks project id'),
      target_map: targetMapShape,
    },
    async (args) => json(await generateAcceptanceTestsHandler(args, lyriks)),
  )

  mcp.tool(
    'generate_repo_scaffold',
    'Produce a DROP-IN acceptance bundle for any repo (greenfield OR existing) — the provider-agnostic way to put the verified prototype\'s contract into a codebase: an AI or human just commits the returned files. Returns {files:[{path,content}], summary}: the Playwright spec + Gherkin (tests/acceptance/), a playwright.config.ts, a .github/workflows/acceptance.yml that runs them (add to branch protection to BLOCK merge), a lyriks.map.json pre-filled with this project\'s screens→paths and nav labels (edit to retarget an existing app), and ACCEPTANCE.md. Pass `target_map` to bake real routes/selectors straight into the specs. No git-provider/OAuth required.',
    {
      project_id: z.string().describe('Lyriks project id'),
      target_map: targetMapShape,
    },
    async (args) => json(await generateRepoScaffoldHandler(args, lyriks)),
  )

  // ── Portfolio / whole-app tools ───────────────────────────────────────────
  mcp.tool(
    'list_workspaces',
    'Lists the workspaces (orgs) the caller belongs to. Empty on Community, where projects are not grouped into workspaces.',
    {},
    async () => json(ee ? await ee.portfolio.listWorkspaces({}) : listWorkspacesWithoutBack()),
  )

  mcp.tool(
    'list_projects',
    'Lists projects, optionally filtered to one workspace. On Community the list is the platform portfolio: ids are the wizard slugs and workspace_id is null.',
    { workspace_id: z.string().optional().describe('Filter to this workspace UUID (ignored on Community)') },
    async (args) => json(ee ? await ee.portfolio.listProjects(args) : await listProjectsWithoutBack(lyriks)),
  )

  mcp.tool(
    'get_project',
    'Returns a project including its full authored spec (the section envelope, keyed by wire id: scope, foundation, features, experience, rules, data, architecture, contract) — which can be large. Pass summary:true for a shape overview, or paths:[...] for specific dotted sub-trees, to stay token-small. Accepts the project UUID or a wizard project slug.',
    {
      project_id: z.string().describe('Project UUID, or a wizard project slug (from list_wizard_projects)'),
      summary: z.boolean().optional().describe('Return a shape overview instead of the full spec'),
      paths: z.array(z.string()).optional().describe('Return only these dotted sub-trees, e.g. ["wizard_envelope.experience.designSystem"]'),
    },
    async (args) =>
      json(ee ? await ee.portfolio.getProject(args) : await getProjectWithoutBack(args, lyriks), 'get_project'),
  )

  mcp.tool(
    'create_project',
    'Creates a bare portfolio project record (a UUID with no linked Lyriks wizard draft) — the wizard section tools (set_section/build_screen/…) will 404 on it. To start a project you can author through the MCP, use create_wizard_project instead; only use create_project for portfolio-level records you will not drive through the wizard.',
    {
      workspace_id: z.string().optional().describe(`Workspace UUID to create the project in (required on Enterprise). ${NO_WORKSPACES_NOTE}`),
      name: z.string().describe('Project name'),
      description: z.string().optional().describe('One-line description'),
    },
    async (args) => {
      if (!ee) return json(await createProjectWithoutBack(args, lyriks))
      if (!args.workspace_id) throw new Error('workspace_id is required: pick one from list_workspaces')
      return json(await ee.portfolio.createProject({ ...args, workspace_id: args.workspace_id }))
    },
  )

  mcp.tool(
    'update_project',
    "Updates only a bare project record's name and/or description. It does NOT update the Lyriks wizard project shown in the Lyriks portfolio; use update_wizard_project for a wizard slug.",
    {
      project_id: z.string().describe('Project UUID'),
      name: z.string().optional().describe('New name'),
      description: z.string().optional().describe('New description'),
    },
    async (args) =>
      json(ee ? await ee.portfolio.updateProject(args) : await updateProjectWithoutBack(args, lyriks)),
  )

  mcp.tool(
    'delete_project',
    'Permanently deletes a bare project record and its traces. It does NOT run the guarded Lyriks wizard deletion flow; use delete_wizard_project with exact-name confirmation for a wizard project.',
    { project_id: z.string().describe('Project UUID') },
    async (args) => json(ee ? await ee.portfolio.deleteProject(args) : deleteProjectWithoutBack(args)),
  )

  // ── The tools only Enterprise serves ───────────────────────────────────────
  // The overlay registers them with their real arguments; the open-source tree
  // registers a stand-in under each name that says the tool does not apply.
  if (ee) ee.registerTools(mcp)
  else registerEnterpriseStandIns(mcp)

  mcp.tool(
    'apply_behavior_batch',
    'Author BEHAVIOR DEPTH on a feature — the full Unspaghettit vocabulary (state definitions, rules, effects, invariants, parameters, events, scenarios, reachability goals, transitions, personas, resources, entities) applied as one atomic add/update/remove/move batch. This is the write half of build_screen/patch_section: use it to detail what a screen or step actually DOES (guards, state changes, emitted events, model-checked scenarios), not just its layout. Runs through the platform engine under your auth and writes the shared model, so depth survives wizard re-saves. `feature_id` is a kernel feature id (a features-section leaf id, or "<projectId>__experience" for journey/step behavior, "<projectId>__data_model" for entities) — get it from get_behavior_context or list_wizard_projects. Each op is `{ kind, ref?, ...args }`; add ops can set `ref` so later ops in the SAME batch reference the new id via `*Ref`. Pass dry_run:true to validate + score without saving (STRONGLY recommended first). Returns `{ available, batch }`: `batch.ok:true` applied (with `refs`, `appliedCount`, `maturityPercentage`); `batch.ok:false` REJECTED — read `batch.errors` and fix. When the engine supports it, `batch.scenarios: { scope, run, passed, failed[], truncated? }` reports the scenarios of what the batch touched, run on the feature as the batch leaves it (a dry run included). A row in `failed` is information, not a rejection: validation alone refuses a batch, so read the row and fix the rule or the scenario; an older engine sends nothing and the field is absent. SEVERAL WRITERS ON ONE FEATURE: pass `expected_updated_at`, the feature `updatedAt` you read (get_behavior_feature returns it at `snapshot.feature.updatedAt` and in its summary), so an engine that supports it refuses to overwrite what changed since; a success then carries `batch.previousUpdatedAt` and `batch.updatedAt`, the version to send next, and an older engine ignores the argument. A conflict answers `batch.ok:false` with `batch.conflict:true`, `batch.currentUpdatedAt` and `batch.changedSince` (the elements that moved, `batch.changedSinceTotal` in all): NOTHING was written, so re-read the feature, rebase your operations on what it now holds, and resend with the new `updatedAt`. `batch.relatedElsewhere`, when present, names elements of OTHER features that share the state paths the batch touched, so a change that looks local is checked against them. Op-kind schema reference: build a batch against the vocabulary in the tool docs (add_state_definition, add_action_rule{rule:{category,condition?,effect:{type,...}}}, add_scenario{surfaceId|actionId,expectedAssertions}, add_reachability_goal, ...). Common gotchas: add_resource/add_reachability_goal nest their own `kind` under resourceKind / the arg (it collides with the op discriminator); block an action with effect {type:"block_action"} not "block"; requiredStates is string[] of paths, use rules for value guards. RULES ARE MANDATORY ON EVERY NEW ACTION — this is the product\'s core reading ("which rules are active"), not a nicety: an `add_action` op is REJECTED unless the same batch also carries at least one `add_action_rule` with that action\'s `actionRef` (so always give `add_action` a `ref`). Ask yourself what gates the action — permissions, state, quota, validity — and encode it. If it is genuinely unconditional, say so AS A RULE: an `add_action_rule` with no `condition` and `effect:{type:"allow_action",description:"…"}`; that records the decision instead of leaving a silent gap.',
    {
      project_id: z.string().describe('Lyriks project id / slug that OWNS the feature (from list_wizard_projects) — authorizes the write'),
      feature_id: z.string().describe('Kernel feature id: a features-section leaf id, or "<projectId>__experience" (journeys/steps) / "<projectId>__data_model" (entities)'),
      operations: z.array(z.record(z.unknown())).optional().describe('Ordered Unspaghettit ops, each { kind, ref?, ...kindArgs } — see the tool description for the op-kind vocabulary. Every `add_action` MUST be paired with at least one `add_action_rule` on its `ref` in this same batch, else the whole batch is rejected. Omit when committing a prior dry-run by `commit` token'),
      dry_run: z.boolean().optional().describe('Validate + score without saving (recommended before a real apply). A valid dry-run returns batch.commitToken'),
      commit: z.string().optional().describe('A commitToken from a prior valid dry_run — saves that exact validated batch WITHOUT resending operations. Single-use, expires after 5 minutes'),
      verbose: z.boolean().optional().describe('Include the per-issue verification report, not just aggregate counts'),
      expected_updated_at: z.string().optional().describe('The feature `updatedAt` this batch was written against (ISO string, from get_behavior_feature). An engine that supports it refuses the batch when the feature changed since: `batch.conflict:true`, nothing written. Pass it whenever several writers share one feature'),
    },
    async (args) => json(await applyBehaviorBatchHandler(args, lyriks)),
  )

  mcp.tool(
    'get_behavior_context',
    'Resolve a project entity to its BEHAVIOR-MODEL address — the ids apply_behavior_batch needs — so you never hand-translate "journey-triage" into "srf-journey-triage" or "step-tri-3" into "act-step-tri-3". Pass the project plus ONE of journey_id / step_id / screen_id (or a raw surface_id / action_id) and get back { featureId, surfaceId, actionId, name, found, depth }, where depth is a connectivity snapshot { statesWritten, statesRead, eventsEmitted, transitions, actions }. A raw surface_id or action_id is looked up in the Experience feature first and, when that feature does not hold it, across the project\'s LEAF features: the `featureId` in the answer names the feature that owns it. Use it to discover the feature_id + surface/action to target, and to see at a glance how much a step already models. found:false means the entity isn\'t in the model yet (author it first); the ids still come back so you know where it WILL live.',
    {
      project_id: z.string().describe('Lyriks project id / slug (from list_wizard_projects)'),
      journey_id: z.string().optional().describe('An experience-section journey id → its workflow surface'),
      step_id: z.string().optional().describe('An experience-section step id → its action (surface resolved from the owning journey)'),
      screen_id: z.string().optional().describe('A builder screen id → its screen surface'),
      surface_id: z.string().optional().describe('A raw kernel surface id (srf-…) to inspect directly'),
      action_id: z.string().optional().describe('A raw kernel action id (act-…) to inspect directly'),
    },
    async (args) => json(await getBehaviorContextHandler(args, lyriks)),
  )

  mcp.tool(
    'get_behavior_feature',
    'Read the canonical Unspaghettit feature tree through authenticated Lyriks, including stable ids for surfaces, actions, rules, effects, states, scenarios, invariants, entities and resources. A complete feature is often larger than one answer can carry, so read it in two steps: summary:true returns the TABLE OF CONTENTS (feature id, name and updatedAt, counts of the feature-level collections, acceptanceCriteria as {id, title}, and per surface {id, name, stateCount, ruleCount, invariants:[{id, name}], actions:[{id, name, rules, effects, scenarios, parameters}]} with counts as numbers), then surface_id or action_id returns that ONE element whole with its {featureId, surfaceId, surfaceName} context. Select by id, never by position: a path such as "snapshot.feature.surfaces.5" names another surface as soon as someone adds one. action_id searches every surface and wins when both ids are given; an unknown id answers found:false with the ids and names that do exist. index_keys:true answers { featureId, updatedAt, total, keys } instead: the implementation-index keys that belong to this feature, in the engine\'s own grammar (surface:<id>, action:<id>, rule:<id>, invariant:<id>, transition:<id>, surface_rule:<id>, surface_invariant:<id>, entity:<id>, state:<dotted.path>, event:<name>, criterion:<id>), so a repository can slice its .unspa.json by feature although index entries carry no featureId (send that slice to sync_implementation_index as a partial index). A state path or an event name several features declare is one key in each of them; criterion:<id> is resolved by newer engines only, an older one lists it under orphans. The list comes whole (100 to 300 short keys for a feature of 30 actions); only a huge feature is paged, with offset, returned and nextOffset in the answer: continue with offset:nextOffset. index_keys wins over surface_id, action_id and summary. `paths` still reads exact dotted branches that have no id of their own (for example "snapshot.feature.events") and wins over every other argument. This is the required read between apply_behavior_batch calls because batch refs only live within one batch.',
    {
      project_id: z.string().describe('Lyriks project id / slug that owns the feature'),
      feature_id: z.string().describe('Kernel feature id'),
      summary: z.boolean().optional().describe('Return the table of contents (ids, names and counts) instead of the complete snapshot: start here'),
      surface_id: z.string().optional().describe('Return this one surface whole (id from the table of contents)'),
      action_id: z.string().optional().describe('Return this one action whole, searched in every surface (id from the table of contents); wins over surface_id'),
      index_keys: z.boolean().optional().describe('Return the implementation-index keys that belong to this feature ({ featureId, updatedAt, total, keys }) instead of the tree; wins over surface_id, action_id and summary'),
      limit: z.number().int().min(1).optional().describe('index_keys only: keys per page (default: every key that fits the response cap)'),
      offset: z.number().int().min(0).optional().describe('index_keys only: keys to skip; pass the nextOffset of the previous page'),
      paths: z.array(z.string()).optional().describe('Exact dotted paths into the response, for branches without an id; wins over summary, surface_id, action_id and index_keys'),
    },
    async (args) => json(await readBehaviorFeatureHandler(args, lyriks), 'get_behavior_feature'),
  )

  mcp.tool(
    'export_behavior_scenarios',
    'Export the executable scenarios of a feature as FIXTURES, so a repository test runs the spec\'s scenarios against the REAL CODE instead of hand-copying their numbers into a test that then drifts from the spec. One fixture per authored scenario, in model order: { featureId, featureName, surfaceId, surfaceName, actionId, actionName, scenarioId, scenarioName, titleToken, personaId, personaName, initialState, parameters, steps, timeAdvance?, expectedStatus, expectedAssertions, expectedTransition?, specVersion }. initialState is what the simulator starts from: the persona state overrides, then the scenario\'s on top, then the defaults of the scenario\'s surface for every declared path still missing, nested along each dotted state path ("cart.total" is initialState.cart.total). parameters are keyed by name: the persona overrides, then the scenario\'s, only the names the action declares. steps are the actions a multi-step scenario replays before its subject action, each { actionId, actionName, surfaceId, parameters, expectedStatus, expectedAssertions, timeAdvance? }. expectedStatus is "success" when the scenario authored none; expectedTransition is present only when authored (null = the action must not move the user). specVersion is when that scenario last changed in the spec (the feature updatedAt on a feature without element stamps), so a repository can tell when a saved fixture moved. This is the input of the engine\'s `unspa scenarios export`, which reads a local snapshots folder a Lyriks-bound repository does not have. Write ONE adapter in the repository, invoke(fixture) => { status: "success" | "blocked", finalState } (the answer repeats the contract in `adapterContract`; only asserted paths need to come back in finalState), save the fixtures beside the test, and loop over them. NAME EACH TEST WITH ITS `titleToken` ("[unspa:<surfaceId>:<actionId>:<scenarioId>]", anywhere in the title; null when an id could not be read back from it): the token is what brings the results back. Run the tests with a JSON report (vitest `--reporter=json`, jest `--json`, both with `--outputFile`) and hand that report to the shipped script `.lyriks/tools/ingest-results.mjs`, which stamps `verifiedAt` on the `action:<id>` index entries whose scenarios ALL passed; the next sync_implementation_index then carries the proof. surface_id / action_id keep one surface or one action. The answer is paged under the response cap: { featureId, total, offset, returned, nextOffset, fixtures, adapterContract }; continue with offset:nextOffset until it is null. An unknown id answers found:false with the ids and names that exist.',
    {
      project_id: z.string().describe('Lyriks project id / slug that owns the feature'),
      feature_id: z.string().describe('Kernel feature id'),
      surface_id: z.string().optional().describe('Keep the scenarios of this one surface'),
      action_id: z.string().optional().describe('Keep the scenarios of this one action (searched in surface_id when given, else in every surface)'),
      limit: z.number().int().min(1).max(200).optional().describe('Fixtures per page (default 50, max 200); fewer come back when they would not fit the response cap'),
      offset: z.number().int().min(0).optional().describe('Scenarios to skip, in model order; pass the nextOffset of the previous page'),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (args) => json(await exportBehaviorScenariosHandler(args, lyriks), 'export_behavior_scenarios'),
  )

  mcp.tool(
    'score_behavior_feature',
    'Score structural and behavioral maturity through the platform engine. Returns the confidence dimensions, failing areas and—by default—the actionable issue list. Filter by surface, area or severity to plan the next apply_behavior_batch.',
    {
      project_id: z.string().describe('Lyriks project id / slug that owns the feature'),
      feature_id: z.string().describe('Kernel feature id'),
      include_issues: z.boolean().optional().describe('Include per-issue fixes; defaults true'),
      surface_id: z.string().optional().describe('Limit issues and counts to one surface'),
      area: z.string().optional().describe('Limit issues and counts to one maturity area'),
      severity: z.enum(['critical', 'recommended']).optional().describe('Limit issues by severity'),
    },
    async (args) => json(await scoreBehaviorFeatureHandler(args, lyriks), 'score_behavior_feature'),
  )

  mcp.tool(
    'assess_behavior_feature',
    'Run the complete executable-spec assessment for one feature: named behavior, maturity, spec gaps with suggested fixes, all scenarios, bounded model checking, verification verdict, implementation coverage and digest.',
    {
      project_id: z.string().describe('Lyriks project id / slug that owns the feature'),
      feature_id: z.string().describe('Kernel feature id'),
    },
    async (args) => json(await assessBehaviorFeatureHandler(args, lyriks)),
  )

  mcp.tool(
    'get_behavior_operations',
    'Discover the exact apply_behavior_batch vocabulary from the running Unspaghettit engine. No query returns headings and an authoring-pattern index; search one or more operation names or concepts for paginated schema excerpts. Queries continuous, spatial, or runtime-evidence also return domain-neutral modeling guidance, separately from schemas. Guidance does not establish runtime correctness.',
    {
      project_id: z.string().optional().describe('Lyriks project id / slug. Optional: the vocabulary is the engine\'s own and identical for every project, so this reads before any project exists'),
      query: z.string().max(512).optional().describe('One or more operation names/concepts, separated by spaces or commas (matches any term)'),
      offset: z.number().int().min(0).optional().describe('Character offset from nextOffset; keep the same query while paging'),
      max_chars: z.number().int().min(1).max(16000).optional().describe('Maximum excerpt characters per page (default 12000)'),
    },
    async (args) => json(await getBehaviorOperationsHandler(args, lyriks), 'get_behavior_operations'),
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Code → spec (adoption). The reverse of the authoring tools above: ingest a
  // product that already exists as running code. Load the `lyriks-retrospec`
  // skill (get_skill) for the workflow these compose into — used out of order
  // they will refuse, which is the point.
  //
  // YOU read the codebase with your own file tools. Nothing here makes the
  // server open a file: you push content and locations.
  // ─────────────────────────────────────────────────────────────────────────

  const projectIdArg = z.string().describe('Lyriks project id / slug that owns the feature')
  const featureIdArg = z.string().describe('Kernel feature id')

  mcp.tool(
    'attach_source',
    'Store a source file you have read as evidence for one feature, so the elements you model from it can be traced back to it. This is the attachment store of the ENGINE, NOT the evidence register of the project: a row a proposal cites by id, or that any section names in `sourceIds`, is added with patch_section {section:"documents", operations:[{op:"append", collection:"sources", value:{id,title,kind,url,note}}]} and read with get_section(documents). Attaching here registers nothing there, so a citedSourceIds that names what you attached here is refused as an unknown source. Pass kind:"code" when adopting an implementation file — file_name must then be the repo-relative path (e.g. src/lib/cart.ts), because spans recorded against a code source are what seed_implementation_index turns into the spec↔code map. Identical content is deduplicated: re-attaching the same text links the existing source instead of storing a copy. Character offsets you later report in record_element_spans index into the exact content you pass here. Set authority/artifact to rank the source so a later contradiction resolves by authority rather than by which document was ingested last. Note: the stored copy lives in the project on the server — attach implementation files, not secrets. Pass kind:"file" for a document with no web address that a feature\'s model rests on (the text of a PDF the user handed you, an exported page): stored here it stays readable through list_sources, which is what keeps that evidence reachable.',
    {
      project_id: projectIdArg,
      feature_id: featureIdArg,
      file_name: z.string().describe('Repo-relative path for code sources (e.g. src/lib/cart.ts)'),
      content: z.string().describe('The exact file content you read'),
      kind: z.enum(['file', 'code']).optional().describe('"code" when adopting an implementation file; defaults to code semantics'),
      authority: z.string().optional().describe('Rank of this source when sources disagree'),
      artifact: z.string().optional().describe('Artifact class, e.g. "implementation" or "test"'),
    },
    async (args) => json(await attachSourceHandler(args, lyriks)),
  )

  mcp.tool(
    'list_sources',
    'List the source documents stored for a project (attached by you, or pasted by the user in the behavior editor): id, name, kind, size, hash, date. Pass source_id to read one back instead — offset/max_chars page through a large file. Prefer reading a source the user already provided over re-pushing your own copy.',
    {
      project_id: projectIdArg,
      source_id: z.string().optional().describe('Read this source instead of listing all'),
      offset: z.number().int().nonnegative().optional().describe('Start character offset when reading'),
      max_chars: z.number().int().positive().optional().describe('How many characters to return'),
    },
    async (args) => json(await listSourcesHandler(args, lyriks), 'list_sources'),
  )

  mcp.tool(
    'classify_source',
    'Rank or re-label a stored source (authority, artifact class) so that when two sources contradict each other the conflict resolves by authority instead of by ingestion order.',
    {
      project_id: projectIdArg,
      source_id: z.string().describe('Source to reclassify'),
      authority: z.string().optional().describe('Authority rank'),
      artifact: z.string().optional().describe('Artifact class, e.g. "implementation" or "test"'),
    },
    async (args) => json(await classifySourceHandler(args, lyriks)),
  )

  mcp.tool(
    'remove_source',
    'Delete a stored source. The analysis keeps its recorded spans, but they lose the text they pointed at — remove a source you attached by mistake, not one you have already traced against.',
    { project_id: projectIdArg, source_id: z.string().describe('Source to delete') },
    async (args) => json(await removeSourceHandler(args, lyriks)),
  )

  mcp.tool(
    'record_element_spans',
    'Trace modeled elements back to the code they came from: stamp MANY elements with their character spans in one call (offsets index into the attached source content, end exclusive). This is the cost driver of adoption — batch every span for a source into a single call rather than one per element. Items are applied in order; a failing item is reported with its reason and does NOT abort the rest. finalize_analysis refuses until every element has one of these, which is what stops a model being invented rather than read.',
    {
      project_id: projectIdArg,
      feature_id: featureIdArg,
      source_id: z.string().optional().describe('Default source for items that omit their own'),
      spans: z
        .array(
          z.object({
            element_id: z.string().describe('Id of the modeled element (surface, action, rule, …)'),
            start_offset: z.number().int().nonnegative(),
            end_offset: z.number().int().positive().describe('Exclusive'),
            source_id: z.string().optional(),
          }),
        )
        .describe('Every span for this source, in one call'),
    },
    async (args) => json(await recordSpansHandler(args, lyriks)),
  )

  mcp.tool(
    'stage_candidates',
    'Park spans you have spotted but not modeled yet, with a one-line summary each, so behavior you noticed is not silently dropped when you move on. Close each one later with dispose_candidate.',
    {
      project_id: projectIdArg,
      feature_id: featureIdArg,
      source_id: z.string().optional().describe('Default source for items that omit their own'),
      candidates: z.array(
        z.object({
          start_offset: z.number().int().nonnegative(),
          end_offset: z.number().int().positive(),
          summary: z.string().describe('What behavior this span appears to contain'),
          source_id: z.string().optional(),
          kind: z.string().optional(),
          confidence: z.number().min(0).max(1).optional(),
        }),
      ),
    },
    async (args) => json(await stageCandidatesHandler(args, lyriks)),
  )

  mcp.tool(
    'dispose_candidate',
    'Close out a staged candidate: pass element_id when you modeled it, or a rationale when you deliberately dropped it. An open candidate is unfinished work, so this is how the analysis reaches a state finalize_analysis will accept.',
    {
      project_id: projectIdArg,
      feature_id: featureIdArg,
      candidate_id: z.string(),
      disposition: z.string().optional().describe('How it was closed'),
      rationale: z.string().optional().describe('Why, when it was dropped rather than modeled'),
      element_id: z.string().optional().describe('The element it became, when modeled'),
    },
    async (args) => json(await disposeCandidateHandler(args, lyriks)),
  )

  mcp.tool(
    'flag_conflict',
    'Record that two sources disagree about the same behavior, instead of silently believing whichever you read last. Cite each side with its source. Bring a conflict between code and documentation to the developer — it is a finding about the product, not a modeling error.',
    {
      project_id: projectIdArg,
      feature_id: featureIdArg,
      summary: z.string().describe('What the disagreement is'),
      statements: z
        .array(z.object({ source_id: z.string(), statement: z.string() }))
        .optional()
        .describe('What each source claims'),
      affected_elements: z.array(z.string()).optional(),
    },
    async (args) => json(await flagConflictHandler(args, lyriks)),
  )

  mcp.tool(
    'resolve_conflict',
    'Close a flagged conflict, either resolved in favour of one source or accepted as a genuine ambiguity to carry forward. Record which way it went and why.',
    {
      project_id: projectIdArg,
      feature_id: featureIdArg,
      conflict_id: z.string(),
      status: z.enum(['resolved', 'accepted_ambiguity']),
      resolution: z.string().describe('The decision and its reasoning'),
      resolved_in_favor_of: z.string().optional().describe('Winning source id, when resolved'),
    },
    async (args) => json(await resolveConflictHandler(args, lyriks)),
  )

  mcp.tool(
    'finalize_analysis',
    'Close the analysis for one feature. It REFUSES while any modeled element has no source span or any candidate is still open, and names what is missing — that refusal is the gate that makes an adopted model trustworthy, so treat it as a work list, not an error. Required before seed_implementation_index.',
    { project_id: projectIdArg, feature_id: featureIdArg },
    async (args) => json(await finalizeAnalysisHandler(args, lyriks)),
  )

  mcp.tool(
    'reset_analysis',
    'Discard a feature\'s analysis — sources stay, spans and candidates go. Use when an adoption pass went down the wrong path and you want to re-read the code from scratch. Destructive: the traces are not recoverable.',
    { project_id: projectIdArg, feature_id: featureIdArg },
    async (args) => json(await resetAnalysisHandler(args, lyriks)),
  )

  mcp.tool(
    'get_provenance',
    'What a feature\'s model is made of: which element came from which source span, which candidates are still open, which conflicts are unresolved. Pass coverage:true for how much of each attached source has actually been consumed. Read this BEFORE finalize_analysis — together they are exactly what the gate checks, so you can see why it would refuse before asking.',
    {
      project_id: projectIdArg,
      feature_id: featureIdArg,
      coverage: z.boolean().optional().describe('Return per-source consumption instead of the trace map'),
      source_id: z.string().optional().describe('Limit coverage to one source'),
    },
    async (args) => json(await getProvenanceHandler(args, lyriks), 'get_provenance'),
  )

  mcp.tool(
    'get_evolution',
    'The Evolution section as ONE aggregate: the board (one card per live change request: stage, the stage its own state supports, maturity, open questions, pending proposals, coherence delta, blocking findings, undecided report lines, acceptance debt, waiver) or, with request_id, ONE dossier IN COUNTS: its touched features, how many fields are filled, empty, critical and empty, open questions, awaiting a proposal or discussed, how many proposals wait and how many are flagged or blocked, how many readings are filled and how many move, the maturity per block with the critical holes named, the coherence findings the engine published, the impact in short (one plain-language line per plane, the spec plane and the code plane, how much moves per section, plus the direct hits), the next gate and exactly why it refuses, the report counts, the observations, the acceptance debt and the last timeline entries. That answer is the SAME SIZE whether the request touches one feature or twenty, because every list it counts comes ONE PART at a time, narrowed to one touched feature with `leaf` and paged with `offset`/`limit`: part:"fields" (one row per inline field per touched feature: the value the owning section holds, whether it is filled, the open question, the proposal waiting, the thread), part:"proposals" (every pending proposal with its full value, reasoning, sources and whether a person may accept it as it stands), part:"impact" (every impacted node under one hypothesis, the one that ran last by default and any other with `hypothesis` add|change|remove, since each run keeps its own findings, `section` narrows to one of leaves|screens_and_journeys|entities_and_fields|rules_and_scenarios|permissions|glossary_terms|code; the code section lists the files the implementation index anchors on the touched and reached features), part:"report" (every line of the current iteration, `verdict` narrows to conform|non_conform|missing|out_of_scope|regression), part:"readings" (the blocks edited elsewhere: behaviour, grants, entities, dependencies; an empty reading = author it in the owning section and it fills itself), part:"drafts" (what the request PROPOSES, in full: each drafted feature with its kind add|amend|remove, the leaf it stands for, its name, description, the four why-fields, its acceptance criteria, dependencies, sources and behaviour rows, plus the leaf id it became once the freeze wrote it), part:"history". Read the counts first, then the one list you need, one feature at a time. START HERE for any change to what the product does. ' + EVOLUTION_IS_THE_DOOR + ' The aggregate is precomputed server-side, and `fieldsAvailable` lists the field paths apply_evolution_batch can propose on; `originsAvailable` lists the six origin codes open_request takes; `members` is the workspace roster a proposal can be handed to (empty where one member is alone). Read this instead of get_section(evolution), which is the raw document without any of the derived readings.',
    {
      project_id: z.string().describe('Lyriks project id (from list_wizard_projects)'),
      request_id: z.string().optional().describe('One request; omit for the board'),
      part: z.enum(DOSSIER_PARTS).optional().describe('With request_id: "summary" (default, counts only) or one list: drafts | fields | proposals | impact | report | readings | history'),
      section: z.string().optional().describe('part:"impact": keep one section of the impact list'),
      hypothesis: z.enum(['add', 'change', 'remove']).optional().describe('part:"impact": which run to read. Each run_impact keeps its own findings, so the three hypotheses stay readable side by side; omit for the one that ran last'),
      verdict: z.string().optional().describe('part:"report": keep one verdict bucket'),
      leaf: z.string().optional().describe('part:"fields"|"proposals"|"readings"|"drafts": keep what belongs to ONE touched feature (a leaf id from the dossier\'s leafIds, a drafted one included)'),
      offset: z.number().int().nonnegative().optional().describe('part:"fields"|"proposals"|"impact"|"report"|"readings": page start (the answer says total, matched, offset, limit)'),
      limit: z.number().int().positive().optional().describe('part:"fields"|"proposals"|"impact"|"report"|"readings": page size (default 150)'),
    },
    async (args) => json(await getEvolutionHandler(args, lyriks), 'get_evolution'),
  )

  mcp.tool(
    'apply_evolution_batch',
    'Drive a change request through its lifecycle with typed operations, applied ATOMICALLY by the platform under the same guards as the dossier page: nothing lands unless every op is allowed, and a refusal names the op and the sentence the spec wrote. WHEN TO OPEN A REQUEST: ' + EVOLUTION_IS_THE_DOOR + ' Each operation is `{ op, ... }` (`kind` is accepted as the same thing, since the behavior batch spells it that way). YOU (the AI client) may: open_request {title, origin, requester?, leafIds[] = EXISTING leaf features the change touches}; the six origins are internal_idea|customer_feedback|support_ticket|market_watch|regulatory|technical_debt, and get_evolution lists them as originsAvailable, update_request {requestId, title?, origin?, requester?}, set_leaves {requestId, leafIds[] = leaves that EXIST, or drafts this request carries}, add_draft_leaf {requestId, kind add|amend|remove (default add), baseLeafId (required for amend and remove: the EXISTING leaf it stands for), name (required for add), description?, coreId?, parentFamilyId?, objective?, problem?, expectedEffect?, value?, acceptanceCriteria[]?, dependsOn[]?, sourceIds[]?, behaviour[]? (each {kind surface|state|action|rule|scenario, name, detail?})} = PUT THE CHANGE ON THE DOSSIER. This is how a capability the product does not have yet gets qualified: the draft is counted among the touched features straight away, the impact walk starts FROM it instead of from the hole where it would sit, the coherence check catches what it would contradict, and NOTHING is written into any section until the freeze. update_draft_leaf {requestId, draftId, ...the same fields} (only what you name is touched), remove_draft_leaf {requestId, draftId} (the draft and what was proposed on it go; the specification is exactly as it was), propose {requestId, fieldPath (from get_evolution fieldsAvailable), leafId, value (a string, or an array of lines for a field whose kind is "list"), whatWasRead (what the sources say), whatWasInferred (what you concluded from it), citedSourceIds[] (documents register ids: register the source first with patch_section(documents), NOT attach_source)}. The two halves are named fields, judged on being filled, in the language the project is written in: nothing is looked for in your wording, and a proposal carrying only the older free-text `reasoning` cannot be accepted, post_on_field {requestId, fieldPath, leafId?, body}, run_impact {requestId, hypothesis add|change|remove, depth 1..5} (COMPUTED: the spec plane over the knowledge graph, the code plane over the synced implementation index; run the three hypotheses in one batch, they read differently: add extends, change reworks, remove strips; sync_implementation_index first for a real code plane), run_coherence {requestId} (COMPUTED by the coherence engine over the whole project), build_implementation_report {requestId} (DERIVED from the synced implementation index against the frozen version: sync_implementation_index first, in Verify). A PERSON decides, and you relay their decision ONLY when they told you to, with as_person:true on the batch (the act lands as theirs, channel stamped on the timeline): decide_proposal {requestId, proposalId, decision accept|refuse|reword, comment?, value?} (accept WRITES the value into the owning section; on a proposal with tagged reviewers, accept is that reviewer\'s validation and the value is written once every reviewer validated, refuse is an invalidation that refuses it), tag_reviewers {requestId, proposalId, reviewerIds[]} (hand a proposal to named members of the workspace, ids = emails from get_evolution `members`; only where the roster holds more than one member, Enterprise), mark_open_question / answer_open_question {requestId, fieldPath, leafId?}, cross_stage {requestId, waiverReason?} (one gate at a time, and Specify does not close while a proposal still awaits a decision, since the maturity next to the dossier is inherited from the features the change touches and never proves the change itself was specified: Specify > Challenge > Verify (freezes the spec as a numbered version) > Accept > Delivered; a waiver crosses an unmet gate with a stated reason), lift_waiver, rebrief (back to Specify, amends a frozen spec), decide_line {requestId, lineId | verdict, decision validated|invalidated|adopted|removed}, rule_observation {requestId, observationId, ruling validated|invalidated|deferred|requalified, reason?}, fold_back {requestId, observationId, leafId, text} (writes an acceptance criterion on the feature), close_request, delete_request. AN OBSERVATION IS LOGGED BY THE PERSON WALKING THE PRODUCT, on the dossier page, because it is anchored on the screen and the element they are looking at and carries their annotated capture: you rule on the observations get_evolution lists and fold the validated ones back, and there is no operation to log one in their place. An observationId the dossier does not list is refused, which is that rule, not a missing feature. NOTHING REACHES A SECTION BEFORE THE FREEZE: never create a feature, entity, term, rule, screen or grant directly while a request is open. A feature the change would add is an add_draft_leaf on the dossier, and crossing into Verify is what writes every draft into the features section, stamped with the request. Other predicted new things are impact findings; spec values are proposals. The answer carries each op result and the touched requests as CARDS; read the dossier again with get_evolution. Order of work: open_request > add_draft_leaf (what the change IS) and/or set_leaves (what it touches) > run_impact (add, then change or remove) > run_coherence > propose on the open questions and empty critical fields > the person decides > cross_stage. A request that disturbs nothing and contradicts nothing needs none of the last three: it crosses its own gates and closes itself the moment the readings come back, and the answer says so. Follow the lyriks-evolution skill.',
    {
      project_id: z.string().describe('Lyriks project id'),
      operations: z.array(z.record(z.unknown())).min(1).describe('Ordered typed operations, each { op, requestId?, ...fields } (see the tool description)'),
      as_person: z.boolean().optional().describe('true ONLY when relaying a decision the signed-in person explicitly took in the conversation; the act is stamped as theirs, through the ai_client channel'),
    },
    async (args) => json(await withWriteLock(`${args.project_id}:evolution`, () => applyEvolutionBatchHandler(args, lyriks))),
  )

  mcp.tool(
    'get_roadmap',
    'The project roadmap as ONE aggregate: releases and sprints with their derived lifecycle (planned/in-progress/done, plus archived once explicitly stamped) and progress %, every feature with its workflow status AND its implementation coverage from the last code-adoption sync, drift flags where the two disagree, and the unscheduled backlog. START HERE when the question is "what is there to do": it is project-wide, precomputed server-side and needs NO .unspa.json index, unlike get_implementation_gaps (one feature at a time) and get_implementation_drift. Three drift flags: "spec-moved-since-sync" (the feature spec was edited after the last index sync, so its coverage no longer describes the current spec and its numbers mean nothing until someone re-syncs: this is how a PO-side enrichment surfaces), "done-but-code-incomplete" and "code-complete-but-not-done". Each feature also carries implementation.updatedAt (last sync) and implementation.specUpdatedAt (last spec edit) so you can judge staleness yourself. Read this instead of get_section(features) when the question is delivery state; it is exactly what the Roadmap tab shows. Write through apply_roadmap_batch, not patch_section.',
    { project_id: z.string().describe('Lyriks project id (from list_wizard_projects)') },
    async (args) => json(await getRoadmapHandler(args, lyriks)),
  )

  mcp.tool(
    'apply_roadmap_batch',
    'Manage the roadmap with typed operations instead of hand-rolled patch_section surgery: create/update/archive/unarchive/remove a release or sprint, assign a feature to a release or sprint (null unassigns), set a feature\'s workflow status or assignee. The batch is ATOMIC (nothing lands unless every op is valid) and every cascade the dashboard performs happens server-side too: removing a release also removes its feature assignments, removing a sprint detaches its work items, so no dangling rows. Archiving is the explicit act that pins a done release/sprint in history ("done" itself is always derived from feature/item statuses). Field requirements per op are validated server-side with every issue reported at once; get_roadmap first for current ids.',
    {
      project_id: z.string().describe('Lyriks project id'),
      operations: z.array(z.object({
        op: z.enum([
          'create_release', 'update_release', 'archive_release', 'unarchive_release', 'remove_release',
          'create_sprint', 'update_sprint', 'archive_sprint', 'unarchive_sprint', 'remove_sprint',
          'assign_feature_to_release', 'set_feature_sprint', 'set_feature_status', 'set_feature_assignee',
        ]).describe('What to do; the other fields depend on it'),
        id: z.string().optional().describe('create_*: explicit id for the new release/sprint (optional)'),
        releaseId: z.string().nullable().optional().describe('*_release ops: target release · assign_feature_to_release: destination (null = unschedule)'),
        sprintId: z.string().nullable().optional().describe('*_sprint ops: target sprint · set_feature_sprint: destination (null = no sprint)'),
        featureId: z.string().optional().describe('Feature ops: the leaf feature id'),
        name: z.string().optional(),
        version: z.string().optional().describe('Releases: the badge label, e.g. "V1"'),
        description: z.string().optional(),
        weekStart: z.number().optional(),
        weekEnd: z.number().optional(),
        startDate: z.string().optional().describe('Sprints: ISO yyyy-mm-dd'),
        endDate: z.string().optional().describe('Sprints: ISO yyyy-mm-dd'),
        order: z.number().optional().describe('update_*: position in the schedule'),
        status: z.enum(['backlog', 'in-progress', 'done']).optional().describe('set_feature_status: the workflow status'),
        assigneeId: z.string().nullable().optional().describe('set_feature_assignee: collaborator id (null = unassigned)'),
      })).describe('Ordered, atomic list of roadmap edits'),
    },
    async (args) => json(await withWriteLock(`${args.project_id}:features`, () => applyRoadmapBatchHandler(args, lyriks))),
  )

  mcp.tool(
    'reconcile_roadmap_statuses',
    'Align feature workflow statuses with recorded implementation coverage, on demand: a feature whose spec entities are ALL located in code becomes done, a partially-located one leaves backlog for in-progress. UPGRADE-ONLY: an offline engine or missing coverage never lowers a status, and a hand-set done is respected. sync_implementation_index / report_implementation_status already trigger this automatically after a landed sync; call it explicitly to re-align after manual status edits, optionally scoped with feature_ids. Returns the statuses it raised.',
    {
      project_id: z.string().describe('Lyriks project id'),
      feature_ids: z.array(z.string()).optional().describe('Limit the alignment to these leaf features'),
    },
    async (args) => json(await withWriteLock(`${args.project_id}:features`, () => reconcileRoadmapHandler(args, lyriks))),
  )

  mcp.tool(
    'seed_implementation_index',
    'ADOPTION ONLY (existing code modeled into the spec): turn a finalized analysis into behavioral-index entries. Every code span becomes {file, line, signature} with status implemented and a stamped specVersion, which is what arms drift detection. Returns the entries and writes NOTHING: the index belongs to your checkout, so write them under `index` in the repo\'s .unspa.json yourself, then call sync_implementation_index. One analysis pass therefore yields the model, its provenance AND the spec↔code map. It refuses ("No spans recorded") on a feature that was specified first and coded afterwards, and that refusal is not a request to record spans: for that direction write the index entries yourself (one key per element, rule:/invariant:/surface_rule:/surface_invariant:/event:/state:/transition: included, each at the line that applies it, status implemented|partial|missing, specVersion = the feature updatedAt) and call sync_implementation_index.',
    {
      project_id: projectIdArg,
      feature_id: featureIdArg,
      overwrite: z.boolean().optional().describe('Replace entries that already exist for these elements'),
    },
    async (args) => json(await seedIndexHandler(args, lyriks)),
  )

  mcp.tool(
    'sync_implementation_index',
    'Push implementation coverage for a whole project from the index you hold: pass the `index` object out of your repo\'s .unspa.json and the engine resolves every key against the spec, reporting status for each action and surface in one call. Prefer this over report_implementation_status once an index exists. Each entry\'s `signature` (one real code line) is its evidence: the engine cannot open your files, so an entry without a signature lands as `unverified` in the dashboard. Seed entries from spans via seed_implementation_index, or copy the real line into `signature` yourself. YOU MAY SEND A PARTIAL INDEX: actions and surfaces absent from the index you send are left untouched (their previous reports stay) and are only counted in `skipped`. The unit that must travel together is an action or surface entry WITH all of its children (rule:, invariant:, transition:, event: for an action; state:, surface_rule:, surface_invariant: for a surface), because a report REPLACES the located entities of that action or surface. So after changing one feature, sending only that feature\'s keys is safe and keeps the call small. The answer carries the counters, a `semantics` object saying what each one means, and `failedAcks` (only the refused reports; pass verbose:true for the acknowledgement of every action and surface). `synced` counts reports written, one per action and per surface that has its own entry; child keys are folded into their parent\'s report and not counted separately. The `stale` and `healed` blocks of THIS tool are about code location (a signature no longer found at its line) and are not evaluated when the index is sent inline, which is always the case here: zero there is not a clean bill, and spec drift is read with get_implementation_drift. A newer engine also answers `criteria`, every acceptance criterion with its standing, whether an index entry verifies it and how that went (`verified`, `failing`, `unverified`, or `none` when nothing verifies it), marked `stale` when its text changed after the result, and `verified`, how many actions are PROVEN against the code (their index entry carries the `verifiedAt` stamp a passing scenario run leaves), apart from the ones merely located; an older engine sends neither and the fields are absent. An index entry keyed `criterion:<id>` may carry `verification { kind, command, files, artifacts, lastResult { passed, at, summary, revision } }`: what checks that criterion and how it last went. `criteria.entries` is cut to its first 50 rows with `criteria.total` kept. The `orphans` block lists index keys that match no spec entity (typo, renamed or removed) and `shared` the keys several features declare, each cut to its first 50 entries with `total` kept; `ok` is true only when there are no orphans and no refused report.',
    {
      project_id: projectIdArg,
      index: z
        .record(z.string(), z.unknown())
        .describe('The `index` object from your .unspa.json, keyed "<type>:<id-or-path>". May be partial: an action or surface entry travels with all of its children'),
      verbose: z.boolean().optional().describe('Also return `acks`, one row per action and surface reported; default false returns only the refused ones as `failedAcks`'),
    },
    async (args) => json(await syncIndexHandler(args, lyriks)),
  )

  mcp.tool(
    'report_implementation_status',
    'Report where spec entities live in the code, for one action/surface or for many at once via `entries`. YOU supply file, line AND `snippet` (the exact code at that location) — the server never opens a repo file, so the snippet is the only evidence it can hold; the engine backfills what it can from the source spans recorded during adoption and stamps every location left without code evidence `unverified`, which the dashboard shows as a claim, not a verification. Prefer the evidence flow (attach_source + record_element_spans + seed_implementation_index + sync_implementation_index): it makes evidence automatic. Use this direct form only while modeling, before an index exists.',
    {
      project_id: projectIdArg,
      feature_id: featureIdArg,
      action_id: z.string().optional().describe('Scope to one action'),
      surface_id: z.string().optional().describe('Scope to one surface'),
      found_entities: z
        .array(
          z.object({
            entity_type: z.string().describe('action | surface | state | rule | invariant | event | transition | …'),
            entity_id: z.string(),
            locations: z.array(
              z.object({
                file: z.string().describe('Repo-relative path'),
                line: z.number().int().nonnegative().optional(),
                snippet: z.string().optional(),
              }),
            ),
          }),
        )
        .optional()
        .describe('Single-scope form'),
      entries: z
        .array(
          z.object({
            action_id: z.string().optional(),
            surface_id: z.string().optional(),
            found_entities: z.array(
              z.object({
                entity_type: z.string(),
                entity_id: z.string(),
                locations: z.array(
                  z.object({
                    file: z.string(),
                    line: z.number().int().nonnegative().optional(),
                    snippet: z.string().optional(),
                  }),
                ),
              }),
            ),
          }),
        )
        .optional()
        .describe('Batch form — many scopes in one call'),
    },
    async (args) => json(await reportStatusHandler(args, lyriks)),
  )

  mcp.tool(
    'get_implementation_status',
    'Current implementation status for one feature, optionally scoped to a surface or action: which entities are recorded as implemented, partial or missing, and where each was last located. A newer engine also answers `criteria`, every acceptance criterion with its standing, whether an index entry verifies it and how that went (`verified`, `failing`, `unverified`, or `none` when nothing verifies it), marked `stale` when its text changed after the result, and `verified`, how many actions are PROVEN against the code (their index entry carries the `verifiedAt` stamp a passing scenario run leaves), apart from the ones merely located; an older engine sends neither and the fields are absent. An index entry keyed `criterion:<id>` may carry `verification { kind, command, files, artifacts, lastResult { passed, at, summary, revision } }`: what checks that criterion and how it last went.',
    {
      project_id: projectIdArg,
      feature_id: featureIdArg,
      surface_id: z.string().optional(),
      action_id: z.string().optional(),
    },
    async (args) => json(await getStatusHandler(args, lyriks), 'get_implementation_status'),
  )

  mcp.tool(
    'get_implementation_gaps',
    'Cross-reference the index you hold against the spec: what the model declares that the code map has not located yet. Each row carries both the `key` used in .unspa.json (e.g. state:cart.itemCount) and the canonical `entity_id` that report_implementation_status accepts — for states those differ. Omit feature_id for the PROJECT-WIDE roll-up: one row per feature holding spec entities ({featureId, name, total, implemented, partial, missing}, worst first), plus project totals and an `unavailable` list of leaves the engine could not answer for. Use that to pick which features to open, then call again with feature_id for the element-level detail. Pass entries:true to read the raw index back through the engine\'s filters and pagination instead of the cross-reference.',
    {
      project_id: projectIdArg,
      index: z.record(z.string(), z.unknown()).describe('The `index` object from your .unspa.json'),
      feature_id: z.string().optional().describe('Scope to one feature; omit for the project-wide roll-up'),
      entries: z.boolean().optional().describe('Return the raw index slice instead of the gap analysis'),
      filters: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('With entries:true — key, entityTypes, status, offset, limit, statsOnly'),
    },
    async (args) => json(await gapsHandler(args, lyriks), 'get_implementation_gaps'),
  )

  mcp.tool(
    'get_implementation_drift',
    'Spec-to-code drift: which implementations were audited against an OLDER version of the spec than the one now in the kernel, so the code may no longer match. "Stale" HERE means the SPEC element changed after the audit recorded in the entry (its `specVersion`); it is unrelated to the `stale` block of sync_implementation_index, which is about a code line that moved. Three buckets: `stale` (re-audit: the spec moved under them), `unversioned` (audited but never stamped, so drift cannot be judged) and `orphans` (index keys that no longer resolve to any spec entity). The answer opens with `summary`: `checked`, the total of each bucket, `staleByScope`, `staleByFeature` (featureId to count, the 50 largest, `moreFeatures` counting the rest) and `staleByFile` (the file your own index maps each stale key to, the 50 largest, `moreFiles`), which is what you plan the re-audit from. Then ONE bucket, PAGED: `rows`, `total`, `offset`, `returned`, `nextOffset` (null on the last page); a page holds up to `limit` rows and fewer when they would not fit one answer, so always continue from `nextOffset`. Each stale row carries `file` and `line` from your index when it has them. This is the payoff of adoption: seeding the index stamps a specVersion on every entry, so this answers meaningfully from day one. Granularity: each entry is judged against the CURRENT version of the exact element it maps, so a changed rule no longer implicates its neighbours. Every stale row carries `scope`: "element" (this entity moved, real evidence) or "feature" (only the feature-wide stamp was available, so the row is suspect by association). A feature written before per-element stamps reports "feature" until its next edit, which calibrates it. Omit feature_id to sweep the whole project.',
    {
      project_id: projectIdArg,
      index: z.record(z.string(), z.unknown()).describe('The `index` object from your .unspa.json'),
      feature_id: z.string().optional().describe('Limit the sweep to one feature'),
      bucket: z.enum(['stale', 'unversioned', 'orphans']).optional().describe('Which list `rows` pages through (default "stale"); the summary always covers all three'),
      limit: z.number().int().min(1).max(200).optional().describe('Rows per page (default 50, max 200)'),
      offset: z.number().int().min(0).optional().describe('Continue from nextOffset of the previous page (default 0)'),
    },
    async (args) => json(await driftHandler(args, lyriks), 'get_implementation_drift'),
  )

  return mcp
}
