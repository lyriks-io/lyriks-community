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
import { createMcpServer } from '../server.js'
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

describe('applyBehaviorBatchHandler scenario results', () => {
  const scenarios = {
    scope: 'touched', run: 4, passed: 3,
    failed: [{ scenarioId: 'sc-1', name: 'A closed cart refuses', surfaceId: 'srf-cart', actionId: 'act-add', actionName: 'Add a line', expectedStatus: 'blocked', actualStatus: 'success', reason: 'status was success but expected blocked' }],
  }
  const apply = (response: unknown) =>
    applyBehaviorBatchHandler({ project_id: 'p', feature_id: 'f', operations: [{ kind: 'x' }], dry_run: true }, makeLyriks(response).lyriks)

  it('lifts what a newer engine answers out of batch.raw, ahead of it', async () => {
    const raw = { ok: true, dryRun: true, appliedCount: 1, scenarios }
    const res = await apply({ available: true, batch: { ok: true, dryRun: true, appliedCount: 1, errors: [], raw }, warnings: ['w'] }) as { batch: Record<string, unknown> }
    expect(res).toEqual({ available: true, batch: { ok: true, dryRun: true, appliedCount: 1, errors: [], scenarios, raw }, warnings: ['w'] })
    // Ahead of raw, which verbose:true makes long: the verdict is read first.
    expect(Object.keys(res.batch)).toEqual(['ok', 'dryRun', 'appliedCount', 'errors', 'scenarios', 'raw'])
  })

  it('invents nothing for an older engine, a rejected batch or an unreachable engine', async () => {
    for (const response of [
      { available: true, batch: { ok: true, raw: { ok: true, appliedCount: 1 } } },
      { available: true, batch: { ok: true, raw: { ok: true, scenarios: 'not a report' } } },
      { available: true, batch: { ok: false, errors: ['op[0] refused'], raw: 'Batch failed: op[0] refused' } },
      { available: true, batch: { ok: true } },
      { available: false, batch: null },
      null,
    ]) expect(await apply(response)).toBe(response)
  })

  it('leaves alone a platform that already reports the scenarios itself', async () => {
    const response = { available: true, batch: { ok: true, scenarios: { scope: 'feature', run: 9, passed: 9, failed: [] }, raw: { ok: true, scenarios } } }
    expect(await apply(response)).toBe(response)
  })

  it('says in the tool description that a failed row is information, not a rejection', () => {
    // @ts-expect-error testing the registered description
    const { description } = createMcpServer(null)._registeredTools.apply_behavior_batch
    expect(description).toContain('`batch.scenarios: { scope, run, passed, failed[], truncated? }`')
    expect(description).toContain('A row in `failed` is information, not a rejection')
    expect(description).toContain('an older engine sends nothing and the field is absent')
  })
})

describe('applyBehaviorBatchHandler written against a version', () => {
  const READ_AT = '2026-09-20T08:00:00.000Z'
  const MOVED_AT = '2026-09-20T08:04:30.000Z'
  const apply = (response: unknown) =>
    applyBehaviorBatchHandler({ project_id: 'p', feature_id: 'f', operations: [{ kind: 'x' }], expected_updated_at: READ_AT }, makeLyriks(response).lyriks)

  it('forwards the version the client read as expectedUpdatedAt, and only when given', async () => {
    const { lyriks, body } = makeLyriks({ available: true, batch: { ok: true } })
    await applyBehaviorBatchHandler({ project_id: 'p', feature_id: 'f', operations: [{ kind: 'x' }], expected_updated_at: READ_AT }, lyriks)
    expect(body()).toEqual({ projectId: 'p', featureId: 'f', operations: [{ kind: 'x' }], dryRun: false, expectedUpdatedAt: READ_AT })
    await applyBehaviorBatchHandler({ project_id: 'p', feature_id: 'f', operations: [{ kind: 'x' }], expected_updated_at: '' }, lyriks)
    expect('expectedUpdatedAt' in body()).toBe(false)
    await applyBehaviorBatchHandler({ project_id: 'p', feature_id: 'f', commit: 'tok-1', expected_updated_at: READ_AT }, lyriks)
    expect(body()).toMatchObject({ commit: 'tok-1', expectedUpdatedAt: READ_AT })
  })

  it('surfaces a conflict out of batch.raw: nothing was written, and what moved is named', async () => {
    const errors = [`The feature changed since ${READ_AT}: nothing was written.`]
    const raw = { ok: false, conflict: true, expectedUpdatedAt: READ_AT, currentUpdatedAt: MOVED_AT, changedSince: ['action:act-add', 'rule:r-1'], changedSinceTotal: 2, errors }
    const res = await apply({ available: true, batch: { ok: false, dryRun: false, appliedCount: 0, errors, raw }, warnings: [] }) as { batch: Record<string, unknown> }
    expect(res.batch).toEqual({
      ok: false, dryRun: false, appliedCount: 0, errors,
      conflict: true, currentUpdatedAt: MOVED_AT, changedSince: ['action:act-add', 'rule:r-1'], changedSinceTotal: 2,
      raw,
    })
    // Copied, not moved, and read before raw.
    expect(Object.keys(res.batch)).toEqual(['ok', 'dryRun', 'appliedCount', 'errors', 'conflict', 'currentUpdatedAt', 'changedSince', 'changedSinceTotal', 'raw'])
    expect(res.batch.raw).toBe(raw)
  })

  it('surfaces the versions of a success, its scenarios and what it touches in other features', async () => {
    const scenarios = { scope: 'touched', run: 2, passed: 2, failed: [] }
    const relatedElsewhere = { total: 1, entries: [{ featureId: 'feat-orders', featureName: 'Orders', statePath: 'cart.total', elements: ['action:act-refund'] }] }
    const raw = { ok: true, appliedCount: 1, previousUpdatedAt: READ_AT, updatedAt: MOVED_AT, scenarios, relatedElsewhere }
    const res = await apply({ available: true, batch: { ok: true, appliedCount: 1, errors: [], raw } }) as { batch: Record<string, unknown> }
    expect(res.batch).toEqual({ ok: true, appliedCount: 1, errors: [], previousUpdatedAt: READ_AT, updatedAt: MOVED_AT, scenarios, relatedElsewhere, raw })
    expect(Object.keys(res.batch).at(-1)).toBe('raw')
    // The engine may list the related elements flat: a list is carried the same way.
    const flat = [{ featureId: 'feat-orders', key: 'action:act-refund' }]
    expect(await apply({ available: true, batch: { ok: true, raw: { ok: true, relatedElsewhere: flat } } }))
      .toEqual({ available: true, batch: { ok: true, relatedElsewhere: flat, raw: { ok: true, relatedElsewhere: flat } } })
  })

  it('invents nothing: an older engine, a misshapen field and a platform that already answers are left alone', async () => {
    for (const response of [
      { available: true, batch: { ok: true, appliedCount: 1, raw: { ok: true, appliedCount: 1 } } },
      { available: true, batch: { ok: false, errors: ['refused'], raw: { ok: false, conflict: 'yes', currentUpdatedAt: 7, changedSince: 'act-add', changedSinceTotal: '2', previousUpdatedAt: null, updatedAt: '', relatedElsewhere: 'none' } } },
      { available: true, batch: { ok: false, conflict: true, currentUpdatedAt: MOVED_AT, changedSince: [], changedSinceTotal: 0, raw: { ok: false, conflict: true, currentUpdatedAt: READ_AT, changedSince: ['x'], changedSinceTotal: 1 } } },
    ]) expect(await apply(response)).toBe(response)
    // A field the platform already sets stays its own; the others still come up.
    const mixed = { available: true, batch: { ok: true, updatedAt: 'platform', raw: { ok: true, previousUpdatedAt: READ_AT, updatedAt: MOVED_AT } } }
    expect(await apply(mixed)).toEqual({ available: true, batch: { ok: true, updatedAt: 'platform', previousUpdatedAt: READ_AT, raw: mixed.batch.raw } })
  })

  it('says when to pass the version, what a conflict means and what relatedElsewhere names', () => {
    // @ts-expect-error testing the registered description
    const tool = createMcpServer(null)._registeredTools.apply_behavior_batch
    expect(tool.inputSchema.parse({ project_id: 'p', feature_id: 'f', operations: [], expected_updated_at: READ_AT })).toMatchObject({ expected_updated_at: READ_AT })
    expect(tool.inputSchema.safeParse({ project_id: 'p', feature_id: 'f', expected_updated_at: 7 }).success).toBe(false)
    expect(tool.description).toContain('SEVERAL WRITERS ON ONE FEATURE: pass `expected_updated_at`')
    expect(tool.description).toContain('`snapshot.feature.updatedAt` and in its summary')
    expect(tool.description).toContain('NOTHING was written, so re-read the feature, rebase your operations on what it now holds, and resend')
    expect(tool.description).toContain('`batch.relatedElsewhere`, when present, names elements of OTHER features that share the state paths the batch touched')
    expect(tool.description).toContain('an older engine ignores the argument')
  })
})

describe('behavior read and maturity handlers', () => {
	it('budgets escaped JSON and advances by the actual returned excerpt length', async () => {
		const reference = 'count ' + '"\\'.repeat(10000);
		const { lyriks } = makeGetLyriks({ reference });
		let combined = '';
		let offset: number | null = 0;
		do {
			const result = await getBehaviorOperationsHandler({ project_id: 'p', query: 'count', offset, max_chars: 16000 }, lyriks) as { reference: string; nextOffset: number | null };
			expect(JSON.stringify(result).length).toBeLessThan(20000);
			expect(result.reference.length).toBeGreaterThan(0);
			combined += result.reference;
			offset = result.nextOffset;
		} while (offset !== null);
		expect(combined).toBe(reference);
	});

	it('discovers domain-neutral interaction guidance without claiming an engine schema match', async () => {
		const { lyriks } = makeGetLyriks({ reference: '# Operations', patterns: [{ id: 'continuous-interaction', title: 'Continuous input', keywords: ['continuous'], steps: ['Model press and release'], verificationBoundary: 'Runtime tests required' }] });
		const result = await getBehaviorOperationsHandler({ project_id: 'p', query: 'continuous' }, lyriks) as { matches: number; guidance: unknown[]; unmatchedTerms: string[] };
		expect(result.matches).toBe(0);
		expect(result.guidance).toHaveLength(1);
		expect(result.unmatchedTerms).toEqual([]);
	});
	it('searches multiple operation names and pages without losing any matched excerpts', async () => {
		const reference = ['# Operations', 'add_effect ' + 'x'.repeat(500), 'count ' + 'y'.repeat(500)].join('\n');
		const { lyriks } = makeGetLyriks({ reference });
		let offset: number | null = 0;
		let combined = '';
		do {
			const page = await getBehaviorOperationsHandler({ project_id: 'p', query: 'add_effect, count missing_term', offset, max_chars: 100 }, lyriks) as { reference: string; matches: number; nextOffset: number | null; unmatchedTerms: string[] };
			expect(page.matches).toBe(2);
			expect(page.reference.length).toBeLessThanOrEqual(100);
			expect(page.unmatchedTerms).toEqual(['missing_term']);
			combined += page.reference;
			offset = page.nextOffset;
		} while (offset !== null);
		expect(combined).toBe(reference);
	});

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
      missingPaths: [],
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
