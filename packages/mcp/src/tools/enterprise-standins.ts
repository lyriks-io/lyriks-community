// The tools only the Enterprise edition serves, registered under their own
// names on an install without it: the tool list is the same on both editions,
// and an agent's playbook pivots on the answer rather than on an unknown tool.
// The real arguments of each tool live with the Enterprise overlay.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { enterpriseToolUnavailable } from '../util/model-availability.js'

/** Name and one-line purpose of each Enterprise tool. */
export const ENTERPRISE_TOOLS: ReadonlyArray<{ name: string; purpose: string }> = [
  { name: 'get_model',            purpose: 'Reads the formal model of a project.' },
  { name: 'get_view',             purpose: 'Reads a role-filtered view of the formal model.' },
  { name: 'find_inconsistencies', purpose: 'Lists the formal verification findings of a project.' },
  { name: 'apply_rule',           purpose: 'Applies a formal rule to the model of a project.' },
  { name: 'generate_artifact',    purpose: 'Generates an artifact from the formal model of a project.' },
]

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] })

export function registerEnterpriseStandIns(mcp: McpServer): void {
  for (const { name, purpose } of ENTERPRISE_TOOLS) {
    mcp.tool(
      name,
      `${purpose} Enterprise only: on this install it answers that it does not apply and names the tools to use instead.`,
      { project_id: z.string().describe('Lyriks project id') },
      async (args) => json(enterpriseToolUnavailable(args.project_id)),
    )
  }
}
