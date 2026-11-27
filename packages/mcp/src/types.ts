// Shared types for the MCP server

export interface HonoVariables {
  user_id:    string
  user_token: string   // raw JWT forwarded to API
  request_id: string
  /** The scope of the grant the call came with; "skills" reads playbooks only (skills-ticket.ts). */
  token_scope?: string | null
  /** The live session a "session-wait" grant may wait in (session-ticket.ts). */
  token_session?: string | null
  /** The project an "index-sync" grant may sync the index of (index-ticket.ts), or an "ai-wake" grant waits for wakes on (wake-ticket.ts). */
  token_project?: string | null
}
