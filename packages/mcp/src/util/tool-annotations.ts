// What every tool tells the client it does (ac-mcp-tool-annotations).
//
// A client that approves on its own (Cowork's Auto mode, the claude.ai
// connector settings) lets through without asking only the tools that declare
// themselves read-only; a tool that declares nothing reads as a writer. A
// retrospecification calls the reads dozens of times, so an undeclared read
// cost the person one approval per call. Each tool therefore carries the
// annotations of its effect, from the one table below.

import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'

/**
 * read: changes nothing. add: only adds (a project, a source, a span, a
 * session). change: can overwrite or remove what exists. replace: overwrites
 * or deletes, and the same call twice leaves the same state.
 */
export type ToolEffect = 'read' | 'add' | 'change' | 'replace'

const ANNOTATIONS: Readonly<Record<ToolEffect, ToolAnnotations>> = {
  read: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  add: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  change: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  replace: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
}

const READ = [
  'list_skills', 'sync_skills', 'get_skill', 'get_capabilities',
  'list_wizard_projects', 'list_domains', 'list_workspaces', 'list_projects', 'get_project',
  'get_section', 'describe_section', 'get_knowledge_graph',
  'assess_project_completeness',
  'get_design_system', 'check_design',
  'get_behavior_context', 'get_behavior_feature', 'get_behavior_project', 'get_behavior_operations',
  'export_behavior_scenarios', 'score_behavior_feature', 'assess_behavior_feature', 'simulate_behavior',
  'what_if', 'what_if_project', 'prove_project_invariants', 'get_data_links', 'find_state_references', 'generate_behavior_types',
  'list_sources', 'get_provenance', 'get_evolution', 'read_evolution_sessions',
  'get_implementation_status', 'get_implementation_gaps', 'get_implementation_drift',
  'get_model', 'get_view', 'find_inconsistencies',
] as const

const ADD = [
  'create_wizard_project', 'create_domain', 'create_project', 'add_element',
  'attach_source', 'record_element_spans', 'stage_candidates', 'flag_conflict',
  // The audit and the closing record their run, which finish_project reads; they change nothing written.
  'audit_project_scope', 'finalize_analysis', 'finish_project',
  // Opening a session and taking the next click move the session, never the spec.
  'start_evolution_session', 'await_evolution_event',
  'generate_artifact',
] as const

const CHANGE = [
  'update_wizard_project', 'update_project',
  'patch_section', 'build_screen', 'wire_element',
  'apply_behavior_batch', 'apply_project_behavior_batch', 'link_data_fields',
  'classify_source', 'dispose_candidate', 'resolve_conflict',
  'apply_evolution_batch', 'update_evolution_session',
  // A question to another AI of the person waits in its queue like a click; the spec never moves.
  'ask_evolution_session',
  'seed_implementation_index', 'sync_implementation_index', 'report_implementation_status', 'report_retrospec_reading',
  'apply_rule',
  // A passage at the same place for the same element is rewritten, never doubled.
  'cite_passages',
] as const

const REPLACE = [
  'set_section', 'delete_wizard_project', 'delete_domain', 'delete_project', 'remove_source', 'reset_analysis',
] as const

export const TOOL_EFFECTS: Readonly<Record<string, ToolEffect>> = Object.freeze(Object.fromEntries([
  ...READ.map((name) => [name, 'read'] as const),
  ...ADD.map((name) => [name, 'add'] as const),
  ...CHANGE.map((name) => [name, 'change'] as const),
  ...REPLACE.map((name) => [name, 'replace'] as const),
]))

/** The annotations a tool declares, from its effect; null for a tool the table does not name. */
export function annotationsFor(name: string): ToolAnnotations | null {
  const effect = TOOL_EFFECTS[name]
  return effect ? ANNOTATIONS[effect] : null
}

/**
 * From now on, every tool registered on `mcp` that declares no annotations of
 * its own carries those of its effect. Call it before the first registration.
 */
export function declareToolEffects(mcp: McpServer): void {
  const register = mcp.tool.bind(mcp) as (...args: unknown[]) => RegisteredTool
  mcp.tool = ((...args: unknown[]) => {
    const tool = register(...args)
    const annotations = tool.annotations ? null : annotationsFor(String(args[0]))
    if (annotations) tool.update({ annotations })
    return tool
  }) as McpServer['tool']
}
