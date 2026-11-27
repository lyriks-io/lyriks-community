import type { AppServices } from '$composition/container.server';
import { json, error } from '@sveltejs/kit';
import { SECTION_ITEM_SCHEMAS } from '$application/specification/section-authoring-schema';
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
import { CAPABILITY_SOURCES, ROLE_TONES, SYSTEM_CAPABILITIES } from '$domain/users';
import { CORE_TONES } from '$domain/features';
import { AUTHORIZATION_MODELS } from '$domain/foundation';
import { EDGE_OUTCOMES, ISSUE_KINDS, ISSUE_SEVERITIES, ISSUE_STATUSES } from '$domain/rules';
import { DB_ENGINES, FIELD_TYPES, HOST_KINDS, HOST_REGIONS, ON_DELETE, PROTOCOLS } from '$domain/data';
import { ARCH_LAYERS, CONSTRAINT_CATEGORIES } from '$domain/architecture';
import { DATA_MODES, DEVICES, OPERATION_KINDS } from '$domain/experience';
import { GLOSSARY_LOCALES, GLOSSARY_STATUSES } from '$domain/glossary';
import { FLAG_DEFAULTS, MIGRATION_STRATEGIES } from '$domain/foundation';
import { DOCUMENT_KINDS } from '$domain/documents';
import {
	CAPABILITY_DISPOSITIONS,
	SCOPE_MODES,
	SECTION_APPLICABILITIES,
	SECTION_ASSESSMENT_STATUSES
} from '$domain/scope';
import {
	SECTIONS,
	SECTION_AUDIENCE,
	isAgentAuthorable,
	isSection,
	type Section
} from '$lib/shared/sections';
import { UI_LOCATION } from '$lib/shared/section-ui-location';
import { BRAND_LIST_SAMPLES } from '$domain/experience';
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
/** The screen prototype is retired: its stored sub-trees are never offered as a shape to author. */
function withoutRetiredPrototype(section: string, draft: unknown): unknown {
	if (section !== 'experience' || !draft || typeof draft !== 'object') return draft;
	const { builder: _builder, prototype: _prototype, ...plan } = draft as Record<string, unknown>;
	return plan;
}

export const GET: RequestHandler = async ({ url, locals }) => {
	const section = url.searchParams.get('section') ?? '';
	if (!isSection(section)) {
		error(400, `unknown section "${section}". Valid: ${SECTIONS.join(', ')}`);
	}

	const s = locals.services;
	// A throwaway projectId yields the section's empty draft — the field skeleton
	// + defaults — without creating or mutating anything.
	const emptyDraft = withoutRetiredPrototype(section, await loadSection(s, section, '__describe__'));

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
		// The write path in wire terms: which tool, and under WHICH argument the
		// document goes. Naming the shape without naming the argument left an
		// author guessing at `draft`, `content` or `body`.
		writeTools: writeToolsFor(section),
		authoring: AUTHORING[section]
	});
};

/** How this section is written, argument by argument. */
function writeToolsFor(section: Section) {
	if (section === 'evolution') {
		return {
			write:
				'apply_evolution_batch { project_id, operations[] }: every operation is `{ op, ... }` and the lifecycle guards apply server-side. A raw set_section on this section is refused.',
			read: 'get_evolution { project_id, request_id?, part? }, which carries the derived readings (maturity, gates, impact, proposals) the raw document does not.'
		};
	}
	if (!isAgentAuthorable(section)) {
		return {
			write: 'Nothing: this section is computed or captured server-side. Read it with get_section.',
			read: 'get_section { project_id, section }'
		};
	}
	return {
		write:
			'set_section { project_id, section, document }: `document` is the WHOLE section draft, in the shape of `emptyDraft` above. It REPLACES what is stored, so anything absent from it is dropped (the answer warns about non-empty sub-trees it dropped).',
		patch:
			'patch_section { project_id, section, operations[] }: a targeted edit that resends nothing. `set` a dotted path, `merge` into a row that already exists (by `id`, or by `match` for a keyless collection), `append` ONE new row at the end of a collection (no selector: this is how a row is added), `remove` a row or a path, and the incremental `add_to_set` / `remove_from_set` / `append_text` / `replace_text`. Prefer it to set_section on any section carrying large sub-trees.',
		read: 'get_section { project_id, section, summary?, paths? }'
	};
}

async function loadSection(
	s: AppServices,
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
		case 'baselines':
			return s.loadBaselinesDraft.execute(projectId);
		case 'documents':
			return s.loadDocumentRegister.execute(projectId);
	}
}


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
		// The built-in system-capability catalog — every one of these ids must end
		// up granted to ≥1 role or the coherence score reports it ungranted. Listed
		// here so authors can fill the matrix without hunting for the ids.
		'permissions.capabilityId (system catalog)': SYSTEM_CAPABILITIES.map((c) => `${c.id} — ${c.label}`)
	},
	features: {
		'cores.tone': codes(CORE_TONES),
		'leafMeta.<featureId>.stage (manual maturity stage override, 1 Idea, 2 Outlined, 3 Specified, 4 Simulated, 5 Complete; leave unset to derive it from the engine maturity score)':
			['1', '2', '3', '4', '5']
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
		'fields.onDelete (a relation only: what deleting the record it points at does to the record holding it; leave it out when the code does not state it, never set_null on a required link)':
			codes(ON_DELETE),
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
		stage: ['logical', 'implementation'],
		'techChoices.layer': codes(ARCH_LAYERS),
		'constraints.category': codes(CONSTRAINT_CATEGORIES)
	},
	experience: {
		'screens.device': codes(DEVICES),
		'stepOperations.kind': codes(OPERATION_KINDS),
		'stepDataReads.mode': codes(DATA_MODES)
	},
	glossary: {
		'terms.locale': codes(GLOSSARY_LOCALES),
		'terms.status': codes(GLOSSARY_STATUSES)
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
			group: ''
		},
		'capabilities (left out, with its reason)': {
			id: 'scope-voice',
			name: 'Voice input',
			description: 'Compose a message by speaking.',
			sourceIds: ['source-product-brief'],
			featureIds: [],
			disposition: 'deferred',
			rationale: 'Scheduled for the next release.',
			group: 'Hands-free use'
		},
		boundary: {
			covers: 'The messaging app on the web and mobile: conversations, members and notifications.',
			decision: 'The product owner asked to specify the app alone, without the admin console.',
			decidedAt: '2026-11-12',
			groups: [{ name: 'Hands-free use', summary: 'speaking a message, reading one aloud' }]
		},
		sectionAssessments: {
			section: 'users',
			applicability: 'required',
			status: 'ready',
			rationale: 'Personas and permissions cover every included capability.'
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
			capabilitySource: 'system'
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
		'leafMeta (keyed by LEAF FEATURE ID — the drawer behind each leaf; every field optional)': {
			'feat-send': {
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
			sourceRefId: null,
			sourceIds: ['src-message-model']
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
		'fields (enum with declared members — the members are the only values the field takes)': {
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
		'fields (relation stating what deleting its target does, as the code says it: on_delete=CASCADE, ON DELETE CASCADE)': {
			id: 'f-msg-author',
			entityId: 'entity-msg',
			name: 'author',
			type: 'relation',
			isId: false,
			isUnique: false,
			isRequired: true,
			isList: false,
			defaultValue: '',
			relationTargetEntityId: 'entity-user',
			onDelete: 'cascade'
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
		// The brand block holds lists too, and an empty draft shows each as `[]`:
		// without an item here an author cannot know a logo variant from a colour
		// token. Typed against the brand model, so a sample cannot drift from it.
		...BRAND_LIST_SAMPLES,
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
			// Retired from the screen: stored as authored, never asked for, so the example leaves them empty.
			objectives: [],
			slas: [],
			contractAttachment: null,
			risks: [],
			sourceIds: ['src-msa']
		},
		'definition.technical (what the PRODUCT needs from the tech — the stack lives in `architecture`)': {
			compatibilities: ['Chrome', 'Edge', 'iOS'],
			// Retired from the screen: stored as authored, never asked for, so the example leaves them empty.
			integrations: [],
			apisExpose: [],
			apisConsume: [],
			performance: [],
			availability: '',
			sourceIds: ['src-it-review']
		},
		'definition.security': {
			authentication: ['sso', 'mfa'],
			authorization: 'rbac',
			encryption: ['at_rest', 'in_transit'],
			auditLogs: 'complete',
			expectedCertifications: ['SOC2_Type_II', 'ISO_27001'],
			dataRetention: [{ dataType: 'Invoices', duration: '10 years', actionAfter: 'archival' }],
			sourceIds: ['src-security-questionnaire']
		},
		'definition.constraints (the sources of each Tech and data › Requirements question; items[] are not shown in the interface)': {
			items: [
				{ id: 'c-eu', theme: 'Compliance', description: 'Customer data stays in the EU.' },
				{ id: 'c-offline', theme: 'Technical', description: 'Read-only when the ERP link is down.' }
			],
			sourceIds: ['src-msa'],
			questionSources: {
				runtime: ['src-it-review'],
				languages: [],
				security: ['src-security-questionnaire'],
				compliance: ['src-security-questionnaire'],
				accessibility: []
			}
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
			a11yStandards: ['WCAG 2.2 AA', 'Keyboard-only navigation'],
			a11yLevel: 'WCAG 2.2 AA, Keyboard-only navigation',
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
	baselines: {
		'baselines (recorded by Lyriks, read-only)': {
			id: 'baseline-v1',
			name: 'Specification 360° of the product',
			createdAt: '2026-07-01T10:00:00.000Z'
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
		'set_section FIRST and keep it current. Choose mode full_product|selected_scope|prototype, then inventory every externally expected capability. Every capability must cite Documents & Sources through sourceIds; included capabilities must map to leaf featureIds. excluded/deferred rows require a rationale, the reason a person reads (and are forbidden in full_product mode); no approval is asked, and an approvalId sent is dropped. Give each left-out capability a `group` and write `boundary`: `covers` (what the specification covers, one sentence in the words of the product), `decision` (the decision the boundary rests on: who asked for it and why), `decidedAt` (its ISO date) and `groups[]` ({name, summary}: one line saying what each group of left-out capabilities holds). The Scope drawer shows them under Out of scope, the largest group first, so name groups a person recognises (5 or so, never one per capability). Review every pre-populated sectionAssessments row whose applicability is `required`: mark it ready only after checking the section; not_applicable requires a rationale and is forbidden in full_product mode. Rows seeded `derived` (Project health, Baselines, Evolution: a dossier is driven by apply_evolution_batch, never assessed here) are computed or captured — leave them alone, the gate does not ask you for them. completionStatus, completedAt, audit and auditLog are server-owned — call assess_project_completeness, then audit_project_scope, then finish_project instead of writing them. Humans never fill this ledger in: it is the reasoning YOU must commit to before authoring. Only the boundary is shown: while the list of what is out of scope waits for a person to approve it, a discreet link on the Overview (<n> out of scope, To approve) opens the Scope drawer; once approved it reads in the History of the Reverse page. The rest has no page. boundary.approval is server-owned: a person approves the list of what is left out there, and a save never writes it; never ask to approve it yourself (refused with 403). Changing a capability left out, its disposition or its reason makes the approval Changed since, and the completion report warns until a person approves it again; tell the person when you change that list.',
	foundation:
		`set_section. The foundation section feeds Specification 360° › Overview, the FIRST page a customer reads, and Tech and data › Requirements and Health. ${FOUNDATION_ALTITUDE_RULE} ` +
		'Author its three nested records together — identity, definition, operations — using the exact emptyDraft shape; every nested record carries the same projectId and the server pins it to the requested project. ' +
		'Each of the six definition slices also carries `sourceIds[]` citing rows of the `documents` register — register the evidence there first, then cite it here. ' +
		'\n\nWHAT EACH FIELD EXPECTS (same wording the author reads on screen):\n' +
		'· identity (Brief tab) — productName; brief = the raw idea in prose, 40-2000 chars, "what problem are we solving, for whom, and why now"; industry + productType (catalogs, custom strings accepted); formFactors[] = every surface the product is used through; featureExpressionMode + structuredRuleFormat + activatedPatterns + ruleFamilyDefaults = the METHODOLOGY downstream rules are written in; sourceMode = where the spec comes from; projectMode solo|team.\n' +
		'· definition.businessObjective (Business objective) — mainProblem: 1-3 sentences, ≤600 chars, "the pain you exist to fix". painPointLinks[]: one pain each (≤48 chars) plus roleIds[] referencing users.roles[].id — create the role in the `users` section first, a stale id simply drops. expectedOutcome: 1-2 sentences, ≤600 chars, "the outcome you commit to". kpis[]: measurable targets with currentValue → targetValue + unit (the app derives the projected % from those two numbers, so give BOTH or the impact panel stays empty). successCriteria[] "We\'ve won when": measurable business signals that prove the bet paid off — tie each to a KPI above. failureCriteria[] "We should kill it when": alert thresholds that prove users aren\'t buying it — numbers, not feelings. Each criterion ≤120 chars.\n' +
		'· definition.market (Market segment) — marketType, customerSize[], industrySectors[], languages[] (ISO codes; EU languages raise a GDPR coherence check), regulations[] (propagated to the Security tab).\n' +
		'· definition.competition (Competitive landscape + Positioning & moat) — directCompetitors[] each with strengths[]/weaknesses[] (≤80 chars per note); indirectCompetitors[] = "what people use today instead" (Excel, a manual process); businessModels[] = how the market monetizes; differentiators[] = ORDERED, max 5, ≤80 chars each; positioning = one phrase that frames us; claimedCategory = the box we want to own (≤80 chars); competitiveMoat = why the advantage is hard to copy.\n' +
		'· definition.business: objectives[], slas[], risks[] and contractAttachment are not shown in the interface: keep what is stored, never ask for them, never fill them. The former contractualConstraints[] and custom[] (business, technical, security) are folded into definition.constraints on read: never write them.\n' +
		'· definition.constraints: sourceIds[] backs the free list and questionSources.<question>[] backs each precise question (runtime, languages, security, compliance, accessibility); items[] {id, theme, description}, the ONE home of every constraint that is NOT technical (contractual, business, legal, compliance, operations...). A TECHNICAL constraint, security included (data residency, encryption, audit, access control, performance of the build...), is pinned in architecture.constraints[] {id,title,detail,category} instead, shown on Specification 360° › Tech and data › Requirements (technical constraints); never write it here. theme = Business, Compliance, Legal or Ops, or any new word; Technical and Security are no longer offered (an old row under them is brought to architecture.constraints by the person) (it is then offered across the project; a theme matching an offered one case aside is spelled like it). HIGH-LEVEL ONLY: THIS is where feature rules keep landing wrongly: a Given/When/Then, a user story, a "the system shall …", a screen mechanic or a field validation is REJECTED with a 400 naming the section that owns it.\n' +
		'· definition.technical (Tech and data › Requirements, where it must run; availability on Tech and data › Operations): what the PRODUCT needs from the tech, never the stack itself (that is the `architecture` section). compatibilities[] = browsers/OS/devices your users actually have (Runtime). availability shows, read-only, on Tech and data › Health. integrations[], apisExpose[]/apisConsume[] and performance[] are not shown in the interface: keep what is stored, never ask for them, never fill them.\n' +
		'· definition.security (Requirements › Security and Compliance) — authentication[] = how users sign in; authorization = how access is granted; encryption[]; auditLogs shows, read-only, on Tech and data › Health; expectedCertifications[] = what the market requires to buy; dataRetention[] is not shown in the interface (stored, never asked for). Per-role permissions are NOT here — they are the matrix in the `users` section.\n' +
		'· operations (Tech and data › Requirements: languages and locales, accessibility; Tech and data › Operations: the quality targets) — i18n {primaryLocale, dateFormat, numberFormat, currency, locales[], notes} = the localization contract downstream generation formats against (timezone is not shown in the interface: stored, never asked for); quality = non-functional budgets, every value a free-text string whose unit is implied by the key (latencyP95Ms "200", availabilityPct "99.9", a11yLevel "WCAG 2.2 AA"), a11yLevel shows on Tech and data › Requirements, and the performance targets (latencyP95Ms, latencyP99Ms, ttiMs, bundleSizeKb, perfNotes) and errorBudgetPct show, read-only, on Tech and data › Health; the other budgets are not shown in the interface; migration {strategy, backwardCompatWindow, dataBackfill, rollbackPlan, notes, flagsExpected[]} = how the change ships, each flag carrying its kill criteria; testFixtures[] = realistic sample data per critical entity (dataJson is a JSON string); screenStates = per Experience screen NAME, the five states an implementer must always handle (empty, loading, error, success, partialData). RETIRED: migration is not shown any more (keep what is stored, never ask for it); testFixtures[] are not shown in the interface (stored, never asked for).\n' +
		'\nWHERE THE REST BELONGS: detailed/executable business rules and edge cases → `rules`; capabilities and their tree → `features`; journeys, screens and prototypes → `experience`; the tech stack, schema and reference docs → `architecture` + `data`; who may do what → `users`; evidence and links → `documents`.',
	users:
		'set_section. WHAT EACH FIELD EXPECTS (Personas tab): roles[] — id, name = WHO the user is ("Workspace Admin", "Free listener"), never what they may do; description = one line on what they come to the product for; userCountMin + userCountMax = the expected population (max null = unbounded); tone = the persona family (see enums); sourceIds[] = the Documents & Sources rows evidencing this persona. ' +
		'offStructureCapabilities[] — {id, label, note} for anything grantable that no feature, journey or screen produces (a back-office chore, an export, a support gesture): THIS is where "can export the workspace" belongs, not in roles[]. ' +
		'capabilityProfiles[] is retired (a row has no kind any more): omit it; a write that still carries it is accepted, the list is ignored and the answer\'s note says so. ' +
		'dismissedSuggestions[] is the HISTORY OF REFUSED PERSONA SUGGESTIONS, {key, name, rationale, dismissedAt, dismissedBy}: each row is a person\'s decision that this project does not serve that persona, recorded when they removed a suggested card. It is not shown on the Personas tab. READ IT BEFORE PROPOSING PERSONAS and never suggest or create a role whose name matches a row (names compare case-insensitively, underscores as spaces) unless the person asks for it by name. It is append-only: omit it or send it back unchanged, a write never removes a row, and only a person dismissing a card adds one (a persona deleted after being accepted is NOT a dismissal). ' +
		'Every permissions[].roleId must be an id present in roles[] of the SAME payload, and a `system` grant must use a catalog id (see enums) — an invented id is rejected, not silently dropped. ' +
		'ORDERING: feature, journey and SURFACE capabilities only exist once the features/experience sections are authored — author features + experience first, then (re)write the permission matrix in one final pass; a matrix written earlier will report those capabilities ungranted. The built-in system capability ids are listed under enums ("permissions.capabilityId (system catalog)"). ' +
		'CAPABILITY IDS BY SOURCE: system = the catalog ids; feature = the leaf feature id, or "action:<leafFeatureId>:<actionId>" for one action of it (the rows the Access matrix shows); journey = the journey id; surface = "screen:<screenId>" for an Experience screen (a page) or "surface:<leafFeatureId>:<surfaceId>" for a dialog/panel/form authored in the behavior model; off_structure = your own id. Surfaces are the rows that answer "who may open this page / this dialog": grant them, do not leave them orphaned. ' +
		'A PERMISSION IS ACCESS, NOTHING ELSE: one permissions[] row {roleId, capabilityId, capabilitySource} says the role has access to that capability, and no row says it has not. There is no verb (no view, create, read, update, delete, execute...): adding, editing or deleting something are actions of the model, each its own capability row, granted like any other. Write ONE row per role and capability you mean to open, never one per verb. A row that still carries `action` (an older playbook) is accepted, the field is ignored and the answer carries a `note` saying so; rows repeating one role and one capability are folded into one. Keyless permissions[] rows are patchable via patch_section merge with match:{roleId,capabilityId}, and removing a row takes the access back.',
	features:
		'set_section. The capability TREE, never the behaviour itself (that is authored per leaf with the behavior tools, and read back as maturity). ' +
		'\n· Tree tab — cores[] {id, name, description, tone} are the product pillars; families[] {id, name, coreId, parentFamilyId, description} group inside a core and may nest; features[] are the LEAVES {id, name, coreId, parentFamilyId, description, unspaghettitFeatureId}. ' +
		'A leaf is one capability the product offers ("Send a message"), not a screen ("Chat page" is an Experience screen) and not a scenario ("Given … then …" is a `rules` row). ' +
		'`unspaghettitFeatureId` MUST equal the leaf `id` — that pair is the binding to the behavior model. Use a project-unique id (`feat-send-invoice`, not `feat-submit`): a generic id collides across projects. ' +
		'Every coreId/parentFamilyId/featureId must resolve inside the SAME payload: an unknown reference is rejected with the collection to author first. ' +
		'\n· Per-leaf detail (the drawer behind a leaf): leafMeta, keyed by leaf feature id: objective, problem, expectedEffect, value (the "why" a reader asks for), code (your own reference), acceptanceCriteria[] {id, text} = the testable statements this leaf must satisfy, dependsOn[] = other leaf ids, sourceIds[] = Documents & Sources citations, stage 1-5 (a MANUAL maturity stage override: 1 Idea, 2 Outlined, 3 Specified, 4 Simulated, 5 Complete; omit it and the stage derives from the engine maturity score, which is the honest default). Every field is optional and an empty string is a deliberate "cleared", never a missing value. ' +
		'\n  A leaf criterion is NOT a second list: saving this section carries it into the behavior model under a reserved `ac-leaf-` id, beside the criteria you author with apply_behavior_batch, and everything that counts criteria counts that one list. Write prose here; write status, relations and evidence through the model. ' +
		'\n· Knowledge › a feature\'s page › Actions › Journeys: actionJourneys { <featureId>: [{ id, name, nodes: string[], links: [{ from, to, kind? }], positions?: { <actionId>: { x, y } }, origin }] }, the one diagram of a feature\'s actions (send a single entry per feature; the page shows the first, its journeys being the paths its arrows draw): nodes are the action ids the journey holds (each once), links the arrows from one action to the next (one action may lead to several), each with its kind: "then" (the person goes on to it; the default, left out), "enables" (the action puts the product in the state the next one needs), "triggers" (it sets the next one off with no one acting: an event, the system, a schedule) or "fails" (it leads there when it is refused or fails), positions where a person dragged a card (leave them out: a card without one stands where the arrows place it, left to right). A journey never loops: an arrow between two different actions of the journey, drawn once, never leading back to where it started (one that does is dropped). A person decides them: a write through this section never replaces, changes or removes a journey whose origin is "person" (it stays as stored), and every other journey you send is stored as a suggestion (origin "ai") replacing the suggestions before it, which a person keeps, changes or dismisses on the page. Write it WITHOUT BEING ASKED, in the same pass as you write or change a feature\'s actions (a Reverse-Specification included), for every feature of two actions or more: the most probable ways a person or the system goes from one action to the next, from what the actions really chain (what one makes possible for the next); an action that leads nowhere stays without an arrow. The page shows a person\'s diagram that has an arrow first, else your suggestion. Never claim origin "person". ',
	experience:
		'The client-visible product, described and never drawn: what a persona goes through, on which screen, doing what with which data, and the design system a coding agent reads with get_design_system to build the UI (no page hands out a design.md file). ' +
		'THE PLAN: journeys[] {id, coreId (a features core), name, description, order, actorRoleIds[] = users.roles[] ids} = one end-to-end path a persona takes; steps[] {id, journeyId, name, order, linkedScreenId} = its ordered stops, each on a screen of the inventory. ' +
		'stepOperations[] {id, stepId, order, kind, label} = what a step does under the hood, and stepDataReads[] {id, stepId, order, entityName, mode, fields[]} = which entity fields it reads or writes: a step with neither is reported as saying nothing it does, and an entity no step reads is reported as unused. ' +
		'screens[] {id, name, description, category, parentScreen, path, device} = the screen inventory: every screen the product shows, its route and device; a screen no step visits is reported. ' +
		'brand {identity, logo, colors, typography, foundation, markers, components, pages, examples} = the sources of the design system get_design_system answers: write them from the real product (its tokens, its fonts, its words), never from a default; an empty source leaves its part of the design system out. ' +
		'Use patch_section to add or edit one journey, step, screen or brand list item (append / merge by id). THE SCREEN PROTOTYPE IS RETIRED: there is no layout to author, no simulator run and no demo collection; the `builder` sub-tree is refused by get_section, set_section and patch_section, and nothing reads it. Acceptance tests come from the behavior scenarios (export_behavior_scenarios).',
	rules:
		'set_section. The register of issues, shown as points of Specification 360° › Overview › What Lyriks noticed; rules[], inventory[] and the edge cases are not shown in the interface (executable rules live in the behavior model, written with apply_behavior_batch). ' +
		'issues[] — one tracked problem across the declared rules: {id, kind, title, detail, severity, status, ownerRoleId = a users.roles[] id or null, resolutionNote, relatedRuleIds[], relatedFeatureId = a leaf feature id or null, relatedJourneyId, autoDetected (false when you author it by hand), sourceIds[]}. ' +
		'scenarios[] — one risky edge case as a plain Given/When/Then: {id, title, given, whenText, then, expectedOutcome, relatedIssueId, relatedJourneyId, covered, sourceIds[]}. `whenText` is the field name, not `when`. Write them so a test can decide pass or fail. ' +
		'inventory[] is a read-only mirror of the rules declared upstream (the foundation, users and experience sections), not shown in the interface: leave it [], it is recomputed on every load. It fills itself when the foundation section declares authentication and retention, when the users section grants a capability and when the experience section holds journeys: an empty mirror is a statement about THOSE sections, never an instruction to write here, and it no longer zeroes this section once contradictions or edge cases are authored. ' +
		'TITLE GRAMMAR for issues[]: the title is read in What Lyriks noticed by someone without the spec open. Subject first, the thing that is wrong, under 80 characters, no reasoning ("Sidebar colour has no dark-palette value"); the why, the option taken and the alternative go in detail. Set relatedFeatureId whenever the issue belongs to a feature: it names the subject on the card.',
	data:
		'set_section. Shown on Specification 360° › Tech and data › Data map (read-only there), authored top-down — every child names its parent by id, and an unknown parent is rejected with the collection to author first. ' +
		'\n· hosts[] {id, name, kind, provider (free text — ignored for on-prem), region (see enums — ignored for on-prem), description} = where it runs. ' +
		'\n· databases[] {id, hostId, name, engine, description}. ' +
		'\n· entities[] {id, name, databaseId (null = not placed yet), description, derivedFrom: author "manual", sourceRefId: null, sourceIds[] = the Documents & Sources rows the table rests on (the code that declares it first: its model, migration or schema; in a project read from its code every table cites one), standalone?: true (the table relates to no other on purpose, its description says why)} — one business record ("Invoice", "Message"), named in the Glossary\'s words. ' +
		'\n· fields[] {id, entityId, name, type, isId, isUnique, isRequired, isList, defaultValue, relationTargetEntityId, parentFieldId (nest under an `object` field), enumValues[] when type is "enum"}. A relation: type "relation" + relationTargetEntityId; isList on both sides reads as many-to-many. ' +
		'\n· interfaces[] {id, protocol, fromBrick, toBrick, operation, description} = the calls between bricks. ' +
		'\n· visibility {"<entityId|fieldId>": "shown"|"hidden"} is the author\'s explicit override of what the client sees; absent means "follow the experience". derivedEntities[] is a read-only mirror of what the journeys consume — leave it []. ' +
		'\nBEHAVIOR COVERAGE: every entity the behavior kernel declares on any leaf feature must be represented here (matched by name, tolerant of case/plural) or explicitly excluded with a written rationale; assess_project_completeness reports each uncovered one as a `behavior-entity-unmodeled` warning and its `data` check stays failed until none remain. During a Reverse-Specification, reconcile TWO sources: the behavior entities AND the fields the real product shows (table columns, forms, detail pages); name everything in the product\'s words, never the schema\'s. ' +
		'\nRELATIONS, CHECKED ON EVERY WRITE: a table nobody points at and that points at nothing is an orphan, and orphans are a defect, never a starting point. Every entity carries the relation to what owns it (the parent record it cannot exist without: a Line to its Invoice, a Member to their Workspace) or is pointed at by what references it (an Assignee, a Source). Each data write answers with `coherenceIssues`; an `unrelated-entity` issue names every orphan, and assess_project_completeness repeats each one as a `data-entity-unrelated` warning that fails the `data` check. Read the response of every data write and fix the orphans in the same pass, from evidence (what screens show together, what the code stores together), never by inventing a link; a genuinely standalone table (a lookup, a singleton setting, a table the product no longer uses) is marked `standalone: true` and says why in its description: only both together keep it out of the orphan check. ' +
		'\nLINKS TO THE BEHAVIOR, MADE AS YOU CAPTURE: the data model and the behavior states describe the same records; the link from a field to the state that holds its value is what lets the solver check the field\'s rules (a required value, a choice) against every feature. Lyriks links by itself a field only one state can hold (path naming the table, last name equal to the field\'s). Link every other one yourself, in the same pass as the states or fields you write, from your evidence (the code that stores the value, what the screen shows): link_data_fields takes many links at once by table and field names, plus the yes-or-no state that says a record of a table exists; get_data_links lists what remains with candidate states. Never link on a name alone when the evidence disagrees; a field a person unlinked stays unlinked. assess_project_completeness counts what remains as `data-field-unlinked`. ',
	architecture:
		'set_section. stage logical|implementation (new projects default logical). Start with logical responsibilities, boundaries and constraints; do not invent a stack or populate unused layers to raise a score. techChoices[] retains its wire name for compatibility: {id, layer, name (component or technology), role (responsibility), version, referenceDocId, description}. Store technical decisions in documents.sources[] with decision.status proposed|accepted|superseded and a note containing technologies, versions, alternatives and rationale. Link by referenceDocId and sourceIds. Move to implementation when choosing technologies; unresolved decisions remain explicit and are never inferred by an export. sourceIds[] and constraints[] {id,title,detail,category} support both stages. derivedTech is read-only, leave []. referenceDocs is migration-only; use the shared Sources register. get_implementation_context and technical exports include linked source content and unresolved references.',
	coherence:
		'DERIVED — agentAuthorable:false. Every score here is computed from the other sections plus the DPO engine. Read it with get_section to find what to FIX upstream; writing it would only assert a number the engine immediately recomputes.' +
		' `health` is the one Project health the Overview shows: { score, verdict, blocking, total, codeLinked, points (the first 50, heaviest first), pointsTotal }, computed from every open point of What Lyriks noticed (coherence gaps, completeness audit issues, analyses not finalized, code not proven, criteria without a result, drift; code points count once code is linked). `headline` is the coherence part of it alone, and `conformance` keeps the proof counts (proven over located actions, criteria by their last result). There is no Control Center: report the health, never a bare number.',
	glossary:
		'set_section. terms[] — one governed concept each: term = the WORD the product and its users say, spelled as a human writes it ("Invoice status"); a code identifier (invoiceStatus, USER_ROLE, getInvoice()) is rejected — that spelling belongs to the Data model, and the word people wrongly use belongs in synonymsAvoid[]. ' +
		'definition = one sentence a newcomer understands; synonymsAllowed[] = the words that mean the same and may be used; synonymsAvoid[] = the ones the team must stop using (they are matched against the whole project corpus and reported); example = the term in a real product sentence; locale fr|en; status draft|approved; sourceIds[] = the Documents & Sources rows that define it. ' +
		'Health score, suggestions, and view state are derived or local — never send them.',
	baselines:
		'DERIVED, agentAuthorable:false. Lyriks records a baseline (its id, its name and its moment, nothing else) at each milestone of the specification: its definitive validation, a code change kept, an evolution closed, a Reverse-Specification published. The version of the specification (v1.0 at the validation, one minor step per later baseline) is counted from them. Read them with get_section; set_section and patch_section are refused with 405, and nothing captures one on demand.',
	documents:
		'set_section. sources[] — THE project evidence register, and the single source of truth for evidence: no other section keeps its own list of links. Each row: title, kind (see enums, default link), url (a reachable web or uploaded-file address), note (citation/excerpt). Optional decision:{status:proposed|accepted|superseded}; keep technical details and rationale in note. Optional evidence:{kind:unit|integration|e2e|visual|load|manual|prototype,result:passed|failed|blocked|not_run,buildId,artifact,command,observedAt,provenance,criterionIds:string[]}. These are REPORTED results, not independently verified evidence or model coverage. Never mark a real-runtime test passed on the basis of a prototype check. Every other section cites these rows by stable id through a `sourceIds: string[]` field — foundation.definition.<slice>.sourceIds, users.roles[].sourceIds, rules.issues[]/scenarios[].sourceIds, glossary.terms[].sourceIds, architecture.sourceIds (+ techChoices[].referenceDocId), features leafMeta.sourceIds. So: register a source HERE first, then cite its id from wherever the claim is made. Ids are the citation contract — keep them unchanged across writes, and never delete a row that is still cited (the app flags the dangling citation rather than hiding it). REACHABLE, OR IT IS NOT A SOURCE: a row is evidence only if a reader other than you can consult it, through one of two doors. Door 1, url = a web address anyone can open (the Notion page, the Jira issue, the Confluence page, the Figma file, the GitHub file or commit, the official docs; the tool response of the MCP you read it through carries it) or an uploaded file. Door 2, no address (a PDF handed over, an interview, a chat, a file on your disk): leave url EMPTY and carry in note everything the spec relies on, verbatim, with where it came from. Never type a file:// path, a local path or a plain reference into url: it opens for nobody, so the write answers with a coherenceIssues line per such row and assess_project_completeness repeats it as a source-unreachable warning that fails the Source traceability check (a row with neither url nor note is source-empty). A code file you read goes through attach_source (readable back through list_sources) and its row here carries the repository web address of the file, or the repo-relative path in the note. Fix every reported row in the same pass.',
	evolution:
		'set_section. One dossier per change request, carrying it from the raw need to the human acceptance walkthrough. ' +
		'\n. READ IT THROUGH get_evolution AND WRITE IT THROUGH apply_evolution_batch, never set_section: the aggregate carries the derived readings (maturity, gates, readings, pending proposals) and the typed operations apply every guard of the lifecycle server-side; a raw section write is refused. ' +
		'\n. requests[]: id, title (a request with none cannot be found again), origin (one of the six known origins, never left unset), requester, leafIds[] = the EXISTING leaf features the change touches (a set, each listed once; an evolution never creates a feature of its own), stage, status, iteration (from 1, only moving forward). ' +
		'\n. THE DOSSIER STORES NO SPECIFICATION VALUE. Every prose field of its page writes through to the section that owns it (features.leafMeta), so deleting a request leaves the spec it wrote untouched. The other blocks (personas and grants, behaviour surfaces/guards/invariants, entities, dependencies, constraints, security, glossary, screens, edge cases) are READINGS: the dossier shows what the touched features hold there and what the impact report moves, and counts a block filled from that reading. Nothing is ticked by hand. When a reading is empty (a touched feature with no invariant, no grant, no entity), THAT is your work: author it with the OWNING section tool (apply_behavior_batch, users, data, ...) and the reading fills itself. ' +
		'\n. coherenceFindings[] come from the coherence engine over the WHOLE project, never from a model, and each one names BOTH nodes at fault plus a fixNowTarget or it is not published. ' +
		'\n. impactFindings[] are read under one hypothesis at a time (add, change or remove, never merged), at a depth of 1 to 5 hops; an entities row must say whether a migration is implied, and a rules row must say replay or rewrite. ' +
		'\n. implementationFindings[] are DERIVED by crossing specified requirements with implementation coverage and reading code anchors. Never write them from your own account of what you built: that is a claim, and it hides exactly the omissions and additions the report exists to surface. One of five verdicts per line, each with a filePath and a lineRange. EVERY LINE NAMES specVersion: the frozen spec version it was built against (read request.specVersion). Crossing into Verify freezes the spec under an incremented version; a report naming another version, or deposited on a request nobody froze, is refused with a 422 and both numbers, never read. ' +
		'\n. proposals[] may be created by an AI client, but only a PERSON accepts, refuses or rewords one, and only acceptance writes the value to its canonical section. Target the OPEN QUESTIONS first: request.openQuestionKeys lists the fields the author declared they cannot answer (keyed path or path@leafId); they are what the completion is for, then the empty fields. ' +
		'\n. openQuestionKeys[] are the author\'s, fieldSignatures[] are people standing behind an exact value (a client never signs), fieldThreads[] hold the conversation next to a field (a client may post, never marks a thread answered nor turns it into a change). Read them; do not author them. ' +
		'\n. observations[] are ruled on by people, never by a client; a validated one must be folded back into the spec before the request can close. ' +
		'\n. history[] is append-only: supersede an entry, never delete it, and every entry names its author and whether that author is a person or a client.'
};
