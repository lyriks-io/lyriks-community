// What a capped answer advises, per tool that HAS arguments to narrow its answer.
//
// A hint is only useful when the tool accepts what it names: advising
// `summary:true` on a tool whose schema refuses unknown arguments sends the agent
// into a validation error, then out of the MCP. So every tool absent from this
// map gets the neutral default of shape.ts, and src/tests/cap-result.test.ts holds
// each entry to the registered schema: every name in `args`, and every
// `name:value` the text spells, is an argument of that tool.

import type { CapHint } from './shape.js'

const SUMMARY_THEN_PATHS: CapHint = {
  text: 'Response capped. Re-read with summary:true for the shape, then paths:["a.b"] for only the sub-trees you need.',
  args: ['summary', 'paths'],
}

export const CAP_HINTS = {
  get_capabilities: {
    text: 'Response capped. Page with offset:<n> and limit:<n>, or narrow with source:"feature" or query:"<text>".',
    args: ['offset', 'limit', 'source', 'query'],
  },
  list_wizard_projects: {
    text: 'Response capped. Narrow with query:"<name or id>" or workspace_id:"<id>", page with limit:<n> and offset:<nextOffset>, or read summary:true or paths:["portfolio.unassigned.0"].',
    args: ['query', 'workspace_id', 'limit', 'offset', 'summary', 'paths'],
  },
  get_section: SUMMARY_THEN_PATHS,
  get_project: SUMMARY_THEN_PATHS,
  get_knowledge_graph: {
    text: 'Response capped. Lower limit:<n>, filter with contexts:["behavior"] or kinds:["feature"], search with q:"<label>", or expand one node with focus_node:"<id>" and depth:1, one way only with direction:"in" (what points at it) or direction:"out".',
    args: ['limit', 'contexts', 'kinds', 'q', 'focus_node', 'depth', 'direction'],
  },
  get_project_elaboration: {
    text: 'Response capped. Page with limit:<n> and offset:<nextOffset>, or filter with kind:"question" or section:"<section>".',
    args: ['limit', 'offset', 'kind', 'section'],
  },
  verify_experience: {
    text: 'Response capped. The detailed spec-gap list is the usual weight: page it with gap_limit:<n> and gap_offset:<n>, or keep one severity with gap_severity:"critical".',
    args: ['gap_limit', 'gap_offset', 'gap_severity'],
  },
  get_behavior_feature: {
    text: 'Response capped. Re-read with summary:true for the table of contents, then surface_id:"<id>" or action_id:"<id>" for one element whole, or paths:["snapshot.feature.events"] for an exact branch. For the index keys of the feature alone, index_keys:true, paged with limit:<n> and offset:<nextOffset> when the feature is huge.',
    args: ['summary', 'surface_id', 'action_id', 'paths', 'index_keys', 'limit', 'offset'],
  },
  export_behavior_scenarios: {
    text: 'Response capped. Pages are sized to fit, so one fixture here is larger than an answer by itself. Narrow with action_id:"<id>" or surface_id:"<id>", step with limit:1 and offset:<nextOffset> to find it, and read that scenario through get_behavior_feature instead.',
    args: ['action_id', 'surface_id', 'limit', 'offset'],
  },
  score_behavior_feature: {
    text: 'Response capped. Limit the issues with surface_id:"<id>", area:"<area>" or severity:"critical", or leave them out with include_issues:false.',
    args: ['surface_id', 'area', 'severity', 'include_issues'],
  },
  get_behavior_operations: {
    text: 'Response capped. Search fewer terms with query:"<operation>", lower max_chars:<n>, and continue with offset:<nextOffset>.',
    args: ['query', 'max_chars', 'offset'],
  },
  list_sources: {
    text: 'Response capped. Read one source with source_id:"<id>" and page through it with offset:<n> and max_chars:<n>.',
    args: ['source_id', 'offset', 'max_chars'],
  },
  get_provenance: {
    text: 'Response capped. Pass coverage:true for per-source consumption instead of the trace map, and source_id:"<id>" to keep one source.',
    args: ['coverage', 'source_id'],
  },
  get_evolution: {
    text: 'Response capped. Read one dossier with request_id:"<id>" (counts only) and one list at a time with part:"fields" | "proposals" | "readings" | "impact" | "report", narrowed to one touched feature with leaf:"<leafId>" (or section:"<section>" / verdict:"<verdict>") and paged with offset:<n> and limit:<n>.',
    args: ['request_id', 'part', 'leaf', 'section', 'verdict', 'offset', 'limit'],
  },
  get_implementation_status: {
    text: 'Response capped. Scope the read with surface_id:"<id>" or action_id:"<id>".',
    args: ['surface_id', 'action_id'],
  },
  get_implementation_gaps: {
    text: 'Response capped. Pass feature_id:"<id>" for one feature, or entries:true with filters:{"offset":0,"limit":50} to page the raw index.',
    args: ['feature_id', 'entries', 'filters'],
  },
  get_implementation_drift: {
    text: 'Response capped. Lower limit:<n> and continue with offset:<nextOffset>, read another list with bucket:"orphans", or sweep one feature with feature_id:"<id>".',
    args: ['limit', 'offset', 'bucket', 'feature_id'],
  },
} satisfies Record<string, CapHint>

export type HintedTool = keyof typeof CAP_HINTS
