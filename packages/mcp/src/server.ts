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
import {
  SECTIONS,
  listProjectsHandler as listWizardProjectsHandler,
  createWizardProjectHandler,
  getSectionHandler,
  setSectionHandler,
  patchSectionHandler,
  describeSectionHandler,
  getImplementationContextHandler,
} from './tools/sections.js'
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
import { capResult } from './util/shape.js'
import { withWriteLock } from './util/write-lock.js'

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
        '("claude" | "codex" | "gemini" | "copilot" | "generic") and the contentHash frontmatter ' +
        'line of each SKILL.md you already have, then install each returned installContent the ' +
        'way its installTargets entry says (write the file, and merge pointerBlock into ' +
        'pointerPath when there is one), then follow the relevant skill — ' +
        'lyriks-build to author a project end-to-end, lyriks-design before building or editing ' +
        'any screen, lyriks-behavior when creating features, lyriks-retrospec when ' +
        'reverse-engineering an EXISTING product or codebase into its spec, lyriks-delivery when ' +
        'the spec meets a tracker (turning features into tickets, and re-syncing once code lands). ' +
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
  const json = (result: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(capResult(result)) }],
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
    'Reconcile locally installed Lyriks authoring skills with this server. Works for ANY agent runtime, not just Claude. Set `client` to what you are ("claude" | "codex" | "gemini" | "copilot" | "generic") so the response carries your layout alone; omit it and every layout comes back for you to choose from. First read the `contentHash:` frontmatter line of each installed SKILL.md you have, under `.claude/skills/<id>/` or `.agents/skills/<id>/` (missing file or missing line = omit the hash). Pass them as `installed`; omit or send [] on a fresh machine — everything then comes back as "new". Response: { skills: [{ id, name, description, contentHash, status: "up-to-date"|"update"|"new", installPath, installTargets: [{ client, label, path, pointerPath?, pointerBlock? }], installContent? }], unknown: [ids] }. For each entry that carries `installContent`, take the `installTargets` item matching your runtime and: (1) write `installContent` VERBATIM to `path` (create directories as needed); (2) when the target also has `pointerPath`, merge `pointerBlock` into that file — replace the region between its `<!-- lyriks-skill:<id> -->` and `<!-- /lyriks-skill:<id> -->` markers if present, otherwise append the block, and change NOTHING else in that file (it belongs to the user). Entries without installContent are already current. Ids in `unknown` are not published by this server — leave those local skills alone. Call this at the START of any session that will author Lyriks project data, before following a skill.',
    {
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
  // Everything a user can do in the app's capabilities, over MCP. Writes hit the wizard app's
  // per-section PUT (with sync side-effects); reads hit the wizard app's section read.
  mcp.tool(
    'list_wizard_projects',
    'Lists the Lyriks wizard portfolio (domains + projects) so you can find the projectId to target with the section tools. These are Lyriks project ids (e.g. "bigledger"), distinct from the project UUIDs used by list_projects. Each card carries `sourceMode` (where the project started: `code_to_spec` = created "From a codebase", the target of a codebase ingestion; `greenfield` = from scratch) and `backProjectId` when Enterprise links it to a portfolio record (the UUID-addressed tools accept the wizard slug directly too).',
    {},
    // Best-effort: the overlay stamps each card with what it knows about it.
    async () => {
      const portfolio = await listWizardProjectsHandler({}, lyriks)
      return json(ee ? await ee.portfolio.annotateWizardPortfolio(portfolio) : portfolio)
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
      section: z.enum(SECTIONS).describe('Section to read — a WIRE id, not a screen label; describe_section reports where each one is edited'),
      summary: z.boolean().optional().describe('Return a tiny shape summary (keys + sizes) instead of the full draft — start here to discover what to drill into'),
      paths: z.array(z.string()).optional().describe('Return only these dotted sub-trees, e.g. ["designSystem","journeys","builder.screenRoots"]. Keeps huge sub-trees (builder.nodes) out unless explicitly requested'),
    },
    async (args) => json(await getSectionHandler(args, lyriks)),
  )

  mcp.tool(
    'describe_section',
    'Schema of a section so you can author it WITHOUT reading the doc or source: the empty-draft shape (every field + default), a sample item per collection (so array-item fields are visible), the allowed enum codes per field, `uiLocation` (the capability + tab where a user edits it), and authoring notes (id conventions, which write tool to use). Call this before set_section/patch_section/build_screen on an unfamiliar section — and read `uiLocation` before naming the section to a user, since several keys are legacy wire ids that match no on-screen label.',
    {
      section: z.enum(SECTIONS).describe('Section to describe'),
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
    'Query a project\'s central knowledge graph — every bounded context (roles, features, journeys, screens, entities, rules, architecture…) plus the unspa behavior model folded into ONE typed node/edge graph (what the in-app graph explorer shows). Read-only derived view; author through the section/behavior tools, not here. DRILL-DOWN FLOW: call with only project_id first — you get whole-graph stats (node/edge counts by context and kind) plus the best-connected hub nodes; then narrow with `contexts`/`kinds` filters or a `q` label search, and expand around one node with `focus_node` (+`depth`) — pass a node id ("kind:rawId"), a bare raw id, or a node label; the response\'s `focusNodeId` reports the node it landed on (an ambiguous label lands on the best-connected match; null = unknown reference, fall back to `q`). Filters and focus combine (intersection). The graph is deduplicated: each concept is ONE node (a screen/feature/entity carries both its wizard facts and its unspa behavior edges — writes/reads/emits/transitions), so follow edges instead of hunting for behavior twins. `limit` caps returned nodes keeping the best-connected; the response flags `truncated` + `matchedNodeCount` so you know to narrow. Contexts: project, foundation, users, features, experience, data, rules, architecture, coherence, behavior, engine. `source`: "merged" (default — wizard projection + behavior, + DPO verdict in Enterprise), "local" (wizard projection alone), "engine" (raw formal-engine substrate, Enterprise-only — errors otherwise).',
    {
      project_id: z.string().describe('Lyriks project id (from list_wizard_projects)'),
      source: z.enum(['merged', 'local', 'engine']).optional().describe('Graph source (default "merged"); "engine" is Enterprise-only'),
      contexts: z.array(z.string()).optional().describe('Keep only nodes from these bounded contexts, e.g. ["behavior","data"]'),
      kinds: z.array(z.string()).optional().describe('Keep only these node kinds, e.g. ["feature","entity","screen","action"]'),
      q: z.string().optional().describe('Case-insensitive substring match on node label / detail / id'),
      focus_node: z.string().optional().describe('Expand the neighborhood around one node — a node id ("kind:rawId"), a bare raw id, or a label; check `focusNodeId` in the response for where it landed'),
      depth: z.number().int().positive().optional().describe('Neighborhood radius in undirected hops (default 1, with focus_node)'),
      limit: z.number().int().positive().optional().describe('Max nodes returned (best-connected win); also sizes the bare-call overview'),
    },
    async (args) => json(await getKnowledgeGraphHandler(args, lyriks)),
  )

  mcp.tool(
    'set_section',
    'Writes one section\'s full draft for a project — everything a user can do in the capability that owns it. FULL REPLACE: any sub-tree you omit is DROPPED (e.g. `collections` seeded by import_data_collections, or `builder.nodes`) — for targeted edits prefer patch_section, which preserves everything you don\'t touch. When existing non-empty top-level sub-trees are absent from your document, the write still lands but returns `warnings` naming what was dropped. Pass the complete section document (get_section first, modify, then set); a document shaped {__ops:[...]} is treated as a patch_section call. projectId is stamped automatically. The write runs lyriks\'s real save use-case + sync side-effects, so it shows in the UI.',
    {
      project_id: z.string().describe('Lyriks project id'),
      section: z.enum(SECTIONS).describe('Section to write — a WIRE id, not a screen label; describe_section reports where each one is edited'),
      document: z.record(z.unknown()).describe('The full section draft document (validated server-side by the wizard app)'),
    },
    async (args) => json(await withWriteLock(`${args.project_id}:${args.section}`, () => setSectionHandler(args, lyriks))),
  )

  mcp.tool(
    'patch_section',
    'Targeted edit of a section without resending the whole document — ideal when a section carries large sub-trees (e.g. the Experience builder) you must not retransmit. The MCP server reads the current draft, applies your operations in order, and writes it back through lyriks\'s real save use-case (same sync side-effects as set_section). Operations: {op:"set", path, value} assigns a dotted path — segments may be object keys OR array indices (e.g. "activeTab", "designSystem.colors.primary", "builder.collections.7.fields.5.options"); {op:"merge", collection, id, value, insert?} shallow-merges value into the id-keyed array item (journeys/steps/screens/components/elements/templates), or appends it when insert=true and no match; for KEYLESS rows (no id field, e.g. users "permissions") address with match:{field:value,...} instead of id — insert-via-match appends value verbatim with no id injected; {op:"remove", collection, id|match} deletes that array item, or {op:"remove", path} deletes a key at a dotted path (e.g. an object-map entry like "builder.nodes.<id>" or "builder.screenRoots.<id>"). `collection` also accepts a dotted path to a nested array (e.g. "builder.collections"). Together these give full create/update/delete over any section.',
    {
      project_id: z.string().describe('Lyriks project id'),
      section: z.enum(SECTIONS).describe('Section to patch — a WIRE id, not a screen label; describe_section reports where each one is edited'),
      operations: z.array(z.object({
        op: z.enum(['set', 'merge', 'remove']).describe('"set" a dotted path · "merge" into an id- or match-keyed array item · "remove" an array item or a path'),
        path: z.string().optional().describe('set/remove: dotted path (keys and/or array indices), e.g. "designSystem.radiusPx" or "builder.nodes.<id>"'),
        collection: z.string().optional().describe('merge/remove: array name — top-level or dotted path, e.g. "journeys", "builder.collections"'),
        id: z.string().optional().describe('merge/remove: id of the array item (id-keyed collections)'),
        match: z.record(z.unknown()).optional().describe('merge/remove: field-equality selector for KEYLESS rows (no id field), e.g. {"roleId":"admin","capabilityId":"cap-x"}'),
        insert: z.boolean().optional().describe('merge: append a new item when none matches (id is stamped only when addressing by id)'),
        value: z.unknown().describe('set: the value to assign · merge: the partial object to shallow-merge'),
      })).describe('Ordered list of targeted edits'),
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
            setState: z.tuple([z.string(), z.unknown()]).optional(),
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
    'Headlessly RUN the prototype to prove a flow works — the verify half of the build loop, no browser. Initialises run state (optionally as a persona, so gates apply; omit for an author run with all gates open) from a start screen (default: the builder entry screen), then applies your ordered `actions` through the real run-mode engine. Each action targets an element by `nodeId` (preferred — from build_screen output / get_section) or by `label` on the current (or `screenId`) screen; set `type` to enter an input value, else the element is interacted with `trigger` (default "change" for inputs, else "click"); set `expectError:true` on a step that is SUPPOSED to fail (a deliberately blocked click, a guard that must reject) — its errors are recorded on the action (`expectedErrorMet`) but consumed, so a proven negative path keeps `ok:true`, and raising no error when one was promised fails instead. Returns: finalScreenId, the live `state` (dotted paths), `visited` screens in order, collection row counts, the activity trace, `errors` (validation / scenario / broken navigation / unbound action) with per-action `newErrors`, `warnings` (non-fatal authoring smells, e.g. a createRecord that captured no input values), plus `ok` (true when no unexpected error). Nothing is persisted. PER-ROW: add `rowIndex:<N>` to an action to fire it in row N of the list repeating that element (the action result echoes the `rowKey` it hit), which is the only way to prove "connect THIS app" / "choose THIS plan" flows. TABS/SIDEBAR: add `tab:<N>` to an action targeting a `tabs` or `sidebar` GROUP (by nodeId/label) to switch it to panel N headlessly, the same state write its tab bar / aside menu performs.',
    {
      project_id: z.string().describe('Lyriks project id'),
      persona_id: z.string().optional().describe('Run as this role id from the users section (persona gates apply); omit for an author run (all gates open)'),
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
    async (args) => json(await verifyExperienceHandler(args, lyriks)),
  )

  mcp.tool(
    'import_data_collections',
    'Raise prototype fidelity by seeding the simulator\'s fake backend from the REAL data model: each entity becomes an editable collection whose fields carry the right generator kind for their declared type, so lists/forms read the shapes the product will actually persist. Imports ALL entities by default, or pass `entity_names` for a subset. Idempotent — an entity already backing a collection (recorded provenance, or name match) is skipped. Pass `refresh:true` after the data section changed to also re-sync those existing collections: their name and fields follow the model again, while author demo knobs (seed counts, authored rows) are kept. Returns {imported, updated, skipped, total}. Run this before binding lists/forms so the bound data matches the data model instead of generic placeholders.',
    {
      project_id: z.string().describe('Lyriks project id'),
      entity_names: z.array(z.string()).optional().describe('Only import these entity names from the data section (default: all entities)'),
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
      json(ee ? await ee.portfolio.getProject(args) : await getProjectWithoutBack(args, lyriks)),
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
    'Author BEHAVIOR DEPTH on a feature — the full Unspaghettit vocabulary (state definitions, rules, effects, invariants, parameters, events, scenarios, reachability goals, transitions, personas, resources, entities) applied as one atomic add/update/remove/move batch. This is the write half of build_screen/patch_section: use it to detail what a screen or step actually DOES (guards, state changes, emitted events, model-checked scenarios), not just its layout. Runs through the platform engine under your auth and writes the shared model, so depth survives wizard re-saves. `feature_id` is a kernel feature id (a features-section leaf id, or "<projectId>__experience" for journey/step behavior, "<projectId>__data_model" for entities) — get it from get_behavior_context or list_wizard_projects. Each op is `{ kind, ref?, ...args }`; add ops can set `ref` so later ops in the SAME batch reference the new id via `*Ref`. Pass dry_run:true to validate + score without saving (STRONGLY recommended first). Returns `{ available, batch }`: `batch.ok:true` applied (with `refs`, `appliedCount`, `maturityPercentage`); `batch.ok:false` REJECTED — read `batch.errors` and fix. Op-kind schema reference: build a batch against the vocabulary in the tool docs (add_state_definition, add_action_rule{rule:{category,condition?,effect:{type,...}}}, add_scenario{surfaceId|actionId,expectedAssertions}, add_reachability_goal, ...). Common gotchas: add_resource/add_reachability_goal nest their own `kind` under resourceKind / the arg (it collides with the op discriminator); block an action with effect {type:"block_action"} not "block"; requiredStates is string[] of paths, use rules for value guards. RULES ARE MANDATORY ON EVERY NEW ACTION — this is the product\'s core reading ("which rules are active"), not a nicety: an `add_action` op is REJECTED unless the same batch also carries at least one `add_action_rule` with that action\'s `actionRef` (so always give `add_action` a `ref`). Ask yourself what gates the action — permissions, state, quota, validity — and encode it. If it is genuinely unconditional, say so AS A RULE: an `add_action_rule` with no `condition` and `effect:{type:"allow_action",description:"…"}`; that records the decision instead of leaving a silent gap.',
    {
      project_id: z.string().describe('Lyriks project id / slug that OWNS the feature (from list_wizard_projects) — authorizes the write'),
      feature_id: z.string().describe('Kernel feature id: a features-section leaf id, or "<projectId>__experience" (journeys/steps) / "<projectId>__data_model" (entities)'),
      operations: z.array(z.record(z.unknown())).optional().describe('Ordered Unspaghettit ops, each { kind, ref?, ...kindArgs } — see the tool description for the op-kind vocabulary. Every `add_action` MUST be paired with at least one `add_action_rule` on its `ref` in this same batch, else the whole batch is rejected. Omit when committing a prior dry-run by `commit` token'),
      dry_run: z.boolean().optional().describe('Validate + score without saving (recommended before a real apply). A valid dry-run returns batch.commitToken'),
      commit: z.string().optional().describe('A commitToken from a prior valid dry_run — saves that exact validated batch WITHOUT resending operations. Single-use, expires after 5 minutes'),
      verbose: z.boolean().optional().describe('Include the per-issue verification report, not just aggregate counts'),
    },
    async (args) => json(await applyBehaviorBatchHandler(args, lyriks)),
  )

  mcp.tool(
    'get_behavior_context',
    'Resolve a project entity to its BEHAVIOR-MODEL address — the ids apply_behavior_batch needs — so you never hand-translate "journey-triage" into "srf-journey-triage" or "step-tri-3" into "act-step-tri-3". Pass the project plus ONE of journey_id / step_id / screen_id (or a raw surface_id / action_id) and get back { featureId, surfaceId, actionId, name, found, depth }, where depth is a connectivity snapshot { statesWritten, statesRead, eventsEmitted, transitions, actions }. Use it to discover the feature_id + surface/action to target, and to see at a glance how much a step already models. found:false means the entity isn\'t in the model yet (author it first); the ids still come back so you know where it WILL live.',
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
    'Read the canonical Unspaghettit feature tree through authenticated Lyriks, including stable ids for surfaces, actions, rules, effects, states, scenarios, invariants, entities and resources. Use paths to fetch focused branches (for example "snapshot.feature.surfaces") when the complete feature is large. This is the required read between apply_behavior_batch calls because batch refs only live within one batch.',
    {
      project_id: z.string().describe('Lyriks project id / slug that owns the feature'),
      feature_id: z.string().describe('Kernel feature id'),
      paths: z.array(z.string()).optional().describe('Optional dotted paths into the response for focused reads'),
      summary: z.boolean().optional().describe('Return a compact shape instead of the complete snapshot'),
    },
    async (args) => json(await readBehaviorFeatureHandler(args, lyriks)),
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
    async (args) => json(await scoreBehaviorFeatureHandler(args, lyriks)),
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
    'Discover the exact apply_behavior_batch vocabulary from the running Unspaghettit engine, so schemas stay aligned with the installed version. With no query returns section headings; query an operation name or concept (for example "add_scenario", "invariant", "remove_effect") for matching schema excerpts.',
    {
      project_id: z.string().describe('Lyriks project id / slug used for authenticated access'),
      query: z.string().optional().describe('Operation name or concept to search for'),
    },
    async (args) => json(await getBehaviorOperationsHandler(args, lyriks)),
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
    'Store a source file you have read as evidence for one feature, so the elements you model from it can be traced back to it. Pass kind:"code" when adopting an implementation file — file_name must then be the repo-relative path (e.g. src/lib/cart.ts), because spans recorded against a code source are what seed_implementation_index turns into the spec↔code map. Identical content is deduplicated: re-attaching the same text links the existing source instead of storing a copy. Character offsets you later report in record_element_spans index into the exact content you pass here. Set authority/artifact to rank the source so a later contradiction resolves by authority rather than by which document was ingested last. Note: the stored copy lives in the project on the server — attach implementation files, not secrets. Pass kind:"file" for a document with no web address that a feature\'s model rests on (the text of a PDF the user handed you, an exported page): stored here it stays readable through list_sources, which is what keeps that evidence reachable.',
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
    async (args) => json(await listSourcesHandler(args, lyriks)),
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
    async (args) => json(await getProvenanceHandler(args, lyriks)),
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
    'Push implementation coverage for a whole project from the index you hold: pass the `index` object out of your repo\'s .unspa.json and the engine resolves every key against the spec, reporting status for each action and surface in one call. Prefer this over report_implementation_status once an index exists. Each entry\'s `signature` (one real code line) is its evidence: the engine cannot open your files, so an entry without a signature lands as `unverified` in the dashboard. Seed entries from spans via seed_implementation_index, or copy the real line into `signature` yourself. The response\'s `orphans` block lists index keys that match no spec entity (typo, renamed or removed) and `ok` is true only when there are none.',
    {
      project_id: projectIdArg,
      index: z
        .record(z.string(), z.unknown())
        .describe('The `index` object from your .unspa.json, keyed "<type>:<id-or-path>"'),
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
    'Current implementation status for one feature, optionally scoped to a surface or action: which entities are recorded as implemented, partial or missing, and where each was last located.',
    {
      project_id: projectIdArg,
      feature_id: featureIdArg,
      surface_id: z.string().optional(),
      action_id: z.string().optional(),
    },
    async (args) => json(await getStatusHandler(args, lyriks)),
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
    async (args) => json(await gapsHandler(args, lyriks)),
  )

  mcp.tool(
    'get_implementation_drift',
    'Spec→code drift: which implementations were audited against an OLDER version of the spec than the one now in the kernel, so the code may no longer match. Returns `stale` (re-audit — the spec moved under them), `unversioned` (audited but never stamped, so drift cannot be judged) and `orphans` (index keys that no longer resolve to any spec entity). This is the payoff of adoption: seeding the index stamps a specVersion on every entry, so this answers meaningfully from day one. Granularity: each entry is judged against the CURRENT version of the exact element it maps, so a changed rule no longer implicates its neighbours. Every stale row carries `scope`: "element" (this entity moved, real evidence) or "feature" (only the feature-wide stamp was available, so the row is suspect by association). A feature written before per-element stamps reports "feature" until its next edit, which calibrates it. Omit feature_id to sweep the whole project.',
    {
      project_id: projectIdArg,
      index: z.record(z.string(), z.unknown()).describe('The `index` object from your .unspa.json'),
      feature_id: z.string().optional().describe('Limit the sweep to one feature'),
    },
    async (args) => json(await driftHandler(args, lyriks)),
  )

  return mcp
}
