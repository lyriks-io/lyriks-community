/**
 * Tests: every tool's input schema, as tools/list serializes it, is valid JSON
 * Schema 2020-12, the dialect the Anthropic API checks tool definitions against.
 * One invalid subschema makes Claude clients drop that tool: wire_element was
 * missing from Claude Desktop because a z.tuple serialized as array-form `items`.
 */

import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createMcpServer } from '../server.js'

// Keywords whose value must itself be a schema: an object or a boolean.
const SCHEMA = ['items', 'additionalProperties', 'additionalItems', 'not', 'if', 'then', 'else', 'contains', 'propertyNames', 'unevaluatedItems', 'unevaluatedProperties']
// Keywords holding a map of schemas, and a list of schemas.
const SCHEMA_MAP = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas']
const SCHEMA_LIST = ['anyOf', 'allOf', 'oneOf', 'prefixItems']

const isSchema = (value: unknown) => typeof value === 'boolean' || (typeof value === 'object' && value !== null && !Array.isArray(value))

function invalidSubschemas(schema: unknown, at: string, found: string[] = []): string[] {
  if (!isSchema(schema)) {
    found.push(at)
    return found
  }
  if (typeof schema === 'boolean') return found
  const node = schema as Record<string, unknown>
  for (const key of SCHEMA) if (key in node) invalidSubschemas(node[key], `${at}.${key}`, found)
  for (const key of SCHEMA_MAP) {
    if (!(key in node)) continue
    const map = node[key]
    if (!isSchema(map) || typeof map === 'boolean') { found.push(`${at}.${key}`); continue }
    for (const [name, sub] of Object.entries(map as Record<string, unknown>)) invalidSubschemas(sub, `${at}.${key}.${name}`, found)
  }
  for (const key of SCHEMA_LIST) {
    if (!(key in node)) continue
    const list = node[key]
    if (!Array.isArray(list)) { found.push(`${at}.${key}`); continue }
    list.forEach((sub, i) => invalidSubschemas(sub, `${at}.${key}[${i}]`, found))
  }
  return found
}

describe('tool input schemas', () => {
  it('are valid JSON Schema 2020-12 for every listed tool', async () => {
    const server = createMcpServer(null)
    const client = new Client({ name: 'schema-check', version: '0' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverSide), client.connect(clientSide)])
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name)).toContain('wire_element')
    const invalid = tools.flatMap(t => invalidSubschemas(t.inputSchema, t.name))
    expect(invalid).toEqual([])
    await client.close()
  })

  it('flags an array-form items, the shape z.tuple serializes to', () => {
    expect(invalidSubschemas({ type: 'object', properties: { pair: { type: 'array', items: [{ type: 'string' }, {}] } } }, 'probe'))
      .toEqual(['probe.properties.pair.items'])
  })
})
