// Shared types for the MCP server

export interface HonoVariables {
  user_id:    string
  user_token: string   // raw JWT forwarded to API
  request_id: string
  /** The scope of the grant the call came with; "skills" reads playbooks only (skills-ticket.ts). */
  token_scope?: string | null
  /** The live session a "session-wait" grant may wait in (session-ticket.ts). */
  token_session?: string | null
}

export interface ApiError {
  code:    string
  message: string
  field:   string | null
}

export interface ApiEnvelope<T> {
  data:   T
  meta:   { request_id: string; timestamp: string; pagination?: unknown }
  errors: ApiError[]
}
