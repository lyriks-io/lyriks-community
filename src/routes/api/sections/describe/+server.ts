import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { SECTION_ITEM_SCHEMAS } from '$application/section-authoring-schema';
import {
	ALL_FORM_FACTORS,
	ALL_RULE_PATTERN_CODES,
	API_KINDS,
	AUDIT_LOG_LEVELS,
	AUTH_MECHANISMS,
	AVAILABILITY_LEVELS,
	BUSINESS_MODELS,
	CERTIFICATIONS,
	COMPATIBILITIES,
	CRITICALITY_LEVELS,
	CUSTOMER_SIZES,
	ENCRYPTION_SCOPES,
	FEATURE_EXPRESSION_MODES,
	FOUNDATION_ALTITUDE_RULE,
	INDUSTRIES,
	INDUSTRY_SECTORS,
	INTEGRATION_DIRECTIONS,
	KPI_UNITS,
	LANGUAGES,
	MARKET_TYPES,
	PERFORMANCE_UNITS,
	PRODUCT_TYPES,
	PROJECT_MODES,
	REGULATIONS,
	RETENTION_ACTIONS,
	RULE_FAMILIES,
	SOURCE_MODES,
	UI_STATE_KEYS
} from '$domain/foundation';
import {
	ACTIVE_PERMISSION_ACTIONS,
	CAPABILITY_SOURCES,
	ROLE_TONES,
	SYSTEM_CAPABILITIES
} from '$domain/users';
import { CORE_TONES, MVP_TIERS } from '$domain/features';
import { AUTHORIZATION_MODELS } from '$domain/foundation';
import { EDGE_OUTCOMES, ISSUE_KINDS, ISSUE_SEVERITIES, ISSUE_STATUSES } from '$domain/rules';
import { DB_ENGINES, FIELD_TYPES, HOST_KINDS, HOST_REGIONS, PROTOCOLS } from '$domain/data';
import { ARCH_LAYERS, CONSTRAINT_CATEGORIES } from '$domain/architecture';
import {
	BUILDER_ELEMENT_KINDS,
	LIST_ROW_LAYOUTS,
	DATA_MODES,
	DEVICES,
	GATE_MODES,
	GROUP_PRESENTATIONS,
	OPERATION_KINDS,
	SIM_THEME_PRESETS,
	STATUS_VARIANTS,
	TRANSITION_EFFECTS,
	TRANSITION_TRIGGERS,
	VALIDATION_KINDS
} from '$domain/experience';
import { GLOSSARY_LOCALES, GLOSSARY_STATUSES } from '$domain/glossary';
import {
	ASSIGNMENT_STATUSES,
	DECISION_AREAS,
	POLICY_CATEGORIES,
	POLICY_STATUSES,
	SCOPE_TYPES
} from '$domain/supervision';
import { FLAG_DEFAULTS, MIGRATION_STRATEGIES } from '$domain/foundation';
import { ENFORCEMENT_MODES, RULE_KINDS, RULE_SOURCES, RULE_STATUSES } from '$domain/finops';
import { APPROVAL_AREAS, APPROVAL_STATUSES } from '$domain/approvals';
import { DOCUMENT_KINDS } from '$domain/documents';
import {
	CAPABILITY_DISPOSITIONS,
	SCOPE_MODES,
	SECTION_APPLICABILITIES,
	SECTION_ASSESSMENT_STATUSES
} from '$domain/scope';
import { PROTOTYPE_ICON_NAMES } from '$lib/ui/icons/prototype-icons';
import {
	SECTIONS,
	SECTION_AUDIENCE,
	isAgentAuthorable,
	isSection,
	type Section
} from '$lib/shared/sections';
import type { RequestHandler } from './$types';

/**
 * Schema-of-a-section surface for the Lyriks MCP `describe_section` tool — so an
 * agent can author a section WITHOUT first reading a populated reference project.
 * Returns the empty-draft shape (every field + default, fetched live from the
 * section's own load use-case so it never drifts), plus curated enum codes,
 * sample collection items, and authoring notes for the high-signal sections.
 *
 *   GET /api/sections/describe?section=<key>
 *     -> { section, uiLocation, emptyDraft, itemSchemas, enums, samples, authoring }
 */
export const GET: RequestHandler = async ({ url }) => {
	const section = url.searchParams.get('section') ?? '';
	if (!isSection(section)) {
		error(400, `unknown section "${section}". Valid: ${SECTIONS.join(', ')}`);
	}

	const s = getServices();
	// A throwaway projectId yields the section's empty draft — the field skeleton
	// + defaults — without creating or mutating anything.
	const emptyDraft = await loadSection(s, section, '__describe__');

	return json({
		section,
		audience: SECTION_AUDIENCE[section],
		// The single machine-readable answer to "should I write this?". Read it
		// before authoring: a `false` section is someone else's data, and the
		// completion gate never asks an agent for it.
		agentAuthorable: isAgentAuthorable(section),
		uiLocation: UI_LOCATION[section],
		emptyDraft,
		itemSchemas: SECTION_ITEM_SCHEMAS[section as keyof typeof SECTION_ITEM_SCHEMAS] ?? {},
		enums: ENUMS[section] ?? {},
		samples: SAMPLES[section] ?? {},
		authoring: AUTHORING[section]
	});
};

async function loadSection(
	s: ReturnType<typeof getServices>,
	section: Section,
	projectId: string
): Promise<unknown> {
	switch (section) {
		case 'scope':
			return s.loadScopeDraft.execute(projectId);
		case 'foundation':
			return s.loadFoundationDraft.execute(projectId);
		case 'users':
			return s.loadUsersDraft.execute(projectId);
		case 'features':
			return s.loadFeaturesDraft.execute(projectId);
		case 'experience':
			return s.loadExperienceDraft.execute(projectId);
		case 'rules':
			return s.loadRulesDraft.execute(projectId);
		case 'data':
			return s.loadDataDraft.execute(projectId);
		case 'architecture':
			return s.loadArchitectureDraft.execute(projectId);
		case 'coherence':
			return s.loadCoherenceDraft.execute(projectId);
		case 'glossary':
			return s.loadGlossaryDraft.execute(projectId);
		case 'supervision':
			return s.loadSupervisionDraft.execute(projectId);
		case 'finops':
			return s.loadFinopsDraft.execute(projectId);
		case 'approvals':
			return s.loadApprovalsDraft.execute(projectId);
		case 'baselines':
			return s.loadBaselinesDraft.execute(projectId);
		case 'documents':
			return s.loadDocumentRegister.execute(projectId);
	}
}

/**
 * Where each section is edited in the app — the capability (and tab) whose
 * label the author actually reads on screen.
 *
 * Public section ids match the current information architecture. Some internal
 * persistence keys predate it, but adapters keep that migration detail behind
 * the single Foundation document. Without this map an agent has
 * to GUESS the mapping from a screenshot, and it guesses wrong. Keep it in step
 * with the capability registry (`$ui/shell/capabilities`) and the page tabs.
 */
const UI_LOCATION: Record<Section, string> = {
	scope:
		'No UI — the scope ledger is agent-authored and is not shown anywhere in the product. Drive it through this API and the completion tools; never tell a user to open a page for it.',
	foundation:
		'Foundation — five tabs, three of them with a second-level nav: Brief (identity, raw idea, form factor) · ' +
		'Business (Objective | Requirements → Business/Technical/Security sub-areas | Competition, which also hosts the Market segment card) · ' +
		'Technical (Runtime | Integrations & APIs | Performance | Custom) · Security (Access | Data protection | Compliance | Custom) · ' +
		'Ops (i18n & locales | Quality budgets | UI states | Migration | Test fixtures). ' +
		'`definition.market` is edited on Business › Competition, not on a tab of its own.',
	users: 'Users & Permissions → Personas and Access matrix tabs',
	features: 'Features → Tree, Roadmap and Work queue tabs',
	experience: 'Experience (journeys, screens, components, live prototype)',
	rules: 'Features → Rules tab (inventory, conflicts, edge cases)',
	data: 'Data & Architecture → hosts, databases, entities and fields',
	architecture: 'Data & Architecture → Architecture & Constraints (stack board, constraints)',
	coherence: 'Project health (coverage, coherence, readiness, maturity) — derived, read-only',
	glossary: 'Glossary',
	supervision: 'Supervision (assignments, AI policy, AI Gateway tab)',
	finops: 'AI Cost Governor, embedded in Supervision → AI Gateway tab',
	approvals: 'Traceability → Approvals tab',
	baselines: 'Traceability → Baselines tab',
	documents: 'Documents & Sources — the project evidence register'
};

/** Project a domain `Option[]` vocabulary onto its persisted codes. */
const codes = (options: readonly { code: string }[]): string[] => options.map((o) => o.code);

/** Allowed code values for the enum-bearing fields of each section. */
const ENUMS: Partial<Record<Section, Record<string, string[]>>> = {
	scope: {
		mode: [...SCOPE_MODES],
		'capabilities.disposition': [...CAPABILITY_DISPOSITIONS],
		'sectionAssessments.applicability': [...SECTION_APPLICABILITIES],
		'sectionAssessments.status': [...SECTION_ASSESSMENT_STATUSES]
	},
	// industry / productType / marketType accept any custom string on top of the
	// built-in catalogs, so their catalogs are listed as suggestions, not as
	// closed enums — an unlisted value is kept verbatim.
	foundation: {
		'identity.industry (catalog — any custom string accepted)': codes(INDUSTRIES),
		'identity.productType (catalog — any custom string accepted)': codes(PRODUCT_TYPES),
		'identity.formFactors': codes(ALL_FORM_FACTORS),
		'identity.featureExpressionMode': codes(FEATURE_EXPRESSION_MODES),
		'identity.structuredRuleFormat': [...ALL_RULE_PATTERN_CODES],
		'identity.activatedPatterns': [...ALL_RULE_PATTERN_CODES],
		'identity.ruleFamilyDefaults (keys)': codes(RULE_FAMILIES),
		'identity.sourceMode': codes(SOURCE_MODES),
		'identity.projectMode': codes(PROJECT_MODES),
		'definition.businessObjective.kpis.unit (suggestions — any short unit accepted)': [...KPI_UNITS],
		'definition.market.marketType (catalog — any custom string accepted)': codes(MARKET_TYPES),
		'definition.market.customerSize': codes(CUSTOMER_SIZES),
		'definition.market.industrySectors': [...INDUSTRY_SECTORS],
		'definition.market.languages': codes(LANGUAGES),
		'definition.market.regulations': codes(REGULATIONS),
		'definition.competition.businessModels (suggestions — custom accepted)': [...BUSINESS_MODELS],
		'definition.technical.compatibilities': [...COMPATIBILITIES],
		'definition.technical.integrations.direction': codes(INTEGRATION_DIRECTIONS),
		'definition.technical.integrations.criticality': codes(CRITICALITY_LEVELS),
		'definition.technical.apisExpose / apisConsume': codes(API_KINDS),
		'definition.technical.performance.unit': codes(PERFORMANCE_UNITS),
		'definition.technical.availability': [...AVAILABILITY_LEVELS],
		'definition.security.authentication': codes(AUTH_MECHANISMS),
		'definition.security.authorization': codes(AUTHORIZATION_MODELS),
		'definition.security.encryption': codes(ENCRYPTION_SCOPES),
		'definition.security.auditLogs': codes(AUDIT_LOG_LEVELS),
		'definition.security.expectedCertifications': codes(CERTIFICATIONS),
		'definition.security.dataRetention.actionAfter': codes(RETENTION_ACTIONS),
		'operations.migration.strategy': codes(MIGRATION_STRATEGIES),
		'operations.migration.flagsExpected.default': codes(FLAG_DEFAULTS),
		'operations.screenStates (keys of each screen record)': [...UI_STATE_KEYS]
	},
	users: {
		'roles.tone': codes(ROLE_TONES),
		'permissions.capabilitySource': codes(CAPABILITY_SOURCES),
		'permissions.action': ACTIVE_PERMISSION_ACTIONS.map((a) => `${a.code} — ${a.hint}`),
		// The built-in system-capability catalog — every one of these ids must end
		// up granted to ≥1 role or the coherence score reports it ungranted. Listed
		// here so authors can fill the matrix without hunting for the ids.
		'permissions.capabilityId (system catalog)': SYSTEM_CAPABILITIES.map((c) => `${c.id} — ${c.label}`)
	},
	features: {
		'cores.tone': codes(CORE_TONES),
		'mvpAssignments.tier': codes(MVP_TIERS),
		'leafMeta.<featureId>.status': ['backlog', 'in-progress', 'done'],
		'leafMeta.<featureId>.trl (manual readiness override, 1-9 — leave unset to derive from the engine maturity score)':
			['1', '2', '3', '4', '5', '6', '7', '8', '9'],
		'assignments.kind (work queue — team data, see authoring)': ['core', 'feature', 'action'],
		'assignments.status (core/action targets only — feature targets derive from leafMeta.status)': [
			'todo',
			'in-progress',
			'done'
		]
	},
	rules: {
		'issues.kind': codes(ISSUE_KINDS),
		'issues.severity': codes(ISSUE_SEVERITIES),
		'issues.status': codes(ISSUE_STATUSES),
		'scenarios.expectedOutcome': codes(EDGE_OUTCOMES)
	},
	data: {
		'fields.type': codes(FIELD_TYPES),
		'fields.enumValues': ['<the allowed members when type is "enum", e.g. free|premium|family>'],
		'databases.engine': codes(DB_ENGINES),
		'hosts.kind': codes(HOST_KINDS),
		'hosts.region (ignored for on-prem — the customer site)': [...HOST_REGIONS],
		'entities.derivedFrom (how the entity entered the model — author "manual")': [
			'manual',
			'journey',
			'feature'
		],
		'visibility.<entityId|fieldId> (explicit client-visibility override; absent ⇒ follow the experience)':
			['shown', 'hidden'],
		'interfaces.protocol': codes(PROTOCOLS)
	},
	architecture: {
		'techChoices.layer': codes(ARCH_LAYERS),
		'constraints.category': codes(CONSTRAINT_CATEGORIES)
	},
	experience: {
		'screens.device': codes(DEVICES),
		'builder element kinds': codes(BUILDER_ELEMENT_KINDS),
		'status variant': codes(STATUS_VARIANTS),
		// `variant` is a free-form string in the domain (builder.ts) interpreted
		// by the renderer (NodeRenderer.svelte) — no closed constant exists, so
		// the recognised values are listed literally here.
		'text variant': ['pill'],
		'meter variant': ['bar', 'ring'],
		'builder.theme.preset': Object.keys(SIM_THEME_PRESETS),
		'icon names (el:"icon" labels — bundled lucide subset)': [...PROTOTYPE_ICON_NAMES],
		'group presentation': codes(GROUP_PRESENTATIONS),
		'list row layout': codes(LIST_ROW_LAYOUTS),
		// Type-only unions in $domain/experience/builder.ts (ElementWidth,
		// ElementAppearance, ElementImageFit, AssertOp) — listed literally.
		'element appearance.width': ['auto', 'full', 'fit'],
		'element appearance.align': ['auto', 'start', 'center', 'end', 'stretch'],
		'element appearance.textAlign': ['left', 'center', 'right'],
		'element media.fit': ['cover', 'contain', 'fill'],
		'transition trigger': codes(TRANSITION_TRIGGERS),
		// The `on[]` AUTHORING key is the effect name itself —
		// `{trigger:'click', setState:['path','value']}`. `toggle`/`increment` are
		// the authoring keys for the stored `toggleState`/`incrementState` kinds;
		// build_screen accepts either spelling and rejects anything else.
		'transition effect key (build_screen / wire_element `on[]`)': [
			'navigate',
			'setState',
			'toggle',
			'increment',
			'createRecord',
			'selectRecord',
			'navigateBack',
			'print',
			'call'
		],
		'transition effect kind (as STORED in builder.nodes)': codes(TRANSITION_EFFECTS),
		'visibility op': ['eq', 'neq', 'truthy', 'falsy'],
		'input validation kind': codes(VALIDATION_KINDS),
		'element gate mode': codes(GATE_MODES),
		'stepOperations.kind': codes(OPERATION_KINDS),
		'stepDataReads.mode': codes(DATA_MODES)
	},
	glossary: {
		'terms.locale': codes(GLOSSARY_LOCALES),
		'terms.status': codes(GLOSSARY_STATUSES)
	},
	supervision: {
		'assignments.scopeType': codes(SCOPE_TYPES),
		'assignments.status': codes(ASSIGNMENT_STATUSES),
		'policyRules.category': codes(POLICY_CATEGORIES),
		'policyRules.status': codes(POLICY_STATUSES),
		'decisions.area': codes(DECISION_AREAS),
		// GatewayStatus is a type-only union in $domain/supervision/enums.ts.
		'gatewayAudit.status': ['ok', 'blocked', 'flagged']
	},
	finops: {
		enforcementMode: codes(ENFORCEMENT_MODES),
		'rules.kind': codes(RULE_KINDS),
		'rules.status': codes(RULE_STATUSES),
		'rules.source': codes(RULE_SOURCES)
	},
	approvals: {
		'items.status': codes(APPROVAL_STATUSES),
		// The catalog aligned with the nav's Specify group — `area` also accepts
		// any custom string (unknown values fall back to "Whole specification"
		// only when empty/non-string).
		'items.area (catalog — any custom string accepted)': [...APPROVAL_AREAS]
	},
	documents: {
		'sources.kind': codes(DOCUMENT_KINDS)
	}
};

/** One filled example per collection so array-item fields are visible. */
const SAMPLES: Partial<Record<Section, Record<string, unknown>>> = {
	scope: {
		capabilities: {
			id: 'scope-send-message',
			name: 'Send a message',
			description: 'A member composes and sends one message.',
			sourceIds: ['source-product-brief'],
			featureIds: ['feat-send'],
			disposition: 'included',
			rationale: '',
			approvalId: null
		},
		'capabilities (approved deferral)': {
			id: 'scope-voice',
			name: 'Voice input',
			description: 'Compose a message by speaking.',
			sourceIds: ['source-product-brief'],
			featureIds: [],
			disposition: 'deferred',
			rationale: 'Scheduled for the next release.',
			approvalId: 'approval-voice-deferral'
		},
		sectionAssessments: {
			section: 'users',
			applicability: 'required',
			status: 'ready',
			rationale: 'Personas and permissions cover every included capability.',
			approvalId: null
		}
	},
	users: {
		roles: {
			id: 'role-admin',
			name: 'Workspace Admin',
			description: 'Manages members and billing.',
			userCountMin: 1,
			userCountMax: 20,
			tone: 'admin'
		},
		offStructureCapabilities: {
			id: 'cap-export',
			label: 'Export workspace data',
			note: null
		},
		permissions: {
			roleId: 'role-admin',
			capabilityId: 'edit_permissions',
			capabilitySource: 'system',
			action: 'update'
		}
	},
	features: {
		cores: { id: 'core-chat', name: 'Conversational Chat', description: 'Ask anything.', tone: 'customer' },
		families: {
			id: 'family-compose',
			name: 'Composition',
			coreId: 'core-chat',
			parentFamilyId: null,
			description: 'Message composition capabilities.'
		},
		features: {
			id: 'feat-send',
			name: 'Send a message',
			coreId: 'core-chat',
			parentFamilyId: null,
			description: 'Type and send.',
			unspaghettitFeatureId: 'feat-send'
		},
		mvpAssignments: { featureId: 'feat-send', tier: 'must' },
		'leafMeta (keyed by LEAF FEATURE ID — the drawer behind each leaf; every field optional)': {
			'feat-send': {
				status: 'backlog',
				objective: 'Let a member get an answer without leaving the thread.',
				problem: 'Answers are copy-pasted from another tool.',
				expectedEffect: 'Time-to-first-answer drops below 30s.',
				value: 'Retention of new members in week 1.',
				acceptanceCriteria: [
					{ id: 'ac-send-1', text: 'An empty message cannot be sent.' },
					{ id: 'ac-send-2', text: 'The reply appears in the same thread.' }
				],
				dependsOn: ['feat-thread'],
				sourceIds: ['src-product-brief']
			}
		},
		'releases (archivedAt optional: the explicit ship stamp; "done" derives from feature statuses)': {
			id: 'release-v1',
			name: 'First release',
			version: '1.0.0',
			weekStart: 1,
			weekEnd: 6,
			order: 0,
			description: 'Initial production scope.'
		},
		roadmapAssignments: { featureId: 'feat-send', releaseId: 'release-v1' },
		'sprints (archivedAt optional: the explicit close stamp, set via apply_roadmap_batch)': {
			id: 'sprint-1',
			name: 'Sprint 1',
			startDate: '2026-01-05',
			endDate: '2026-01-16',
			order: 0
		}
	},
	rules: {
		issues: {
			id: 'issue-rate-limit',
			kind: 'missing_rule',
			title: 'Rate limit is unspecified',
			detail: 'The send action has no declared request limit.',
			severity: 'major',
			status: 'open',
			ownerRoleId: null,
			resolutionNote: '',
			relatedRuleIds: [],
			relatedFeatureId: 'feat-send',
			relatedJourneyId: null,
			autoDetected: false
		},
		scenarios: {
			id: 'edge-empty-message',
			title: 'Empty message',
			given: 'The composer is empty',
			whenText: 'The member submits the form',
			then: 'The message is not sent and validation is shown',
			expectedOutcome: 'blocked',
			relatedIssueId: null,
			relatedJourneyId: 'journey-chat',
			covered: true
		}
	},
	data: {
		hosts: {
			id: 'host-main',
			name: 'Primary host',
			kind: 'onprem',
			provider: '',
			region: '',
			description: 'Customer-managed appliance.'
		},
		databases: {
			id: 'db-core',
			hostId: 'host-main',
			name: 'Core database',
			engine: 'postgres',
			description: 'Transactional product data.'
		},
		entities: {
			id: 'entity-msg',
			name: 'Message',
			databaseId: 'db-core',
			description: 'One chat turn.',
			derivedFrom: 'manual',
			sourceRefId: null
		},
		fields: {
			id: 'f-msg-content',
			entityId: 'entity-msg',
			name: 'content',
			type: 'string',
			isId: false,
			isUnique: false,
			isRequired: true,
			isList: false,
			defaultValue: '',
			relationTargetEntityId: null
		},
		'fields (enum with declared members — the simulator seeds rows from enumValues)': {
			id: 'f-user-plan',
			entityId: 'entity-user',
			name: 'plan',
			type: 'enum',
			enumValues: ['free', 'premium', 'family'],
			isId: false,
			isUnique: false,
			isRequired: true,
			isList: false,
			defaultValue: 'free',
			relationTargetEntityId: null
		},
		interfaces: {
			id: 'interface-api',
			protocol: 'rest',
			fromBrick: 'web',
			toBrick: 'api',
			operation: 'POST /messages',
			description: 'Submit a new message.'
		}
	},
	architecture: {
		techChoices: {
			id: 'tech-sveltekit',
			layer: 'frontend',
			name: 'SvelteKit',
			role: 'Web application',
			version: '2',
			referenceDocId: 'doc-sveltekit',
			description: 'Server-rendered application framework.'
		},
		sourceIds: ['doc-sveltekit'],
		constraints: {
			id: 'constraint-airgap',
			title: 'Air-gapped runtime',
			detail: 'The deployed appliance performs no default runtime egress.',
			category: 'compliance'
		}
	},
	experience: {
		journeys: {
			id: 'journey-chat',
			coreId: 'core-chat',
			name: 'Ask',
			description: 'A member asks a question.',
			order: 0,
			actorRoleIds: ['role-free']
		},
		steps: {
			id: 'step-chat-1',
			journeyId: 'journey-chat',
			name: 'Send',
			order: 0,
			linkedScreenId: 'scr-chat'
		},
		'stepOperations (what a step DOES under the hood — feeds step-depth coherence)': {
			id: 'op-send',
			stepId: 'step-chat-1',
			order: 0,
			kind: 'api',
			label: 'POST /messages'
		},
		'stepDataReads (which entity fields a step reads/writes — feeds entity coverage)': {
			id: 'read-history',
			stepId: 'step-chat-1',
			order: 0,
			entityName: 'Message',
			mode: 'read',
			fields: ['content', 'createdAt']
		},
		'builder.stateSeeds (initial run state — values are STRINGS, coerced at run time)': {
			path: 'chat.hasReply',
			value: 'false'
		},
		screens: {
			id: 'scr-chat',
			name: 'Chat',
			templateId: null,
			description: 'The chat workspace.',
			category: 'core-chat',
			parentScreen: null,
			path: '/chat',
			device: 'auto',
			deviceW: 1280,
			deviceH: 832
		},
		components: { id: 'cmp-sidebar', name: 'Sidebar', description: 'Reused nav.', color: 'violet' },
		'build_screen layout (compact spec → builder nodes)': {
			label: 'Root',
			direction: 'col',
			gap: 3,
			padding: 4,
			children: [
				{ el: 'image', label: 'Product hero' },
				{ el: 'heading', label: 'Title' },
				{
					el: 'list',
					label: 'History',
					bind: { kind: 'entity', ref: 'Message' }
				},
				{
					el: 'button',
					label: 'Send',
					variant: 'primary',
					on: [{ trigger: 'click', call: { label: 'Reply', loadingPath: 'chat.sending', resultPath: 'chat.hasReply', resultValue: 'true', latencyMs: 1000 } }]
				},
				{
					el: 'button',
					label: 'Moderate',
					gate: { personaIds: ['role-admin'], mode: 'visible', allow: true }
				}
			]
		},
		'list bound to a collection (bind kind "entity" = ITERATE the named simulator collection; rows show its first two fields, or set componentId for a full row template where labels interpolate {Field})': {
			el: 'list',
			label: 'Tracks',
			bind: { kind: 'entity', ref: 'Track' },
			componentId: 'cmp-track-row',
			filterStatePath: 'search.query',
			rowLayout: 'cards',
			rowColumns: 3
		},
		'PER-ROW ACTIONS — author them INSIDE the row-template component; every element there acts on the row it is rendered in': {
			note: 'build_screen the component cmp-app-row, then bind the list to it via componentId',
			layout: {
				label: 'App row',
				direction: 'row',
				children: [
					{ el: 'text', label: '{name} — {category}' },
					{ el: 'checkbox', label: 'Select' },
					{
						el: 'button',
						label: 'Connect this app',
						on: [
							{ trigger: 'click', selectRecord: 'catalog.app' },
							{ trigger: 'click', setState: ['catalog.appName', '{name}'] },
							{ trigger: 'click', navigate: 'scr-authorize' }
						]
					}
				]
			}
		},
		'dependent select (choices read live from a collection, narrowed by another state value)': {
			el: 'select',
			label: 'Connection',
			bind: { kind: 'state', ref: 'editor.connection' },
			optionsFrom: { collection: 'Connection', field: 'name', filterField: 'app', filterPath: 'editor.app' }
		},
		'patch_section element appearance/media': {
			operations: [
				{
					op: 'set',
					path: 'builder.nodes.<imageNodeId>.media',
					value: { src: '/assets/product-hero.png', alt: 'Product overview', fit: 'cover', aspectRatio: '16 / 9' }
				},
				{
					op: 'set',
					path: 'builder.nodes.<imageNodeId>.appearance',
					value: { width: 'full', radius: 16, shadow: true }
				},
				{
					op: 'set',
					path: 'builder.nodes.<headingNodeId>.appearance',
					value: { fontSize: 32, fontWeight: 800, color: '#111827' }
				}
			]
		}
	},
	glossary: {
		terms: {
			id: 'term-conversation',
			term: 'Conversation',
			definition: 'One thread of user/AI exchanges.',
			synonymsAllowed: ['thread'],
			synonymsAvoid: ['chat', 'discussion'],
			example: 'Rename the conversation from its context menu.',
			locale: 'en',
			status: 'approved'
		}
	},
	supervision: {
		assignments: {
			id: 'asg-checkout',
			assignee: 'Aline',
			scopeType: 'core',
			scopeLabel: 'Checkout',
			status: 'doing',
			progress: 30,
			dueInDays: 3,
			updatedAt: 'just now'
		},
		policyRules: {
			id: 'pol-no-pii',
			category: 'data',
			label: 'No PII in prompts',
			status: 'ok',
			detail: 'Prompts are scrubbed before leaving the gateway.'
		},
		decisions: {
			id: 'dec-postgres',
			title: 'PostgreSQL for appliance persistence',
			rationale: 'One durable datastore across standalone and horizontally scaled profiles.',
			by: 'Aline',
			area: 'infrastructure',
			when: 'just now'
		}
	},
	foundation: {
		// Every sample below is deliberately written at BUSINESS altitude — copy the
		// register, not just the shape. The "rejected" entries are the exact mistake
		// the write guard answers 400 on.
		'definition.businessObjective (the bet — pain → outcome → numbers)': {
			mainProblem:
				'Finance teams re-key every supplier invoice by hand, so payment runs slip and discounts are lost.',
			painPointLinks: [
				{ id: 'pain-rekeying', text: 'Manual re-keying of invoices', roleIds: ['role-ap-clerk'] }
			],
			expectedOutcome: 'Invoices are approved in under 48h with no manual re-keying.',
			kpis: [{ name: 'Days sales outstanding', currentValue: 54, targetValue: 32, unit: 'days' }],
			successCriteria: ['DSO down from 54 to 32 days within two quarters'],
			failureCriteria: ['Fewer than 10% of invoices flow through the product after 3 months'],
			sourceIds: ['src-cfo-interview']
		},
		'definition.businessObjective.successCriteria / failureCriteria — REJECTED entries (feature rules, not business signals)':
			[
				'Given an overdue invoice, when 30 days pass, then a reminder is sent',
				'The user must be able to filter invoices by status',
				'The system shall validate the invoice number format',
				'Clicking the Approve button marks the invoice as paid'
			],
		'definition.market': {
			marketType: 'b2b',
			customerSize: ['mid_market', 'enterprise'],
			industrySectors: ['Finance → Payments'],
			languages: ['en', 'fr'],
			regulations: ['GDPR', 'SOC2'],
			sourceIds: ['src-market-study']
		},
		'definition.competition': {
			directCompetitors: [
				{
					name: 'Yooz',
					logoUrl: null,
					strengths: ['Established ERP connectors'],
					weaknesses: ['Slow onboarding']
				}
			],
			indirectCompetitors: ['Excel + shared mailbox'],
			businessModels: ['SaaS'],
			differentiators: ['Approves without leaving the ERP'],
			claimedCategory: 'Invoice-to-cash automation',
			positioning: 'The fastest invoice approval for mid-market finance teams.',
			competitiveMoat: 'Switching cost of the approval history and the ERP mapping.',
			sourceIds: ['src-market-study']
		},
		'definition.business (high-level commitments — NOT executable rules)': {
			objectives: ['Cut the cost of processing one invoice by half'],
			slas: [{ metric: 'Uptime', commitment: '99.9%', penalty: '5% credit per 0.1% missed' }],
			contractualConstraints: ['Data stays in the EU'],
			contractAttachment: null,
			risks: ['Assumes finance teams will trust auto-approval'],
			custom: [{ label: 'Board checkpoint', value: 'Pilot reviewed at the Q4 board' }],
			sourceIds: ['src-msa']
		},
		'definition.technical (what the PRODUCT needs from the tech — the stack lives in `architecture`)': {
			compatibilities: ['Chrome', 'Edge', 'iOS'],
			integrations: [{ system: 'SAP', direction: 'both', criticality: 'critical' }],
			apisExpose: ['REST', 'Webhooks'],
			apisConsume: ['REST'],
			performance: [{ action: 'Invoice list load', target: 200, unit: 'ms' }],
			availability: '99.9%',
			custom: [{ label: 'Offline mode', value: 'Read-only when the ERP link is down' }],
			sourceIds: ['src-it-review']
		},
		'definition.security': {
			authentication: ['sso', 'mfa'],
			authorization: 'rbac',
			encryption: ['at_rest', 'in_transit'],
			auditLogs: 'complete',
			expectedCertifications: ['SOC2_Type_II', 'ISO_27001'],
			dataRetention: [{ dataType: 'Invoices', duration: '10 years', actionAfter: 'archival' }],
			custom: [],
			sourceIds: ['src-security-questionnaire']
		},
		'operations.i18n.locales': { code: 'en', label: 'English', rtl: false },
		'operations.migration.flagsExpected': {
			id: 'flag-newbilling',
			flag: 'newBilling',
			default: 'off',
			owner: 'Aline',
			killCriteria: 'error_rate > 1% for 5m'
		},
		'operations.testFixtures': {
			id: 'fx-invoices',
			name: '3-invoices-mixed-status',
			scope: 'Invoice',
			description: 'Paid, overdue and draft invoices.',
			dataJson: '[{ "id": "inv_1", "status": "paid", "amount": 1200 }]'
		},
		'operations.quality (free-text budgets — units are implied by the key)': {
			latencyP95Ms: '200',
			latencyP99Ms: '500',
			errorBudgetPct: '0.1',
			availabilityPct: '99.9',
			bundleSizeKb: '250',
			ttiMs: '1500',
			a11yLevel: 'WCAG 2.2 AA',
			browsers: 'Chrome, Edge, Safari (last 2 versions)',
			perfNotes: 'Measured on the invoice list with 10k rows.'
		},
		'operations.screenStates (keyed by the Experience screen NAME, not its id)': {
			'Invoice list': {
				empty: 'No invoices yet — invite your ERP connector.',
				loading: 'Skeleton rows, no spinner.',
				error: 'Retry banner with the last sync time.',
				success: 'Rows grouped by due date.',
				partialData: 'Show synced rows and flag the pending ones.'
			}
		}
	},
	finops: {
		'levers (top-level authorable fields — numbers are clamped: thresholds 0-100, budgetTightenRatio 0-1)': {
			monthlyBudgetUsd: 500,
			spentUsd: 120,
			enforcementMode: 'advisory',
			maturityThreshold: 70,
			coherenceThreshold: 80,
			budgetTightenRatio: 0.8,
			scopeLabel: 'Checkout',
			scopeReadiness: 85,
			gateway: { baseUrl: 'http://litellm.internal:4000', connected: false, pendingPushCount: 0, lastPushOk: false }
		},
		'rules (compiled LiteLLM guardrails — normally compiler-derived; hand-added rows use source "manual")': {
			id: 'finops-rule-1',
			kind: 'budget_cap',
			status: 'active',
			source: 'budget',
			rationale: 'Spend ratio 0.85 > tighten ratio 0.8',
			scopeLabel: 'Checkout',
			capUsd: 120,
			estimatedSavingUsd: 45,
			createdAt: 'just now'
		}
	},
	approvals: {
		items: {
			id: 'appr-experience',
			title: 'Sign off the Experience spec',
			area: 'Experience',
			reviewer: 'Aline',
			status: 'in_review',
			deadline: '2026-08-01',
			note: 'Doubles as the review comment / accepted-risk rationale.'
		}
	},
	baselines: {
		'baselines (name/note are the ONLY writable fields — the rest is an immutable captured snapshot)': {
			id: 'baseline-v1',
			name: 'Pre-pilot baseline',
			note: 'Scope agreed with the customer.',
			createdAt: '2026-07-01T10:00:00.000Z',
			readiness: 87,
			coherence: 92,
			featureCount: 24,
			content: '# Requirements document (Markdown)…'
		}
	},
	documents: {
		sources: {
			id: 'src-interview-ops',
			title: 'Ops lead interview',
			kind: 'interview',
			url: 'https://drive.example.com/ops-interview-notes',
			note: 'Citation / key excerpt the spec relies on.'
		}
	}
};

/** How to author each section, which write tool to use, and id conventions. */
const AUTHORING: Record<Section, string> = {
	scope:
		'set_section FIRST and keep it current. Choose mode full_product|selected_scope|prototype, then inventory every externally expected capability. Every capability must cite Documents & Sources through sourceIds; included capabilities must map to leaf featureIds. excluded/deferred rows require a rationale and an approved|accepted_risk approvalId (and are forbidden in full_product mode). Review every pre-populated sectionAssessments row whose applicability is `required`: mark it ready only after checking the section; not_applicable requires a rationale + settled approval and is forbidden in full_product mode. Rows seeded `derived` (Project health, Baselines, Supervision, AI Cost Governor) are computed or operator-owned — leave them alone, the gate does not ask you for them. completionStatus, completedAt, audit and auditLog are server-owned — call assess_project_completeness, then audit_project_scope, then finish_project instead of writing them. Humans never fill this ledger in: it is the reasoning YOU must commit to before authoring, and it has no page in the app — do not point a user at one.',
	foundation:
		`set_section. This is the only Foundation section, and the FIRST page a customer reads. ${FOUNDATION_ALTITUDE_RULE} ` +
		'Author its three nested records together — identity, definition, operations — using the exact emptyDraft shape; every nested record carries the same projectId and the server pins it to the requested project. ' +
		'Each of the six definition slices also carries `sourceIds[]` citing rows of the `documents` register — register the evidence there first, then cite it here. ' +
		'\n\nWHAT EACH FIELD EXPECTS (same wording the author reads on screen):\n' +
		'· identity (Brief tab) — productName; brief = the raw idea in prose, 40-2000 chars, "what problem are we solving, for whom, and why now"; industry + productType (catalogs, custom strings accepted); formFactors[] = every surface the product is used through; featureExpressionMode + structuredRuleFormat + activatedPatterns + ruleFamilyDefaults = the METHODOLOGY downstream rules are written in; sourceMode = where the spec comes from; projectMode solo|team.\n' +
		'· definition.businessObjective (Business objective) — mainProblem: 1-3 sentences, ≤600 chars, "the pain you exist to fix". painPointLinks[]: one pain each (≤48 chars) plus roleIds[] referencing users.roles[].id — create the role in the `users` section first, a stale id simply drops. expectedOutcome: 1-2 sentences, ≤600 chars, "the outcome you commit to". kpis[]: measurable targets with currentValue → targetValue + unit (the app derives the projected % from those two numbers, so give BOTH or the impact panel stays empty). successCriteria[] "We\'ve won when": measurable business signals that prove the bet paid off — tie each to a KPI above. failureCriteria[] "We should kill it when": alert thresholds that prove users aren\'t buying it — numbers, not feelings. Each criterion ≤120 chars.\n' +
		'· definition.market (Market segment) — marketType, customerSize[], industrySectors[], languages[] (ISO codes; EU languages raise a GDPR coherence check), regulations[] (propagated to the Security tab).\n' +
		'· definition.competition (Competitive landscape + Positioning & moat) — directCompetitors[] each with strengths[]/weaknesses[] (≤80 chars per note); indirectCompetitors[] = "what people use today instead" (Excel, a manual process); businessModels[] = how the market monetizes; differentiators[] = ORDERED, max 5, ≤80 chars each; positioning = one phrase that frames us; claimedCategory = the box we want to own (≤80 chars); competitiveMoat = why the advantage is hard to copy.\n' +
		'· definition.business (Requirements › Business) — HIGH-LEVEL ONLY, four blocks: A objectives[] "what the business commits to" + slas[] {metric, commitment, penalty} (the contractual commitment and its penalty — the uptime target itself goes in technical.availability); B contractualConstraints[] "terms we agreed to honor"; C risks[] "what could sink the bet, and what you\'re taking for granted"; D contractAttachment (a filename or storage key, or null) + custom[] {label, value} for anything else. THIS is where feature rules keep landing wrongly: a Given/When/Then, a user story, a "the system shall …", a screen mechanic or a field validation is REJECTED with a 400 naming the section that owns it.\n' +
		'· definition.technical (Requirements › Technical) — what the PRODUCT needs from the tech, never the stack itself (that is the `architecture` section): compatibilities[] = browsers/OS/devices your users actually have; integrations[] {system, direction, criticality} = systems the product is useless without (identity/SSO systems go to security.authentication instead); apisExpose[]/apisConsume[]; performance[] {action, target, unit} = user-perceived targets per key action; availability = the uptime target (SLO); custom[] {label, value}.\n' +
		'· definition.security (Requirements › Security) — authentication[] = how users sign in; authorization = how access is granted; encryption[]; auditLogs; expectedCertifications[] = what the market requires to buy; dataRetention[] {dataType, duration, actionAfter}; custom[] {label, value}. Per-role permissions are NOT here — they are the matrix in the `users` section.\n' +
		'· operations (Ops tab) — i18n {primaryLocale, timezone, dateFormat, numberFormat, currency, locales[], notes} = the localization contract downstream generation formats against; quality = non-functional budgets, every value a free-text string whose unit is implied by the key (latencyP95Ms "200", availabilityPct "99.9", a11yLevel "WCAG 2.2 AA"); migration {strategy, backwardCompatWindow, dataBackfill, rollbackPlan, notes, flagsExpected[]} = how the change ships, each flag carrying its kill criteria; testFixtures[] = realistic sample data per critical entity (dataJson is a JSON string); screenStates = per Experience screen NAME, the five states an implementer must always handle (empty, loading, error, success, partialData).\n' +
		'\nWHERE THE REST BELONGS: detailed/executable business rules and edge cases → `rules`; capabilities and their tree → `features`; journeys, screens and prototypes → `experience`; the tech stack, schema and reference docs → `architecture` + `data`; who may do what → `users`; evidence and links → `documents`.',
	users:
		'set_section. WHAT EACH FIELD EXPECTS (Personas tab): roles[] — id, name = WHO the user is ("Workspace Admin", "Free listener"), never what they may do; description = one line on what they come to the product for; userCountMin + userCountMax = the expected population (max null = unbounded); tone = the persona family (see enums); sourceIds[] = the Documents & Sources rows evidencing this persona. ' +
		'offStructureCapabilities[] — {id, label, note} for anything grantable that no feature, journey or screen produces (a back-office chore, an export, a support gesture): THIS is where "can export the workspace" belongs, not in roles[]. ' +
		'capabilityProfiles[] is NOT authorable over the MCP (per-row typing is off while the vocabulary is the five essentials) — persisted rows are still honoured, so send it back unchanged or omit it. ' +
		'Every permissions[].roleId must be an id present in roles[] of the SAME payload, and a `system` grant must use a catalog id (see enums) — an invented id is rejected, not silently dropped. ' +
		'ORDERING: feature, journey and SURFACE capabilities only exist once the features/experience sections are authored — author features + experience first, then (re)write the permission matrix in one final pass; a matrix written earlier will report those capabilities ungranted. The built-in system capability ids are listed under enums ("permissions.capabilityId (system catalog)"). ' +
		'CAPABILITY IDS BY SOURCE: system = the catalog ids; feature = the leaf feature id; journey = the journey id; surface = "screen:<screenId>" for an Experience screen (a page) or "surface:<leafFeatureId>:<surfaceId>" for a dialog/panel/form authored in the behavior model; off_structure = your own id. Surfaces are the rows that answer "who may open this page / this dialog" — grant them, do not leave them orphaned. ' +
		'Every capability accepts the same five permissions: view (visible at all), create, read, update, delete. `view` is the one to grant on a surface — it is what decides whether the role can open it. Keyless permissions[] rows are patchable via patch_section merge with match:{roleId,capabilityId}.',
	features:
		'set_section. The capability TREE and its delivery plan — never the behaviour itself (that is authored per leaf with the behavior tools, and read back as maturity). ' +
		'\n· Tree tab — cores[] {id, name, description, tone} are the product pillars; families[] {id, name, coreId, parentFamilyId, description} group inside a core and may nest; features[] are the LEAVES {id, name, coreId, parentFamilyId, description, unspaghettitFeatureId}. ' +
		'A leaf is one capability the product offers ("Send a message"), not a screen ("Chat page" is an Experience screen) and not a scenario ("Given … then …" is a `rules` row). ' +
		'`unspaghettitFeatureId` MUST equal the leaf `id` — that pair is the binding to the behavior model. Use a project-unique id (`feat-send-invoice`, not `feat-submit`): a generic id collides across projects. ' +
		'Every coreId/parentFamilyId/featureId/releaseId must resolve inside the SAME payload — an unknown reference is rejected with the collection to author first. ' +
		'\n· Per-leaf detail (the drawer behind a leaf) — leafMeta, keyed by leaf feature id: objective, problem, expectedEffect, value (the "why" a reader asks for), code (your own reference), acceptanceCriteria[] {id, text} = the testable statements this leaf must satisfy, dependsOn[] = other leaf ids, sourceIds[] = Documents & Sources citations, status backlog|in-progress|done, trl 1-9 (a MANUAL readiness override — omit it and readiness derives from the engine maturity score, which is the honest default). Every field is optional and an empty string is a deliberate "cleared", never a missing value. ' +
		'\n· Roadmap tab — mvpAssignments[] {featureId, tier} and releases[] {id, name, version, weekStart, weekEnd, order, description, archivedAt?} + roadmapAssignments[] {featureId, releaseId}. actionRelease maps ONE kernel action to a different release than its parent leaf, keyed "<featureId>::<actionId>". ' +
		'\n· Work queue tab — sprints[] {id, name, startDate?, endDate?, order, archivedAt?}, assignments[] (who does what: kind core|feature|action + the ids for that kind, assigneeId, sprintId, order), featureRoles/actionRoles (contributor ids per feature/action), actionAssignments (owner per action), actionTrl. This is the WORKSPACE\'s own delivery data: it names real people. Author it only from what the user explicitly told you — never invent an assignee, a sprint or a due date, and leave these empty when planning was not part of the request. ' +
		'\n· PREFER THE ROADMAP TOOLS for delivery management: get_roadmap reads releases/sprints with derived lifecycle (planned|in-progress|done|archived), progress % and per-feature implementation coverage in one call; apply_roadmap_batch mutates them with cascades handled (release/sprint removal cleans its assignments); reconcile_roadmap_statuses raises feature statuses to match code-adoption coverage (upgrade-only, also fired automatically after sync_implementation_index). archivedAt is the explicit ship/close stamp: "done" is always DERIVED from statuses, archiving pins it in history.',
	experience:
		'Largest section — the client-visible product: what a user goes through, on which screen, and what the screen actually does. ' +
		'THE PLAN RECORDS: journeys[] {id, coreId (a features core), name, description, order, actorRoleIds[] = users.roles[] ids} = one end-to-end path a persona takes; steps[] {id, journeyId, name, order, linkedScreenId} = the ordered stops of that path, each landing on a screen; ' +
		'stepOperations[] {id, stepId, order, kind, label} = what the step does under the hood (feeds step-depth coherence) and stepDataReads[] {id, stepId, order, entityName, mode, fields[]} = which entity fields it reads/writes (feeds entity coverage) — both are how a journey stops being a title and starts being verifiable; ' +
		'screens[] {id, name, templateId, description, category, parentScreen, path, device, deviceW, deviceH} = the pages; components[] {id, name, description, color} = layouts reused across screens (a row template, a sidebar). Author the plan first, then materialise each screen. ' +
		'Use set_section for the PLAN (journeys, steps, screens metadata, components metadata, builder.theme/collections/stateSeeds/entryScreenId) with builder.nodes={} and builder.screenRoots={}. Then call build_screen once per screen/component to materialise the layout from a compact nested spec. Use patch_section for targeted edits (e.g. builder.nodes.<id>.flex.card=true, builder.nodes.<id>.appearance={width:"full",fontSize:32,radius:16}, builder.nodes.<id>.media={src:"/assets/hero.png",alt:"Hero",fit:"cover",aspectRatio:"16 / 9"}, builder.stateSeeds). Appearance is structured: width auto|full|fit, align auto|start|center|end|stretch, textAlign left|center|right, fontSize 8..96, fontWeight 100..900, hex color/background/borderColor, borderWidth/radius/paddingX/paddingY, shadow, opacity 0..1. Prefer bundled/uploaded image assets; remote URLs are explicit opt-in and never populated by default. Tabs: presentation:"tabs" selects the active panel by NUMERIC INDEX stored at tabsKey (default 0), not by label. Aside nav: presentation:"sidebar" is the SAME child-groups-are-panels contract rendered as a left navigation menu (labels = menu items, active item highlighted); prefer it over tabs whenever a real product would use an aside navigation panel (settings areas, admin consoles, multi-section detail pages). Dropdown menu: presentation:"menu" is an anchored dropdown (the header-right user menu case): same visibleWhen open/close contract as overlay, no scrim, right-aligned at its slot (appearance.align:"start" opens rightward); clicking outside or picking an item dismisses it by falsifying the condition, so the trigger just toggles the state (e.g. toggle:"menu.open"). Clickable badges/tiles: ANY element with a click transition, click scenario or an action/event binding is a live click target in Run mode and gets the theme hover affordance, so a pill badge or stat tile can carry an action directly. Data on screens: a list ITERATES a simulator collection via bind:{kind:"entity",ref:"<CollectionName>"} (import_data_collections first); text labels interpolate {#Collection}, {Collection.field}, {Collection.N.field}. Per-role authorization: element gate {personaIds,mode:"visible"|"enabled",allow} (build_screen / wire_element `gate`). Input validations: required|email|min|max|pattern (param is a string); on a number input (inputType:"number") min/max bound the VALUE (min 0 rejects -5), on a text input they bound the length. Layout groups: a nested group OMITS `el` entirely ({direction,children,...}); `el:"container"` is a leaf, not a wrapper — putting children on it errors. A `list` iterates a collection and can take a row-template via componentId. Navigation living inside a reused component — including a list row-template — counts for journey verification and reachability; no redundant host-screen links needed. Realistic demo data: builder.collections[].rows = explicit records (keyed by field name, max 50) seeded INSTEAD of generated values — the only way to correlate fields across a row (a "Free" plan priced 0); missing fields are gap-filled. Per-field `options` pools also override a single field\'s generator. Design expressiveness: el:"icon" renders a bundled lucide icon (label = icon name, e.g. "zap"; appearance.fontSize = px size, color cascades); el:"meter" renders a progress bar (label = value 0-100, interpolatable "{usage.pct}"; variant:"ring" = circular gauge; appearance.color = fill); el:"text" variant:"pill" renders a badge/chip; a GROUP\'s appearance.color cascades to descendant text/icon defaults (one patch recolors a dark sidebar); builder.theme.preset picks a named palette ("light"|"dark"|"midnight"|"paper"|"forest") that fills the theme colors in one shot (explicit colors still win). Create flows: a transition effect createRecord:"<Collection>" appends a real row at run time, capturing any input on the same screen whose LABEL equals a collection field name — so name inputs "Name", not "Zap name" — or declare the mapping explicitly with fieldMap {"<field name>":"<input label>"} on the effect; a createRecord that captures no inputs surfaces in simulate warnings. PER-ROW INTERACTIVITY (a catalog, pricing table or inbox where each row acts): author the row template component once, and every element inside it acts on the row it is rendered in — effect selectRecord with target "<prefix>" publishes the whole clicked record to state (readable anywhere as {prefix.field}, plus {prefix} = the row id), and any setState/print value may interpolate {Field} from that row. Drive it headlessly with simulate_experience by adding rowIndex:<N> to an action (N indexes the rows currently visible, i.e. after the live search filter). Row LAYOUT: a bound list takes rowLayout "stack" (default) | "grid" | "cards" plus rowColumns 1..4 — cards wrap responsively, which is how pricing tiers and app catalogs should look; never hand-duplicate one card per record. FORM CONTROLS: besides el:"input", there are el:"textarea" (multi-line), el:"select" (options:[...] or optionsFrom:{collection,field[,filterField,filterPath]} for a live/dependent dropdown) and el:"checkbox" (boolean state, so truthy/falsy guards work). They validate, gate and fire change-triggers exactly like an input; inside a row template each row keeps its own value.',
	rules:
		'set_section. Features › Rules — the home of every EXECUTABLE statement, and the section Foundation rejects its feature rules into. ' +
		'issues[] — one tracked problem across the declared rules: {id, kind, title, detail, severity, status, ownerRoleId = a users.roles[] id or null, resolutionNote, relatedRuleIds[], relatedFeatureId = a leaf feature id or null, relatedJourneyId, autoDetected (false when you author it by hand), sourceIds[]}. ' +
		'scenarios[] — one risky edge case as a plain Given/When/Then: {id, title, given, whenText, then, expectedOutcome, relatedIssueId, relatedJourneyId, covered, sourceIds[]}. `whenText` is the field name, not `when`. These become the verify_experience acceptance spec, so write them so a run can decide pass/fail. ' +
		'inventory[] is a read-only mirror of the rules declared upstream (Foundation, Users, Experience) — leave it [], it is recomputed on load. ' +
		'TITLE GRAMMAR for issues[]: the title is read on a Control Center card by someone without the spec open. Subject first, the thing that is wrong, under 80 characters, no reasoning ("Sidebar colour has no dark-palette value"); the why, the option taken and the alternative go in detail. Set relatedFeatureId whenever the issue belongs to a feature: it names the subject on the card.',
	data:
		'set_section. Data & Architecture › Data model, authored top-down — every child names its parent by id, and an unknown parent is rejected with the collection to author first. ' +
		'\n· hosts[] {id, name, kind, provider (free text — ignored for on-prem), region (see enums — ignored for on-prem), description} = where it runs. ' +
		'\n· databases[] {id, hostId, name, engine, description}. ' +
		'\n· entities[] {id, name, databaseId (null = not placed yet), description, derivedFrom: author "manual", sourceRefId: null} — one business record ("Invoice", "Message"), named in the Glossary\'s words. ' +
		'\n· fields[] {id, entityId, name, type, isId, isUnique, isRequired, isList, defaultValue, relationTargetEntityId, parentFieldId (nest under an `object` field), enumValues[] when type is "enum"}. A relation: type "relation" + relationTargetEntityId; isList on both sides reads as many-to-many. ' +
		'\n· interfaces[] {id, protocol, fromBrick, toBrick, operation, description} = the calls between bricks. ' +
		'\n· visibility {"<entityId|fieldId>": "shown"|"hidden"} is the author\'s explicit override of what the client sees; absent means "follow the experience". derivedEntities[] is a read-only mirror of what the journeys consume — leave it []. ' +
		'\nBEHAVIOR COVERAGE: every entity the behavior kernel declares on any leaf feature must be represented here (matched by name, tolerant of case/plural) or explicitly excluded with a written rationale; assess_project_completeness reports each uncovered one as a `behavior-entity-unmodeled` warning and its `data` check stays failed until none remain. When retro-speccing, reconcile TWO sources: the behavior entities AND the fields the real product shows (table columns, forms, detail pages); name everything in the product\'s words, never the schema\'s. ' +
		'\nRELATIONS, CHECKED ON EVERY WRITE: a table nobody points at and that points at nothing is an orphan, and orphans are a defect, never a starting point. Every entity carries the relation to what owns it (the parent record it cannot exist without: a Line to its Invoice, a Member to their Workspace) or is pointed at by what references it (an Assignee, a Source). Each data write answers with `coherenceIssues`; an `unrelated-entity` issue names every orphan, and assess_project_completeness repeats each one as a `data-entity-unrelated` warning that fails the `data` check. Read the response of every data write and fix the orphans in the same pass, from evidence (what screens show together, what the code stores together), never by inventing a link; a genuinely standalone table (a lookup, a singleton setting) says so in its description. ' +
		'\nThen call import_data_collections to seed the simulator backend from these entities (enumValues become the exact seeded value pool). Never import while a data write still reports `unrelated-entity`: the collections would freeze the orphans.',
	architecture:
		'set_section. techChoices[] {id, layer (see enums), name, role = what it does here ("Web application"), version, referenceDocId, description}, sourceIds[], constraints[] {id, title, detail, category (see enums)} = the non-negotiables the stack must respect. derivedTech is derived — leave []. referenceDocs[] is a retired private list — never author it. Architecture has NO private doc list any more: official docs are rows of the `documents` section (the project evidence register), and this section CITES them. MANDATORY: write the doc rows into `documents` first (title, REAL official-documentation url, kind link|research|regulation|…), then set every techChoices[] entry\'s referenceDocId to one of those source ids, and list the same ids in sourceIds[]. referenceDocId:null is acceptable ONLY when the tech genuinely has no official documentation (bespoke/internal tooling) — never because the lookup was skipped, and never with an invented URL. Also cover all 5 layers (frontend|backend|data|integrations|infra) and declare at least one non-negotiable constraint; tech→doc referencing alone is worth 35/100 coherence points (issue code unreferenced-tech). (A legacy referenceDocs[] on an older project is folded into the register automatically — read it there, do not re-author it here.)',
	coherence:
		'DERIVED — agentAuthorable:false. Every score here is computed from the other sections plus the DPO engine. Read it with get_section to find what to FIX upstream; writing it would only assert a number the engine immediately recomputes.',
	glossary:
		'set_section. terms[] — one governed concept each: term = the WORD the product and its users say, spelled as a human writes it ("Invoice status"); a code identifier (invoiceStatus, USER_ROLE, getInvoice()) is rejected — that spelling belongs to the Data model, and the word people wrongly use belongs in synonymsAvoid[]. ' +
		'definition = one sentence a newcomer understands; synonymsAllowed[] = the words that mean the same and may be used; synonymsAvoid[] = the ones the team must stop using (they are matched against the whole project corpus and reported); example = the term in a real product sentence; locale fr|en; status draft|approved; sourceIds[] = the Documents & Sources rows that define it. ' +
		'Health score, suggestions, and view state are derived or local — never send them.',
	supervision:
		'OPERATOR-OWNED — agentAuthorable:false. This is the WORKSPACE\'s own running data, not the specification of the customer\'s product: who is assigned what, which AI policy the organisation applies, what each member spends. It names real people and real money, so authoring it from an LLM means inventing facts about someone\'s organisation. ' +
		'READ it with get_section when you need context (who owns a scope, whether a policy blocks something); write it ONLY when the user gives you the values explicitly. The completion gate never asks an agent for it. ' +
		'\nFor reference, the shape a human fills: assignments[] (assignee, scopeType, scopeLabel, status, progress 0-100, dueInDays), policyRules[] (category/label/status/detail), decisions[] (title/rationale/by/area), memberKeys[] (member, monthlyBudgetUsd, spentUsd, tokensUsed, tokenQuota). activity[] and gatewayAudit[] are read-only mirrors — leave []. The AI Gateway tab also embeds the AI Cost Governor (its levers live in the separate `finops` section).',
	finops:
		'OPERATOR-OWNED — agentAuthorable:false. The AI Cost Governor holds the workspace\'s real AI budget, its real spend and the enforcement mode that can FREEZE generation for everyone. A budget you infer is a wrong number on someone\'s finance page, and flipping enforcementMode to "enforced" blocks the team — never author either unless the user states the values. Live signals are recomputed at the edge and rules are normally derived by the compiler. ' +
		'READ it with get_section to know the current posture. The completion gate never asks an agent for it. ' +
		'\nFor reference, the levers a human sets: monthlyBudgetUsd/spentUsd (USD ≥ 0), enforcementMode advisory|enforced (advisory = warnings only, the air-gap default; enforced freezes generation and pushes blocking rules), maturityThreshold/coherenceThreshold/scopeReadiness (0-100), budgetTightenRatio (0-1), scopeLabel, gateway{baseUrl,connected,pendingPushCount,lastPushOk} (the optional on-prem LiteLLM proxy link), and rules[] (see sample — kind block_scope|route_cheap_model|budget_cap; capUsd only matters for budget_cap, 0 = fall back to the project-wide tighten formula).',
	approvals:
		'set_section. items[] — a lightweight approval worklist, one row per thing to sign off (title, area, reviewer, status draft|in_review|approved|changes_requested|accepted_risk, deadline free-form string, note = review comment / accepted-risk rationale). `area` is free text; the codes listed under enums mirror the nav\'s Specify group. Rows keep their ids (send id back on update); unknown statuses fall back to draft.',
	baselines:
		'DERIVED — agentAuthorable:false. A baseline is an immutable point-in-time snapshot (scores, feature count, and the full Markdown requirements document in `content`) captured server-side via POST /api/projects/<projectId>/baselines/capture — never author snapshot fields. set_section (PUT) is only for renaming (name), annotating (note), or deleting (omit the row).',
	documents:
		'set_section. sources[] — THE project evidence register, and the single source of truth for evidence: no other section keeps its own list of links. Each row: title, kind (see enums, default link), url (a link or stable reference — bytes live elsewhere, e.g. an uploaded brand file ref), note (citation/excerpt). Every other section cites these rows by stable id through a `sourceIds: string[]` field — foundation.definition.<slice>.sourceIds, users.roles[].sourceIds, rules.issues[]/scenarios[].sourceIds, glossary.terms[].sourceIds, architecture.sourceIds (+ techChoices[].referenceDocId), features leafMeta.sourceIds. So: register a source HERE first, then cite its id from wherever the claim is made. Ids are the citation contract — keep them unchanged across writes, and never delete a row that is still cited (the app flags the dangling citation rather than hiding it). REACHABLE, OR IT IS NOT A SOURCE: a row is evidence only if a reader other than you can consult it, through one of two doors. Door 1, url = a web address anyone can open (the Notion page, the Jira issue, the Confluence page, the Figma file, the GitHub file or commit, the official docs; the tool response of the MCP you read it through carries it) or an uploaded file. Door 2, no address (a PDF handed over, an interview, a chat, a file on your disk): leave url EMPTY and carry in note everything the spec relies on, verbatim, with where it came from. Never type a file:// path, a local path or a plain reference into url: it opens for nobody, so the write answers with a coherenceIssues line per such row and assess_project_completeness repeats it as a source-unreachable warning that fails the Source traceability check (a row with neither url nor note is source-empty). A code file you read goes through attach_source (readable back through list_sources) and its row here carries the repository web address of the file, or the repo-relative path in the note. Fix every reported row in the same pass.'
};
