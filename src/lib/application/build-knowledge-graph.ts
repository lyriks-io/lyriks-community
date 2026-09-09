import {
	GraphBuilder,
	nodeId,
	type GraphContext,
	type GraphNodeKind,
	type KnowledgeGraph
} from '$domain/graph';
import type { FoundationIdentityDraft } from '$domain/foundation';
import type { ProjectFeaturesDraft } from '$domain/features';
import { SYSTEM_CAPABILITIES, type DerivedCapability, type ProjectUsersDraft } from '$domain/users';
import {
	SCREEN_CAPABILITY_PREFIX,
	SURFACE_CAPABILITY_PREFIX
} from './projection/surface-capabilities';
import type { ProjectExperienceDraft } from '$domain/experience';
import type { ProjectDataDraft } from '$domain/data';
import type { ProjectRulesDraft } from '$domain/rules';
import type { ProjectArchitectureDraft } from '$domain/architecture';
import type { Gap } from '$domain/coherence';

/**
 * Everything the central graph is projected from — the per-context drafts that
 * the bounded project stores hold today, plus the live coherence gaps. Each field is
 * optional so a half-filled project still yields a (smaller) valid graph.
 */
export interface KnowledgeGraphInput {
	projectId: string;
	generatedAt: string;
	identity?: FoundationIdentityDraft | null;
	features?: ProjectFeaturesDraft | null;
	users?: ProjectUsersDraft | null;
	experience?: ProjectExperienceDraft | null;
	data?: ProjectDataDraft | null;
	rules?: ProjectRulesDraft | null;
	architecture?: ProjectArchitectureDraft | null;
	/**
	 * The surface rows of the permission matrix (pages + behavior surfaces).
	 * Derived, not a draft: they come from the upstream capability provider, and
	 * they are what turns a surface grant into a real edge.
	 */
	surfaces?: readonly DerivedCapability[];
	gaps?: readonly Gap[];
}

const trunc = (s: string | null | undefined, n = 140): string | undefined => {
	const t = (s ?? '').trim();
	if (!t) return undefined;
	return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/**
 * Drop a trailing `· <parent>` from a label when it just repeats the node the
 * element nests under (e.g. a permission rule "Merchant Admin → read · Export
 * returns & refund reports" hanging off the "Export returns & refund reports"
 * capability). No-op when there's no parent label or no such suffix.
 */
/**
 * The kernel-local surface id inside a `surface:<featureId>:<surfaceId>`
 * capability id — the id the behavior graph keys its `surface` nodes by, so a
 * matrix row and the kernel overlay land on ONE node. Null for anything else
 * (a page, an off-structure row).
 */
const behaviorSurfaceId = (capabilityId: string): string | null => {
	if (!capabilityId.startsWith(SURFACE_CAPABILITY_PREFIX)) return null;
	const rest = capabilityId.slice(SURFACE_CAPABILITY_PREFIX.length);
	const sep = rest.indexOf(':');
	return sep > 0 ? rest.slice(sep + 1) || null : null;
};

const stripOwnerSuffix = (label: string, ownerLabel: string | undefined): string => {
	if (!ownerLabel) return label;
	const suffix = ` · ${ownerLabel}`;
	return label.endsWith(suffix) ? label.slice(0, -suffix.length) : label;
};

/**
 * Fold the per-context drafts into ONE knowledge graph — the "Base de
 * connaissance graph" of the platform diagram, realised as a derived read
 * model. Drafts stay the source of truth; this projection is rebuilt on demand
 * and is the single artefact the viewer (and a future engine adapter) reads.
 *
 * The function is PURE and total: missing drafts are skipped, dangling edges
 * are dropped by `GraphBuilder`, and node ids are namespaced by kind so ids
 * never collide across contexts.
 */
export function buildKnowledgeGraph(input: KnowledgeGraphInput): KnowledgeGraph {
	const g = new GraphBuilder();
	const { projectId } = input;

	const add = (
		kind: GraphNodeKind,
		context: GraphContext,
		rawId: string,
		label: string,
		detail?: string,
		meta?: Record<string, string | number | boolean>
	): string => g.addNode({ id: nodeId(kind, rawId), kind, context, label, detail, meta });

	// ── Root ──────────────────────────────────────────────────────────────
	const root = add(
		'project',
		'project',
		projectId,
		input.identity?.productName?.trim() || 'Untitled project',
		trunc(input.identity?.brief),
		input.identity ? { industry: input.identity.industry, type: input.identity.productType } : undefined
	);

	// ── Users (roles + permissions) ────────────────────────────────────────
	if (input.users) {
		for (const capability of SYSTEM_CAPABILITIES) {
			const capabilityId = add(
				'capability',
				'users',
				capability.id,
				capability.label,
				undefined,
				{ source: 'system' }
			);
			g.addEdge({
				id: `e:proj-cap:${capability.id}`,
				from: root,
				to: capabilityId,
				kind: 'contains'
			});
		}
		for (const role of input.users.roles) {
			const rid = add('role', 'users', role.id, role.name || 'Role', trunc(role.description), {
				tone: role.tone
			});
			g.addEdge({ id: `e:proj-role:${role.id}`, from: root, to: rid, kind: 'contains' });
		}
		for (const cap of input.users.offStructureCapabilities) {
			const capId = add('capability', 'users', cap.id, cap.label || 'Capability', trunc(cap.note));
			g.addEdge({ id: `e:proj-cap:${cap.id}`, from: root, to: capId, kind: 'contains' });
		}
		// Behavior surfaces (dialogs, panels, forms, workflows) the matrix governs.
		// Pages need nothing here — Experience already owns a `screen` node for each.
		// These use the SAME node id as the behavior overlay
		// (`surface:<surfaceId>`), so when the merged provider adds the kernel
		// layer both describe one node rather than a twin.
		for (const surface of input.surfaces ?? []) {
			const local = behaviorSurfaceId(surface.id);
			if (!local) continue;
			const sid = add('surface', 'behavior', local, surface.label, surface.surfaceKind);
			g.addEdge({
				id: `e:feat-surface:${surface.sourceRefId}:${local}`,
				from: nodeId('feature', surface.sourceRefId),
				to: sid,
				kind: 'contains'
			});
		}
		// Group CRUD rows into one readable role → capability relationship. The
		// declared source tells us the target kind even when features and journeys
		// have not been projected yet; GraphBuilder resolves those endpoints later.
		const grants = new Map<
			string,
			{
				roleId: string;
				capabilityId: string;
				source: (typeof input.users.permissions)[number]['capabilitySource'];
				actions: Set<string>;
				allActions: boolean;
			}
		>();
		for (const grant of input.users.permissions) {
			const key = `${grant.roleId}:${grant.capabilityId}`;
			const grouped = grants.get(key) ?? {
				roleId: grant.roleId,
				capabilityId: grant.capabilityId,
				source: grant.capabilitySource,
				actions: new Set<string>(),
				allActions: false
			};
			if (grant.action) grouped.actions.add(grant.action);
			else grouped.allActions = true;
			grants.set(key, grouped);
		}
		for (const grant of grants.values()) {
			// A page grant addresses the screen the Experience context already owns,
			// and a behavior surface the `surface` node emitted above — so "who may
			// open this screen / this dialog" is a real edge either way.
			const to =
				grant.source === 'surface'
					? grant.capabilityId.startsWith(SCREEN_CAPABILITY_PREFIX)
						? nodeId('screen', grant.capabilityId.slice(SCREEN_CAPABILITY_PREFIX.length))
						: nodeId('surface', behaviorSurfaceId(grant.capabilityId) ?? grant.capabilityId)
					: nodeId(
							grant.source === 'feature'
								? 'feature'
								: grant.source === 'journey'
									? 'journey'
									: ('capability' satisfies GraphNodeKind),
							grant.capabilityId
						);
			g.addEdge({
				id: `e:grant:${grant.roleId}:${grant.capabilityId}`,
				from: nodeId('role', grant.roleId),
				to,
				kind: 'accesses',
				label: grant.allActions ? 'all actions' : [...grant.actions].join(', ') || undefined
			});
		}
	}

	// ── Features (core → family → feature) + roadmap releases ──────────────
	if (input.features) {
		for (const core of input.features.cores) {
			const cid = add('core', 'features', core.id, core.name || 'Core', trunc(core.description), {
				tone: core.tone
			});
			g.addEdge({ id: `e:proj-core:${core.id}`, from: root, to: cid, kind: 'contains' });
		}
		for (const fam of input.features.families) {
			add('family', 'features', fam.id, fam.name || 'Family', trunc(fam.description));
			const parent = fam.parentFamilyId
				? nodeId('family', fam.parentFamilyId)
				: nodeId('core', fam.coreId);
			g.addEdge({
				id: `e:fam:${fam.id}`,
				from: parent,
				to: nodeId('family', fam.id),
				kind: 'contains'
			});
		}
		const mvp = new Map(input.features.mvpAssignments.map((m) => [m.featureId, m.tier]));
		for (const feat of input.features.features) {
			const meta = mvp.has(feat.id) ? { mvp: mvp.get(feat.id) as string } : undefined;
			add('feature', 'features', feat.id, feat.name || 'Feature', trunc(feat.description), meta);
			const parent = feat.parentFamilyId
				? nodeId('family', feat.parentFamilyId)
				: nodeId('core', feat.coreId);
			g.addEdge({
				id: `e:feat:${feat.id}`,
				from: parent,
				to: nodeId('feature', feat.id),
				kind: 'contains'
			});
		}
		for (const rel of input.features.releases) {
			const rid = add('release', 'features', rel.id, rel.name || rel.version || 'Release', trunc(rel.description), {
				version: rel.version,
				weeks: `${rel.weekStart}-${rel.weekEnd}`
			});
			g.addEdge({ id: `e:proj-rel:${rel.id}`, from: root, to: rid, kind: 'contains' });
		}
		for (const ra of input.features.roadmapAssignments) {
			g.addEdge({
				id: `e:roadmap:${ra.featureId}:${ra.releaseId}`,
				from: nodeId('feature', ra.featureId),
				to: nodeId('release', ra.releaseId),
				kind: 'scheduled'
			});
		}
	}

	// ── Experience (journeys → steps → screens, components, templates) ──────
	if (input.experience) {
		const exp = input.experience;
		for (const tpl of exp.templates) {
			const templateId = add(
				'template',
				'experience',
				tpl.id,
				tpl.name || 'Template',
				trunc(tpl.description)
			);
			g.addEdge({ id: `e:proj-template:${tpl.id}`, from: root, to: templateId, kind: 'contains' });
		}
		for (const cmp of exp.components) {
			const componentId = add(
				'component',
				'experience',
				cmp.id,
				cmp.name || 'Component',
				trunc(cmp.description),
				{ color: cmp.color }
			);
			g.addEdge({ id: `e:proj-component:${cmp.id}`, from: root, to: componentId, kind: 'contains' });
		}
		for (const scr of exp.screens) {
			add('screen', 'experience', scr.id, scr.name || 'Screen', trunc(scr.description), {
				device: scr.device
			});
			if (scr.templateId) {
				g.addEdge({
					id: `e:scr-tpl:${scr.id}`,
					from: nodeId('screen', scr.id),
					to: nodeId('template', scr.templateId),
					kind: 'uses'
				});
			}
			if (scr.parentScreen) {
				g.addEdge({
					id: `e:scr-parent:${scr.id}`,
					from: nodeId('screen', scr.parentScreen),
					to: nodeId('screen', scr.id),
					kind: 'contains'
				});
			}
		}
		for (const jr of exp.journeys) {
			add('journey', 'experience', jr.id, jr.name || 'Journey', trunc(jr.description));
			// A journey sits under its Core (mirrored from features).
			g.addEdge({
				id: `e:core-journey:${jr.id}`,
				from: nodeId('core', jr.coreId),
				to: nodeId('journey', jr.id),
				kind: 'contains'
			});
			// Also anchor it to the project so orphan-core journeys still attach.
			g.addEdge({ id: `e:proj-journey:${jr.id}`, from: root, to: nodeId('journey', jr.id), kind: 'contains' });
			for (const roleId of jr.actorRoleIds) {
				g.addEdge({
					id: `e:perform:${roleId}:${jr.id}`,
					from: nodeId('role', roleId),
					to: nodeId('journey', jr.id),
					kind: 'performs'
				});
			}
		}
		const journeyNameById = new Map(exp.journeys.map((jr) => [jr.id, jr.name || 'Journey']));
		for (const st of exp.steps) {
			const journeyName = journeyNameById.get(st.journeyId);
			add(
				'step',
				'experience',
				st.id,
				st.name || 'Step',
				journeyName ? trunc(`${journeyName} · step ${st.order + 1}`) : undefined,
				{ order: st.order }
			);
			g.addEdge({
				id: `e:journey-step:${st.id}`,
				from: nodeId('journey', st.journeyId),
				to: nodeId('step', st.id),
				kind: 'contains'
			});
			if (st.linkedScreenId) {
				g.addEdge({
					id: `e:step-screen:${st.id}`,
					from: nodeId('step', st.id),
					to: nodeId('screen', st.linkedScreenId),
					kind: 'shows'
				});
			}
		}
		// Step → data entity (Data Consumed underlay), matched by entity name.
		const entityByName = new Map(
			(input.data?.entities ?? []).map((e) => [e.name.trim().toLowerCase(), e.id])
		);
		for (const dr of exp.stepDataReads) {
			const eid = entityByName.get(dr.entityName.trim().toLowerCase());
			if (eid) {
				g.addEdge({
					id: `e:read:${dr.id}`,
					from: nodeId('step', dr.stepId),
					to: nodeId('entity', eid),
					kind: dr.mode === 'write' ? 'writes' : 'reads',
					label: dr.mode
				});
				const entityFields = (input.data?.fields ?? []).filter((field) => field.entityId === eid);
				for (const fieldName of dr.fields) {
					const field = entityFields.find(
						(candidate) => candidate.name.trim().toLowerCase() === fieldName.trim().toLowerCase()
					);
					if (!field) continue;
					g.addEdge({
						id: `e:read-field:${dr.id}:${field.id}`,
						from: nodeId('step', dr.stepId),
						to: nodeId('field', field.id),
						kind: dr.mode === 'write' ? 'writes' : 'reads',
						label: fieldName
					});
				}
			}
		}
		for (const element of exp.elements) {
			const elementId = add(
				'element',
				'experience',
				element.id,
				element.name || 'Experience element',
				trunc(element.description)
			);
			g.addEdge({ id: `e:proj-element:${element.id}`, from: root, to: elementId, kind: 'contains' });
		}
		// Builder trees are owned by screens, reusable components, or templates.
		// Resolve that real owner once so component-library/template children do
		// not become floating nodes merely because their surface is not a screen.
		const surfaceOwnerId = (surfaceId: string): string | undefined =>
			[
				nodeId('screen', surfaceId),
				nodeId('component', surfaceId),
				nodeId('template', surfaceId)
			].find((candidate) => g.hasNode(candidate));

		// Component reuse: a builder node carrying a componentId means the surface
		// it lives on USES that component.
		for (const bn of Object.values(exp.builder?.nodes ?? {})) {
			const componentId = bn.componentId;
			const surfaceId = bn.surfaceId;
			const ownerId = surfaceId ? surfaceOwnerId(surfaceId) : undefined;
			if (bn.kind === 'element' && ownerId) {
				// "Back" alone is ambiguous eleven times over; anchor every element to
				// the surface it lives on so readers (and the MCP) can tell them apart.
				// `screenId` also lets the editor deep-link open the builder on the
				// owning surface (see `node-link.ts`).
				const owner = g.getNode(ownerId);
				const elementId = add(
					'element',
					'experience',
					bn.id,
					bn.label || bn.elementKind || 'Builder element',
					owner ? trunc(`${bn.elementKind || 'element'} on ${owner.label}`) : undefined,
					{
						...(bn.elementKind ? { kind: bn.elementKind } : {}),
						...(surfaceId ? { screenId: surfaceId } : {})
					}
				);
				g.addEdge({
					id: `e:surface-element:${surfaceId}:${bn.id}`,
					from: ownerId,
					to: elementId,
					kind: 'contains'
				});

				const binding = bn.wiring.binding;
				if (binding?.targetKind === 'surface') {
					g.addEdge({
						id: `e:element-surface:${bn.id}:${binding.targetRef}`,
						from: elementId,
						to: nodeId('screen', binding.targetRef),
						kind: 'transitions',
						label: 'binding'
					});
				} else if (binding?.targetKind === 'entity') {
					const entity = (input.data?.entities ?? []).find(
						(candidate) =>
							candidate.id === binding.targetRef ||
							candidate.name.trim().toLowerCase() === binding.targetRef.trim().toLowerCase()
					);
					if (entity) {
						g.addEdge({
							id: `e:element-entity:${bn.id}:${entity.id}`,
							from: elementId,
							to: nodeId('entity', entity.id),
							kind: 'reads',
							label: binding.targetRef
						});
					}
				}

				for (const transition of bn.wiring.transitions) {
					if (transition.effect.kind !== 'navigate' || !transition.effect.target) continue;
					g.addEdge({
						id: `e:element-navigation:${bn.id}:${transition.id}`,
						from: elementId,
						to: nodeId('screen', transition.effect.target),
						kind: 'transitions',
						label: transition.trigger
					});
				}
			}
			if (componentId && ownerId) {
				g.addEdge({
					id: `e:uses-cmp:${surfaceId}:${componentId}`,
					from: ownerId,
					to: nodeId('component', componentId),
					kind: 'uses'
				});
			}
		}
	}

	// ── Data (host → database → entity → field) ────────────────────────────
	if (input.data) {
		for (const host of input.data.hosts) {
			const hid = add('host', 'data', host.id, host.name || 'Host', trunc(host.description), {
				kind: host.kind,
				provider: host.provider
			});
			g.addEdge({ id: `e:proj-host:${host.id}`, from: root, to: hid, kind: 'contains' });
		}
		for (const db of input.data.databases) {
			add('database', 'data', db.id, db.name || 'Database', trunc(db.description), {
				engine: db.engine
			});
			g.addEdge({
				id: `e:host-db:${db.id}`,
				from: nodeId('host', db.hostId),
				to: nodeId('database', db.id),
				kind: 'contains'
			});
		}
		for (const ent of input.data.entities) {
			add('entity', 'data', ent.id, ent.name || 'Entity', trunc(ent.description), {
				origin: ent.derivedFrom
			});
			const parent = ent.databaseId ? nodeId('database', ent.databaseId) : root;
			g.addEdge({
				id: `e:db-entity:${ent.id}`,
				from: parent,
				to: nodeId('entity', ent.id),
				kind: 'contains'
			});
			if (ent.sourceRefId) {
				g.addEdge({
					id: `e:entity-source:${ent.id}:${ent.sourceRefId}`,
					from: nodeId('entity', ent.id),
					to: nodeId('journey', ent.sourceRefId),
					kind: 'derives',
					label: ent.derivedFrom
				});
			}
		}
		for (const f of input.data.fields) {
			add('field', 'data', f.id, f.name || 'field', f.type, {
				type: f.type,
				required: f.isRequired,
				id: f.isId
			});
			g.addEdge({
				id: `e:entity-field:${f.id}`,
				from: nodeId('entity', f.entityId),
				to: nodeId('field', f.id),
				kind: 'contains'
			});
			if (f.parentFieldId) {
				g.addEdge({
					id: `e:field-parent:${f.parentFieldId}:${f.id}`,
					from: nodeId('field', f.parentFieldId),
					to: nodeId('field', f.id),
					kind: 'contains'
				});
			}
			if (f.relationTargetEntityId) {
				g.addEdge({
					id: `e:relation:${f.id}`,
					from: nodeId('entity', f.entityId),
					to: nodeId('entity', f.relationTargetEntityId),
					kind: 'relates',
					label: f.name
				});
			}
		}
		for (const item of input.data.interfaces) {
			const interfaceId = add(
				'interface',
				'data',
				item.id,
				item.operation || 'Interface',
				trunc(item.description) ??
					trunc(`${item.protocol.toUpperCase()} ${item.fromBrick || '?'} → ${item.toBrick || '?'}`),
				{ protocol: item.protocol, from: item.fromBrick, to: item.toBrick }
			);
			g.addEdge({ id: `e:proj-interface:${item.id}`, from: root, to: interfaceId, kind: 'contains' });
		}
	}

	// ── Rules (consolidated inventory) ─────────────────────────────────────
	if (input.rules) {
		for (const issue of input.rules.issues) {
			const issueId = add(
				'issue',
				'rules',
				issue.id,
				issue.title || 'Rule issue',
				trunc(issue.detail),
				{ severity: issue.severity, status: issue.status, kind: issue.kind }
			);
			g.addEdge({ id: `e:proj-issue:${issue.id}`, from: root, to: issueId, kind: 'contains' });
			for (const [kind, ref] of [
				['role', issue.ownerRoleId],
				['feature', issue.relatedFeatureId],
				['journey', issue.relatedJourneyId]
			] as const) {
				if (!ref) continue;
				g.addEdge({
					id: `e:issue-ref:${issue.id}:${kind}:${ref}`,
					from: issueId,
					to: nodeId(kind, ref),
					kind: 'flags'
				});
			}
		}
		for (const scenario of input.rules.scenarios) {
			const scenarioId = add(
				'scenario',
				'rules',
				scenario.id,
				scenario.title || 'Scenario',
				trunc(`${scenario.given} → ${scenario.whenText} → ${scenario.then}`),
				{ outcome: scenario.expectedOutcome, covered: scenario.covered }
			);
			g.addEdge({ id: `e:proj-scenario:${scenario.id}`, from: root, to: scenarioId, kind: 'contains' });
			if (scenario.relatedIssueId) {
				g.addEdge({
					id: `e:scenario-issue:${scenario.id}:${scenario.relatedIssueId}`,
					from: scenarioId,
					to: nodeId('issue', scenario.relatedIssueId),
					kind: 'tests'
				});
			}
			if (scenario.relatedJourneyId) {
				g.addEdge({
					id: `e:scenario-journey:${scenario.id}:${scenario.relatedJourneyId}`,
					from: scenarioId,
					to: nodeId('journey', scenario.relatedJourneyId),
					kind: 'tests'
				});
			}
		}
		for (const rule of input.rules.inventory) {
			// Nest each rule under the artefact it governs — a feature, journey,
			// entity, capability or role — so it sits on that node instead of piling
			// onto the project root. The bulk are permission grants (one per
			// role×capability) whose `sourceRefId` is a capability id; those now hang
			// off their capability. Only rules with no concrete home (definition rules,
			// SLAs, security policies — synthetic source paths) fall back to the root.
			const owner =
				[
					nodeId('feature', rule.sourceRefId),
					nodeId('journey', rule.sourceRefId),
					nodeId('entity', rule.sourceRefId),
					nodeId('capability', rule.sourceRefId),
					nodeId('role', rule.sourceRefId)
				].find((id) => g.hasNode(id)) ?? root;
			// Once nested, a trailing "· <parent>" in the label (e.g. a permission
			// rule's "… · Export returns & refund reports") just repeats the node it
			// hangs off — drop it so the graph reads cleanly. The flat Step-06 list
			// keeps the full label, so only strip here.
			add('rule', 'rules', rule.id, stripOwnerSuffix(rule.label || 'Rule', g.getNode(owner)?.label), trunc(rule.statement), {
				category: rule.category,
				mandatory: rule.mandatory
			});
			g.addEdge({ id: `e:proj-rule:${rule.id}`, from: owner, to: nodeId('rule', rule.id), kind: 'contains' });
		}
	}

	// ── Architecture (tech choices) ────────────────────────────────────────
	if (input.architecture) {
		for (const doc of input.architecture.referenceDocs) {
			const docId = add(
				'referenceDoc',
				'architecture',
				doc.id,
				doc.title || 'Reference document',
				trunc(doc.description),
				{ kind: doc.kind }
			);
			g.addEdge({ id: `e:proj-reference:${doc.id}`, from: root, to: docId, kind: 'contains' });
		}
		for (const tc of input.architecture.techChoices) {
			add('tech', 'architecture', tc.id, tc.name || 'Tech', trunc(tc.role), {
				layer: tc.layer,
				version: tc.version
			});
			g.addEdge({ id: `e:proj-tech:${tc.id}`, from: root, to: nodeId('tech', tc.id), kind: 'contains' });
			if (tc.referenceDocId) {
				g.addEdge({
					id: `e:tech-reference:${tc.id}:${tc.referenceDocId}`,
					from: nodeId('tech', tc.id),
					to: nodeId('referenceDoc', tc.referenceDocId),
					kind: 'uses'
				});
			}
		}
		for (const constraint of input.architecture.constraints) {
			const constraintId = add(
				'constraint',
				'architecture',
				constraint.id,
				constraint.title || 'Architecture constraint',
				trunc(constraint.detail),
				{ category: constraint.category }
			);
			g.addEdge({ id: `e:proj-constraint:${constraint.id}`, from: root, to: constraintId, kind: 'contains' });
		}
	}

	// ── Coherence overlay (gaps flag the context they live in) ─────────────
	// A gap carrying a `featureRef` (e.g. a per-feature behavior advisory) hangs off
	// that feature node, so the flag sits on the thing it's about instead of piling
	// onto the project root. Falls back to the root when the feature isn't in the
	// graph (or the gap is project-wide).
	for (const gap of input.gaps ?? []) {
		add('gap', 'coherence', gap.id, gap.title || 'Gap', trunc(gap.detail), {
			severity: gap.severity,
			blocking: gap.blocking,
			step: gap.sourceStep
		});
		const featureNode = gap.featureRef ? nodeId('feature', gap.featureRef) : undefined;
		const from = featureNode && g.hasNode(featureNode) ? featureNode : root;
		g.addEdge({ id: `e:gap:${gap.id}`, from, to: nodeId('gap', gap.id), kind: 'flags' });
	}

	return g.build(projectId, input.generatedAt);
}
