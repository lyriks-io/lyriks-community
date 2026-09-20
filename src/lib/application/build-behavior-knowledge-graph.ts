import { nodeId, type GraphEdge, type GraphNode } from '$domain/graph';
import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';
import type { FormalCoherenceReport } from './ports';

/**
 * Anti-corruption mappers that fold the Unspaghettit behavior model and the
 * formal DPO verdict into the shared `KnowledgeGraph` vocabulary, so the merged
 * provider can overlay both onto the local wizard projection.
 *
 * Why the behavior model and NOT the raw DPO/MRS substrate: the engine's own
 * graph is unlabelled `function/bus/site/graph` primitives (see
 * `build-engine-knowledge-graph.ts`) — meaningless to an author. Unspa holds the
 * human names for exactly those elements (feature → surface → action → event),
 * so THIS is the readable behavior layer. The DPO's understandable contribution
 * is its verdict (coherent / which states are violated), rendered as a small
 * overlay node rather than raw substrate.
 *
 * Pure: types + total mapping, no IO. The provider gathers the snapshots and the
 * report, then calls these.
 */

/** Loose readers over the opaque `feature` record (unspa wire format). */
interface UEvent {
	id?: unknown;
	name?: unknown;
	description?: unknown;
}
interface UAction {
	id?: unknown;
	name?: unknown;
	intent?: unknown;
	emittedEvents?: unknown;
	transitions?: unknown;
	triggeredByEvent?: unknown;
	requiredStates?: unknown;
	parameters?: unknown;
	rules?: unknown;
	invariants?: unknown;
	effects?: unknown;
	onBlockedEffects?: unknown;
	scenarios?: unknown;
}
interface USurface {
	id?: unknown;
	name?: unknown;
	type?: unknown;
	description?: unknown;
	actions?: unknown;
	transitions?: unknown;
	parentSurfaceId?: unknown;
	stateDefinitions?: unknown;
	rules?: unknown;
	invariants?: unknown;
}
interface UTransition {
	toSurface?: unknown;
	target?: unknown;
	to?: unknown;
}
interface UPersona {
	id?: unknown;
	name?: unknown;
	description?: unknown;
}
interface UState {
	id?: unknown;
	name?: unknown;
	path?: unknown;
	type?: unknown;
	description?: unknown;
	/** Expression a derived state recomputes itself from. Newer engines only. */
	derived?: unknown;
	valueSetId?: unknown;
}
interface UParameter {
	id?: unknown;
	name?: unknown;
	bindToStatePath?: unknown;
	valueSetId?: unknown;
}
interface URule {
	id?: unknown;
	name?: unknown;
	description?: unknown;
	category?: unknown;
	condition?: unknown;
}
interface UEffect {
	id?: unknown;
	type?: unknown;
	path?: unknown;
	/** What the effect writes INTO `path`: an expression that may read other states. */
	value?: unknown;
	event?: unknown;
	target?: unknown;
	targetRef?: unknown;
	toSurface?: unknown;
	dependencyId?: unknown;
	operation?: unknown;
	resultPath?: unknown;
	description?: unknown;
}
interface UDependency {
	id?: unknown;
	name?: unknown;
	kind?: unknown;
	provider?: unknown;
	description?: unknown;
	operations?: unknown;
}
interface UScenario {
	id?: unknown;
	name?: unknown;
	title?: unknown;
	description?: unknown;
	stateOverrides?: unknown;
	expectedAssertions?: unknown;
	given?: unknown;
	then?: unknown;
}
interface UField {
	id?: unknown;
	name?: unknown;
	type?: unknown;
}
interface UEntity {
	id?: unknown;
	name?: unknown;
	description?: unknown;
	fields?: unknown;
	resourceId?: unknown;
}
interface UResource {
	id?: unknown;
	name?: unknown;
	type?: unknown;
}
/**
 * What a feature promises, as newer engines carry it. All optional: an older
 * snapshot has none of these keys and must project exactly as it did before.
 */
interface UCriterionRelation {
	kind?: unknown;
	criterionId?: unknown;
	/** Set only when the related criterion lives in ANOTHER feature. */
	featureId?: unknown;
	note?: unknown;
}
interface UCriterion {
	id?: unknown;
	title?: unknown;
	given?: unknown;
	when?: unknown;
	then?: unknown;
	expectedOutcome?: unknown;
	relatedSurfaceId?: unknown;
	description?: unknown;
	status?: unknown;
	relations?: unknown;
}
interface UConstant {
	id?: unknown;
	name?: unknown;
	value?: unknown;
	description?: unknown;
}
interface UValueSet {
	id?: unknown;
	name?: unknown;
	values?: unknown;
	description?: unknown;
}
/** A feature-level invariant, or a reachability goal (which adds its `kind`). */
interface UFeatureRule {
	id?: unknown;
	name?: unknown;
	description?: unknown;
	category?: unknown;
	condition?: unknown;
	kind?: unknown;
}
interface UFeature {
	id?: unknown;
	name?: unknown;
	description?: unknown;
	surfaces?: unknown;
	personas?: unknown;
	entities?: unknown;
	resources?: unknown;
	events?: unknown;
	dependencies?: unknown;
	acceptanceCriteria?: unknown;
	featureInvariants?: unknown;
	reachabilityGoals?: unknown;
	constants?: unknown;
	valueSets?: unknown;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const prefixedRawId = (id: string, prefix: string): string | null =>
	id.startsWith(prefix) && id.length > prefix.length ? id.slice(prefix.length) : null;

function transitionTarget(entry: unknown): string {
	if (!entry || typeof entry !== 'object') return '';
	const transition = entry as UTransition;
	return str(transition.toSurface) || str(transition.target) || str(transition.to);
}

function objectId(entry: unknown): string {
	if (!entry || typeof entry !== 'object') return '';
	return str((entry as { id?: unknown }).id);
}

/** What one authored expression tree references, wherever the reference sits. */
interface ExpressionRefs {
	readonly states: string[];
	readonly constants: string[];
}

/**
 * The ONE walker over an authored expression tree. A rule condition, an
 * effect's value, a derived formula, a goal's condition and a scenario's
 * assertions are all the same shape, so they are all read here rather than in
 * five half-walkers: a reference nested under three operators is exactly the
 * one that used to be missed (a `set_state` whose value reads two other states
 * projected the write and neither read).
 *
 * A state is recognised by the KEYS the wire format puts a path under (`path`,
 * `left`, `bindToStatePath`), a constant by the expression node itself
 * (`{ kind: 'const', name }`). A `{ kind: 'literal', value }` is not a
 * reference, and a `param` name is not a state, so neither is collected.
 */
function expressionRefs(entry: unknown): ExpressionRefs {
	const states = new Set<string>();
	const constants = new Set<string>();
	const visit = (value: unknown, key = ''): void => {
		if (typeof value === 'string') {
			if (key === 'path' || key === 'left' || key === 'bindToStatePath') states.add(value);
			return;
		}
		if (Array.isArray(value)) {
			value.forEach((child) => visit(child));
			return;
		}
		if (!value || typeof value !== 'object') return;
		const node = value as { kind?: unknown; name?: unknown };
		if (node.kind === 'const' && typeof node.name === 'string' && node.name.length > 0) {
			constants.add(node.name);
		}
		for (const [childKey, child] of Object.entries(value)) visit(child, childKey);
	};
	visit(entry);
	return { states: [...states], constants: [...constants] };
}

/** The state paths an expression tree reads: the half most callers want. */
function statePaths(entry: unknown): string[] {
	return expressionRefs(entry).states;
}

/** The name of an emitted event, whether the entry is a bare string or an object. */
function eventName(entry: unknown): string {
	if (typeof entry === 'string') return entry;
	if (entry && typeof entry === 'object') {
		const e = entry as UEvent;
		return str(e.name) || str(e.id);
	}
	return '';
}

/**
 * Behavior subgraph: feature → surface → action → event, each carrying its human
 * `name`. Linked under the project root node so it hangs off the same tree as the
 * wizard projection. Ids are namespaced by kind (via `nodeId`) and never collide
 * with wizard nodes.
 */
export function buildBehaviorGraphElements(
	projectRootId: string,
	features: readonly UnspaFeatureSnapshot[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];
	const seenEvent = new Set<string>();
	const seenResource = new Set<string>();
	const seenState = new Set<string>();
	const seenPersona = new Set<string>();
	const seenEntity = new Set<string>();
	const seenField = new Set<string>();

	const ensureState = (path: string, state?: UState): string => {
		const stateNodeId = nodeId('state', path);
		if (!seenState.has(stateNodeId)) {
			seenState.add(stateNodeId);
			nodes.push({
				id: stateNodeId,
				kind: 'state',
				context: 'behavior',
				label: str(state?.name) || path,
				detail: str(state?.description) || str(state?.type) || undefined
			});
		}
		return stateNodeId;
	};

	const ensureEvent = (name: string, detail?: string): string => {
		const eventNodeId = nodeId('event', name);
		if (!seenEvent.has(eventNodeId)) {
			seenEvent.add(eventNodeId);
			nodes.push({ id: eventNodeId, kind: 'event', context: 'behavior', label: name, detail });
		}
		return eventNodeId;
	};

	for (const snap of features) {
		const f = (snap?.feature ?? {}) as UFeature;
		const fid = str(f.id);
		if (!fid) continue;
		const fNodeId = nodeId('feature', `beh:${fid}`);
		nodes.push({
			id: fNodeId,
			kind: 'feature',
			context: 'behavior',
			label: str(f.name) || fid,
			detail: str(f.description) || undefined
		});
		edges.push({ id: `e:beh:${projectRootId}->${fid}`, from: projectRootId, to: fNodeId, kind: 'contains' });
		edges.push({
			id: `e:bind:feature:${fid}`,
			from: nodeId('feature', fid),
			to: fNodeId,
			kind: 'binds',
			label: 'featureId'
		});

		for (const dependencyRaw of arr(f.dependencies)) {
			const dependency = (dependencyRaw ?? {}) as UDependency;
			const dependencyId = objectId(dependencyRaw);
			if (!dependencyId) continue;
			const dependencyNodeId = nodeId('dependency', `beh:${dependencyId}`);
			nodes.push({
				id: dependencyNodeId,
				kind: 'dependency',
				context: 'behavior',
				label: str(dependency.name) || dependencyId,
				detail:
					str(dependency.description) ||
					[str(dependency.kind), str(dependency.provider)].filter(Boolean).join(' · ') ||
					undefined,
				meta: { operations: arr(dependency.operations).length }
			});
			edges.push({
				id: `e:beh:${fid}->dependency:${dependencyId}`,
				from: fNodeId,
				to: dependencyNodeId,
				kind: 'contains',
				label: 'external dependency'
			});
		}

		for (const resourceRaw of arr(f.resources)) {
			const resource = (resourceRaw ?? {}) as UResource;
			const rid = str(resource.id);
			if (!rid) continue;
			const resourceNodeId = nodeId('resource', `beh:${rid}`);
			if (!seenResource.has(resourceNodeId)) {
				seenResource.add(resourceNodeId);
				nodes.push({
					id: resourceNodeId,
					kind: 'resource',
					context: 'behavior',
					label: str(resource.name) || rid,
					detail: str(resource.type) || undefined
				});
			}
			edges.push({ id: `e:beh:${fid}->resource:${rid}`, from: fNodeId, to: resourceNodeId, kind: 'contains' });
			const databaseId = prefixedRawId(rid, 'res-db-');
			const interfaceId = prefixedRawId(rid, 'res-if-');
			if (databaseId) {
				edges.push({
					id: `e:bind:database:${databaseId}`,
					from: nodeId('database', databaseId),
					to: resourceNodeId,
					kind: 'binds',
					label: 'res-db-{databaseId}'
				});
			} else if (interfaceId) {
				edges.push({
					id: `e:bind:interface:${interfaceId}`,
					from: nodeId('interface', interfaceId),
					to: resourceNodeId,
					kind: 'binds',
					label: 'res-if-{interfaceId}'
				});
			}
		}

		for (const personaRaw of arr(f.personas)) {
			const persona = (personaRaw ?? {}) as UPersona;
			const pid = str(persona.id);
			if (!pid) continue;
			const personaNodeId = nodeId('persona', `beh:${pid}`);
			if (!seenPersona.has(personaNodeId)) {
				seenPersona.add(personaNodeId);
				nodes.push({
					id: personaNodeId,
					kind: 'persona',
					context: 'behavior',
					label: str(persona.name) || pid,
					detail: str(persona.description) || 'Persona'
				});
			}
			edges.push({ id: `e:beh:${fid}->persona:${pid}`, from: fNodeId, to: personaNodeId, kind: 'contains' });
			const roleId = prefixedRawId(pid, 'per-');
			if (roleId) {
				edges.push({
					id: `e:bind:role:${roleId}`,
					from: nodeId('role', roleId),
					to: personaNodeId,
					kind: 'binds',
					label: 'per-{roleId}'
				});
			}
		}

		for (const entityRaw of arr(f.entities)) {
			const entity = (entityRaw ?? {}) as UEntity;
			const eid = str(entity.id);
			if (!eid) continue;
			const entityNodeId = nodeId('entity', `beh:${eid}`);
			if (!seenEntity.has(entityNodeId)) {
				seenEntity.add(entityNodeId);
				nodes.push({
					id: entityNodeId,
					kind: 'entity',
					context: 'behavior',
					label: str(entity.name) || str((entity as { namespace?: unknown }).namespace) || eid,
					detail: str(entity.description) || undefined
				});
			}
			edges.push({ id: `e:beh:${fid}->entity:${eid}`, from: fNodeId, to: entityNodeId, kind: 'contains' });
			const localEntityId = prefixedRawId(eid, 'ent-');
			if (localEntityId) {
				edges.push({
					id: `e:bind:entity:${localEntityId}`,
					from: nodeId('entity', localEntityId),
					to: entityNodeId,
					kind: 'binds',
					label: 'ent-{entityId}'
				});
			}
			const resourceId = str(entity.resourceId);
			if (resourceId) {
				edges.push({
					id: `e:beh:entity-resource:${eid}:${resourceId}`,
					from: entityNodeId,
					to: nodeId('resource', `beh:${resourceId}`),
					kind: 'relates',
					label: 'resourceId'
				});
			}
			for (const fieldRaw of arr(entity.fields)) {
				const field = (fieldRaw ?? {}) as UField;
				const fieldId = str(field.id);
				if (!fieldId) continue;
				const fieldNodeId = nodeId('field', `beh:${fieldId}`);
				if (!seenField.has(fieldNodeId)) {
					seenField.add(fieldNodeId);
					nodes.push({
						id: fieldNodeId,
						kind: 'field',
						context: 'behavior',
						label: str(field.name) || fieldId,
						detail: str(field.type) || undefined
					});
				}
				edges.push({
					id: `e:beh:${eid}->field:${fieldId}`,
					from: entityNodeId,
					to: fieldNodeId,
					kind: 'contains'
				});
				const localFieldId = prefixedRawId(fieldId, 'fld-');
				if (localFieldId) {
					edges.push({
						id: `e:bind:field:${localFieldId}`,
						from: nodeId('field', localFieldId),
						to: fieldNodeId,
						kind: 'binds',
						label: 'fld-{fieldId}'
					});
				}
			}
		}

		for (const eventRaw of arr(f.events)) {
			const event = (eventRaw ?? {}) as UEvent;
			const name = eventName(event);
			if (!name) continue;
			const eventNodeId = ensureEvent(name, str(event.description) || undefined);
			edges.push({ id: `e:beh:${fid}->event:${name}`, from: fNodeId, to: eventNodeId, kind: 'contains' });
		}

		// ── What the feature PROMISES, before the surfaces that reference it ──
		// Constants and value sets come first: a rule, an effect or a state below
		// names them, and an edge is only drawn to something this feature declared.
		const constantNames = new Set<string>();
		for (const constantRaw of arr(f.constants)) {
			const constant = (constantRaw ?? {}) as UConstant;
			const name = str(constant.name);
			if (!name) continue;
			constantNames.add(name);
			const value = constant.value;
			nodes.push({
				id: nodeId('constant', `beh:${fid}:${name}`),
				kind: 'constant',
				context: 'behavior',
				label: name,
				detail: str(constant.description) || undefined,
				// The value is the point of a constant, so it travels when it is a scalar.
				...(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
					? { meta: { value } }
					: {})
			});
			edges.push({
				id: `e:beh:${fid}->constant:${name}`,
				from: fNodeId,
				to: nodeId('constant', `beh:${fid}:${name}`),
				kind: 'contains'
			});
		}

		/** `reads` edges to every constant of THIS feature an expression references. */
		const readsConstants = (fromId: string, edgeIdPrefix: string, expression: unknown): void => {
			for (const name of expressionRefs(expression).constants) {
				// A name the feature never declared is a spec error, not an edge.
				if (!constantNames.has(name)) continue;
				edges.push({
					id: `${edgeIdPrefix}->constant:${name}`,
					from: fromId,
					to: nodeId('constant', `beh:${fid}:${name}`),
					kind: 'reads'
				});
			}
		};

		for (const valueSetRaw of arr(f.valueSets)) {
			const valueSet = (valueSetRaw ?? {}) as UValueSet;
			const valueSetId = objectId(valueSetRaw);
			if (!valueSetId) continue;
			const values = arr(valueSet.values).map(str).filter(Boolean);
			nodes.push({
				id: nodeId('valueSet', `beh:${fid}:${valueSetId}`),
				kind: 'valueSet',
				context: 'behavior',
				label: str(valueSet.name) || valueSetId,
				// The allowed values, so searching for one of them finds the set.
				detail: values.join(' | ') || str(valueSet.description) || undefined
			});
			edges.push({
				id: `e:beh:${fid}->value-set:${valueSetId}`,
				from: fNodeId,
				to: nodeId('valueSet', `beh:${fid}:${valueSetId}`),
				kind: 'contains'
			});
		}

		for (const criterionRaw of arr(f.acceptanceCriteria)) {
			const criterion = (criterionRaw ?? {}) as UCriterion;
			const criterionId = objectId(criterionRaw);
			if (!criterionId) continue;
			const criterionNodeId = nodeId('criterion', `beh:${fid}:${criterionId}`);
			const status = str(criterion.status);
			const outcome = str(criterion.expectedOutcome);
			nodes.push({
				id: criterionNodeId,
				kind: 'criterion',
				context: 'behavior',
				label: str(criterion.title) || criterionId,
				// The prose itself, joined, so a search for the words of a criterion
				// finds it. It is documentation: nothing here is model-checked.
				detail:
					[str(criterion.given), str(criterion.when), str(criterion.then)]
						.filter(Boolean)
						.join(' · ') ||
					str(criterion.description) ||
					undefined,
				...(status || outcome
					? { meta: { ...(status ? { status } : {}), ...(outcome ? { expectedOutcome: outcome } : {}) } }
					: {})
			});
			edges.push({
				id: `e:beh:${fid}->criterion:${criterionId}`,
				from: fNodeId,
				to: criterionNodeId,
				kind: 'contains'
			});
			// The surface a criterion is about may live on a sibling feature, so the
			// edge is queued like any other and dropped if it stays dangling.
			const relatedSurfaceId = str(criterion.relatedSurfaceId);
			if (relatedSurfaceId) {
				edges.push({
					id: `e:beh:${fid}:criterion:${criterionId}->surface:${relatedSurfaceId}`,
					from: criterionNodeId,
					to: nodeId('surface', relatedSurfaceId),
					kind: 'relates',
					label: 'about'
				});
			}
			for (const relationRaw of arr(criterion.relations)) {
				const relation = (relationRaw ?? {}) as UCriterionRelation;
				const relationKind = str(relation.kind);
				const targetId = str(relation.criterionId);
				if (!relationKind || !targetId) continue;
				// A relation resolves in this feature unless it names another one.
				const targetFeatureId = str(relation.featureId) || fid;
				edges.push({
					id: `e:beh:${fid}:criterion:${criterionId}:${relationKind}:${targetFeatureId}:${targetId}`,
					from: criterionNodeId,
					to: nodeId('criterion', `beh:${targetFeatureId}:${targetId}`),
					kind: 'relates',
					label: relationKind.replace(/_/g, ' ')
				});
			}
		}

		// Feature-level invariants and reachability goals are projected as `rule`
		// nodes, exactly like the invariants a surface or an action carries: same
		// vocabulary, so a reader meets one kind of "what must hold" everywhere.
		for (const [collection, label] of [
			[arr(f.featureInvariants), 'feature invariant'],
			[arr(f.reachabilityGoals), 'reachability goal']
		] as const) {
			for (const featureRuleRaw of collection) {
				const featureRule = (featureRuleRaw ?? {}) as UFeatureRule;
				const featureRuleId = objectId(featureRuleRaw);
				if (!featureRuleId) continue;
				const featureRuleNodeId = nodeId('rule', `beh:${fid}:${featureRuleId}`);
				const goalKind = str(featureRule.kind);
				nodes.push({
					id: featureRuleNodeId,
					kind: 'rule',
					context: 'behavior',
					label: str(featureRule.name) || str(featureRule.description) || `${label} ${featureRuleId}`,
					detail: str(featureRule.category) || (goalKind ? `${label} · ${goalKind}` : label)
				});
				const slug = label.replace(' ', '-');
				edges.push({
					id: `e:beh:${fid}->${slug}:${featureRuleId}`,
					from: fNodeId,
					to: featureRuleNodeId,
					kind: 'contains'
				});
				for (const path of statePaths(featureRule.condition)) {
					edges.push({
						id: `e:beh:${fid}:${slug}:${featureRuleId}->state:${path}`,
						from: featureRuleNodeId,
						to: ensureState(path),
						kind: 'reads'
					});
				}
				readsConstants(featureRuleNodeId, `e:beh:${fid}:${slug}:${featureRuleId}`, featureRule.condition);
			}
		}

		for (const sRaw of arr(f.surfaces)) {
			const s = (sRaw ?? {}) as USurface;
			const sid = str(s.id);
			if (!sid) continue;
			const sNodeId = nodeId('surface', sid);
			nodes.push({
				id: sNodeId,
				kind: 'surface',
				context: 'behavior',
				label: str(s.name) || sid,
				detail: str(s.type) || undefined
			});
			edges.push({ id: `e:beh:${fid}->${sid}`, from: fNodeId, to: sNodeId, kind: 'contains' });
			const journeyId = prefixedRawId(sid, 'srf-');
			const screenId = prefixedRawId(sid, 'srf-screen-');
			if (screenId) {
				// The builder also roots reusable components and templates as
				// `srf-screen-*` surfaces. Emit one binds candidate per possible wizard
				// owner — the graph builder drops the dangling ones, so exactly the
				// node that exists claims the twin.
				for (const ownerKind of ['screen', 'component', 'template'] as const) {
					edges.push({
						id: `e:bind:${ownerKind}:${screenId}`,
						from: nodeId(ownerKind, screenId),
						to: sNodeId,
						kind: 'binds',
						label: 'srf-screen-{screenId}'
					});
				}
			} else if (journeyId) {
				edges.push({
					id: `e:bind:journey:${journeyId}`,
					from: nodeId('journey', journeyId),
					to: sNodeId,
					kind: 'binds',
					label: 'srf-{journeyId}'
				});
			}
			const parentSurfaceId = str(s.parentSurfaceId);
			if (parentSurfaceId) {
				edges.push({
					id: `e:beh:surface-parent:${parentSurfaceId}:${sid}`,
					from: nodeId('surface', parentSurfaceId),
					to: sNodeId,
					kind: 'contains'
				});
			}
			for (const stateRaw of arr(s.stateDefinitions)) {
				const state = (stateRaw ?? {}) as UState;
				const path = str(state.path);
				if (!path) continue;
				const stateNodeId = ensureState(path, state);
				edges.push({
					id: `e:beh:${sid}->state:${path}`,
					from: sNodeId,
					to: stateNodeId,
					kind: 'contains'
				});
				// A derived state is computed from other states: the formula is what
				// says which, and without it the dependency was nowhere in the graph.
				for (const readPath of statePaths(state.derived)) {
					edges.push({
						id: `e:beh:derived:${path}->state:${readPath}`,
						from: stateNodeId,
						to: ensureState(readPath),
						kind: 'reads'
					});
				}
				readsConstants(stateNodeId, `e:beh:${fid}:derived:${path}`, state.derived);
				const valueSetId = str(state.valueSetId);
				if (valueSetId) {
					edges.push({
						id: `e:beh:${fid}:state:${path}->value-set:${valueSetId}`,
						from: stateNodeId,
						to: nodeId('valueSet', `beh:${fid}:${valueSetId}`),
						kind: 'uses',
						label: 'allowed values'
					});
				}
			}
			for (const [collection, label] of [
				[arr(s.rules), 'rule'],
				[arr(s.invariants), 'invariant']
			] as const) {
				for (const ruleRaw of collection) {
					const rule = (ruleRaw ?? {}) as URule;
					const ruleId = objectId(ruleRaw);
					if (!ruleId) continue;
					const ruleNodeId = nodeId('rule', `beh:${fid}:${ruleId}`);
					nodes.push({
						id: ruleNodeId,
						kind: 'rule',
						context: 'behavior',
						label: str(rule.name) || str(rule.description) || `${label} ${ruleId}`,
						detail: str(rule.category) || label
					});
					edges.push({ id: `e:beh:${sid}->${label}:${ruleId}`, from: sNodeId, to: ruleNodeId, kind: 'contains' });
					for (const path of statePaths(rule.condition)) {
						edges.push({
							id: `e:beh:${fid}:${label}:${ruleId}->state:${path}`,
							from: ruleNodeId,
							to: ensureState(path),
							kind: 'reads'
						});
					}
					readsConstants(ruleNodeId, `e:beh:${fid}:${label}:${ruleId}`, rule.condition);
				}
			}
			for (const transitionRaw of arr(s.transitions)) {
				const target = transitionTarget(transitionRaw);
				if (!target) continue;
				edges.push({
					id: `e:beh:${sid}:transitions:${target}`,
					from: sNodeId,
					to: nodeId('surface', target),
					kind: 'transitions'
				});
			}

			for (const aRaw of arr(s.actions)) {
				const a = (aRaw ?? {}) as UAction;
				const aid = str(a.id);
				if (!aid) continue;
				const aNodeId = nodeId('action', aid);
				nodes.push({
					id: aNodeId,
					kind: 'action',
					context: 'behavior',
					label: str(a.name) || aid,
					detail: str(a.intent) || undefined
				});
				edges.push({ id: `e:beh:${sid}->${aid}`, from: sNodeId, to: aNodeId, kind: 'contains' });
				const stepId = prefixedRawId(aid, 'act-');
				if (stepId) {
					edges.push({
						id: `e:bind:step:${stepId}`,
						from: nodeId('step', stepId),
						to: aNodeId,
						kind: 'binds',
						label: 'act-{stepId}'
					});
					edges.push({
						id: `e:bind:element:${stepId}`,
						from: nodeId('element', stepId),
						to: aNodeId,
						kind: 'binds',
						label: 'act-{elementId}'
					});
				}
				const writeElementId = prefixedRawId(aid, 'act-write-');
				if (writeElementId) {
					edges.push({
						id: `e:bind:write-element:${writeElementId}`,
						from: nodeId('element', writeElementId),
						to: aNodeId,
						kind: 'binds',
						label: 'act-write-{elementId}'
					});
				}

				for (const path of arr(a.requiredStates).map(str).filter(Boolean)) {
					edges.push({
						id: `e:beh:${aid}->required-state:${path}`,
						from: aNodeId,
						to: ensureState(path),
						kind: 'reads',
						label: 'required state'
					});
				}
				for (const parameterRaw of arr(a.parameters)) {
					const parameter = (parameterRaw ?? {}) as UParameter;
					const parameterValueSetId = str(parameter.valueSetId);
					if (parameterValueSetId) {
						edges.push({
							id: `e:beh:${fid}:${aid}->value-set:${parameterValueSetId}`,
							from: aNodeId,
							to: nodeId('valueSet', `beh:${fid}:${parameterValueSetId}`),
							kind: 'uses',
							label: 'allowed values'
						});
					}
					// A parameter with no bound path writes nothing; it may still name a set.
					const path = str(parameter.bindToStatePath);
					if (!path) continue;
					edges.push({
						id: `e:beh:${aid}->parameter-state:${objectId(parameterRaw) || str(parameter.name)}:${path}`,
						from: aNodeId,
						to: ensureState(path),
						kind: 'writes',
						label: str(parameter.name) || 'parameter'
					});
				}

				for (const [collection, label] of [
					[arr(a.rules), 'rule'],
					[arr(a.invariants), 'invariant']
				] as const) {
					for (const ruleRaw of collection) {
						const rule = (ruleRaw ?? {}) as URule;
						const ruleId = objectId(ruleRaw);
						if (!ruleId) continue;
						const ruleNodeId = nodeId('rule', `beh:${fid}:${ruleId}`);
						nodes.push({
							id: ruleNodeId,
							kind: 'rule',
							context: 'behavior',
							label: str(rule.name) || str(rule.description) || `${label} ${ruleId}`,
							detail: str(rule.category) || label
						});
						edges.push({ id: `e:beh:${aid}->${label}:${ruleId}`, from: aNodeId, to: ruleNodeId, kind: 'contains' });
						for (const path of statePaths(rule.condition)) {
							edges.push({
								id: `e:beh:${fid}:${label}:${ruleId}->state:${path}`,
								from: ruleNodeId,
								to: ensureState(path),
								kind: 'reads'
							});
						}
						readsConstants(ruleNodeId, `e:beh:${fid}:${label}:${ruleId}`, rule.condition);
					}
				}

				const declaredEvents = new Set(
					arr(a.emittedEvents).map(eventName).filter(Boolean)
				);
				for (const effectRaw of [...arr(a.effects), ...arr(a.onBlockedEffects)]) {
					const effect = (effectRaw ?? {}) as UEffect;
					const effectId = objectId(effectRaw);
					if (!effectId) continue;
					// Effects are syntax-level wrappers. Project their useful semantics as
					// typed action edges instead of rendering generic `emit_event` /
					// `set_state` circles between the action and its actual target. Canonical
					// action/kind/target ids also collapse repeated snapshot projections.
					const description = str(effect.description) || undefined;
					const path = str(effect.path);
					if (path) {
						edges.push({
							id: `e:beh:${aid}:writes:${path}`,
							from: aNodeId,
							to: ensureState(path),
							kind: 'writes',
							label: description
						});
					}
					// What an effect writes is an expression: `total = cart.items + fee`
					// writes `total` and READS the two others. Only the write was
					// projected, so the states an action depends on stayed invisible.
					for (const readPath of statePaths(effect.value)) {
						edges.push({
							id: `e:beh:${aid}:reads:${readPath}`,
							from: aNodeId,
							to: ensureState(readPath),
							kind: 'reads'
						});
					}
					readsConstants(aNodeId, `e:beh:${aid}`, effect.value);
					const event = str(effect.event);
					if (event && !declaredEvents.has(event)) {
						edges.push({
							id: `e:beh:${aid}:emits:${event}`,
							from: aNodeId,
							to: ensureEvent(event),
							kind: 'emits',
							label: description
						});
					}
					const target = transitionTarget(effectRaw) || str(effect.targetRef);
					if (target && str(effect.type).includes('transition')) {
						edges.push({
							id: `e:beh:${aid}:transitions:${target}`,
							from: aNodeId,
							to: nodeId('surface', target),
							kind: 'transitions',
							label: description
						});
					}
					const dependencyId = str(effect.dependencyId);
					if (dependencyId) {
						edges.push({
							id: `e:beh:${aid}->effect:${effectId}:dependency:${dependencyId}`,
							from: aNodeId,
							to: nodeId('dependency', `beh:${dependencyId}`),
							kind: 'uses',
							label: str(effect.operation) || description || 'invoke operation'
						});
					}
					const resultPath = str(effect.resultPath);
					if (resultPath) {
						edges.push({
							id: `e:beh:${aid}:writes:${resultPath}`,
							from: aNodeId,
							to: ensureState(resultPath),
							kind: 'writes',
							label: description || 'operation result'
						});
					}
				}

				for (const scenarioRaw of arr(a.scenarios)) {
					const scenario = (scenarioRaw ?? {}) as UScenario;
					const scenarioId = objectId(scenarioRaw);
					if (!scenarioId) continue;
					const scenarioNodeId = nodeId('scenario', `beh:${fid}:${scenarioId}`);
					nodes.push({
						id: scenarioNodeId,
						kind: 'scenario',
						context: 'behavior',
						label: str(scenario.name) || str(scenario.title) || scenarioId,
						detail: str(scenario.description) || undefined
					});
					edges.push({ id: `e:beh:scenario:${scenarioId}->${aid}`, from: scenarioNodeId, to: aNodeId, kind: 'tests' });
					for (const path of statePaths([
						...arr(scenario.stateOverrides),
						...arr(scenario.expectedAssertions),
						scenario.given,
						scenario.then
					])) {
						edges.push({
							id: `e:beh:scenario:${scenarioId}->state:${path}`,
							from: scenarioNodeId,
							to: ensureState(path),
							kind: 'tests'
						});
					}
				}

				for (const evRaw of arr(a.emittedEvents)) {
					const name = eventName(evRaw);
					if (!name) continue;
					const evNodeId = ensureEvent(name);
					edges.push({ id: `e:beh:${aid}:emits:${name}`, from: aNodeId, to: evNodeId, kind: 'emits' });
				}
				const trigger = str(a.triggeredByEvent);
				if (trigger) {
					edges.push({
						id: `e:beh:${trigger}=>${aid}`,
						from: nodeId('event', trigger),
						to: aNodeId,
						kind: 'triggers'
					});
				}
				for (const transitionRaw of arr(a.transitions)) {
					const target = transitionTarget(transitionRaw);
					if (!target) continue;
					edges.push({
						id: `e:beh:${aid}:transitions:${target}`,
						from: aNodeId,
						to: nodeId('surface', target),
						kind: 'transitions'
					});
				}
			}
		}
	}

	return { nodes, edges };
}

/**
 * DPO verdict overlay: one status node hung off the project root, plus a flagged
 * node per formal violation. This is the DPO's *understandable* contribution to
 * the graph — the pass/fail verdict — instead of the raw MRS substrate. Returns
 * nothing when the engine reported nothing.
 */
export function buildDpoOverlayElements(
	projectRootId: string,
	report: FormalCoherenceReport | null
): { nodes: GraphNode[]; edges: GraphEdge[] } {
	if (!report || !report.engineAvailable) return { nodes: [], edges: [] };
	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];
	const violations = report.inconsistencies.length;

	const verdictId = nodeId('graphNode', 'dpo-verdict');
	nodes.push({
		id: verdictId,
		kind: 'graphNode',
		context: 'engine',
		label: report.coherent ? 'Formal (DPO): coherent' : `Formal (DPO): ${violations} violation(s)`,
		detail: 'Machine-checked by the Rust DPO engine',
		meta: { coherent: report.coherent, violations }
	});
	edges.push({ id: 'e:dpo:root', from: projectRootId, to: verdictId, kind: 'guards' });

	report.inconsistencies.forEach((inc, i) => {
		const vId = nodeId('gap', `dpo-${inc.code.toLowerCase()}-${i}`);
		nodes.push({
			id: vId,
			kind: 'gap',
			context: 'coherence',
			label: inc.message || inc.code,
			detail: inc.nodeIds[0] ? `state "${inc.nodeIds[0]}"` : undefined,
			meta: { code: inc.code, ...(inc.featureId ? { featureId: inc.featureId } : {}) }
		});
		edges.push({ id: `e:dpo:v${i}`, from: verdictId, to: vId, kind: 'guards' });
		// The engine names the feature owning the offending element: hang the
		// violation off it too, so the flag sits on the thing it is about (the
		// builder drops the edge when that feature is not in the graph).
		if (inc.featureId) {
			edges.push({ id: `e:dpo:v${i}:feature`, from: nodeId('feature', inc.featureId), to: vId, kind: 'guards' });
		}
	});

	return { nodes, edges };
}
