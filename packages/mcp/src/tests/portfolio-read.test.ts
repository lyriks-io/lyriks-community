import { describe, expect, it } from 'vitest'
import { readPortfolio } from '../util/portfolio-read.js'
import { capResult } from '../util/shape.js'

const cards = Array.from({ length: 75 }, (_, i) => ({ id: `project-${String(i).padStart(3, '0')}`, name: `Project ${i}`, workspaceId: i % 2 ? 'b' : 'a', sourceMode: 'greenfield', backProjectId: `back-${i}`, details: { huge: 'x'.repeat(4000) } }))
const source = { portfolio: { domains: [{ id: 'domain', name: 'Products', projects: cards.slice(0, 40) }], unassigned: cards.slice(40) } }
const read = (options = {}) => readPortfolio(source, options) as { portfolio: { domains: Array<{ projects: typeof cards }>; unassigned: typeof cards }; total: number; returned: number; nextOffset: number | null }
const flatten = (result: ReturnType<typeof read>) => [...result.portfolio.domains.flatMap(d => d.projects), ...result.portfolio.unassigned]

describe('wizard portfolio discovery', () => {
  it('keeps actionable identities under the generic response cap', () => {
    const result = read()
    expect(capResult(result)).toBe(result)
    expect(flatten(result)[0]).toMatchObject({ id: 'project-000', name: 'Project 0', backProjectId: 'back-0' })
    expect(result).toMatchObject({ total: 75, returned: 20, nextOffset: 20 })
    expect(flatten(result)[0]).not.toHaveProperty('details')
  })
  it('visits every project exactly once across domain boundaries', () => {
    const ids: string[] = []
    let offset: number | null = 0
    do {
      const result = read({ offset, limit: 13 })
      ids.push(...flatten(result).map(c => c.id))
      offset = result.nextOffset
    } while (offset !== null)
    expect(new Set(ids).size).toBe(75)
    expect(ids).toHaveLength(75)
  })
  it('filters before pagination and supports the advertised focused reads', () => {
    expect(read({ query: 'PROJECT 74', workspace_id: 'a' }).total).toBe(1)
    expect(read({ query: 'PROJECT 74', workspace_id: 'b' }).total).toBe(0)
    expect(readPortfolio(source, { paths: ['portfolio.unassigned.0.id'] })).toEqual({ selected: { 'portfolio.unassigned.0.id': 'project-040' } })
    expect(readPortfolio(source, { summary: true })).toHaveProperty('summary')
  })
  it('does not mutate upstream data and handles empty or out-of-range pages', () => {
    read()
    expect(cards[0].details.huge).toHaveLength(4000)
    expect(read({ offset: 1000 })).toMatchObject({ returned: 0, nextOffset: null })
    expect(readPortfolio({ error: 'unavailable' })).toEqual({ error: 'unavailable' })
  })
})
