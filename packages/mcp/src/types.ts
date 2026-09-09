// Shared types for the MCP server

export interface HonoVariables {
  user_id:    string
  user_token: string   // raw JWT forwarded to API
  request_id: string
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
