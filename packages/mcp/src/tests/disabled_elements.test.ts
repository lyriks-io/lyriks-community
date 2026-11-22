/**
 * Tests: a disabled element of a feature's behaviour through the gateway. It
 * reads in the tree with who disabled it, when and why; the table of contents
 * counts it apart; simulate_behavior disables elements in memory for one
 * trial; the exported scenarios of a disabled element come skipped.
 */

import { describe, it, expect, vi } from 'vitest'
import { featureToc, readBehaviorFeatureHandler, simulateBehaviorHandler } from '../tools/behavior.js'
import { scenarioFixtures } from '../tools/behavior_scenarios.js'
import { disabledCounts } from '../tools/disabled.js'
import { createMcpServer } from '../server.js'
import type { LyriksClient } from '../lyriks-client.js'

const marker = { by: 'Sam Rivera', at: '2026-11-18T10:00:00.000Z', reason: 'replaced by the batch validation' }

function feature(): Record<string, unknown> {
  return {
    id: 'feat-validation', name: 'Validation', updatedAt: '2026-11-18T10:00:00.000Z',
    surfaces: [{
      id: 's1', name: 'Element', stateDefinitions: [], rules: [], invariants: [], transitions: [],
      actions: [
        {
          id: 'a1', name: 'Validate an element', parameters: [], effects: [], invariants: [],
          rules: [{ id: 'r1', category: 'permissions', description: 'An unassigned viewer cannot validate.', disabled: marker }, { id: 'r2', category: 'business' }],
          scenarios: [{ id: 'sc1', name: 'An editor validates', stateOverrides: [], parameterOverrides: [] }],
        },
        {
          id: 'a2', name: 'Reopen the element', parameters: [], effects: [], invariants: [], disabled: marker,
          rules: [{ id: 'r3', category: 'business' }],
          scenarios: [{ id: 'sc2', name: 'Reopen', stateOverrides: [], parameterOverrides: [] }],
        },
        {
          id: 'a3', name: 'Read it', parameters: [], effects: [], invariants: [], rules: [],
          scenarios: [{ id: 'sc3', name: 'Read after a reopen', stateOverrides: [], parameterOverrides: [], steps: [{ actionId: 'a2', parameterOverrides: [] }] }],
        },
      ],
    }],
    featureInvariants: [], reachabilityGoals: [{ id: 'g1', name: 'Validated', disabled: marker }],
  }
}

const lyriksServing = (f: Record<string, unknown>) =>
  ({ get: vi.fn().mockResolvedValue({ snapshot: { format: 'unspaghettit', version: 1, feature: f }, statements: { 'rule:r1': 'When a viewer validates, the system shall refuse it.' } }) }) as unknown as LyriksClient

describe('a disabled element read through get_behavior_feature', () => {
  it('carries disabled with who, when and why on each disabled element [criterion:ac-leaf-7fed852b-f6a7-40c6-b6d8-8dbc26bd495e]', async () => {
    const read = await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'feat-validation', action_id: 'a1' }, lyriksServing(feature())) as { action: { rules: Record<string, unknown>[] }; statements: Record<string, string> }
    expect(read.action.rules[0]).toMatchObject({ id: 'r1', disabled: marker })
    expect(read.action.rules[1]?.disabled).toBeUndefined()
    // Its rule still reads as its sentence.
    expect(read.statements['rule:r1']).toBe('When a viewer validates, the system shall refuse it.')
    const off = await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'feat-validation', action_id: 'a2' }, lyriksServing(feature())) as { action: Record<string, unknown> }
    expect(off.action.disabled).toEqual(marker)
  })

  it('counts the disabled elements apart in the table of contents [criterion:ac-leaf-c3d51224-44a6-401a-8b3b-f9e9f92b5194]', async () => {
    const toc = featureToc(feature()) as { disabled: Record<string, number>; surfaces: { actions: Record<string, unknown>[] }[] }
    // The rule r1 on its own, the action a2 with its rule and its scenario, the goal.
    expect(toc.disabled).toEqual({ total: 5, feature: 0, actions: 1, rules: 2, invariants: 0, scenarios: 1, reachabilityGoals: 1 })
    expect(toc.surfaces[0]!.actions.find((a) => a.id === 'a2')?.disabled).toEqual(marker)
    expect(toc.surfaces[0]!.actions.find((a) => a.id === 'a1')?.disabled).toBeUndefined()
    const summary = await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'feat-validation', summary: true }, lyriksServing(feature())) as Record<string, unknown>
    expect(summary.disabled).toMatchObject({ total: 5 })
    // A feature with nothing disabled reads as before.
    const inForce = { ...feature(), surfaces: [], reachabilityGoals: [] }
    expect(featureToc(inForce).disabled).toBeUndefined()
  })

  it('counts everything a disabled feature holds', () => {
    expect(disabledCounts({ ...feature(), disabled: marker })).toMatchObject({ feature: 1, actions: 3, rules: 3, scenarios: 3, reachabilityGoals: 1 })
  })
})

describe('simulate_behavior with elements disabled in memory', () => {
  it('relays the ids to disable and saves nothing [criterion:ac-leaf-27ca9a00-8cd5-4213-903d-30384ab0af2d]', async () => {
    const post = vi.fn().mockResolvedValue({ available: true, ok: true, steps: [] })
    await simulateBehaviorHandler({ project_id: 'p', feature_id: 'feat-validation', run_scenarios: true, disable: ['r1'] }, { post } as unknown as LyriksClient)
    expect(post).toHaveBeenCalledWith('/api/behavior/simulate', { projectId: 'p', featureId: 'feat-validation', runScenarios: true, disable: ['r1'] })
    // A trial reads only: the tool says it changes nothing.
    const tools = (createMcpServer(null) as unknown as { _registeredTools: Record<string, { annotations?: { readOnlyHint?: boolean }; inputSchema?: unknown }> })._registeredTools
    expect(tools.simulate_behavior?.annotations?.readOnlyHint).toBe(true)
  })

  it('answers the refusal of an id the feature does not hold, as the platform wrote it [criterion:ac-leaf-4d11b243-1cc7-4377-bff1-028e75887b02]', async () => {
    const refusal = { available: true, ok: false, persisted: false, errors: ['No element of this feature has that id: rule-ghost'] }
    const answer = await simulateBehaviorHandler({ project_id: 'p', feature_id: 'feat-validation', run_scenarios: true, disable: ['rule-ghost'] }, { post: vi.fn().mockResolvedValue(refusal) } as unknown as LyriksClient)
    expect(answer).toEqual(refusal)
  })
})

describe('the exported scenarios of a disabled element', () => {
  it('come skipped, saying who disabled the element, when and why [criterion:ac-leaf-7c70d116-f395-4fd1-9e12-d41790f6e070]', () => {
    const page = scenarioFixtures(feature(), {}) as { fixtures: Record<string, unknown>[]; adapterContract: string }
    const byId = Object.fromEntries(page.fixtures.map((f) => [f.scenarioId, f]))
    expect(byId.sc1?.skip).toBeUndefined()
    expect(byId.sc2).toMatchObject({ skip: true, disabled: marker })
    // Replaying a disabled action, a scenario cannot run either.
    expect(byId.sc3).toMatchObject({ skip: true, disabled: marker })
    expect(page.adapterContract).toContain('Skip skip:true ones.')
  })
})

describe('the tools say how to disable and read a disabled element', () => {
  it('declares the two batch operations, the in-memory trial and the marker', () => {
    const tools = (createMcpServer(null) as unknown as { _registeredTools: Record<string, { description?: string }> })._registeredTools
    expect(tools.apply_behavior_batch?.description).toContain('disable_element')
    expect(tools.apply_behavior_batch?.description).toContain('enable_element')
    expect(tools.simulate_behavior?.description).toContain('`disable`')
    expect(tools.get_behavior_feature?.description).toContain('disabled: { by, at, reason }')
  })
})
