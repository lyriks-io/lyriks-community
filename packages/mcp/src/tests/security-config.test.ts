import { afterEach, describe, expect, it } from 'vitest'
import { assertStrictAuthConfiguration } from '../security-config.js'

afterEach(() => {
  delete process.env.MCP_AUTH_REQUIRED
  delete process.env.PUBLIC_BASE_URL
  process.env.JWT_SECRET = 'test-secret-for-vitest'
})

describe('strict MCP authentication configuration', () => {
  it('rejects a missing or placeholder JWT secret', () => {
    process.env.MCP_AUTH_REQUIRED = '1'
    process.env.PUBLIC_BASE_URL = 'https://lyriks.example.corp'
    delete process.env.JWT_SECRET
    expect(assertStrictAuthConfiguration).toThrow(/JWT_SECRET/)

    process.env.JWT_SECRET = 'change-me'
    expect(assertStrictAuthConfiguration).toThrow(/JWT_SECRET/)
  })

  // Without it the OAuth endpoints and the /login bounce are built from this
  // gateway's own origin, which serves no login page: the browser opens the
  // flow and gets a 404. Refuse to start instead of advertising it.
  it('rejects a missing or malformed public origin in strict mode', () => {
    process.env.MCP_AUTH_REQUIRED = '1'
    process.env.JWT_SECRET = 'a-generated-jwt-secret-of-32-bytes'

    delete process.env.PUBLIC_BASE_URL
    expect(assertStrictAuthConfiguration).toThrow(/PUBLIC_BASE_URL/)

    process.env.PUBLIC_BASE_URL = '   '
    expect(assertStrictAuthConfiguration).toThrow(/PUBLIC_BASE_URL/)

    process.env.PUBLIC_BASE_URL = '/mcp'
    expect(assertStrictAuthConfiguration).toThrow(/absolute URL/)
  })

  it('accepts a generated secret and a public origin in strict mode', () => {
    process.env.MCP_AUTH_REQUIRED = '1'
    process.env.JWT_SECRET = 'a-generated-jwt-secret-of-32-bytes'
    process.env.PUBLIC_BASE_URL = 'https://lyriks.example.corp'
    expect(assertStrictAuthConfiguration).not.toThrow()
  })

  it('keeps standalone development mode zero-config', () => {
    delete process.env.JWT_SECRET
    expect(assertStrictAuthConfiguration).not.toThrow()
  })
})
