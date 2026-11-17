// MCP server registration.
//
// Creates a McpServer and registers every tool.
// Called once per request in stateless mode — fresh McpServer per POST /mcp.

import { EVOLUTION_TOOLS, OPEN_SCOPE, type EditionScope } from './edition-scope.js'
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
import { withSpecLanguage } from './tools/spec-language.js'
import { LyriksClient }             from './lyriks-client.js'
import { readPortfolio } from './util/portfolio-read.js'
import { getCapabilitiesHandler } from './tools/capabilities.js'
import {
  READABLE_SECTIONS,
  SECTIONS,
  listProjectsHandler as listWizardProjectsHandler,
  createWizardProjectHandler,
  getSectionHandler,
  setSectionHandler,
  patchSectionHandler,
  describeSectionHandler,
  refuseRetiredPrototypeInProject,
  withoutRetiredPrototypeInProject,
} from './tools/sections.js'
import { INCREMENTAL_OPS } from './util/validate-section-patch.js'
import { buildScreenHandler } from './tools/build_screen.js'
import { listSkillsHandler, getSkillHandler, syncSkillsHandler, type SelfInstallSource } from './tools/skills.js'
import { CANDIDATE_DECISIONS, CANDIDATE_KINDS, SPAN_TARGETS_NOTE } from './tools/adoption.js'
import { getKnowledgeGraphHandler } from './tools/knowledge_graph.js'
import {
  assessProjectCompletenessHandler,
  auditProjectScopeHandler,
  finishProjectHandler,
} from './tools/completion.js'
import {
  createDomainHandler,
  deleteDomainHandler,
  deleteWizardProjectHandler,
  listDomainsHandler,
  updateWizardProjectHandler,
} from './tools/lyriks-portfolio.js'
import { addElementHandler } from './tools/add_element.js'
import { wireElementHandler } from './tools/wire_element.js'
import { checkDesignHandler, getDesignSystemHandler } from './tools/design-system.js'
import {
  applyBehaviorBatchHandler,
  assessBehaviorFeatureHandler,
  simulateBehaviorHandler,
  whatIfHandler,
  proveProjectRulesHandler,
  whatIfProjectHandler,
  getDataLinksHandler,
  linkDataFieldsHandler,
  applyProjectBehaviorBatchHandler,
  readProjectBehaviorHandler,
  findStateReferencesHandler,
  generateBehaviorTypesHandler,
  getBehaviorContextHandler,
  getBehaviorOperationsHandler,
  readBehaviorFeatureHandler,
  scoreBehaviorFeatureHandler,
} from './tools/behavior.js'
import { exportBehaviorScenariosHandler } from './tools/behavior_scenarios.js'
import {
  attachSourceHandler,
  citePassagesHandler,
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
import { SESSION_LIMITS, awaitEvolutionEventHandler, startEvolutionSessionHandler, updateEvolutionSessionHandler } from './tools/evolution-session.js'
import { reportRetrospecReadingHandler } from './tools/retrospec-reading.js'
import { capResult } from './util/shape.js'
import { CAP_HINTS, type HintedTool } from './util/cap-hints.js'
import { withWriteLock } from './util/write-lock.js'
import { declareToolEffects } from './util/tool-annotations.js'

// Whenever a client tells a person that something waits on them, the person
// gets there in one click: every place a person acts on carries its own link,
// made whole by the server that knows which installation it serves.
const PERSON_LINKS =
  'LINKS FOR THE PERSON: every place a person acts on carries `href`, an absolute link to the page that opens ON that place: ' +
  'each request card, the dossier itself, `proposals.href` (the first proposal waiting), `gate.href` (the next gate, to cross or waive), ' +
  'every proposal, every field row, every report line, every observation, and every refused result a person resolves. ' +
  'Whenever you tell the person that something waits on them (a signature, an open question, a gate, a line to decide, a remark to rule), ' +
  'hand them that href as a clickable markdown link, one per thing, instead of describing where to click; never build a page address yourself. ' +
  'Hand one too whenever the page shows what your answer talks about better than the chat (a request, a proposal, a report line, a finding). ' +
  'In the turn you hand a link, open the person\'s live session on the project first when none of yours is open (start_evolution_session, ' +
  'in the background, without a word unless it fails), so what they do on that page reaches you; never open one merely because you use this MCP.'

// The one rule about Evolution, spelled once. The instructions, both Evolution
// tools, the binding block and the per-prompt hook carry this same text, so a
// client that reads two of them never finds two different rules. Evolution used
// to be the mandatory door for every change; field use showed a dossier for a
// two-line fix cost more than the fix, so agents skipped it anyway. It is now a
// tool the person reaches for, not a toll on every change.
export const EVOLUTION_IS_OPTIONAL =
  'Evolution is OPTIONAL. A change to an existing product is made directly: the spec first through ' +
  'the section tools (apply_behavior_batch, patch_section), then the code, ' +
  'then sync_implementation_index. Open an Evolution request (get_evolution / apply_evolution_batch, ' +
  'the lyriks-evolution skill) only when the person asks for one, or asks for a change to be QUALIFIED ' +
  'before anyone decides it (what it would involve, an impact report, an estimate, a decision that ' +
  'belongs to someone else): the dossier then carries the change as a draft (add_draft_leaf), reads its ' +
  'impact and coherence on the product as it would be, and writes the change into the sections only when it lands ' +
  '(declared live, or its branch merged into the deployment branch), never at the freeze into Verify. ' +
  'Never open a dossier on your own for an ordinary change, and never hold a change back because no ' +
  'dossier exists. A change the person is already carrying in an open request continues in that request.'

// What Lyriks answers and what the client's own code tools answer, spelled once
// (criterion 4cfd9e34). The binding block and the per-prompt hook the platform
// ships say the same. Field use on a 1.2M-line monolith: the agent either asked
// Lyriks what only the code holds (how to call an API) or searched the code
// from nothing after reading the rule; both rated the spec as a detour.
export const SPEC_AND_CODE_TOOLS =
  'LYRIKS AND YOUR CODE TOOLS: Lyriks answers what the product must do, why, and where the code implements it; ' +
  'your own code tools (your search, a code search service, a code graph, your editor) answer how the code is written. ' +
  'A question about how the product behaves reads the spec first, then follows the places the read gives ' +
  '(`code` on a get_behavior_feature read of an action or a surface: file, line, code line) into those tools ' +
  'and checks the code against the spec; where they differ, tell the person instead of resolving it either way. ' +
  'A question about the code alone (how to call an API, an internal mechanism, a library, code the project ' +
  'does not specify) goes to your code tools directly, without a Lyriks call.'

// `ee` is the Enterprise overlay bound to the caller, or null on the Community
// edition: the portfolio tools then answer from the platform, and the tools only
// Enterprise serves are registered as stand-ins that say so.
/** A tool description with a paragraph appended, for descriptions kept on one line. */
const withDraftNote = (description: string, note: string): string => `${description} ${note}`

const DRAFT_BATCH_NOTE =
  'SCOPE FENCE: set_non_goals { nonGoals: [] } and set_expected_actions { expectedActions: [] } replace what the feature deliberately will not do and the actions it commits to building (get_behavior_operations has every op). PROJECT LEVEL: cross-feature invariants and canonical state variables go through apply_project_behavior_batch; a change to those invariants that an Evolution request carries goes through apply_evolution_batch add_rule_draft instead, which writes nothing before the landing. EVOLUTION DRAFTS: feature_id may be a draft an Evolution request carries (`draft:...`). The same operations and guards apply, validated by the engine over what the draft stands for (the feature it amends, or an empty feature for an addition), and the batch is appended to the DRAFT\'s behaviour model: nothing official is created, no feature and no section moves. The ids the answer names are kept, so a later batch on the draft can address them. A dry run keeps nothing; there is no commit token on a draft (send the operations again with dry_run:false). A frozen request refuses. The model lands on the feature when the change lands (declared live, or its branch merged into the deployment branch), never at the freeze into Verify. Read it back with get_behavior_feature on the draft id and run it with simulate_behavior.'

const DRAFT_EVOLUTION_NOTE =
  'A DRAFT\'S RUNNABLE BEHAVIOUR: set_draft_behaviour {requestId, draftId, operations[]} replaces the draft\'s behaviour model with these apply_behavior_batch operations, validated by the engine over what the draft stands for (operations:[] clears it). To add to it batch by batch, call apply_behavior_batch with feature_id = the draft id instead: same vocabulary, same guards, the ids it answers are kept. The model is what get_behavior_feature and simulate_behavior read on the draft id, and what the landing writes into the feature (the freeze into Verify and the landing are both refused, naming the draft, when the model no longer applies to the feature it amends).'

const DRAFT_READ_NOTE =
  'A draft an Evolution request carries (`draft:...`) reads the same way: the feature its behaviour model makes, computed by the engine and never stored (the answer carries `draft`).'

/**
 * The screen prototype is retired: no AI client draws a layout, runs the
 * simulator or seeds demo collections any more. Its layout tools stay in the
 * tree, unregistered, so nothing reaches `tools/list`; its run, coverage,
 * verification, sample-data and acceptance-export tools went with the platform
 * doors they called. Acceptance tests come from the behavior scenarios
 * (export_behavior_scenarios).
 */
const PROTOTYPE_TOOLS_REGISTERED = false

export function createMcpServer(ee: BoundOverlay | null, lyriksToken?: string, selfInstall?: SelfInstallSource, scope: EditionScope = OPEN_SCOPE): McpServer {
  const mcp = new McpServer(
    { name: 'lyriks', version: '1.0.0' },
    {
      // Read by connecting agents on initialize — the contract for using this server.
      instructions:
        'Lyriks project DATA (sections, screens, features, behavior) MUST be authored ' +
        'through these tools — never by editing files or databases directly. Authoring skills ' +
        '(SKILL.md playbooks) ship with the platform and auto-update on ANY agent runtime: at ' +
        'the START of any authoring session call sync_skills with `client` set to what you are ' +
        '(and self_install:true when you can run Node in the repository: then run the selfInstall.command it ' +
        'returns, which installs every file from the server without passing it through the conversation) ' +
        '(use skill_ids for relevant guides or include_content:false for metadata-only discovery; ' +
        'fetch any deferred guide completely before following it), then supply your client ' +
        '("claude" | "codex" | "gemini" | "copilot" | "generic") and the contentHash frontmatter ' +
        'line of each SKILL.md you already have, then install each returned installContent the ' +
        'way its installTargets entry says (write the file, and merge pointerBlock into ' +
        'pointerPath when there is one), and apply the `binding` the same response carries (the ' +
        'block in the instruction file your runtime always loads, plus the per-prompt hook for Claude ' +
        'Code): it is what keeps the repository bound to its Lyriks project for every later session ' +
        'and every user; then follow the relevant skill — ' +
        'lyriks-build to author a project end-to-end, lyriks-design to write the design.md, ' +
        'lyriks-behavior when creating features, lyriks-retrospec when ' +
        'reverse-engineering an EXISTING product into its spec, whatever it is read from (its codebase, its ' +
        'documentation, or its design: a Figma file, a clickable prototype, a mockup artifact), lyriks-delivery when ' +
        'the spec meets a tracker (turning features into tickets, and re-syncing once code lands), ' +
        'lyriks-evolution when the person wants a change qualified or carried through a dossier. ' +
        EVOLUTION_IS_OPTIONAL + ' ' +
        'THE CONVERSATION STAYS BOUND TO ITS PROJECT: once the user has asked for Lyriks on a product, ' +
        'named a Lyriks project, or the repository carries a Lyriks binding (installed lyriks-* skills, ' +
        'a .unspa.json index), EVERY later request in that conversation about that product goes through ' +
        'this MCP, without the user saying "Lyriks" again: the first request bound the whole conversation. ' +
        'A request that changes what the product does (a capability, a rule, a screen, a field, a state, ' +
        'a flow, a message) is a SPEC CHANGE FIRST: author it in the bound project through the section ' +
        'tools (apply_behavior_batch, patch_section), then write the code, then ' +
        'record where the code implements it (index entries carrying their signature line, ' +
        'sync_implementation_index; lyriks-delivery step 4). A request that asks ' +
        'how the product behaves, whether something is right, what is missing or what broke is a SPEC ' +
        'READ FIRST: get_behavior_feature, get_section, get_implementation_status, get_implementation_gaps, ' +
        'get_implementation_drift or simulate_behavior before answering from the code ' +
        'or from memory. ' + SPEC_AND_CODE_TOOLS + ' ' +
        'Only work with no user-visible effect (a refactor, a build or dependency fix, ' +
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
        'A PRODUCT KNOWN FROM ITS DESIGN (a clickable prototype, a mockup, a Figma file, a design artifact) ' +
        'is a retrospecification too: lyriks-retrospec in full, its part for a prototype included, the project ' +
        'created with source_mode from_figma. Read the source whole (never cut a long line), count what it holds ' +
        'before writing, cite it on every element, and finish on assess_project_completeness, never on an impression. ' +
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
        'Report a completion together with the Project health its answer carries (`health`: score, word, ' +
        'blocking count), never a bare 100: the health is ONE state score computed from every open point ' +
        'What Lyriks noticed (coherence gaps, completeness audit issues, analyses not finalized, code not ' +
        'proven, criteria without a result, drift), and there is no Control Center. ' +
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
        'ONE LANGUAGE PER SPEC: every project read (get_project, get_behavior_feature, ' +
        'assess_behavior_feature) states the language the spec is written in (`specLanguage`, ' +
        '`language`): the one its operating details declare, English when none is. Write every ' +
        'description, acceptance criterion, reason, scenario name and message in THAT language, ' +
        'never in the language of the conversation, so the model never mixes languages; the names ' +
        'the code will also carry (state paths, events, actions, fields, enumeration values, ' +
        'parameters) stay in English whatever the language. When the read carries a notice that no ' +
        'language is declared while the prose reads otherwise, tell the person and ask them to ' +
        'declare it (foundation.operations.i18n, read as the languages of Specification 360° › Tech and data › Requirements) instead of switching on your own. ' +
        'THE EXPERIENCE IS DESCRIBED, NEVER DRAWN: journeys, their steps (each on a screen of the ' +
        'inventory, saying what it does and which data it reads), the screen inventory and the ' +
        'design.md sources (brand), all written with patch_section. The screen prototype is retired: ' +
        'no layout, no simulator, no demo collection, and the experience `builder` sub-tree is refused. ' +
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
  // Every tool says to the client whether it only reads (ac-mcp-tool-annotations).
  declareToolEffects(mcp)

  // Sections live in the wizard app (source of truth). Forward
  // the caller's token so the wizard app's auth wall (LYRIKS_AUTH_REQUIRED=1) authorizes us.
  const lyriks = new LyriksClient(lyriksToken)
  // A tool the installation's edition does not hold is registered, then
  // disabled: the client never sees it in tools/list (EVO-001), and the
  // registrations below stay one list for every edition.
  if (!scope.evolutions) {
    const register = mcp.tool.bind(mcp) as (...args: unknown[]) => { disable(): void }
    mcp.tool = ((...args: unknown[]) => {
      const tool = register(...args)
      if (typeof args[0] === 'string' && EVOLUTION_TOOLS.has(args[0])) tool.disable()
      return tool
    }) as typeof mcp.tool
  }

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
    'Lists the authoring guides ("skills") that ship with this Lyriks install — the playbooks for building Lyriks projects THROUGH this MCP. Install and follow the relevant one BEFORE authoring: "lyriks-build" to author a project end-to-end (every section), "lyriks-design" to write the design.md (the Experience brand sources), "lyriks-behavior" when creating features (apply_behavior_batch depth), "lyriks-retrospec" to reverse-engineer an existing product or ingest a codebase, "lyriks-delivery" to turn a spec into tickets and re-sync the implementation index once code lands. The returned list is the AUTHORITY: a skill named in this description but absent from the response is not published by this install (usually an out-of-date appliance), and get_skill will 404 on it; report that instead of retrying. Returns { skills: [{ id, name, description, sizeBytes, contentHash }] }. To install or refresh, prefer sync_skills (one call reconciles everything); get_skill fetches a single one.',
    {},
    async () => json(await listSkillsHandler({}, lyriks)),
  )

  mcp.tool(
    'sync_skills',
    'Reconcile locally installed Lyriks authoring skills with this server. Works for ANY agent runtime, not just Claude. FIRST CHOICE when you can run Node 18+ in the repository root (Claude Code, Codex, Gemini CLI): report what you hold (`installed`, `installed_tools`) with self_install:true, write the installer files the answer carries if any (`.lyriks/tools/mcp-client.mjs`, `skills-apply.mjs`, `sync-skills.mjs`, verbatim), then run `selfInstall.command` in the repository root: it installs every guide, the binding block, the hooks and the scripts exactly as published, without passing them through the conversation, and prints only what it wrote (its sign-in lasts ten minutes and reads playbooks only). Run it as given; when it fails (no Node, no network), call sync_skills again without self_install and install from the answers as follows. Set `client` to what you are ("claude" | "codex" | "gemini" | "copilot" | "generic") so the response carries your layout alone; omit it and every layout comes back for you to choose from. First read the `contentHash:` frontmatter line of each installed SKILL.md you have, under `.claude/skills/<id>/` or `.agents/skills/<id>/` (missing file or missing line = omit the hash). Pass them as `installed`; omit or send [] on a fresh machine — everything then comes back as "new". Response: { skills: [{ id, name, description, contentHash, status: "up-to-date"|"update"|"new", installPath, installTargets: [{ client, label, path, pointerPath?, pointerBlock? }], installContent? }], unknown: [ids] }. For each entry that carries `installContent`, take the `installTargets` item matching your runtime and: (1) write `installContent` VERBATIM to `path` (create directories as needed); (2) when the target also has `pointerPath`, merge `pointerBlock` into that file — replace the region between its `<!-- lyriks-skill:<id> -->` and `<!-- /lyriks-skill:<id> -->` markers if present, otherwise append the block, and change NOTHING else in that file (it belongs to the user). An entry is current only when status is "up-to-date". With include_content:false, new/update entries carry contentDeferred:true; fetch their complete content before installing or following them. Use skill_ids to synchronize only the guides relevant to the task. SIZE: the whole answer (guides, binding block, hooks and scripts) stays under 45,000 characters, which every AI client accepts. The installer travels first when a command is offered, then whole guides, then whole scripts, while they fit; a guide already current comes back as its id, status and hash alone, an unchanged script without its purpose; a guide past the budget comes back with contentDeferred:true under `deferredForSize` (fetch each with get_skill, or call sync_skills again naming it in skill_ids), a script past it comes back with `deferred: true` and no content, listed under `deferredScripts`; a file is never cut in half, since an install writes it verbatim. Ids in `unknown` are not published by this server — leave those local skills alone. The response also carries `binding`: what keeps this repository bound to its Lyriks project in every later session, for every user. Take the `binding.targets` item matching your runtime and: (3) merge its `pointerBlock` into `pointerPath` (the instruction file you always load: CLAUDE.md, AGENTS.md, GEMINI.md or .github/copilot-instructions.md), replacing the region between `<!-- lyriks-binding -->` and `<!-- /lyriks-binding -->` if present, appending the block otherwise, touching nothing else; (4) when the target carries `hook` (Claude Code), write `hook.content` VERBATIM to `hook.path` and wire it: if `hook.settingsPath` does not exist write `hook.settingsContent` as is, otherwise add `hook.settingsEntry` under `hooks.UserPromptSubmit[0].hooks` unless a command naming `hook.path` is already there; (4b) when the target also carries `toolsHook` (Claude Code), write `toolsHook.content` VERBATIM to `toolsHook.path` and wire it the same way under `hooks.PreToolUse`: if `toolsHook.settingsPath` does not exist write `toolsHook.settingsContent` as is, otherwise add `toolsHook.settingsEntry` to the `hooks.PreToolUse` item whose `matcher` is `toolsHook.settingsMatcher` (add that item when there is none) unless a command naming `toolsHook.path` is already there. That hook lets the Lyriks tools run without asking the person to allow each call (the tools that delete still ask; LYRIKS_ASK_EVERY_TOOL=1 switches it off). Then, whatever your runtime: (5) when `binding.tools` is present (the top level of `binding`, the same list for every runtime; an older platform sends none), for each entry write `content` VERBATIM to `path` (create directories as needed), every one of them, side by side under `.lyriks/tools/`, since they import each other. They are plain Node helper scripts for this repository: syncing an index or applying a batch too large to type as a tool argument, and checking the index by signature text instead of by exact line; the `purpose` of each entry says what it does and how to run it. An entry (or the `hook`) that comes back with `unchanged: true` has no `content`: you already hold that exact version, write nothing. An entry with `deferred: true` has no `content` either: write the others, then call sync_skills again with `installed_tools` listing every file you now hold, and the deferred ones come back. include_content:false defers every script, as it defers every guide. To get that, report what you hold in `installed_tools`: for each file under `.lyriks/tools/` and for `.claude/hooks/lyriks-bound-prompt.mjs` and `.claude/hooks/lyriks-allow-tools.mjs`, its `path` and the hash its `// contentHash: <hash>` line carries (the first line, or the second after `#!`); a file without that line is reported without a hash, or left out, and comes back whole. Omit `installed_tools` and every file comes back with its content. Pass `project_id` (the wizard project slug this repository is specified in) as soon as you know it, so the block names the project; a project created later gets one more sync_skills call with its id. Call this at the START of any session that will author Lyriks project data, before following a skill.',
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
      installed_tools: z
        .array(z.object({
          path: z.string().describe('The installed file, relative to the workspace root: .lyriks/tools/<file>.mjs, .claude/hooks/lyriks-bound-prompt.mjs or .claude/hooks/lyriks-allow-tools.mjs'),
          content_hash: z.string().optional().describe('The value of its `// contentHash:` line; omit when the file has none'),
        }))
        .optional()
        .describe('The binding helper scripts and hook already installed; a file reported with the published hash comes back `unchanged: true` without content. Omit to receive every file whole'),
      client: z
        .enum(['claude', 'codex', 'gemini', 'copilot', 'generic'])
        .optional()
        .describe('Which agent runtime you are, so only your install layout comes back. Use "generic" when you are none of the named ones; omit to receive every layout'),
      project_id: z
        .string()
        .optional()
        .describe('The Lyriks wizard project this repository is specified in (the slug the section tools address), so the binding block names it. Pass it as soon as it is known; call sync_skills again with it once the project is created'),
      self_install: z
        .boolean()
        .optional()
        .describe('You can run Node in the repository root: the answer then carries only the installer files you lack and `selfInstall.command`, which installs the rest from the server without passing it through the conversation. Omit when you cannot run a command'),
    },
    async (args) => uncapped(await syncSkillsHandler(args, lyriks, undefined, selfInstall)),
  )

  mcp.tool(
    'get_skill',
    'Returns one authoring skill in full, in `installContent`: the guide with a `contentHash:` frontmatter line so the installed copy self-reports its version (one copy only, so the answer fits a client; `content` is sent alone only by a platform that has no install variant), and `installTargets` — one layout per agent runtime (Claude Code writes `.claude/skills/<id>/SKILL.md` and is done; Codex, Gemini, Copilot and any other agent write `.agents/skills/<id>/SKILL.md` and merge the target\'s `pointerBlock` into its `pointerPath`, e.g. AGENTS.md). Install by following the target matching your runtime, or follow the skill directly this session. Get ids from list_skills. Prefer sync_skills as the entry point — it diffs and returns everything stale or missing in one call. Pass `client`: the answer then carries your layout alone; without it, an answer past 45,000 characters sends the shared pointer block once at the top (`pointerBlock`) instead of in every layout.',
    {
      skill_id: z.string().describe('Skill id from list_skills, e.g. "lyriks-build"'),
      client: z
        .enum(['claude', 'codex', 'gemini', 'copilot', 'generic'])
        .optional()
        .describe('Which agent runtime you are, so only your install layout comes back and the answer stays small'),
    },
    async (args) => uncapped(await getSkillHandler(args, lyriks)),
  )

  // ── Project sections (lyriks source of truth) ─────────────────────────────────
  mcp.tool(
    'get_capabilities',
    'Read the canonical permission capability registry for this project. Each row carries capabilityId, label and capabilitySource; copy capabilityId and capabilitySource exactly into users.permissions, one row per role that has access to the capability (no row means no access). A permission carries no verb: adding, editing or deleting something are capabilities of their own (the action rows, "action:<featureId>:<actionId>"), granted like any other. Includes features and their actions, journeys, screens, behavioral surfaces, system and off-structure capabilities. Paginated and read-only. A bare screen id is not a surface capability id.',
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
    'Creates a lyriks WIZARD project you can immediately drive with set_section / patch_section / apply_behavior_batch. Use THIS (not create_project) to start a new project through the MCP: create_project mints a back UUID with no linked Lyriks wizard draft, so section writes 404 under the enterprise auth guard. Runs lyriks\'s real CreateProject use-case (owned + workspace-scoped, so you keep access) and returns `{ projectId, workspaceId }` — `projectId` is the slug the section tools address. `workspace_id` names the owning team; required only when you belong to more than one (list_workspaces).',
    {
      name: z.string().describe('Product / project name'),
      description: z.string().optional().describe('One-line brief, stored as the product summary shown on Specification 360° › Overview'),
      workspace_id: z.string().optional().describe('Owning workspace UUID (from list_workspaces) — required when the caller belongs to >1 workspace'),
      domain_id: z.string().optional().describe('Optional folder id (list_domains) to file the project under'),
      stage: z.string().optional().describe('Optional starting portfolio stage (defaults server-side)'),
      source_mode: z
        .enum(['greenfield', 'from_document', 'code_to_spec', 'from_figma', 'ma_dd_audit'])
        .optional()
        .describe('Where the project starts, shown on its card as sourceMode: code_to_spec when you are about to ingest a codebase into it, from_document when you rebuild an existing product from its documentation, from_figma from its design (a Figma file, a clickable prototype, a mockup), greenfield (the default) from scratch. The three that read an existing product are retrospecifications: follow lyriks-retrospec, and every element must cite the source it was read from (the completeness audit blocks otherwise)'),
    },
    async (args) => json(await createWizardProjectHandler(args, lyriks)),
  )

  mcp.tool(
    'update_wizard_project',
    'Updates the real Lyriks project shown on the home board and in the project menu: name, description and/or folder (domain_id). Use this for a project id returned by list_wizard_projects. This is distinct from update_project, which updates only a bare/back project record. Every project name opens on a capital (every other letter reads as typed), so the answer carries `name`, the name as every reader will see it, and `nameStyled` { sent, kept, reason } whenever that is not the name you sent: report the name kept, not the one you asked for.',
    {
      project_id: z.string().describe('Lyriks project id (from list_wizard_projects)'),
      name: z.string().optional().describe('New user-facing project name; its first letter is made a capital, every other letter kept as typed (the answer says the name kept)'),
      description: z.string().optional().describe('New project brief / description'),
      domain_id: z.string().nullable().optional().describe('Folder id (list_domains), or null to take the project out of its folder'),
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
    'Lists the folders the caller can see (the project menu groups projects in folders; the wire calls them domains). Use these ids with create_wizard_project or update_wizard_project.',
    {},
    async () => json(await listDomainsHandler({}, lyriks)),
  )

  mcp.tool(
    'create_domain',
    'Creates a folder in the project menu to group projects (a domain on the wire).',
    {
      name: z.string().describe('Domain name'),
      description: z.string().optional().describe('Domain description'),
      icon: z.string().optional().describe('Bundled lucide icon id, e.g. lucide:building-2'),
    },
    async (args) => json(await createDomainHandler(args, lyriks)),
  )

  mcp.tool(
    'delete_domain',
    'Deletes an empty folder of the project menu (a domain on the wire). The server refuses while projects still belong to it.',
    { domain_id: z.string().describe('Folder id from list_domains') },
    async (args) => json(await deleteDomainHandler(args, lyriks)),
  )

  mcp.tool(
    'get_section',
    'Reads one section of a project. AVOID the full read for big sections (data/coherence can be 100KB+ — generated artifacts): pass `summary:true` for a tiny two-level shape (keys + array/object sizes), or `paths` to fetch only specific dotted sub-trees (e.g. ["journeys","screens","brand.colors"]). The full document stays in the MCP server; only the requested slice is returned. Omit both for the whole draft (back-compat). The `coherence` section also carries `health`, the Project health the Overview shows: { score, verdict, blocking, total, codeLinked, points (first 50), pointsTotal }, ONE state score computed from every open point What Lyriks noticed; the coherence headline is only part of it.',
    {
      project_id: z.string().describe('Lyriks project id (from list_wizard_projects)'),
      section: z.enum(READABLE_SECTIONS).describe('Section to read — a WIRE id, not a screen label; describe_section reports where each one is edited. `evolution` reads the raw dossiers; get_evolution is the one that carries their derived readings'),
      summary: z.boolean().optional().describe('Return a tiny shape summary (keys + sizes) instead of the full draft — start here to discover what to drill into'),
      paths: z.array(z.string()).optional().describe('Return only these dotted sub-trees, e.g. ["journeys","screens","brand.colors"]. Keeps big sub-trees out unless explicitly requested. The experience `builder` sub-tree (the retired screen prototype) is refused'),
    },
    async (args) => json(await getSectionHandler(args, lyriks), 'get_section'),
  )

  mcp.tool(
    'describe_section',
    'Schema of a section so you can author it WITHOUT reading the doc or source: the empty-draft shape (every field + default), a sample item per collection (so array-item fields are visible), the allowed enum codes per field, `uiLocation` (the capability + tab where a user edits it), and authoring notes (id conventions, which write tool to use). Call this before set_section/patch_section on an unfamiliar section — and read `uiLocation` before naming the section to a user, since several keys are legacy wire ids that match no on-screen label.',
    {
      section: z.enum(READABLE_SECTIONS).describe('Section to describe, `evolution` included (it is read with get_evolution and written with apply_evolution_batch, never with set_section)'),
    },
    async (args) => json(await describeSectionHandler(args, lyriks)),
  )

  mcp.tool(
    'get_knowledge_graph',
    'Query a project\'s central knowledge graph — every bounded context (roles, features, journeys, screens, entities, rules, architecture…) plus the unspa behavior model folded into ONE typed node/edge graph (no page draws it; Evolutions reads it to compute the impact of a request). Read-only derived view; author through the section/behavior tools, not here. DRILL-DOWN FLOW: call with only project_id first — you get whole-graph stats (node/edge counts by context and kind) plus the best-connected hub nodes; then narrow with `contexts`/`kinds` filters or a `q` label search, and expand around one node with `focus_node` (+`depth`) — pass a node id ("kind:rawId"), a bare raw id, or a node label; the response\'s `focusNodeId` reports the node it landed on (an ambiguous label lands on the best-connected match; null = unknown reference, fall back to `q`). The expansion is undirected unless you pass `direction`: "in" keeps what points AT the focus node (what contains, reads, writes, tests or triggers it), "out" what the node points at (what it contains, reads, writes, emits), "both" is the default. Filters and focus combine (intersection). The graph is deduplicated: each concept is ONE node (a screen/feature/entity carries both its wizard facts and its unspa behavior edges — writes/reads/emits/transitions), so follow edges instead of hunting for behavior twins. `limit` caps returned nodes keeping the best-connected; the response flags `truncated` + `matchedNodeCount` so you know to narrow. Contexts: project, foundation, users, features, experience, data, rules, architecture, coherence, behavior, engine. `source`: "merged" (default — wizard projection + behavior, + DPO verdict in Enterprise), "local" (wizard projection alone), "engine" (raw formal-engine substrate, Enterprise-only — errors otherwise). TWO RECIPES over the behavior model, whose actions, states, rules, invariants (kind "rule"), scenarios and events are nodes. `q` reads a node\'s label, detail and id only: a feature by its name or the first 140 characters of its description, a surface by its name, an action by its name or intent, a rule by its description, an invariant by its name, a scenario or an event by its name or description, a state by its path or description. Acceptance criteria are not in the graph. (1) FIND THE FEATURE THAT OWNS A WORD: q:"<word>" lists the nodes that carry it. A rule or scenario hit names its feature in its id ("rule:beh:<featureId>:<ruleId>", "scenario:beh:<featureId>:<scenarioId>"). For a surface, an action or a state a surface declares, call again with focus_node:"<hit id>", depth:2, kinds:["feature"], direction:"in": the feature that contains it comes back (feature contains surface, surface contains action and state). Walking "in" only, a feature that merely declares an event the action EMITS stays out (without direction it comes back beside the owner); one that declares an event TRIGGERING the action still does. (2) WHO READS OR WRITES A STATE PATH: focus_node:"state:<dotted.path>", depth:1, direction:"in". A path is ONE node for the whole project, so its neighbors span every feature that touches it, and each edge kind says how: `writes` from an action (an effect on that path, an operation result, a parameter bound to it), `reads` from an action that requires it or from a rule or invariant whose condition names it (depth:2 adds the action or surface holding that rule), `tests` from a scenario that sets or asserts it, `contains` from each surface that declares it. Every behavior edge of a state node points AT it, so direction:"in" loses nothing at depth:1, and at depth:2 it keeps to the holders (the action or surface of a rule, the surface and the scenarios of an action) where an undirected walk also returns every other state and event those actions touch. Blind spot: a path read only inside an effect\'s value expression, a derived-state formula, a rule\'s own effect or a feature-level invariant has no edge, so an empty answer there is not proof that nothing reads it.',
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
    'Writes one section\'s full draft for a project — everything a user can do in the capability that owns it. FULL REPLACE: any sub-tree you omit is DROPPED (e.g. `journeys` or `brand`) — for targeted edits prefer patch_section, which preserves everything you don\'t touch. When existing non-empty top-level sub-trees are absent from your document, the write still lands but returns `warnings` naming what was dropped. Pass the complete section document (get_section first, modify, then set); a document shaped {__ops:[...]} is treated as a patch_section call. On `experience`, once the project holds screens, NEVER full-replace: edit journeys, steps, the screen inventory and the brand with patch_section (the screen prototype is retired); a whole-Experience replacement is unverifiable and is blocked by the safety controls of agent runtimes, a refusal you should never have to work around. projectId is stamped automatically. The write runs lyriks\'s real save use-case + sync side-effects, so it shows in the UI. The answer carries `writeGuard`: "revision-checked" when the write went out under the revision read just before it, "unavailable" on an older platform whose read carries no revision (the write was then NOT protected against concurrent edits, and any `revision` in the answer is the one after the write).',
    {
      project_id: z.string().describe('Lyriks project id'),
      section: z.enum(SECTIONS).describe('Section to write — a WIRE id, not a screen label; describe_section reports where each one is edited'),
      document: z.record(z.string(), z.unknown()).describe('The full section draft document (validated server-side by the wizard app)'),
      expected_revision: z.number().int().min(0).optional().describe('Revision returned by get_section; a concurrent edit is rejected instead of overwritten.'),
    },
    async (args) => json(await withWriteLock(`${args.project_id}:${args.section}`, () => setSectionHandler(args, lyriks))),
  )

  mcp.tool(
    'patch_section',
    'Targeted edit of a section without resending the whole document: ideal when a section carries large sub-trees (e.g. the data model) you must not retransmit. The MCP server reads the current draft, applies your operations in order, and writes it back through lyriks\'s real save use-case (same sync side-effects as set_section). Operations: {op:"set", path, value} assigns a dotted path, whose segments may be object keys OR array indices (e.g. "activeTab", "brand.identity.name", "fields.7.enumValues"); {op:"merge", collection, id, value, insert?} shallow-merges value into the id-keyed array item (journeys/steps/screens/components/elements/templates), or appends it when insert=true and no match; for KEYLESS rows (no id field, e.g. users "permissions") address with match:{field:value,...} instead of id; insert-via-match appends value verbatim with no id injected; {op:"append", collection, value, id?} ADDS one row at the end with NO selector at all, which is the op to reach for whenever the row does not exist yet (merge edits a row that must already be there): pass `id` to stamp one on the new row, leave it out for a keyless collection, and the array is created when the section has none yet; it is idempotent, so an id already present (or a row already held verbatim) reports `unchanged` instead of a duplicate, and you never count existing rows to set an index; {op:"remove", collection, id|match} deletes that array item, or {op:"remove", path} deletes a key at a dotted path (e.g. an object-map entry like "brand.examples.<id>"). `collection` also accepts a dotted path to a nested array (e.g. "journeys.0.steps"). Together these give full create/update/delete over any section. INCREMENTAL ops add to a list or a text WITHOUT resending the whole value and without erasing what a concurrent writer added to it; prefer them over set/merge whenever you add to something that already exists: {op:"add_to_set", path, value} appends a scalar to the array at path unless it is already there (the array is created when absent), e.g. one more source id in a `sourceIds` list; {op:"remove_from_set", path, value} removes every occurrence; {op:"append_text", path, value, separator?} appends separator (default a blank line) then value to the string at path unless the text already contains value, e.g. one more paragraph in a long description; {op:"replace_text", path, find, value} replaces find by value when find occurs EXACTLY once (zero or several occurrences: the op does not apply and `notApplied` says which, so extend find until it is unique). For these four, `path` may be combined with collection + id|match: it is then read INSIDE that row (e.g. collection:"features", id:"feat-1", path:"sourceIds"), which addresses the row by id rather than by an index another writer can shift. They are idempotent, so a retry cannot duplicate: an op that finds its work already done counts as applied and is listed under `unchanged`, and a retried replace_text either lands there too (its value extends find) or reports that find now occurs 0 times. THE ANSWER: opsApplied/opsTotal, `changed` (the targets of the ops that changed the draft), `unchanged` (found their target, nothing left to change), `notApplied` (each op that found no target, with the reason), and `writeGuard`: "revision-checked" when the write went out under the revision read just before it, "unavailable" on an older platform whose read carries no revision (the write was then NOT protected against concurrent edits, and any `revision` in the answer is the one after the write). A set or a path remove that would leave NOTHING where a list held rows (null, an empty list, a scalar, a removal; or an object holding lists set to a non-object) is NOT APPLIED unless the op carries erase:true: it comes back under notApplied naming how many rows it would erase, and the other ops land, so a leftover test op never wipes a section (replacing a list by other rows, or removing one row by collection and id, is unaffected). With dry_run:true on a platform that has no validation route, the answer says dryRunUnavailable:true with the local match counts, and nothing is saved.',
    {
      project_id: z.string().describe('Lyriks project id'),
      section: z.enum(SECTIONS).describe('Section to patch — a WIRE id, not a screen label; describe_section reports where each one is edited'),
      expected_revision: z.number().int().min(0).optional().describe('Use baseRevision from a preview to reject intervening section changes.'),
      dry_run: z.boolean().optional().describe('Preview on a temporary copy and run existing platform authoring guards without saving; default false. Reports unmatched operations. This is not a reserved or atomic multi-section transaction.'),
      operations: z.array(z.object({
        op: z.enum(['set', 'merge', 'append', 'remove', ...INCREMENTAL_OPS]).describe('"set" a dotted path · "merge" into an id- or match-keyed array item · "append" one new row at the end of a collection (no selector) · "remove" an array item or a path · "add_to_set" / "remove_from_set" one scalar of an array · "append_text" / "replace_text" inside a string (append and the four incremental ops are idempotent)'),
        path: z.string().optional().describe('set/remove and the incremental ops: dotted path (keys and/or array indices), e.g. "brand.identity.baseline" or "definition.market.notes"; with an incremental op plus collection, the path INSIDE the selected row, e.g. "sourceIds"'),
        collection: z.string().optional().describe('merge/append/remove, optional on the incremental ops: array name, top-level or dotted path, e.g. "journeys", "brand.colors.tokens"'),
        id: z.string().optional().describe('With collection: id of the array item (id-keyed collections); on append, the id to STAMP on the new row, omitted for a keyless collection'),
        match: z.record(z.string(), z.unknown()).optional().describe('With collection: field-equality selector for KEYLESS rows (no id field), e.g. {"roleId":"admin","capabilityId":"cap-x"}'),
        insert: z.boolean().optional().describe('merge: append a new item when none matches (id is stamped only when addressing by id)'),
        value: z.unknown().optional().describe('Required for set/merge/append and the incremental ops (an object for merge/append, a scalar for add_to_set/remove_from_set, a string for append_text/replace_text); omitted for remove'),
        find: z.string().optional().describe('replace_text: the exact text to replace; it must occur exactly once at path'),
        separator: z.string().optional().describe('append_text: what goes between the current text and value (default a blank line)'),
        erase: z.boolean().optional().describe('set/remove at a path: true when the op MEANS to empty a list that holds rows (or an object holding lists); without it such an op is not applied and comes back under notApplied'),
      })).min(1).max(1000).describe('Ordered list of targeted edits; the complete operation shape is validated before applying any edit'),
    },
    async (args) => json(await withWriteLock(`${args.project_id}:${args.section}`, () => patchSectionHandler(args, lyriks))),
  )

  if (PROTOTYPE_TOOLS_REGISTERED) mcp.tool(
    'build_screen',
    'Author a complete Experience-Builder screen layout in one call from a compact nested spec — instead of many low-level builder.nodes set-ops. The server materialises the spec into builder nodes (groups + elements, childIds, screenRoots) for the target surface, REPLACING any previous layout for it, and writes through lyriks (same sync as set_section). The target must already exist — a screen (create via patch_section screens insert:true) OR a reusable component (patch_section components insert:true); build a component\'s tree here once, then reference it from any group via componentId. The `layout` is the root group: { label?, direction?:"row"|"col", justify?, align?, gap?, padding?, wrap?, card?:true (render the group as a surface card — background+border+shadow, so you get real containers without a follow-up patch), maxWidth?:"sm"|"md"|"lg"|"xl" (cap AND centre the column — use for a chat thread, form, or marketing column; "none"=full width), presentation?:"inline"|"overlay"|"tabs"|"sidebar"|"menu" (overlay=modal shown while visibleWhen holds; tabs=child groups become panels; sidebar=SAME child-groups-are-panels contract rendered as an aside navigation menu with the active item highlighted; prefer sidebar over tabs wherever a real product would use an aside nav panel: settings areas, admin consoles, multi-section detail pages; menu=anchored DROPDOWN sharing the overlay visibleWhen contract, no scrim, right-aligned at its slot (appearance.align:"start" opens rightward), dismissed by clicking outside or picking an item, so a header-right user menu is: avatar button with on:[{toggle:"menu.open"}] followed by a group {presentation:"menu",visibleWhen:{path:"menu.open"},children:[...]}), tabsKey?:"<statePath>" (tabs+sidebar: active panel index), componentId?:"<componentId>" (render that component\'s tree here), visibleWhen?:{path,op?,value?} (group-level — opens/closes an overlay), children:[...] }. A child is a group (has `children`) or an element { el:"heading"|"text"|"input"|"textarea"|"select"|"checkbox"|"button"|"link"|"list"|"form"|"container"|"image"|"status"|"icon"|"meter", label? (for el:"icon" the label IS the bundled lucide icon name, e.g. "zap" — unknown names render a placeholder dot; for el:"meter" the label is the value 0-100 and interpolates run state, e.g. "{usage.pct}"), variant?(button emphasis; for el:"status" one of "loading"|"empty"|"error"|"success"; for el:"text" "pill" renders an accent-tinted badge/chip (appearance.background/color override the tint); for el:"meter" "ring" renders a circular gauge instead of a bar; ANY element given click behavior via nav/on/bind, a pill badge or icon included, is a live hover-highlighted click target in Run mode, so put actions directly on badges and tiles instead of adding a redundant button), inputType?, bind?:{kind,ref} (for el:"list", bind:{kind:"entity",ref:"<CollectionName>"} makes the list ITERATE that simulator collection — rows render the collection\'s first two fields, or attach componentId for a full row template; text labels also interpolate {#Collection} = row count and {Collection.field} / {Collection.N.field}), nav?:"<targetScreenId>" (shorthand click→navigate), setState?:["<path>","<value>"] (shorthand click→set state), gate?:{personaIds:["<roleId>"],mode?:"visible"|"enabled",allow?:true} (per-role authorization — persona runs hide/disable the element for excluded roles from the users section), validations?:[{kind:"required"|"email"|"min"|"max"|"pattern",param?,message?}] (input validation — the full catalog), on?:[{trigger?:"click"|"hover"|"change"|"submit" (default "change" for inputs, else "click"), navigate?|setState?:["<path>","<value>"]|toggle?:"<path>"|increment?:"<path>",by?|createRecord?:"<Collection>",fieldMap?:{"<field name>":"<input label>"} (append a fake-backend row: fields whose name matches a same-surface input label — or whose fieldMap entry names one — take that input\'s value, the rest get seeded data, then the form clears; put it on the surface holding the matching inputs. A createRecord that captures NO inputs is reported in simulate_experience `warnings`)|navigateBack?:true|print?:{path,value} (append a line to a log state path)|call?:{label,endpoint?,latencyMs?,loadingPath?,outcome?:"success"|"error",resultPath?,resultValue?,errorPath?} (simulated async op: in Run mode loadingPath goes truthy then after latency resolves — success sets resultPath=resultValue, error sets errorPath; gate a "status" element on loadingPath/errorPath for a spinner/error), when?:{path,op?:"truthy"|"falsy"|"eq"|"neq",value?} (GUARD — the effect fires only while this state condition holds; two transitions on one trigger with complementary guards model if/else branching)}] (explicit triggers+effects — inputs drive state on type/Enter), requireValid?:true (button/link: block the click while its screen has invalid inputs — a submit gate), visibleWhen?:{path,op?:"truthy"|"falsy"|"eq"|"neq",value?} (run-mode: show only while a state condition holds), appearance?:{background,color,borderColor,borderWidth,radius,maxWidth (px cap — needed to size an image/thumbnail in a row),paddingX,paddingY,fontSize,fontWeight,textAlign,align,width,shadow,opacity} (a colored chip/tile in one call), media?:{src,alt,fit:"cover"|"contain"|"fill",aspectRatio} OR src?/alt? shorthand (for el:"image" — a data: URI keeps the appliance air-gapped), componentId?:"<componentId>" (for el:"list" — a component used as the per-row template; labels resolve {Field} from each record), filterStatePath?:"<statePath>" (for el:"list" — live search: shows only rows matching the value an input wrote to this path), rowLayout?:"stack"|"grid"|"cards" + rowColumns?:1-4 (for el:"list" — how the row template repeats; use cards/grid for pricing tiers, app catalogs and tile dashboards instead of hand-duplicating one card per record — it wraps responsively), options?:["A","B"] / optionsFrom?:{collection,field,filterField?,filterPath?} (for el:"select" — a fixed list, or choices read LIVE from a collection field, optionally narrowed by another field matching a state value = dependent picker, e.g. only the connections of the chosen app) }. PER-ROW INTERACTIVITY: author the row-template component once — every element inside it acts on the row it is rendered in. Use on:[{trigger:"click",selectRecord:"<statePrefix>"}] to publish the clicked record to state (readable anywhere as {prefix.field}, plus {prefix} = the row id), and any setState/print `value` may interpolate {Field} from that row; a checkbox/input inside a row template keeps a separate value per row. Prove it with simulate_experience actions carrying rowIndex:<N>. el:"textarea" is multi-line text and el:"checkbox" a boolean (so truthy/falsy guards read it); both validate and fire change-triggers like an input. NOTE el:"container" is an inert dashed PLACEHOLDER — it does NOT interpolate {Field} or honor appearance.background; use el:"text" for a bound or colored chip. An element with both `el` and `children` is rejected (an element can\'t hold children). Duplicate labels among clickable elements are returned as `warnings` (they break label-based targeting). For data-true list/form rows, call import_data_collections first so collections match the real entities from the data section. Mirrors the wizard Flow + Gate tabs.',
    {
      project_id: z.string().describe('Lyriks project id'),
      screen_id: z.string().describe('Existing LibraryScreen id to build the layout for'),
      layout: z.record(z.string(), z.unknown()).describe('Root group spec (see tool description for the node shape)'),
    },
    async (args) => json(await withWriteLock(`${args.project_id}:experience`, () => buildScreenHandler(args, lyriks))),
  )

  if (PROTOTYPE_TOOLS_REGISTERED) mcp.tool(
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
        .record(z.string(), z.unknown())
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

  if (PROTOTYPE_TOOLS_REGISTERED) mcp.tool(
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
        .record(z.string(), z.unknown())
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
    'assess_project_completeness',
    'Reads the deterministic WHOLE-PROJECT completion report. Unlike section scores, it checks the declared external scope inventory, source links, included capability→leaf-feature mappings, approved omissions, every canonical section assessment, global readiness/coherence, per-feature behavior, end-to-end Experience verification and audit freshness. Read `issues` as the blocker list; do not claim completion from any narrower tool. A check with nothing to check yet (no capability in the scope, no feature with behaviour) reads passed:false with a detail starting "Not checked yet", never a green check. The answer also carries `health`, the Project health exactly as the Overview of the Specification 360° shows it: { score (0-100), verdict (strong | watch | critical), blocking, total, codeLinked, points (the first 50 open points: { id, title, severity, blocking, kindLabel, featureRef? }, the ones that cost the health most first), pointsTotal }. It is ONE state score computed from every open point What Lyriks noticed: coherence gaps of every severity, completeness audit issues, analyses not finalized, code located but not proven, criteria without a test result or failing, code read against an older spec; the code points count only once code is linked (codeLinked). A completion at 100 is ALWAYS reported with the health beside it (score, word, blocking count), never alone: a complete scope is not a healthy product. Every open point is work until shown otherwise: only the scope mode, the approval of terms and sections, the finish and a fact the product cannot show belong to a person; the capabilities of the scope, the behaviour of every feature, the section assessments and the audit are the author\'s own work, never reported as a decision or as "on request".',
    { project_id: z.string().describe('Lyriks project id (from list_wizard_projects)') },
    async (args) => json(await assessProjectCompletenessHandler(args, lyriks)),
  )

  mcp.tool(
    'audit_project_scope',
    'Snapshots the current scope and all project-section revisions, then returns the whole-project completion report. Run only after authoring and resolving current blockers. Any later project save makes this audit stale automatically, so assess again before finishing.',
    { project_id: z.string().describe('Lyriks project id') },
    async (args) =>
      json(await withWriteLock(`${args.project_id}:scope`, () => auditProjectScopeHandler(args, lyriks))),
  )

  mcp.tool(
    'report_retrospec_reading',
    'What you report of the retrospecification you run (shown on the Retrospecification and on Code drift). As your very first call, when the prompt that starts the run asks for it, report `received: true`: the person\'s Reverse page moves on to the analysis by itself, and when no run waits for its prompt nothing is recorded and you go on. Report `commit`, the last commit of code of the checkout you read (and `repository`), before finish_project: the next run then reads only what changed since it, never the whole product again; a run reading the documentation alone records none. In a complementary run, report `checks`: for each hand edit Code drift lists (its `anchor`), whether the code says what the specification now says (`says: "same"`) or otherwise (`"other"`), with what the code reads (`code`) and where (`where`, "file:line"); change neither the edit nor the code. Called with none of them, it reads where the run stands (complementary or whole, the commit it starts from, the commit it recorded) and the hand edits with their status (unchecked, differs, kept), which is the list a complementary run reads against the code. A commit or a check is refused while no run is under way; an anchor with no hand edit is refused by name.',
    {
      project_id: z.string().describe('Lyriks project id'),
      received: z.boolean().optional().describe('true: you just received the prompt that starts the run (your very first call)'),
      commit: z.string().optional().describe('The commit the run read, as git names it (full or short hash)'),
      repository: z.string().optional().describe('The repository it belongs to (its remote URL or name)'),
      checks: z
        .array(
          z.object({
            anchor: z.string().describe('The anchor of the hand edit, as the reading lists it ("action:<featureId>:<actionId>", "feature:<featureId>")'),
            says: z.enum(['same', 'other']).describe('Whether the code says what the specification now says'),
            code: z.string().optional().describe('What the code reads, in a sentence or its signature line'),
            where: z.string().optional().describe('Where it reads it: "src/orders.ts:42"'),
          }),
        )
        .optional()
        .describe('What the code says of each hand edit (complementary run)'),
      changes: z
        .array(
          z.object({
            id: z.string().describe('Your own id for this difference: reporting it again replaces it'),
            kind: z.enum(['new', 'changed', 'removed']),
            anchor: z.string().optional().describe('What it changes or removes: "feature:<featureId>", "action:<featureId>:<actionId>", "rule:<featureId>:<ruleId>", "role:<id>", "term:<id>", "journey:<id>"'),
            dock: z.string().optional().describe('For a new element: the anchor of the element it docks on'),
            title: z.string().describe('The element, in the words of the product'),
            proposed: z.string().optional().describe('What the element would read in the specification (not for a removal)'),
            code: z.string().optional().describe('What the code reads, in a sentence or its signature line'),
            where: z.string().optional().describe('Where it reads it: "src/orders.ts:42"'),
          }),
        )
        .optional()
        .describe('A run that holds its changes writes nothing: each difference goes here, and a person decides it on Mismatch. A change a person rejected (its `asked` says what must change) comes back here under the same id, worded as asked'),
      withdrawn: z.array(z.string()).optional().describe('The ids of changes a person rejected as not being a change at all: they leave the report. Only a rejected change can be withdrawn'),
      finished: z.boolean().optional().describe('true: a run that holds its changes read what it had to read'),
      written: z
        .array(z.object({ change: z.string().describe('The id of the validated change'), elements: z.array(z.object({ anchor: z.string(), title: z.string().optional() })).describe('The elements of the specification it became') }))
        .optional()
        .describe('Once you wrote what a person validated: what each change became'),
    },
    async (args) => json(await reportRetrospecReadingHandler(args, lyriks)),
  )

  mcp.tool(
    'finish_project',
    'Marks the lyriks project globally complete only when the latest scope audit is fresh and the whole-project report has zero blockers. Otherwise it does not mutate completion and returns the exact report explaining what remains. This is the only tool whose success authorizes saying the project is complete.',
    { project_id: z.string().describe('Lyriks project id') },
    async (args) =>
      json(await withWriteLock(`${args.project_id}:scope`, () => finishProjectHandler(args, lyriks))),
  )

  mcp.tool(
    'get_design_system',
    'The design system of the project in ONE answer, as its Experience page reads it: the palette (a primary, a secondary and a tertiary colour, each with its base, hover and active shade; a shade the brand does not give is null), the colours of text and surfaces (background, surface, text, border), the type (family and each size with what it is for), the corners, the spacing, the shadows, the breakpoints, the style in a few words, and the sourceIds it was read from. Every colour comes as written and as hex. Read it before you help with a design (a Figma frame, a screenshot, a stylesheet): it is the reference, and check_design holds a design against it. To change it, patch_section experience on brand.colors.palette, brand.colors.semantic, brand.typography and brand.foundation, citing what you read in brand.sourceIds.',
    { project_id: z.string().describe('Lyriks project id (from list_wizard_projects)') },
    async (args) => json(await getDesignSystemHandler(args, lyriks)),
  )

  mcp.tool(
    'check_design',
    'Hold a design against the design system of the project: give the colours and the sizes you read from a design file (a Figma frame through the Figma MCP, a screenshot, a stylesheet), and each one comes back matched to the nearest value of the specification, read as "matches" (the same colour or size), "close" (slightly off: a colour distance under 10, the eye reads them as one colour; a size within 2px) or "outside" (not in the design system), with the nearest value, how far and one sentence to say. Counts come first. Use it to help the person align the design with the specification, or, when they decide the design is right, to propose the change to the specification (get_design_system then patch_section experience). Colours in hex, rgb() or hsl(); a gradient or a variable is read as not a plain colour.',
    {
      project_id: z.string().describe('Lyriks project id (from list_wizard_projects)'),
      colors: z.array(z.object({ name: z.string().optional().describe('What the design calls it, e.g. "Button / primary / hover"'), value: z.string().describe('The colour as the design gives it: #2094F3, rgb(...), hsl(...)') })).max(200).optional(),
      sizes: z.array(z.object({ kind: z.enum(['font', 'radius', 'spacing']), name: z.string().optional(), px: z.number().describe('The size in pixels') })).max(200).optional(),
    },
    async (args) => json(await checkDesignHandler(args, lyriks)),
  )

  // A TargetMap retargets the generated tests onto an EXISTING repo (no git
  // provider needed): real routes, real selectors, explicit state→observable.
  const targetMapShape = z
    .object({
      routes: z.record(z.string(), z.string()).optional().describe('screen name (or id) → real route, e.g. {"Login":"/auth/sign-in"}'),
      selectors: z.record(z.string(), z.string()).optional().describe('element label → real CSS selector, e.g. {"Continue":"[data-testid=submit]"}'),
      observables: z
        .record(z.string(), z.object({ kind: z.enum(['url', 'text', 'visible', 'hidden', 'value']), value: z.string().optional(), selector: z.string().optional() }))
        .optional()
        .describe('state path → how to assert it in the real UI (when the prototype can\'t auto-derive)'),
    })
    .optional()

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
    'Returns a project record and the OUTLINE of its authored spec: each section of the envelope (keyed by wire id: scope, foundation, features, experience, rules, data, architecture, contract) as a size marker, with no section content. Most questions need one part only: read one section with get_section, one feature with get_behavior_feature, or a sub-tree here with paths:[...]. full:true returns the whole project: it can be very large and it stays under the size cap like every answer, so a large project comes back shortened. Accepts the project UUID or a wizard project slug.',
    {
      project_id: z.string().describe('Project UUID, or a wizard project slug (from list_wizard_projects)'),
      summary: z.boolean().optional().describe('Kept for older clients: the outline is what this tool answers by default'),
      full: z.boolean().optional().describe('Return the whole project with every section. Large: prefer get_section or paths'),
      paths: z.array(z.string()).optional().describe('Return only these dotted sub-trees, e.g. ["wizard_envelope.experience.designSystem"]'),
    },
    async (args) =>
      json(
        refuseRetiredPrototypeInProject(args.paths) ??
          withoutRetiredPrototypeInProject(
            await withSpecLanguage(
              ee ? await ee.portfolio.getProject(args) : await getProjectWithoutBack(args, lyriks),
              lyriks,
              args.project_id,
            ),
          ),
        'get_project',
      ),
  )

  mcp.tool(
    'create_project',
    'Creates a bare portfolio project record (a UUID with no linked Lyriks wizard draft) — the wizard section tools (set_section/patch_section/…) will 404 on it. To start a project you can author through the MCP, use create_wizard_project instead; only use create_project for portfolio-level records you will not drive through the wizard.',
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
    withDraftNote(
    'Author BEHAVIOR DEPTH on a feature — the full Unspaghettit vocabulary (state definitions, rules, effects, invariants, parameters, events, scenarios, reachability goals, transitions, personas, resources, entities) applied as one atomic add/update/remove/move batch. This is the write half of patch_section: use it to detail what a feature or a journey step actually DOES (guards, state changes, emitted events, model-checked scenarios). Runs through the platform engine under your auth and writes the shared model, so depth survives wizard re-saves. `feature_id` is a kernel feature id (a features-section leaf id, or "<projectId>__experience" for journey/step behavior, "<projectId>__data_model" for entities) — get it from get_behavior_context or list_wizard_projects. Each op is `{ kind, ref?, ...args }`; add ops can set `ref` so later ops in the SAME batch reference the new id via `*Ref`. Pass dry_run:true to validate + score without saving (STRONGLY recommended first). Returns `{ available, batch }`: `batch.ok:true` applied (with `refs`, `appliedCount`, `maturityPercentage`, and on a newer engine `created`: one row per element the batch minted, ref or not, `{ op, kind, id, path?, key? }` where `key` is its .unspa.json key, so the index is written without reading the feature back, and `renamed`: `{ from, to }` for every state path the batch moved, so the index entry is moved with it); `batch.ok:false` REJECTED — read `batch.errors` and fix. When the engine supports it, `batch.scenarios: { scope, run, passed, failed[], truncated? }` reports the scenarios of what the batch touched, run on the feature as the batch leaves it (a dry run included). A row in `failed` is information, not a rejection: validation alone refuses a batch, so read the row and fix the rule or the scenario; an older engine sends nothing and the field is absent. SEVERAL WRITERS ON ONE FEATURE: pass `expected_updated_at`, the feature `updatedAt` you read (get_behavior_feature returns it at `snapshot.feature.updatedAt` and in its summary), so an engine that supports it refuses to overwrite what changed since; a success then carries `batch.previousUpdatedAt` and `batch.updatedAt`, the version to send next, and an older engine ignores the argument. A conflict answers `batch.ok:false` with `batch.conflict:true`, `batch.currentUpdatedAt` and `batch.changedSince` (the elements that moved, `batch.changedSinceTotal` in all): NOTHING was written, so re-read the feature, rebase your operations on what it now holds, and resend with the new `updatedAt`. `batch.relatedElsewhere`, when present, names elements of OTHER features that share the state paths the batch touched, so a change that looks local is checked against them. Op-kind schema reference: build a batch against the vocabulary in the tool docs (add_state_definition, add_action_rule{rule:{category,condition?,effect:{type,...}}}, add_scenario{surfaceId|actionId,expectedAssertions}, add_reachability_goal, ...). Common gotchas: add_resource/add_reachability_goal nest their own `kind` under resourceKind / the arg (it collides with the op discriminator); block an action with effect {type:"block_action"} not "block"; requiredStates is string[] of paths, use rules for value guards. RULES ARE MANDATORY ON EVERY NEW ACTION — this is the product\'s core reading ("which rules are active"), not a nicety: an `add_action` op is REJECTED unless the same batch also carries at least one `add_action_rule` with that action\'s `actionRef` (so always give `add_action` a `ref`). Ask yourself what gates the action — permissions, state, quota, validity — and encode it. If it is genuinely unconditional, say so AS A RULE: an `add_action_rule` with no `condition` and `effect:{type:"allow_action",description:"…"}`; that records the decision instead of leaving a silent gap.',
      DRAFT_BATCH_NOTE,
    ),
    {
      project_id: z.string().describe('Lyriks project id / slug that OWNS the feature (from list_wizard_projects) — authorizes the write'),
      feature_id: z.string().describe('Kernel feature id: a features-section leaf id, or "<projectId>__experience" (journeys/steps) / "<projectId>__data_model" (entities), or a draft id (draft:...) an Evolution request carries, whose behaviour model the batch then extends'),
      operations: z.array(z.record(z.string(), z.unknown())).optional().describe('Ordered Unspaghettit ops, each { kind, ref?, ...kindArgs } — see the tool description for the op-kind vocabulary. Every `add_action` MUST be paired with at least one `add_action_rule` on its `ref` in this same batch, else the whole batch is rejected. Omit when committing a prior dry-run by `commit` token'),
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
      screen_id: z.string().optional().describe('A screen id of the inventory → its screen surface'),
      surface_id: z.string().optional().describe('A raw kernel surface id (srf-…) to inspect directly'),
      action_id: z.string().optional().describe('A raw kernel action id (act-…) to inspect directly'),
    },
    async (args) => json(await getBehaviorContextHandler(args, lyriks)),
  )

  mcp.tool(
    'get_behavior_feature',
    withDraftNote(
    'Read the canonical Unspaghettit feature tree through authenticated Lyriks, including stable ids for surfaces, actions, rules, effects, states, scenarios, invariants, entities and resources. A complete feature is often larger than one answer can carry (with no selector, such a feature comes back as its table of contents, `fullReadChars` giving the size of the complete read), so read it in two steps: summary:true returns the TABLE OF CONTENTS (feature id, name and updatedAt, counts of the feature-level collections, acceptanceCriteria as {id, title}, and per surface {id, name, stateCount, ruleCount, invariants:[{id, name}], actions:[{id, name, rules, effects, scenarios, parameters}]} with counts as numbers), then surface_id or action_id returns that ONE element whole with its {featureId, surfaceId, surfaceName} context and its `statements`: each rule and always-true statement as one EARS requirement sentence (While / When / If ... then / shall) and each scenario as Given/When/Then, derived from the logic by a fixed template, keyed `<kind>:<id>`; the description of a rule is its reason, not a restatement. Select by id, never by position: a path such as "snapshot.feature.surfaces.5" names another surface as soon as someone adds one. action_id searches every surface and wins when both ids are given; an unknown id answers found:false with the ids and names that do exist. index_keys:true answers { featureId, updatedAt, total, keys } instead: the implementation-index keys that belong to this feature, in the engine\'s own grammar (surface:<id>, action:<id>, rule:<id>, invariant:<id>, transition:<id>, surface_rule:<id>, surface_invariant:<id>, entity:<id>, state:<dotted.path>, event:<name>, criterion:<id>), so a repository can slice its .unspa.json by feature although index entries carry no featureId (send that slice to sync_implementation_index as a partial index). A state path or an event name several features declare is one key in each of them; criterion:<id> is resolved by newer engines only, an older one lists it under orphans. The list comes whole (100 to 300 short keys for a feature of 30 actions); only a huge feature is paged, with offset, returned and nextOffset in the answer: continue with offset:nextOffset. index_keys wins over surface_id, action_id and summary. `paths` still reads exact dotted branches that have no id of their own (for example "snapshot.feature.events") and wins over every other argument. This is the required read between apply_behavior_batch calls because batch refs only live within one batch. WHERE THE CODE IS: an action_id or surface_id read also carries `code`, where the implementation index last located the element and each of its children: `places` (key, name, file, line, `code` the code line, `stale` with `movedToLine` when the line moved, `unverified` when no code evidence backs it, `locatedAt`), `notLocatedYet`, `audits` (each action or surface report: commit, date, `provenAgainstCode`) and `next`: open those places with your own code tools (your search, a code search service, a code graph, your editor) to read how the code is written, and tell the person where it does otherwise than the rules read here. `linked:false` says the spec is not linked to the code yet: search the code by the names the answer gives. The table of contents, index_keys, paths and a draft carry no `code`; `code.available:false` says why the places could not be read.',
      DRAFT_READ_NOTE,
    ),
    {
      project_id: z.string().describe('Lyriks project id / slug that owns the feature'),
      feature_id: z.string().describe('Kernel feature id, or a draft id (draft:...) an Evolution request carries'),
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
    'simulate_behavior',
    'Walk a feature step by step, SAVING NOTHING: run a sequence of actions from a starting state, threading the state from one to the next, and read what each step did: `status` (success | blocked), `refusedBecause` (the reason of the rule that refused it, a rejected input, a broken invariant), `changes` ([{ path, before, after }] for every state path it moved), `messages`, `emittedEvents`, `movedTo` (the surface it navigated to, or null), `outcome`, and `cascaded` (the event handlers it woke up, in this feature or another of the project). A refused step changes nothing and the walk goes on from the same state; stop_on_blocked:true ends it there and `notRun` counts what was left. The answer ends with `finalState` and `simulated`, which says what was walked. run_scenarios:true also runs every scenario of the simulated feature and model_check:true explores its state space (dead actions, invariant counterexamples, deadlocks), so a feature or a draft is simulated in full from one call; steps are then optional. A step is { actionId, surfaceId?, parameters?, timeAdvance? }: parameters by name, and `$channel` says the channel the call arrives through (ui | api | mcp | webmcp | cli) on an action that declares exposures. `snapshot` is the state to start from over the declared defaults; `persona_id` applies a persona first. TRY A FEATURE BEFORE IT EXISTS: `operations` (exactly the apply_behavior_batch vocabulary) are applied IN MEMORY first, validated the way a batch is, and never saved; a step may then name what they created with `actionRef` / `surfaceRef`. A batch that does not validate answers { ok:false, errors } and runs no step. feature_id may be a DRAFT an Evolution request carries (`draft:…`): its behaviour model (authored with apply_behavior_batch on the draft id) is replayed over the feature it amends, or over an empty feature for an addition, then the `operations` you send, if any. An addition with no model yet needs `operations`. Read access is enough. Use it to try a flow while authoring; pin an expected result with a scenario, and explore every path with assess_behavior_feature.',
    {
      project_id: z.string().describe('Lyriks project id / slug that owns the feature'),
      feature_id: z.string().describe('Kernel feature id, or a draft id (`draft:…`) carried by an Evolution request of the project'),
      steps: z.array(z.record(z.string(), z.unknown())).max(50).optional().describe('Ordered steps, each { actionId | actionRef, surfaceId? | surfaceRef?, parameters?, timeAdvance? }. Optional when run_scenarios or model_check is asked'),
      run_scenarios: z.boolean().optional().describe('Also run every scenario of the simulated feature: scenarios { run, passed, failed[] }'),
      model_check: z.union([z.boolean(), z.object({ max_depth: z.number().int().positive().optional(), max_states: z.number().int().positive().optional() })]).optional().describe('Also explore the state space like model_check: invariant counterexamples, dead or unreached actions, deadlocks, reachability'),
      operations: z.array(z.record(z.string(), z.unknown())).optional().describe('apply_behavior_batch operations applied in memory before the walk, never saved'),
      snapshot: z.record(z.string(), z.unknown()).optional().describe('State to start from, over the declared defaults (nested or dotted keys)'),
      persona_id: z.string().optional().describe('A persona of the feature: its state first, its parameter values as defaults'),
      stop_on_blocked: z.boolean().optional().describe('End the walk at the first refused step'),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (args) => json(await simulateBehaviorHandler(args, lyriks), 'simulate_behavior'),
  )

  // ── Proof by the solver: Enterprise only ────────────────────────────────────
  // The Community engine runs no solver, so these tools are not offered there
  // at all: no stand-in names a proof the installation cannot make.
  if (ee) {
    mcp.tool(
      'what_if',
      'Ask what a change WOULD DO before writing it, SAVING NOTHING and without any language model: `operations` (exactly the apply_behavior_batch vocabulary: move a threshold, remove a rule, give a role a right) are applied in memory and validated like a batch (a change that does not validate answers { ok:false, errors }). The platform\'s SMT solver then proves the feature before and after with its project and bound, the authored scenarios run on both, and the answer is the difference only: `statements` (each invariant whose outcome changes: violated, none-within-bound, unsettled, unsupported), `actions` and `goals` (reach from the start), `deadlocks`, `findingsAppeared` / `findingsResolved`, `branches` that become possible or impossible, `scenarios` that start or stop passing (with the reason), `scope` (every feature proved: the changed one, and each other feature declaring a state written by an action the change adds, removes or alters, with those `states`; a feature outside it cannot move), `dependents` (for each other feature of the scope whose proofs or scenarios move, the same difference with its featureId and featureName), `unchanged` (true only when nothing moved in any feature of the scope), and `proven` (whether each side was proven; a side the solver could not prove is compared on scenarios alone). feature_id may be a DRAFT an Evolution request carries (`draft:…`): its behaviour model is the change, compared with the feature it amends or with an empty one for an addition; `operations` then go on top. The impact of an Evolution request carries the same comparison for each of its drafts (get_evolution part:"impact", `proofs`). Read access is enough.',
      {
        project_id: z.string().describe('Lyriks project id / slug that owns the feature'),
        feature_id: z.string().describe('Kernel feature id, or a draft id (`draft:…`) carried by an Evolution request of the project'),
        operations: z.array(z.record(z.string(), z.unknown())).optional().describe('apply_behavior_batch operations of the change, applied in memory, never saved. Required for a kernel feature; on top of the model for a draft'),
        max_steps: z.number().int().positive().optional().describe('How many steps from the start the proofs search (default 6)'),
      },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async (args) => json(await whatIfHandler(args, lyriks), 'what_if'),
    )

    mcp.tool(
      'prove_project_invariants',
      "The oracle's answer for every rule that spans a project (its project invariants, the rules the data model states among them, `fromDataModel:true`): ONE verdict per rule over the whole project, proven by the SMT solver and replayed by the simulator, never sampled, without any language model. `verdict`, most decisive first: impossible (no state satisfies it), contradicted (`contradictedBy`: the feature invariants that rule it out), broken (`brokenAtStart` with the values it reads there, or `brokenBy`: the shortest path from the start, each step with its feature, action and inputs), unsettled (never a proof either way), out-of-reach (`reason`), never-exercised (no feature writes what it reads: nothing puts it to the test), held-within-bound (no path of up to `maxSteps` steps breaks it: only the steps searched are proven, so it is NOT a proof; say so, never call it proved), proved (it holds on every run whatever its length, `provedBy: 'induction'`). Each rule also carries `leads` (actions no guard keeps from breaking it), `writers` and `readers`, `summary` (one sentence in the spec's language, relay it as is) and `href`, the link that opens the rule for the person: hand it over with the verdict. `counts` tallies the verdicts. Proving takes every feature that writes what the rules read: on a large project, name the rules with invariant_ids. Read access is enough; nothing is saved.",
      {
        project_id: z.string().describe('Lyriks project id / slug'),
        invariant_ids: z.array(z.string()).optional().describe('Only these rules (project invariant ids); every one otherwise'),
        max_steps: z.number().int().positive().optional().describe('How many steps from the start the path search looks (default 6)'),
      },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async (args) => json(await proveProjectRulesHandler(args, lyriks), 'prove_project_invariants'),
    )

    mcp.tool(
      'what_if_project',
      "Ask what a change to the project's RULES would do before anyone decides, SAVING NOTHING and without any language model: `operations` in the apply_project_behavior_batch vocabulary (add_project_invariant, update_project_invariant, remove_project_invariant), validated exactly like that batch (a change that does not validate answers { ok:false, errors }). The project is proved with its rules as they are and as the change would leave them, same features and bound, and the answer is the difference only: `rules` (every rule whose verdict or breaking path moves, the added, removed and changed ones and any other, each with `before`, `after`, `summary` and `href`), `scenarios` (authored scenarios of every feature that start or stop passing, with the reason), `actions` (actions that can no longer run from the start, or now can), `unchangedRules` and `headline`, one sentence in the spec's language. The other direction, what a change to ONE feature does to the project's rules, is what_if on that feature. Read access is enough.",
      {
        project_id: z.string().describe('Lyriks project id / slug'),
        operations: z.array(z.record(z.string(), z.unknown())).min(1).describe('apply_project_behavior_batch operations on project invariants, applied in memory, never saved'),
        max_steps: z.number().int().positive().optional().describe('How many steps from the start the proofs search (default 6)'),
      },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async (args) => json(await whatIfProjectHandler(args, lyriks), 'what_if_project'),
    )
  }

  mcp.tool(
    'get_data_links',
    "What joins the data model to the behavior: every data field with the behavior state that holds its value (`linkedTo`) and who linked it (`linkedBy`: lyriks when only one state could hold it, ai-client, person), or, when none, `candidates` (path, type, description, declaring feature) for you to weigh against your evidence. The link is what lets the solver check a field's rules (a required value, a choice) against every feature; `unlinkedCheckable` counts the fields whose rules nothing checks yet, and `tables` gives each table's existence state (the yes-or-no state true while one of its records exists, needed for required fields). Paged table by table (`nextOffset`); `unlinked_only:true` keeps what remains, `table` narrows to one. A field `declinedByPerson` was unlinked by a person: never link it again. Read access is enough; nothing is saved.",
    {
      project_id: z.string().describe('Lyriks project id / slug'),
      table: z.string().optional().describe('Only this table (its name in the data model)'),
      unlinked_only: z.boolean().optional().describe('Only the fields no state carries yet'),
      offset: z.number().int().min(0).optional().describe('Page start (the answer gives nextOffset)'),
      limit: z.number().int().positive().max(200).optional().describe('Page size (default 60)'),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (args) => json(await getDataLinksHandler(args, lyriks), 'get_data_links'),
  )

  mcp.tool(
    'link_data_fields',
    "Link data fields to the behavior states that hold their values, in the SAME pass as you capture them (after writing the states of a feature, or the fields of a table), from your evidence: the code that stores the value, what the screen shows. Never on a name alone when the evidence disagrees. `links`: [{ table, field, state_path }] by the names the data model uses (case does not matter); `state_path: null` takes a link back. `existence`: [{ table, state_path }] says when one of the table's records exists (required fields are checked only for a record that exists): a yes-or-no state true while it exists (\"integrity.receiptExists\"), or, when the behavior has no such state, a condition on its status: \"service.status != none\", \"offer.status = open\", \"exchange.status in pending|signed\", \"tap.status not in none|cut\" (a choice state only accepts values it allows; a number never says it). A state may hold a field in the behavior's own terms: a date or date-time field links to a number state (a time on the behavior's clock), and an optional field (not a choice, not a yes-or-no) to a yes-or-no state true while it is filled (a token kept as \"reset.pending\", an owner as \"link.hasOwner\"). When another feature keeps the same value under its own state (an administrator's \"user.banned\" beside \"account.banned\"), link that state with `also: true`: it becomes a further carrier, shown wherever data is read and never checked a second time by the solver, which checks the first state; `also: true` with `state_path: null` takes back the field's further carriers only. Each link is recorded as made by an AI client; a link is refused on its own line, the others still apply, when the kinds or the choices differ, the state already carries another field, or a person unlinked that field. Lyriks links by itself the fields only one state can hold, so link the rest. The answer gives each outcome and how the data model's rules moved (`rules`: added, updated, removed, linked). Needs write access; up to 500 entries per call.",
    {
      project_id: z.string().describe('Lyriks project id / slug'),
      links: z
        .array(z.object({ table: z.string(), field: z.string(), state_path: z.string().nullable(), also: z.boolean().optional() }))
        .optional()
        .describe('Fields to link (state_path) or unlink (null), by table and field names; also:true adds a further carrier'),
      existence: z
        .array(z.object({ table: z.string(), state_path: z.string().nullable() }))
        .optional()
        .describe('Per table, when one of its records exists: a yes-or-no state, or a status condition such as "service.status != none" (null clears it)'),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (args) => json(await linkDataFieldsHandler(args, lyriks), 'link_data_fields'),
  )

  mcp.tool(
    'apply_project_behavior_batch',
    'Author what holds ACROSS a project\'s features, in one atomic batch (nothing lands unless every op and every check passes; dry_run:true saves nothing). The feature-level vocabulary stays in apply_behavior_batch; this is the project level. Ops: add_project_invariant { ref?, invariant: { name, condition, message, description } } (a safety property spanning features, e.g. "no cart holds more than the stock": its condition reads state paths ANY feature of the project declares, never a parameter; a path no feature declares is refused. It holds on every simulate_behavior step and in every model check), update_project_invariant { invariantId|invariantRef, name?, condition?, message?, description? }, remove_project_invariant { invariantId }; add_state_variable { ref?, path, type, defaultValue, description, valueSetId?|enumValues?, owner: { featureId, surfaceId }, readers?, writers? } (ONE canonical identity for a state several features share; the path is unique and every projection must be a surface of a project feature), update_state_variable { stateId|stateRef, ...fields }, link_state_variable { stateId|stateRef, dataField: { featureId, entityId, fieldId } | null } (drift between the state and the data field it mirrors comes back as warnings), remove_state_variable { stateId }. promote_to_project_library { featureId, definitionKind: "entity"|"resource"|"persona", id, dedupe? } moves a definition into the project library and collapses identical copies in other features into references; it rewrites several features, so it runs ALONE and has no dry run (features then reference library definitions with the link_project_definition batch op). The core registry is declared from the feature tree and refused here. Read it all back with get_behavior_project.',
    {
      project_id: z.string().describe('Lyriks project id'),
      operations: z.array(z.record(z.string(), z.unknown())).min(1).describe('Ordered project-level ops, each { kind, ... }'),
      dry_run: z.boolean().optional().describe('Validate without saving'),
    },
    async (args) => json(await applyProjectBehaviorBatchHandler(args, lyriks)),
  )

  mcp.tool(
    'get_behavior_project',
    'What the behavior engine holds for a project beyond its features: projectInvariants (safety properties spanning features), coreFeatures (the core registry, declared from the feature tree), stateVariables ({ stateVariables, coherenceIssues }: canonical shared states with any drift from the data field each mirrors) and library (entities, resources and personas defined once, with the features referencing them and any dangling reference). Author them with apply_project_behavior_batch.',
    { project_id: z.string().describe('Lyriks project id') },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (args) => json(await readProjectBehaviorHandler(args, lyriks)),
  )

  mcp.tool(
    'find_state_references',
    'Before renaming or removing a state, list every rule, effect, invariant, required state and parameter binding of a feature that reads or writes its path.',
    {
      project_id: z.string().describe('Lyriks project id / slug that owns the feature'),
      feature_id: z.string().describe('Kernel feature id'),
      state_path: z.string().describe('Dotted state path, e.g. "cart.items"'),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (args) => json(await findStateReferencesHandler(args, lyriks)),
  )

  mcp.tool(
    'generate_behavior_types',
    'Generate the TypeScript module mirroring a feature: a type per enum state, the value type of every state path, the parameter shape of every action and the names of its events. Returned as `source` for the repository to save (nothing is written on the server); implementation code that imports it stops compiling when the model changes under it. Regenerate after each behavior change.',
    {
      project_id: z.string().describe('Lyriks project id / slug that owns the feature'),
      feature_id: z.string().describe('Kernel feature id'),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (args) => json(await generateBehaviorTypesHandler(args, lyriks)),
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
      sha256: z.string().optional().describe('The sha256 your shell computed over the file (`sha256sum <path>`; its output is accepted as is). The gateway computes it over the content it received and stores nothing when they differ, so a file retyped with an altered character is caught. Pass it whenever no script can send the file for you (Claude Cowork, claude.ai)'),
      register_id: z.string().optional().describe('The id of the row of the documents register (documents.sources) this text belongs to. Pass it for every document, page or file a spec element cites: the row then names the stored text (one source, one id, the register\'s) and its passages can be cited with cite_passages. An unknown id is refused before anything is stored.'),
    },
    async (args) => json(await attachSourceHandler(args, lyriks)),
  )

  mcp.tool(
    'cite_passages',
    'Cite the passages of a stored source the elements of the specification rest on, so a reader sees in the source exactly what each element took from it. Each passage names the register source (`source_id`, a documents.sources id whose text you stored with attach_source given that register_id), the element (`anchor`, as the Specification 360° anchors it: "feature:<featureId>", "action:<featureId>:<actionId>", "rule:<featureId>:<ruleId>", "role:<roleId>", "term:<termId>", "table:<entityId>", "journey:<journeyId>"), the exact `words` it rests on (quote them as the source reads them, the shortest span that carries what the element took, not the whole section; spaces and line breaks may differ) and `takes`, one sentence saying what the element took from them ("the limit of 12 statuses", "who may archive a project"). The platform finds the words in the stored text and records their place; it never trusts an offset you count. Words it cannot find word for word, a source whose text is not stored and an unknown source are refused by name in `refused`, and the rest is recorded. Citing the same place for the same element again rewrites it. This is how a retrospecification from documents says where each element comes from; the sourceIds an element cites stay the register ids.',
    {
      project_id: projectIdArg,
      passages: z
        .array(
          z.object({
            source_id: z.string().describe('The register source (documents.sources id) whose stored text the words come from'),
            anchor: z.string().describe('The element the passage supports, as the Specification 360° anchors it'),
            words: z.string().describe('The exact words the element rests on, as the source reads them'),
            takes: z.string().describe('One sentence: what the element took from these words'),
          }),
        )
        .min(1)
        .describe('One row per passage; an element may rest on several, and one passage may support several elements'),
    },
    async (args) => json(await citePassagesHandler(args, lyriks)),
  )

  mcp.tool(
    'list_sources',
    'List the source documents stored for a project (attached by you, or pasted by the user in the behavior editor): id, name, kind, size, hash, date. Pass source_id to read one back instead — offset/max_chars page through a large file. Prefer reading a source the user already provided over re-pushing your own copy.',
    {
      project_id: projectIdArg,
      source_id: z.string().optional().describe('Read this source instead of listing all'),
      name: z.string().optional().describe('List only the sources whose file name contains this text, e.g. "links.handler.js"'),
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
    `Trace modeled elements back to the code they came from: stamp MANY elements with their character spans in one call (offsets index into the attached source content, end exclusive). This is the cost driver of adoption: batch every span for a source into a single call rather than one per element. Items are applied in order; a failing item is reported in \`results\` with its reason and does NOT abort the rest. finalize_analysis refuses until every element has one of these, which is what stops a model being invented rather than read. ${SPAN_TARGETS_NOTE}`,
    {
      project_id: projectIdArg,
      feature_id: featureIdArg,
      source_id: z.string().optional().describe('Default source for items that omit their own'),
      spans: z
        .array(
          z.object({
            element_id: z.string().describe('Id of the modeled element: a surface, a state definition, an action, a rule, an invariant, a transition, an event or an entity (never an effect, parameter, exposure, scenario, goal, persona, resource, constant or criterion)'),
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
    'Park spans you have spotted but not modeled yet, with a one-line summary each, so behavior you noticed is not silently dropped when you move on. Close each one later with dispose_candidate. The answer leads with `created`: one row per candidate staged, in the order sent, { candidateId, kind, summary, startOffset, endOffset, sourceId }, so dispose_candidate takes that candidateId without reading the provenance back; a candidate that was refused has no row there and is named in `results` with its reason.',
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
          kind: z.enum(CANDIDATE_KINDS).describe('The element type this behaviour would become in the model'),
          confidence: z.number().min(0).max(1).optional(),
        }),
      ),
    },
    async (args) => json(await stageCandidatesHandler(args, lyriks)),
  )

  mcp.tool(
    'dispose_candidate',
    'Close out a staged candidate: pass element_id when you modeled it, or a rationale when you deliberately dropped it. An open candidate is unfinished work that finalize_analysis does NOT wait for, so decide each one before you close the analysis: a model closed with candidates still open says nothing about what you parked.',
    {
      project_id: projectIdArg,
      feature_id: featureIdArg,
      candidate_id: z.string(),
      disposition: z.enum(CANDIDATE_DECISIONS).describe('accepted or merged (give element_id: the element it became), rejected or out_of_scope (give a rationale), conflict (tied up in an open disagreement)'),
      rationale: z.string().optional().describe('Why, when it was dropped rather than modeled'),
      element_id: z.string().optional().describe('The element it became, when modeled: a surface, a state definition, an action, a rule, an invariant, a transition, an event or an entity, the same elements a span can point at'),
    },
    async (args) => json(await disposeCandidateHandler(args, lyriks)),
  )

  mcp.tool(
    'flag_conflict',
    'Record that two sources disagree about the same behavior, instead of silently believing whichever you read last. Cite each side with its source: at least two statements, each naming a different stored source (list_sources) and what it claims. Bring a conflict between code and documentation to the developer: it is a finding about the product, not a modeling error. Settle it later with resolve_conflict.',
    {
      project_id: projectIdArg,
      feature_id: featureIdArg,
      summary: z.string().describe('What the disagreement is'),
      statements: z
        .array(z.object({ source_id: z.string().min(1), statement: z.string().min(1) }))
        .min(2)
        .describe('What each source claims: at least two, each from a different stored source'),
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
    'Close the analysis for one feature. It REFUSES while no source is linked, when the analysis is already closed, or while any modeled element has no source span, and then names the elements without one (the first twenty, and how many in all): that refusal is the gate that makes an adopted model trustworthy, so treat it as a work list, not an error. It checks nothing else: a candidate still open does not hold it (decide each with dispose_candidate first), and an open conflict closes with a note saying how many stay open. Required before seed_implementation_index.',
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
    'What a feature\'s model is made of: which element came from which source span, which candidates are still open, which conflicts are unresolved. Pass coverage:true for how much of each attached source has actually been consumed. Read this BEFORE finalize_analysis: an element without a span is what the gate refuses on, while the open candidates and conflicts it lists are what the gate lets through, so settle them first.',
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
    'The Evolution section as ONE aggregate: the board (the requests FIRST, one card per live change request: stage, the stage its own state supports, maturity, open questions, pending proposals, coherence delta, blocking findings, undecided report lines, acceptance debt, waiver) or, with request_id, ONE dossier IN COUNTS: its touched features, how many fields are filled, empty, critical and empty, open questions, awaiting a proposal or discussed, how many proposals wait and how many are flagged or blocked, how many readings are filled and how many move, the maturity per block with the critical holes named, the coherence findings the engine published, the impact in short (one plain-language line per plane, the spec plane and the code plane, how much moves per section, plus the direct hits), the next gate and exactly why it refuses, the report counts, the observations, the acceptance debt and the last timeline entries. That answer stays under the result cap whatever the request holds: every list that grows with it (the touched features, the changes of the drafts, the coherence findings, the docking points, the paths of the journey, the data changes, the versions, the history) comes counted with a short preview and a `read` naming its part, and every text (the answers of the Need, the descriptions and answers of the steps) comes cut to a preview that says `cut: true` and its full `length`, its thread counted, read whole with part:"texts". Never take a preview for the whole: every list comes ONE PART at a time, narrowed to one touched feature with `leaf` and paged with `offset`/`limit`: part:"fields" (one row per inline field per touched feature: the value the owning section holds, whether it is filled, the open question, the proposal waiting, the thread), part:"proposals" (every pending proposal with its full value, reasoning, sources and whether a person may accept it as it stands), part:"impact" (every impacted node under one hypothesis, the one that ran last by default and any other with `hypothesis` add|change|remove, since each run keeps its own findings, `section` narrows to one of leaves|screens_and_journeys|entities_and_fields|rules_and_scenarios|permissions|glossary_terms|code; the code section lists the files the implementation index anchors on the touched and reached features), part:"report" (every line of the current iteration, `verdict` narrows to conform|non_conform|missing|out_of_scope|regression; each line carries `scope`: "request" for an element this request brought, "inherited" for one the touched features already held at the first freeze, which is their backlog and never holds the report open; `undecided` counts the request lines only, `inherited` counts the rest; `scope` narrows the list), part:"readings" (the blocks edited elsewhere: behaviour, grants, entities, dependencies; an empty reading = author it in the owning section and it fills itself), part:"drafts" (what the request PROPOSES, in full: each drafted feature with its kind add|amend|remove, the leaf it stands for, its name, description, the four why-fields, its acceptance criteria, dependencies, sources and behaviour rows, its `changes` (every element its behaviour model creates, changes or removes, by name, with its id and the action and screen it belongs to), plus the leaf id it became once the landing wrote it), part:"texts" (every text written on the request, whole, with its trail and its thread), part:"coherence" (every coherence finding, `scope` request|inherited narrows it; with them Project health now and as the change would leave it, and `settles`: every finding of Project health the request settles, with its outcome and its validation, paged with the same offset and limit), part:"points" (where each piece of the change lands on the product, qualified), part:"data" (the data changes and the model they are declared against), part:"versions" (every frozen version and what changed from the one before), part:"history". Read the counts first, then the one list you need, one feature at a time. A list page that would not fit the result cap comes back shorter in the SAME shape, with `nextOffset`. The board counts leaves and sources; read them with part:"leaves" or part:"sources". A request is named by its full id or any unique prefix. Read it when the person wants a change qualified or carried through a dossier, or to see the requests already open. ' + EVOLUTION_IS_OPTIONAL + ' The aggregate is precomputed server-side, and `fieldsAvailable` lists the field paths apply_evolution_batch can propose on; `originsAvailable` lists the six origin codes open_request takes; `members` is the workspace roster a proposal can be handed to (empty where one member is alone). Read this instead of get_section(evolution), which is the raw document without any of the derived readings. ' + PERSON_LINKS,
    {
      project_id: z.string().describe('Lyriks project id (from list_wizard_projects)'),
      request_id: z.string().optional().describe('One request, by its full id or any unique prefix of 4+ characters (the 8-character ids the board and reports quote work); omit for the board'),
      part: z.enum(DOSSIER_PARTS).optional().describe('With request_id: "summary" (default, counts and previews) or one list: drafts | fields | proposals | impact | report | readings | history | texts | coherence | points | data | versions | sections (the changes to the other pages of the spec, each value before and after). Without request_id: leaves | sources pages the board\'s own lists (the board itself only counts them)'),
      section: z.string().optional().describe('part:"impact": keep one section of the impact list'),
      hypothesis: z.enum(['add', 'change', 'remove']).optional().describe('part:"impact": which run to read. Each run_impact keeps its own findings, so the three hypotheses stay readable side by side; omit for the one that ran last'),
      verdict: z.string().optional().describe('part:"report": keep one verdict bucket'),
      scope: z.enum(['request', 'inherited']).optional().describe('part:"report" and part:"coherence": "request" keeps the lines on elements this request brought (they hold the report open), "inherited" the lines on elements the touched features already held at the first freeze (their backlog: shown, never a gate)'),
      leaf: z.string().optional().describe('part:"fields"|"proposals"|"readings"|"drafts": keep what belongs to ONE touched feature (a leaf id from the dossier\'s leafIds, a drafted one included)'),
      offset: z.number().int().nonnegative().optional().describe('page start for any list part (the answer says total, matched, offset, limit, and nextOffset when rows remain)'),
      limit: z.number().int().positive().optional().describe('page size for any list part (default 150); a page that would not fit the result cap comes back shorter, same shape, with nextOffset and pageNote'),
    },
    async (args) => json(await getEvolutionHandler(args, lyriks), 'get_evolution'),
  )

  mcp.tool(
    'apply_evolution_batch',
    withDraftNote(
    'Drive a change request through its lifecycle with typed operations, applied ATOMICALLY by the platform under the same guards as the dossier page: nothing lands unless every op is allowed, and a refusal names the op and the sentence the spec wrote. WHEN TO OPEN A REQUEST: ' + EVOLUTION_IS_OPTIONAL + ' Each operation is `{ op, ... }` (`kind` is accepted as the same thing, since the behavior batch spells it that way). YOU (the AI client) may: open_request {title, origin, requester?, leafIds[] = EXISTING leaf features the change touches, findingIds[]? = findings of Project health the request is opened to settle: each becomes a line with no outcome yet, the features they name join leafIds, the Need description names them, and title may then be left out}; every requestId accepts the full id or any unique prefix of 4+ characters; the six origins are internal_idea|customer_feedback|support_ticket|market_watch|regulatory|technical_debt, and get_evolution lists them as originsAvailable, update_request {requestId, title?, origin?, requester?}, set_leaves {requestId, leafIds[] = leaves that EXIST, or drafts this request carries}, add_draft_leaf {requestId, kind add|amend|remove (default add), baseLeafId (required for amend and remove: the EXISTING leaf it stands for), name (required for add), description?, coreId?, parentFamilyId?, objective?, problem?, expectedEffect?, value?, acceptanceCriteria[]?, dependsOn[]?, sourceIds[]?, behaviour[]? (each {kind surface|state|action|rule|scenario, name, detail?})} = PUT THE CHANGE ON THE DOSSIER. This is how a capability the product does not have yet gets qualified: the draft is counted among the touched features straight away, the impact walk starts FROM it instead of from the hole where it would sit, the coherence check catches what it would contradict, and NOTHING is written into any section until the change lands. AN AMENDMENT IS A DELTA: on kind "amend", acceptanceCriteria[] are the criteria it ADDS (the feature\'s other criteria stay), retireCriteria[] names by id the feature\'s criteria it retires, changeCriteria[] ({id, text}) rewords one in place under its id, descriptionPatch ({find, replace}, or a list of them; `find` must occur exactly once in the feature\'s description) and descriptionAppend edit the description without resending it (a `description` replaces it outright); every id and passage is checked against the feature when the draft is made. Values typed on an amend draft (objective, problem, value, criteria...) count as filled for the feature it amends, so do not propose them again. update_draft_leaf {requestId, draftId, ...the same fields} (only what you name is touched), remove_draft_leaf {requestId, draftId} (the draft and what was proposed on it go; the specification is exactly as it was), add_section_draft {requestId, page glance|users|experience|requirements|architecture|glossary, summary (what it changes, in the person\'s words), edits[] (the patch_section vocabulary: set, merge, append, remove, add_to_set, remove_from_set, append_text, replace_text, each on what that page of the Specification 360° shows: Overview its product summary, current and target situation; Tech and data › Requirements its platforms, languages, security, compliance, accessibility and technical constraints; Users its roles, and Users › Permission matrix its permissions; Experience its journeys, steps, screens and components; Tech and data › Architecture its stack; Glossary its terms), sourceIds[]?} = A CHANGE TO ANOTHER PAGE OF THE SPEC: features keep add_draft_leaf and the Data map add_data_draft, Health is computed and takes none, and an edit on what no page shows is refused since nobody could read or validate it; every edit is checked against the section as it stands and that section\'s own guards, read whole with get_evolution part "sections" (each value before and after, named by its page), validated by a person on the Specification like a feature, and written into nothing before the landing, which applies it through the section\'s own save. update_section_draft {requestId, sectionDraftId (the section:... id add_section_draft answered; a draftId carrying it is read the same), summary?, edits?, sourceIds?} (only what you name is touched), remove_section_draft {requestId, sectionDraftId} (the spec is exactly as it was), add_rule_draft {requestId, summary, operations[] (the invariant operations of apply_project_behavior_batch: add_project_invariant, update_project_invariant, remove_project_invariant), sourceIds[]?} = A CHANGE TO THE RULES THE WHOLE PRODUCT KEEPS: checked by the engine as a dry run when drafted, on the product as the request would leave it (a state a feature draft of this request declares counts as declared, so draft the feature change first), proved with the change by the coherence check where the engine proves rules, read in part "sections" (field `rules`, each rule before and after as one EARS sentence), validated by a person on the Specification, and written into the project\'s behaviour as one batch only at the landing; inside a request, send these operations here, never through apply_project_behavior_batch, which writes at once. update_rule_draft {requestId, ruleDraftId (the rules:... id add_rule_draft answered; a draftId carrying it is read the same), summary?, operations?, sourceIds?}, remove_rule_draft {requestId, ruleDraftId}, add_finding_draft {requestId, findingId (the id get_section(coherence) gives a finding of Project health in analysis.gaps), outcome? fixed|kept (none yet when left out), reason? (required when kept; on a fix, where it was fixed when the fix is already in the product, written into the note at the landing), sourceIds[]?} = A FINDING OF PROJECT HEALTH THE CHANGE SETTLES: one line per finding, one live request per finding, a blocking finding is fixed and never kept, the feature it names joins the features the request touches; validated by a person on the Specification once its outcome is chosen; when the change lands it leaves Project health in the same run (a finding of the rules register is resolved with the request and the merge commit as its note, a kept one is settled by design with its reason, a fixed one only the engine detects leaves once the engine reads the landed spec), so never settle by hand what a request fixes, and the coherence check reads Project health now and after the change. update_finding_draft {requestId, findingDraftId (the finding:... id, or findingId), outcome?, reason?, sourceIds?}, remove_finding_draft {requestId, findingDraftId}, propose {requestId, fieldPath (from get_evolution fieldsAvailable), leafId, value (a string, or an array of lines for a field whose kind is "list"), whatWasRead (what the sources say), whatWasInferred (what you concluded from it), citedSourceIds[] (documents register ids: register the source first, in the same batch with register_source, or with patch_section(documents), NOT attach_source), question? (the ONE fact you are missing to finish it, asked in the suggestion itself; a text with two question marks is refused), choices[]? (at most 3 short answers a click gives under the question); a question is answered on the page, so with no session of yours on the project open one in the same turn (start_evolution_session, then await_evolution_event) before you hand the link, or the answer never reaches you}. The two halves are named fields, judged on being filled, in the language the project is written in: nothing is looked for in your wording, and a proposal missing either half is REFUSED when it is proposed (a batch then stops there, so put proposals before decisions), register_source {title, url? (a web address anyone can open), note? (the words themselves, verbatim, when there is no such address), kind?, id?} (writes a row of the documents register; one of url or note is required; answers the id to cite; needs no requestId), withdraw_proposal {requestId, proposalId} (take back a proposal YOU made while nobody has decided it, so a wrong or flagged value never holds a field nobody will sign; a person refuses instead), post_on_field {requestId, fieldPath, leafId?, body, replyTo?, asks? (true when your reply asks the person something: the page shows that it waits for their answer, so with no session of yours on the project open one in the same turn before you hand the link; ONE question, and a new topic of yours that asks about a field where your own suggestion waits is refused: ask it in the suggestion), private? (in a session: a subject you carry onto another question stays between the person and you), writes? ([{ fieldPath, value }]: the texts you OFFER in your message, each at its place, step.<step>.description or step.<step>.<question>, each value the whole text that place would hold, one line per statement; the page shows them as the place shows them with Accept and Refuse, Accept writes them as the person\'s write, which they then validate; never paste a text for the person to copy, and when an exchange settled a text, offer it this way in one message; in a workspace of several members this is how you write ANY text of a step, answer_step and update_step_description being refused to you there; the Need\'s verbatim, a diagram and a field of a block (propose) are refused)}, run_impact {requestId, hypothesis add|change|remove, depth 1..5} (COMPUTED: the spec plane over the knowledge graph, the code plane over the synced implementation index; run the hypotheses the request asks for, one per kind of draft it carries, in one batch: each row reads with the verb of the draft behind the feature it was reached from; remove on a request that removes nothing is the cost of taking the change back out, a reading of its own run only when the person asks; an empty report says why in impact.emptyBecause; sync_implementation_index first for a real code plane), run_coherence {requestId} (COMPUTED by the coherence engine over the whole project; the same request gives the same reading whatever asked for it: when the behaviour verification it folds in has not answered in time, a request holding a reading keeps it and the answer says to run it again in a moment), build_implementation_report {requestId} (DERIVED from the synced implementation index against the frozen version: sync_implementation_index first, in Verify; lines on elements the touched features already held at the first freeze come back scope "inherited" and do not hold the report open, so only this request\'s own lines need a decision before Accept). A PERSON decides, and you relay their decision ONLY when they told you to, with as_person:true on the batch (the act lands as theirs, channel stamped on the timeline): decide_proposal {requestId, proposalId, decision accept|refuse|reword, comment?, value?, sense?} (accept WRITES the value into the owning section; a glossary flag (flaggedWords, each naming the agreed term) WARNS and never blocks, and sense records the person\'s words when they keep a flagged wording in another sense; on a proposal with tagged reviewers, accept is that reviewer\'s validation and the value is written once every reviewer validated, refuse is an invalidation that refuses it), tag_reviewers {requestId, proposalId, reviewerIds[]} (hand a proposal to named members of the workspace, ids = emails from get_evolution `members`; only where the roster holds more than one member, Enterprise), mark_open_question / answer_open_question {requestId, fieldPath, leafId?}, cross_stage {requestId, waiverReason?} (one gate at a time, and Specify does not close while a proposal still awaits a decision, since the maturity next to the dossier is inherited from the features the change touches and never proves the change itself was specified: Specify > Challenge > Verify (freezes the spec as a numbered version) > Accept > Delivered; a waiver crosses an unmet gate with a stated reason), lift_waiver, rebrief (back to Specify, amends a frozen spec), decide_line {requestId, lineId | verdict, decision validated|invalidated|adopted|removed}, rule_observation {requestId, observationId, ruling validated|invalidated|deferred|requalified, reason?}, fold_back {requestId, observationId, leafId, text} (writes an acceptance criterion on the feature), close_request (only once delivered, and only where the project names no deployment branch), cancel_request {requestId, reason} (stops the change at any stage: it leaves the board\'s columns, stays readable, and what it wrote into the specification stays), reopen_request {requestId} (takes a cancelled request back up where it stood), delete_request. AN OBSERVATION IS LOGGED BY THE PERSON WALKING THE PRODUCT, on the dossier page, because it is anchored on the screen and the element they are looking at and carries their annotated capture: you rule on the observations get_evolution lists and fold the validated ones back, and there is no operation to log one in their place. An observationId the dossier does not list is refused, which is that rule, not a missing feature. INSIDE A DOSSIER, NOTHING REACHES A SECTION BEFORE THE LANDING: the change a request carries is not also written directly (other changes are, since Evolution is optional). A feature the change would add is an add_draft_leaf on the dossier, and the landing (the change declared live, its branch merged into the deployment branch, or the request closed) is what writes every draft into the features section, stamped with the request; the freeze into Verify records the numbered version the code is built against and writes nothing. Other predicted new things are impact findings; spec values are proposals. The answer carries each op result and the touched requests as CARDS; read the dossier again with get_evolution. THE CLOSE, once the change is approved: where the project names a deployment branch it goes live by its merge, never by hand. The person\'s AI merges the request\'s branch in their checkout and runs report-merge.mjs, which sends report_merge {requestId, branch, into, mergeCommit, containsValidated} (recorded only when git says the validated commit is in the merge: the drafts become the official specification then) and syncs the index in the same run, so syncing again is offered only while the request still holds entries; during the Build every sync-index.mjs run reports the branch (report_code_state). Elsewhere declare_deployment {requestId, releaseId?, note?} makes it live. answer_click {clickId, text, asks?, place?, proposal?} answers a click made outside a request (chat, reread; ask_block for an older question still waiting): on chat, a message of the person\'s PRIVATE conversation in Ask my AI, asks:true when your answer is ONE question back because you cannot tell what they mean, place {anchor, title} the block of Knowledge your answer bears on most (they may publish it there), proposal {featureId, summary, operations} a change of the specification as apply_behavior_batch operations, which Lyriks dry-runs and refuses with what does not land (correct it and answer again) and which the person validates on the page; never write the specification yourself from a chat. IN A SESSION, while you are on a click (from await_evolution_event handing it to you until you call it again), cross_stage, close_request and delete_request are refused, since no cancellation could undo them; after the person cancels the request you are on, every operation is refused until you call await_evolution_event again, which tells you what was undone. VALIDATING IS OPTIONAL UNTIL THE BUILD: no validation of the Need, the Solution, the Functional spec or the Technical spec holds the next step, the drafts (add_draft_leaf, set_draft_behaviour, the data, section and rule drafts) or the entry into the Impact analysis; the request enters it on its own once all four stand validated, and is moved on by hand otherwise. The freeze into the build waits for one validation: the Solution\'s, by a person ("The Solution is not validated yet"), besides the Specification items an AI wrote. Order of work: open_request > the Need, then the Solution and its two diagrams (prose, see the skill) with EVERY TEXT THE PAGE REQUIRES, since the person\'s Validate is refused while one is empty: the Solution\'s description and how we will know it works (answer_step {step: "solution", question: "examples"}), the Functional spec\'s description and its rules (answer_step {step: "functional_spec", question: "refusals"}: what the product allows or refuses and why, one rule per line, shown as the Rule lines of 2.1; a change that refuses nothing new says so in one line, or skip_question {requestId, fieldPath: "step.functional_spec.refusals", reason} says why it is not asked); get_evolution `next` names what is still owed > hand the person the link to validate them only once `next` says to > add_draft_leaf (what the change IS) and/or set_leaves (what it touches), data, section and rule changes > run_impact (the hypotheses the drafts ask for) > run_coherence > propose on the open questions and empty critical fields > the person decides > cross_stage. A request that disturbs nothing and contradicts nothing needs none of the last three: it crosses its own gates and closes itself the moment the readings come back, and the answer says so. ' + PERSON_LINKS + ' Follow the lyriks-evolution skill.',
      DRAFT_EVOLUTION_NOTE,
    ),
    {
      project_id: z.string().describe('Lyriks project id'),
      operations: z.array(z.record(z.string(), z.unknown())).min(1).describe('Ordered typed operations, each { op, requestId?, ...fields } (see the tool description)'),
      as_person: z.boolean().optional().describe('true ONLY when relaying a decision the signed-in person explicitly took in the conversation; the act is stamped as theirs, through the ai_client channel'),
    },
    async (args) => json(await withWriteLock(`${args.project_id}:evolution`, () => applyEvolutionBatchHandler(args, lyriks))),
  )

  mcp.tool(
    'start_evolution_session',
    'Open the person\'s LIVE SESSION on the project: they stay on their pages and click while you wait, instead of going back and forth in the chat. A person holds ONE session per project, whatever opens it: given the project alone it starts on every page; given a request (request_id), it is the same session of the project, started on that request (the answer names it in `startsOn` and `href`). Opening one ends the one before. It covers the Specification 360°, the Retrospecification, the Evolution board and every request: await_evolution_event (project_id and session_id; request_id is not needed) hands you the person\'s clicks from all of them, in the order they were made, each with the page and the place it was made and what the page already holds. The person sees it in ONE place, Ask my AI at the foot of the navigation: "Not connected" before, "Connecting", "Listening" or "Working" in session, with what you do (the click you are on) in its box, "Not connected" again once it ended. Open it when the work calls for it, never merely because you use this MCP: (1) on your own, in the same turn and before the link, whenever you hand the person a link to the app (an href an answer carries), in the background and without a word in the chat unless it fails, so their click there reaches you (never again once the person ended it in that conversation); (2) when the prompt Ask my AI or "Prepare it with my AI" copies says a Lyriks session begins, or the person asks to work with you on the pages; (3) on your own, in the same turn, whenever you ask the person something they answer on a page (the question of a suggestion, a reply sent with asks: true, a link to answer there): without a session their answer never reaches you. In session the AI buttons of the pages come alive: Prefill with my AI, Ask your AI in a thread, Draw with my AI, Send to my AI at Build and on each step of the close (merge, index sync, branch), Ask your AI on a block, Re-read the code with my AI. The clicks still waiting from an earlier session go to this one first. Then wait at once, and again after every answer, until it says the session ended. Waiting must never take the chat away from the person: a client that runs a command in the background and is woken when it ends (Claude Code: Bash with run_in_background) waits with `node .lyriks/tools/await-event.mjs <project_id> - <session_id>` (installed by sync_skills, endpoint from LYRIKS_MCP_URL), which ends printing the event, and answers the person in the chat meanwhile; any other client waits in short holds (max_wait_seconds) and answers the chat between two waits. A session never lets you do what you could not do outside one: a prefill is a proposal the person signs, a decision is relayed only when they said it. Follow the lyriks-evolution skill.',
    {
      project_id: z.string().describe('Lyriks project id'),
      request_id: z.string().optional().describe('Optional: the request to start on, by its full id or any unique prefix of 4+ characters. The session is the project\'s either way'),
    },
    async (args) => json(await startEvolutionSessionHandler(args, lyriks, selfInstall?.sessionTicket ? { mcpUrl: selfInstall.mcpUrl, ticket: selfInstall.sessionTicket } : undefined)),
  )

  mcp.tool(
    'await_evolution_event',
    `Wait, in the person's open session on the project, for their next click on any page of it. ONE call held open up to ${SESSION_LIMITS.maxHoldSeconds} s; while it waits the server sends an MCP progress notification every ${SESSION_LIMITS.progressIntervalSeconds} s, so a client that resets its timeout on progress (Claude Code does) keeps it open without any setting. A client that sends no progress token gets ${SESSION_LIMITS.withoutProgressSeconds} s per call (raise its tool timeout and pass max_wait_seconds to wait longer). It answers kind "click" with the click, its \`requestId\` when it was made on a request (null elsewhere), and \`answerWith\`, the one operation that answers it. On a request: prefill (\`section\` lists every question it covers, each with its value: fill each one you can in the same batch, never only the first; \`stepPrefill\` is set when the click is section n of m of a prefill of a whole step: fill that section only, then wait again; \`answer\` is set when the person answered the question of your suggestion: propose again on that field with the answer folded in), ask (a message sent with 'Ask your AI' in a field's thread), draw (a step's diagram), ticket (post the closing message on the ticket through your own tracker connector, then report_ticket_post), build (\`build.brief\`: build the frozen version and prove it) and close (\`close.step\` merge, sync or branch and \`close.brief\`, its commands: run them in the person's checkout, never push, say what git refused). Outside a request: chat (a message of the person's private conversation in Ask my AI, with the conversation so far and \`askedFrom\`, the page it was asked from: judge first whether the question bears on it, and ask back when you cannot tell), reread (re-read the code of a feature or a finding) and ask_block (an older question on a block, still answered), answered with apply_evolution_batch [{ op: "answer_click", clickId, text, ... }] as \`answerWith\` says. Every click carries the thread (each message says whether it is private and whether it awaits an answer), its \`scope\` (the question of yours still waiting in the thread, and a note when the message opens another topic instead of answering it: say so to the person and ask before acting) and \`known\` (what the page already holds; read it first and never ask the person any of it). Kind "progress" when the person moved a request on themselves (a step they validated, a stage they crossed, the last suggestion that waited on them decided), with what happened, the step it stands at and its \`next\`: carry on the tour from it without being told in the chat, never on your own writes, and a waiting click always comes first; kind "nothing" when no click came: call it again at once, without a word in the chat; kind "ended" with why (ended_by_person, idle, gone, replaced, finished): say so in the chat and stop; finished means your work is done and nothing waits for you, so do not wait again nor open a new session in this turn. Any answer may carry \`cancelled\`: the person cancelled the click you were on, what you wrote for it went back (except what someone changed since), and you do not redo it unless they ask again. While you work on a click, Ask my AI and the place it was made read that you are on it, and the person may Cancel; announce each major step with update_evolution_session say (the place shows the latest), answer, then wait again. What the person sends with 'Ask your AI', and every reply under your messages, reaches you; a comment never does, so never answer one; a new topic asked of you stays between the person and you until they make it a comment or your answer changes the specification. When one fact is missing to finish a suggestion, ask it IN the suggestion (propose with question and choices), ONE question at a time; offer the answers as \`choices\` whenever it is one of a few (yes or no among them), in a suggestion as in a post_on_field sent with asks: true, and add multiple: true when several may be picked (boxes to tick, six at most). If you hang up while waiting, Ask my AI reads you gone and the session ends: open a new one to come back. A held call keeps the person's chat messages from reaching you until it answers: where your client can run a command in the background and wake you when it ends (Claude Code), wait with \`node .lyriks/tools/await-event.mjs <project_id> - <session_id>\` run in the background instead, and answer the chat meanwhile; elsewhere pass a short max_wait_seconds and answer the chat between two waits.`,
    {
      project_id: z.string().describe('Lyriks project id'),
      request_id: z.string().optional().describe('Not needed: the session is the project\'s and hands the clicks of every page'),
      session_id: z.string().describe('The session start_evolution_session opened'),
      max_wait_seconds: z.number().int().positive().max(SESSION_LIMITS.maxHoldSeconds).optional().describe(`How long this one call may wait, ${SESSION_LIMITS.maxHoldSeconds} s at most; by default the longest your client keeps open (${SESSION_LIMITS.maxHoldSeconds} s with progress notifications, ${SESSION_LIMITS.withoutProgressSeconds} s without)`),
    },
    async (args, extra) => json(await awaitEvolutionEventHandler(args, lyriks, extra)),
  )

  mcp.tool(
    'update_evolution_session',
    'Speak to the person\'s pages in their open session, so they see what you do without leaving them: say {text} announces your next major step in one sentence, shown in Ask my AI and beside the place the person clicked (on a request, pass its request_id so that place shows it), each step replacing the one before ("Reading the Need to prefill 1.2", then "Comparing the texts with the diagram"); say is refused after the person cancelled the click you were on, until you call await_evolution_event again; end:true ends the session, only when the person said so in the chat. Nothing else of yours shows on the pages: their own next-step bands say what waits on the person, and you point them at a place with the href a reading carries, as a link in the chat.',
    {
      project_id: z.string().describe('Lyriks project id'),
      request_id: z.string().optional().describe('The request the click you are on was made on, so its place shows what you say; leave it out elsewhere'),
      session_id: z.string().describe('The open session'),
      say: z.string().max(200).optional().describe('Your next major step, one sentence in the person\'s language'),
      end: z.boolean().optional().describe('true ends the session, only on the person\'s word'),
    },
    async (args) => json(await updateEvolutionSessionHandler(args, lyriks)),
  )

  mcp.tool(
    'get_roadmap',
    'The project roadmap as ONE aggregate: releases and sprints with their derived lifecycle (planned/in-progress/done, plus archived once explicitly stamped) and progress %, every feature with its workflow status AND its implementation coverage from the last code-adoption sync, drift flags where the two disagree, and the unscheduled backlog. START HERE when the question is "what is there to do": it is project-wide, precomputed server-side and needs NO .unspa.json index, unlike get_implementation_gaps (one feature at a time) and get_implementation_drift. Three drift flags: "spec-moved-since-sync" (the feature spec was edited after the last index sync, so its coverage no longer describes the current spec and its numbers mean nothing until someone re-syncs: this is how a PO-side enrichment surfaces), "done-but-code-incomplete" and "code-complete-but-not-done". Each feature also carries implementation.updatedAt (last sync) and implementation.specUpdatedAt (last spec edit) so you can judge staleness yourself. Read this instead of get_section(features) when the question is delivery state; it is exactly what Evolutions › Roadmap shows. Write through apply_roadmap_batch, not patch_section.',
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
    'ADOPTION ONLY (existing code modeled into the spec): turn a finalized analysis into behavioral-index entries. Every code span becomes {file, line, signature} with status implemented and a stamped specVersion, which is what arms drift detection. Returns the entries and writes NOTHING: the index belongs to your checkout, so write them under `index` in the repo\'s .unspa.json yourself, then call sync_implementation_index; or pass sync:true and the server lands those entries as the coverage itself in the same call, its sync answer under `synced` (incomplete and orphans included), so nothing is retyped (the path in Claude Cowork, where no script can reach Lyriks; still write the entries into .unspa.json). One analysis pass therefore yields the model, its provenance AND the spec↔code map. It refuses ("No spans recorded") on a feature that was specified first and coded afterwards, and that refusal is not a request to record spans: for that direction write the index entries yourself (one key per element, rule:/invariant:/surface_rule:/surface_invariant:/event:/state:/transition: included, each at the line that applies it, status implemented|partial|missing, specVersion = the feature updatedAt) and call sync_implementation_index.',
    {
      project_id: projectIdArg,
      feature_id: featureIdArg,
      overwrite: z.boolean().optional().describe('Replace entries that already exist for these elements'),
      sync: z.boolean().optional().describe('Also land the seeded entries as the coverage in this same call (answer under `synced`): the path for a client that cannot run the sync script, such as Claude Cowork'),
    },
    async (args) => json(await seedIndexHandler(args, lyriks)),
  )

  mcp.tool(
    'sync_implementation_index',
    'Push implementation coverage for a whole project from the index you hold: pass the `index` object out of your repo\'s .unspa.json and the engine resolves every key against the spec, reporting status for each action and surface in one call. Prefer this over report_implementation_status once an index exists. Each entry\'s `signature` (one real code line) is its evidence: the engine cannot open your files, so an entry without a signature lands as `unverified` in the dashboard. Seed entries from spans via seed_implementation_index, or copy the real line into `signature` yourself. YOU MAY SEND A PARTIAL INDEX: actions and surfaces absent from the index you send are left untouched (their previous reports stay) and are only counted in `skipped`. The unit that must travel together is an action or surface entry WITH all of its children (rule:, invariant:, transition:, event: for an action; state:, surface_rule:, surface_invariant: for a surface), because a report REPLACES the located entities of that action or surface. So after changing one feature, sending only that feature\'s keys is safe and keeps the call small. The answer carries the counters, a `semantics` object saying what each one means, and `failedAcks` (only the refused reports; pass verbose:true for the acknowledgement of every action and surface). `synced` counts reports written, one per action and per surface that has its own entry; child keys are folded into their parent\'s report and not counted separately. The `stale` and `healed` blocks of THIS tool are about code location (a signature no longer found at its line) and are not evaluated when the index is sent inline, which is always the case here: zero there is not a clean bill, and spec drift is read with get_implementation_drift. A newer engine also answers `criteria`, every acceptance criterion with its standing, whether an index entry verifies it and how that went (`verified`, `failing`, `unverified`, or `none` when nothing verifies it), marked `stale` when its text changed after the result, and `verified`, how many actions are PROVEN against the code (their index entry carries the `verifiedAt` stamp a passing scenario run leaves), apart from the ones merely located; an older engine sends neither and the fields are absent. An index entry keyed `criterion:<id>` may carry `verification { kind, command, files, artifacts, lastResult { passed, at, summary, revision } }`: what checks that criterion and how it last went. `criteria.entries` is cut to its first 50 rows with `criteria.total` kept. The `orphans` block lists index keys that match no spec entity (typo, renamed or removed), `shared` the keys several features declare, and `incomplete` each action or surface you sent without some of the children the spec declares under it, with the keys it came without (those children are reported missing: send them with their parent), each cut to its first 50 entries with `total` kept; `ok` is true only when there are no orphans and no refused report. The answer opens with `sent`: how many keys you sent, how many of them are orphans, and for the criterion keys among them how many are verified, failing or only recorded; the project\'s feature ids are counted (`projectFeatures`), and when you sent criterion keys `criteria.entries` lists those only (verbose:true for the project). A surface entry of any status but "missing" (partial included) resolves its states and surface rules and invariants, like an action; on an older engine a partial surface reported them all missing. An orphan state key the engine knows was renamed carries `renamedTo`.',
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
