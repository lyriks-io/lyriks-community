/**
 * Tests: create_wizard_project (Fix #4) + apply_behavior_batch commit token (Fix #8)
 */

import { describe, it, expect, vi } from 'vitest'
import { createWizardProjectHandler } from '../tools/sections.js'
import {
  applyBehaviorBatchHandler,
  getBehaviorOperationsHandler,
  readBehaviorFeatureHandler,
  scoreBehaviorFeatureHandler,
} from '../tools/behavior.js'
import type { LyriksClient } from '../lyriks-client.js'

/** A mock LyriksClient whose POST captures the written body and returns a fixture. */
function makeLyriks(response: unknown) {
  const post = vi.fn().mockResolvedValue(response)
  const lyriks = { post } as unknown as LyriksClient
  const body = () => post.mock.calls.at(-1)?.[1] as Record<string, unknown>
  return { lyriks, post, body }
}

describe('createWizardProjectHandler (Fix #4)', () => {
  it('POSTs the lyriks project route and maps snake_case args to the wizard app camelCase', async () => {
    const { lyriks, post, body } = makeLyriks({ projectId: 'returnly-2', workspaceId: 'ws-1' })

    const res = await createWizardProjectHandler(
      { name: 'Returnly 2', description: 'RMA portal', workspace_id: 'ws-1', domain_id: 'dom-1', stage: 'build' },
      lyriks,
    )

    expect(post).toHaveBeenCalledWith('/api/projects', expect.any(Object))
    expect(body()).toEqual({
      name: 'Returnly 2',
      description: 'RMA portal',
      workspaceId: 'ws-1',
      domainId: 'dom-1',
      stage: 'build',
    })
    expect(res).toEqual({ projectId: 'returnly-2', workspaceId: 'ws-1' })
  })

  it('forwards the origin as sourceMode, so the card says the project was started from a codebase', async () => {
    const { lyriks, body } = makeLyriks({ projectId: 'ingested', workspaceId: null })
    await createWizardProjectHandler({ name: 'Ingested', source_mode: 'code_to_spec' }, lyriks)
    expect(body()).toMatchObject({ name: 'Ingested', sourceMode: 'code_to_spec' })
  })

  it('omits optional fields as undefined when not supplied', async () => {
    const { lyriks, body } = makeLyriks({ projectId: 'p', workspaceId: null })
    await createWizardProjectHandler({ name: 'Solo' }, lyriks)
    expect(body()).toEqual({
      name: 'Solo',
      description: undefined,
      workspaceId: undefined,
      domainId: undefined,
      stage: undefined,
    })
  })

  it('propagates a lyriks error (e.g. 403 not a member)', async () => {
    const post = vi.fn().mockRejectedValue(new Error('lyriks 403 on POST /api/projects: not a member'))
    const lyriks = { post } as unknown as LyriksClient
    await expect(createWizardProjectHandler({ name: 'X', workspace_id: 'ws-x' }, lyriks)).rejects.toThrow('403')
  })
})

describe('applyBehaviorBatchHandler — commit token (Fix #8)', () => {
  it('forwards operations + dryRun on a normal apply', async () => {
    const { lyriks, body } = makeLyriks({ available: true, batch: { ok: true } })
    await applyBehaviorBatchHandler(
      { project_id: 'returnly', feature_id: 'returnly__experience', operations: [{ kind: 'add_state_definition' }], dry_run: true },
      lyriks,
    )
    expect(body()).toEqual({
      projectId: 'returnly',
      featureId: 'returnly__experience',
      operations: [{ kind: 'add_state_definition' }],
      dryRun: true,
    })
  })

  it('forwards a commit token (and no ops) so a dry-run is saved without resending', async () => {
    const { lyriks, body } = makeLyriks({ available: true, batch: { ok: true, dryRun: false } })
    await applyBehaviorBatchHandler(
      { project_id: 'returnly', feature_id: 'returnly__experience', commit: 'tok-123' },
      lyriks,
    )
    const sent = body()
    expect(sent.commit).toBe('tok-123')
    expect(sent.operations).toEqual([]) // omitted → [], lyriks ignores them on the commit path
    expect(sent.dryRun).toBe(false)
  })

  it('leaves commit off the body when not supplied', async () => {
    const { lyriks, body } = makeLyriks({ available: true, batch: { ok: true } })
    await applyBehaviorBatchHandler(
      { project_id: 'p', feature_id: 'p__experience', operations: [{ kind: 'x' }] },
      lyriks,
    )
    expect('commit' in body()).toBe(false)
  })

  it('passes verbose:true through to the wizard app (per-issue verification report, Fix #6)', async () => {
    const { lyriks, body } = makeLyriks({ available: true, batch: { ok: true } })
    await applyBehaviorBatchHandler(
      { project_id: 'p', feature_id: 'p__experience', operations: [{ kind: 'x' }], dry_run: true, verbose: true },
      lyriks,
    )
    expect(body().verbose).toBe(true)
  })

  it('leaves verbose off the body when not supplied (aggregate counts only)', async () => {
    const { lyriks, body } = makeLyriks({ available: true, batch: { ok: true } })
    await applyBehaviorBatchHandler(
      { project_id: 'p', feature_id: 'p__experience', operations: [{ kind: 'x' }] },
      lyriks,
    )
    expect('verbose' in body()).toBe(false)
  })
})

describe('behavior read and maturity handlers', () => {
  function makeGetLyriks(response: unknown) {
    const get = vi.fn().mockResolvedValue(response)
    return { lyriks: { get } as unknown as LyriksClient, get }
  }

  it('reads focused feature paths while preserving stable ids', async () => {
    const { lyriks, get } = makeGetLyriks({
      snapshot: { feature: { surfaces: [{ id: 'srf-1', actions: [{ id: 'act-1' }] }] } },
    })
    const result = await readBehaviorFeatureHandler(
      { project_id: 'p', feature_id: 'f', paths: ['snapshot.feature.surfaces.0.actions.0.id'] },
      lyriks,
    )
    expect(get).toHaveBeenCalledWith('/api/behavior/feature?projectId=p&featureId=f')
    expect(result).toEqual({
      feature_id: 'f',
      values: { 'snapshot.feature.surfaces.0.actions.0.id': 'act-1' },
    })
  })

  it('forwards maturity filters and includes actionable issues by default', async () => {
    const { lyriks, get } = makeGetLyriks({ report: { percentage: 60 } })
    await scoreBehaviorFeatureHandler(
      { project_id: 'p', feature_id: 'f', area: 'scenarios', severity: 'critical' },
      lyriks,
    )
    const url = String(get.mock.calls[0]?.[0])
    expect(url).toContain('/api/behavior/score?')
    expect(url).toContain('includeIssues=true')
    expect(url).toContain('area=scenarios')
    expect(url).toContain('severity=critical')
  })

  it('searches the engine-owned operation reference instead of copying its schema', async () => {
    const { lyriks } = makeGetLyriks({
      reference: '# Operations\n\n## ADD ops\nadd_scenario { featureId }\nmore guidance\n',
    })
    const result = await getBehaviorOperationsHandler(
      { project_id: 'p', query: 'add_scenario' },
      lyriks,
    ) as { matches: number; reference: string }
    expect(result.matches).toBe(1)
    expect(result.reference).toContain('add_scenario')
  })
})
