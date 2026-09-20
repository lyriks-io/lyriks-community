// Scenarios exported as fixtures. Agents write executable scenarios in the spec,
// then hand-copy their numbers into a repository test, because nothing hands
// them over. The engine has a CLI for it (`unspa scenarios export`), but it
// reads a local snapshots folder, and a Lyriks-bound repository has none: its
// features live in the platform. So the gateway computes, from the feature the
// platform serves, the input that CLI feeds a user-written adapter.
//
// The composition mirrors the engine (cli/scenarios/codegen.ts resolveScenario,
// simulator RunScenarios.ts runOne): persona overrides first, the scenario's on
// top, then the defaults of the scenario's surface for every declared path
// still missing, written NESTED along each dotted path the way the engine's
// writePath does. A persona's persistAcrossSurfaces only drives the interactive
// simulator when the user switches surface; no scenario run reads it, so it has
// no say in an initial snapshot.

import type { LyriksClient } from '../lyriks-client.js'
import { RESULT_CAP, summarize } from '../util/shape.js'
import { availableIds, featureOf, isRow, rows, type Row } from './behavior.js'

export interface ExportBehaviorScenariosArgs {
  project_id: string
  feature_id: string
  surface_id?: string
  action_id?: string
  limit?: number
  offset?: number
}

const SCENARIO_PAGE = { default: 50, max: 200 } as const

// Short on purpose: it rides along with every page.
export const ADAPTER_CONTRACT =
  'One adapter: invoke(input) => { status: "success" | "blocked", finalState }, input: one fixture. ' +
  'Start the real code from initialState (nested by dotted path: persona, then scenario, then surface ' +
  'defaults) and parameters (by name). Replay steps first, in order, each against its expectedStatus and ' +
  'expectedAssertions; apply timeAdvance before acting. Assert status, then on success each expectedAssertions ' +
  'path against finalState: only asserted paths need to be returned. Each test title must contain its ' +
  'fixture\'s titleToken: .lyriks/tools/ingest-results.mjs finds it in a JSON test report.'

/**
 * The token the engine's result ingester recognises a test by, in its title:
 * `[unspa:<surfaceId>:<actionId>:<scenarioId>]` (unspaghettit
 * cli/scenarios/results.ts, scenarioTitleToken and TOKEN, mirrored here to the
 * character: a token spelled any other way brings no result back).
 */
export const TITLE_TOKEN = /\[unspa:([^:\]]+):([^:\]]+):([^:\]]+)\]/

/**
 * null when an id is missing or holds a character the ingester cannot read back
 * (":" or "]"): a token that parses to other ids would stamp the wrong action.
 */
export function scenarioTitleToken(surfaceId: unknown, actionId: unknown, scenarioId: unknown): string | null {
  const ids = [surfaceId, actionId, scenarioId].map((id) => (typeof id === 'string' || typeof id === 'number' ? String(id) : ''))
  const token = `[unspa:${ids.join(':')}]`
  const read = TITLE_TOKEN.exec(token)
  return read && read[0] === token && ids.every((id, i) => read[i + 1] === id) ? token : null
}

// A state path is dotted identifiers, and `__proto__` is one: writing it would
// swap a prototype instead of setting a key.
const isStatePath = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !v.split('.').includes('__proto__')

/** The engine's writePath: nested objects along the dotted path, a later write wins. */
function writePath(snapshot: Row, path: string, value: unknown): Row {
  const segments = path.split('.')
  const next: Row = { ...snapshot }
  let cursor = next
  for (const segment of segments.slice(0, -1)) {
    const existing = cursor[segment]
    const child: Row = isRow(existing) ? { ...existing } : {}
    cursor[segment] = child
    cursor = child
  }
  cursor[segments[segments.length - 1]] = value
  return next
}

function readPath(snapshot: Row, path: string): unknown {
  let cursor: unknown = snapshot
  for (const segment of path.split('.')) {
    if (!isRow(cursor) || !Object.hasOwn(cursor, segment)) return undefined
    cursor = cursor[segment]
  }
  return cursor
}

const applyStateOverrides = (snapshot: Row, overrides: unknown): Row =>
  rows(overrides).reduce((next, o) => (isStatePath(o.path) ? writePath(next, o.path, o.value) : next), snapshot)

/** The engine's mergeSnapshotWithDefaults: a declared path nobody set starts at its default. */
const fillDefaults = (snapshot: Row, definitions: unknown): Row =>
  rows(definitions).reduce(
    (next, def) => (isStatePath(def.path) && def.defaultValue !== undefined && readPath(next, def.path) === undefined
      ? writePath(next, def.path, def.defaultValue)
      : next),
    snapshot,
  )

/** Overrides keyed by parameter name; like the engine, only the names the action declares. */
function namedParameters(overrides: unknown, action: Row | undefined): Row {
  const declared = action && Array.isArray(action.parameters) ? new Set(rows(action.parameters).map((p) => p.name)) : null
  return Object.fromEntries(
    rows(overrides)
      .filter((o) => typeof o.parameterName === 'string' && (!declared || declared.has(o.parameterName)))
      .map((o) => [o.parameterName, o.value]),
  )
}

const statusOf = (v: unknown): 'success' | 'blocked' => (v === 'blocked' ? 'blocked' : 'success')
const timeAdvanceOf = (r: Row) => (typeof r.timeAdvance === 'number' ? { timeAdvance: r.timeAdvance } : {})

/** One authored scenario as the input of the adapter, plus what the test asserts. */
export function scenarioFixture(feature: Row, surface: Row, action: Row, scenario: Row): Row {
  const persona = scenario.personaId === undefined ? undefined : rows(feature.personas).find((p) => p.id === scenario.personaId)
  const authored = applyStateOverrides(applyStateOverrides({}, persona?.stateOverrides), scenario.stateOverrides)
  const steps = rows(scenario.steps).map((step): Row => {
    // A step without a surface replays an action of the scenario's own surface.
    const stepSurface = step.surfaceId === undefined ? surface : rows(feature.surfaces).find((s) => s.id === step.surfaceId)
    const stepAction = stepSurface && rows(stepSurface.actions).find((a) => a.id === step.actionId)
    return {
      actionId: step.actionId,
      actionName: stepAction?.name ?? null,
      surfaceId: stepSurface?.id ?? step.surfaceId ?? null,
      parameters: { ...namedParameters(persona?.parameterOverrides, stepAction), ...namedParameters(step.parameterOverrides, stepAction) },
      expectedStatus: statusOf(step.expectedStatus),
      expectedAssertions: rows(step.expectedAssertions),
      ...timeAdvanceOf(step),
    }
  })
  const versions = isRow(feature.elementVersions) ? feature.elementVersions : {}
  const stamp = versions[`scenario:${String(scenario.id)}`]
  return {
    featureId: feature.id,
    featureName: feature.name,
    surfaceId: surface.id,
    surfaceName: surface.name,
    actionId: action.id,
    actionName: action.name,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    // What a test title carries so that its result finds its way back to this scenario.
    titleToken: scenarioTitleToken(surface.id, action.id, scenario.id),
    personaId: scenario.personaId ?? null,
    personaName: persona?.name ?? null,
    initialState: fillDefaults(authored, surface.stateDefinitions),
    parameters: { ...namedParameters(persona?.parameterOverrides, action), ...namedParameters(scenario.parameterOverrides, action) },
    steps,
    ...timeAdvanceOf(scenario),
    expectedStatus: statusOf(scenario.expectedStatus),
    expectedAssertions: rows(scenario.expectedAssertions),
    // null is authored too: it means the action must not move the user.
    ...(scenario.expectedTransition !== undefined ? { expectedTransition: scenario.expectedTransition } : {}),
    // A feature written before element stamps only knows when anything in it moved.
    specVersion: typeof stamp === 'string' ? stamp : feature.updatedAt ?? null,
  }
}

/**
 * The fixtures of a feature, in model order, one page at a time. The page is
 * sized under the response cap so the generic cap never samples it, which would
 * drop the nested state a fixture exists to carry and open holes in the paging.
 */
export function scenarioFixtures(feature: Row, args: Pick<ExportBehaviorScenariosArgs, 'surface_id' | 'action_id' | 'limit' | 'offset'>): Row {
  const featureId = feature.id
  const inFeature = rows(feature.surfaces)
  if (args.surface_id && !inFeature.some((s) => s.id === args.surface_id))
    return { found: false, featureId, surface_id: args.surface_id, reason: 'No surface of this feature has this id.', available: availableIds(feature, false) }
  const surfaces = inFeature.filter((s) => !args.surface_id || s.id === args.surface_id)
  if (args.action_id && !surfaces.some((s) => rows(s.actions).some((a) => a.id === args.action_id))) {
    const reason = args.surface_id ? 'No action of this surface has this id.' : 'No action of this feature has this id.'
    return { found: false, featureId, action_id: args.action_id, ...(args.surface_id ? { surface_id: args.surface_id } : {}), reason, available: availableIds(feature, true) }
  }
  const all = surfaces.flatMap((surface) =>
    rows(surface.actions)
      .filter((action) => !args.action_id || action.id === args.action_id)
      .flatMap((action) => rows(action.scenarios).map((scenario) => ({ surface, action, scenario }))))

  const offset = Number.isSafeInteger(args.offset) ? Math.max(0, args.offset!) : 0
  const limit = Number.isSafeInteger(args.limit) ? Math.max(1, Math.min(SCENARIO_PAGE.max, args.limit!)) : SCENARIO_PAGE.default
  const head = { featureId, total: all.length, offset }
  const fixtures: Row[] = []
  let room = RESULT_CAP - JSON.stringify({ ...head, adapterContract: ADAPTER_CONTRACT }).length - 256
  for (const { surface, action, scenario } of all.slice(offset, offset + limit)) {
    const fixture = scenarioFixture(feature, surface, action, scenario)
    room -= JSON.stringify(fixture).length + 1
    // Always one fixture, so a page makes progress even under a tiny cap.
    if (room < 0 && fixtures.length) break
    fixtures.push(fixture)
  }
  const next = offset + fixtures.length
  return { ...head, returned: fixtures.length, nextOffset: next < all.length ? next : null, fixtures, adapterContract: ADAPTER_CONTRACT }
}

/** Read the feature the way get_behavior_feature does, and answer its scenarios as fixtures. */
export async function exportBehaviorScenariosHandler(
  args: ExportBehaviorScenariosArgs,
  lyriks: LyriksClient,
): Promise<unknown> {
  const q = new URLSearchParams({ projectId: args.project_id, featureId: args.feature_id })
  const result = await lyriks.get(`/api/behavior/feature?${q.toString()}`) as Record<string, unknown>
  const feature = featureOf(result)
  return feature
    ? scenarioFixtures(feature, args)
    : { found: false, featureId: args.feature_id, reason: 'The platform answer carries no snapshot.feature.', answer: summarize(result) }
}
