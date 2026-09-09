/**
 * Closed vocabularies for the Foundation identity slice, transcribed verbatim
 * from the Lyriks behavioral spec (feature `4ad873cc`). Codes are the contract;
 * labels are human display copy. Keep codes stable — they are persisted and
 * shared with downstream wizard steps.
 */

import type { Option } from '$domain/shared';

/* ── Industry ─────────────────────────────────────────────────────────── */
export const INDUSTRIES = [
	{ code: 'ecommerce_conversion', label: 'E-commerce · Conversion' },
	{ code: 'retail', label: 'Retail' },
	{ code: 'saas', label: 'SaaS' },
	{ code: 'fintech', label: 'Fintech' },
	{ code: 'healthcare', label: 'Healthcare' },
	{ code: 'manufacturing', label: 'Manufacturing' },
	{ code: 'education', label: 'Education' },
	{ code: 'media', label: 'Media' },
	{ code: 'public_sector', label: 'Public sector' },
	{ code: 'transport', label: 'Transport' },
	{ code: 'energy', label: 'Energy' },
	{ code: 'legal', label: 'Legal' },
	{ code: 'hr', label: 'HR' },
	{ code: 'other', label: 'Other' }
] as const satisfies readonly Option[];
export type IndustryCode = (typeof INDUSTRIES)[number]['code'];

/** Display label for an industry — custom (user-typed) values display as-is. */
export function industryLabelOf(industry: string): string {
	return INDUSTRIES.find((i) => i.code === industry)?.label ?? (industry.trim() || 'Product spec');
}

/* ── Product type ─────────────────────────────────────────────────────── */
export const PRODUCT_TYPES = [
	{ code: 'production_product', label: 'Production product' },
	{ code: 'internal_tool', label: 'Internal tool' },
	{ code: 'mvp', label: 'MVP' },
	{ code: 'prototype', label: 'Prototype' },
	{ code: 'side_project', label: 'Side project' },
	{ code: 'research_spike', label: 'Research spike' }
] as const satisfies readonly Option[];
export type ProductTypeCode = (typeof PRODUCT_TYPES)[number]['code'];

/* ── Market type ──────────────────────────────────────────────────────── */
export const MARKET_TYPES = [
	{ code: 'b2b', label: 'B2B', hint: 'Sell to businesses' },
	{ code: 'b2c', label: 'B2C', hint: 'Sell to consumers' },
	{ code: 'b2b2c', label: 'B2B2C', hint: 'Through a business to its users' },
	{ code: 'd2c', label: 'D2C', hint: 'Direct to consumer' },
	{ code: 'b2g', label: 'B2G', hint: 'Sell to government' },
	{ code: 'p2p', label: 'P2P', hint: 'Peer to peer' },
	{ code: 'marketplace', label: 'Marketplace', hint: 'Multi-sided platform matching supply and demand' },
	{ code: 'nonprofit', label: 'Non-profit', hint: 'Mission-driven, not revenue-first' },
	{ code: 'internal', label: 'Internal', hint: 'In-house tool for your own organization' }
] as const satisfies readonly Option[];
export type MarketTypeCode = (typeof MARKET_TYPES)[number]['code'];

/* ── Customer size ────────────────────────────────────────────────────── */
export const CUSTOMER_SIZES = [
	{ code: 'tpe_lt_10', label: 'TPE (<10)' },
	{ code: 'smb_10_250', label: 'SMB (10–250)' },
	{ code: 'mid_market', label: 'Mid-market' },
	{ code: 'eti', label: 'ETI' },
	{ code: 'enterprise', label: 'Enterprise' },
	{ code: 'public', label: 'Public sector' }
] as const satisfies readonly Option[];
export type CustomerSizeCode = (typeof CUSTOMER_SIZES)[number]['code'];

/* ── Form factors — grouped tile grid (multi-select) ──────────────────── */
export interface FormFactorGroup {
	readonly label: string;
	readonly items: readonly Option<FormFactorCode>[];
}

export const FORM_FACTOR_GROUPS: readonly FormFactorGroup[] = [
	{
		label: 'Visual interfaces',
		items: [
			{ code: 'desktop_gui', label: 'Desktop GUI', hint: 'Keyboard, mouse, screen' },
			{ code: 'web_interface', label: 'Web interface', hint: 'Browser, click, form, scroll' },
			{ code: 'mobile_touch', label: 'Mobile touch', hint: 'Tap, swipe, pinch' },
			{ code: 'tablet_kiosk', label: 'Tablet / kiosk', hint: 'Touch surface, public booth' }
		]
	},
	{
		label: 'Terminal',
		items: [
			{ code: 'cli', label: 'CLI', hint: 'Command-line text' },
			{ code: 'tui', label: 'TUI', hint: 'Interactive text UI in a terminal' }
		]
	},
	{
		label: 'Conversational',
		items: [
			{ code: 'text_chatbot', label: 'Text chatbot', hint: 'Written conversation' },
			{ code: 'voice_assistant', label: 'Voice assistant', hint: 'Spoken interaction' }
		]
	},
	{
		label: 'Sensory & immersive',
		items: [
			{ code: 'gesture_ui', label: 'Gesture UI', hint: 'Hand / body movement' },
			{ code: 'eye_tracking', label: 'Eye tracking', hint: 'Gaze interaction' },
			{ code: 'vr_ar_mr', label: 'VR / AR / MR', hint: 'Immersive 3D' }
		]
	},
	{
		label: 'Programmatic',
		items: [
			{ code: 'api', label: 'API', hint: 'Software to software' },
			{ code: 'webhooks_events', label: 'Webhooks / events', hint: 'Event-driven' }
		]
	},
	{
		label: 'Automation & AI',
		items: [
			{ code: 'rpa', label: 'RPA', hint: 'Robot clicks like a human' },
			{ code: 'ai_agent', label: 'AI agent', hint: 'Goal-driven, multi-tool' },
			{ code: 'prompt_interface', label: 'Prompt interface', hint: 'Natural-language instructions' },
			{ code: 'nocode_lowcode', label: 'No-code / low-code', hint: 'Visual builder' }
		]
	},
	{
		label: 'Embedded',
		items: [
			{ code: 'embedded_ui', label: 'Embedded UI', hint: 'Inside another product' },
			{ code: 'iot_sensors', label: 'IoT sensors', hint: 'Physical device telemetry' },
			{ code: 'biometric', label: 'Biometric', hint: 'Fingerprint, face, voice ID' },
			{ code: 'ambient_invisible', label: 'Ambient / invisible', hint: 'No explicit UI' }
		]
	}
];

/** Flat list of every form-factor option, across groups. */
export const ALL_FORM_FACTORS: readonly Option<FormFactorCode>[] = FORM_FACTOR_GROUPS.flatMap(
	(g) => [...g.items]
);

export type FormFactorCode =
	| 'desktop_gui'
	| 'web_interface'
	| 'mobile_touch'
	| 'tablet_kiosk'
	| 'cli'
	| 'tui'
	| 'text_chatbot'
	| 'voice_assistant'
	| 'gesture_ui'
	| 'eye_tracking'
	| 'vr_ar_mr'
	| 'api'
	| 'webhooks_events'
	| 'rpa'
	| 'ai_agent'
	| 'prompt_interface'
	| 'nocode_lowcode'
	| 'embedded_ui'
	| 'iot_sensors'
	| 'biometric'
	| 'ambient_invisible';

/* ── Languages (ISO 639-1 subset) ─────────────────────────────────────── */
export const LANGUAGES = [
	{ code: 'en', label: 'English' },
	{ code: 'fr', label: 'French' },
	{ code: 'nl', label: 'Dutch' },
	{ code: 'de', label: 'German' },
	{ code: 'es', label: 'Spanish' },
	{ code: 'it', label: 'Italian' },
	{ code: 'pt', label: 'Portuguese' },
	{ code: 'pl', label: 'Polish' },
	{ code: 'sv', label: 'Swedish' },
	{ code: 'da', label: 'Danish' },
	{ code: 'fi', label: 'Finnish' },
	{ code: 'ja', label: 'Japanese' },
	{ code: 'zh', label: 'Chinese' },
	{ code: 'ar', label: 'Arabic' }
] as const satisfies readonly Option[];
export type LanguageCode = (typeof LANGUAGES)[number]['code'];

/** ISO codes that imply EU data-protection scope (drives a coherence check). */
export const EU_LANGUAGE_CODES: readonly string[] = [
	'fr',
	'de',
	'es',
	'it',
	'nl',
	'pt',
	'pl',
	'sv',
	'da',
	'fi'
];

/* ── Regulations ──────────────────────────────────────────────────────── */
export const REGULATIONS = [
	{ code: 'GDPR', label: 'GDPR' },
	{ code: 'SOC2', label: 'SOC 2' },
	{ code: 'eIDAS', label: 'eIDAS' },
	{ code: 'HIPAA', label: 'HIPAA' },
	{ code: 'PCI_DSS', label: 'PCI DSS' },
	{ code: 'ISO_27001', label: 'ISO 27001' },
	{ code: 'CCPA', label: 'CCPA' },
	{ code: 'DORA', label: 'DORA' },
	{ code: 'NIS2', label: 'NIS2' }
] as const satisfies readonly Option[];
export type RegulationCode = (typeof REGULATIONS)[number]['code'];

/* ── Industry sectors (multi-level taxonomy, "Parent → Child") ────────── */
export const INDUSTRY_SECTORS: readonly string[] = [
	'Tech → SaaS',
	'Tech → Developer tools',
	'Tech → AI / ML',
	'Retail → E-commerce',
	'Retail → Marketplace',
	'Retail → Point of sale',
	'Finance → Banking',
	'Finance → Payments',
	'Finance → Insurance',
	'Health → Clinical',
	'Health → Wellness',
	'Industry → Manufacturing',
	'Industry → Logistics',
	'Public → Government',
	'Public → Education',
	'Media → Streaming',
	'Media → Publishing'
];

/* ── Methodology · feature expression mode (single-select) ────────────── */
export const FEATURE_EXPRESSION_MODES = [
	{ code: 'user_story', label: 'User story', hint: 'As a <role>, I want <goal> so that <benefit>' },
	{ code: 'job_story', label: 'Job story', hint: 'When <situation>, I want <motivation>, so I can <outcome>' },
	{ code: 'use_case', label: 'Use case', hint: 'Actors, preconditions, main / alternate flows' },
	{ code: 'bdd_gherkin', label: 'BDD / Gherkin', hint: 'Given / When / Then scenarios' },
	{ code: 'free_description', label: 'Free description', hint: 'No framework: describe it in prose' }
] as const satisfies readonly Option[];
export type FeatureExpressionModeCode = (typeof FEATURE_EXPRESSION_MODES)[number]['code'];

/* ── Rule patterns ────────────────────────────────────────────────────── */
/**
 * The closed set of structured forms a rule can be captured in. Drives both the
 * project-wide "structured form for rules" default and the workspace
 * activated-patterns library (the project picks a subset of these to allow).
 */
export const RULE_PATTERNS = [
	{ code: 'plain_text', label: 'Plain text', hint: 'Narrative, translated to a structured form on save' },
	{ code: 'gherkin', label: 'Gherkin', hint: 'Given / When / Then' },
	{ code: 'decision_table', label: 'Decision table', hint: 'Conditions × outcomes' },
	{ code: 'equation', label: 'Equation', hint: 'Maths / formula' },
	{ code: 'dmn', label: 'DMN', hint: 'Decision Model & Notation' }
] as const satisfies readonly Option[];
export type RulePatternCode = (typeof RULE_PATTERNS)[number]['code'];

/** Every rule-pattern code, in declaration order (the full workspace library). */
export const ALL_RULE_PATTERN_CODES: readonly RulePatternCode[] = RULE_PATTERNS.map((p) => p.code);

/* ── Origin · source mode (single-select) ─────────────────────────────── */
export const SOURCE_MODES = [
	{ code: 'greenfield', label: 'Greenfield', hint: 'Start from a blank canvas, PO creation' },
	{ code: 'from_document', label: 'From document', hint: 'PDF, Notion, Confluence, a written spec' },
	{ code: 'code_to_spec', label: 'Code-To-Spec', hint: 'Reverse engineer an existing codebase' },
	{ code: 'from_figma', label: 'From Figma', hint: 'Screens and components first' },
	{ code: 'ma_dd_audit', label: 'M&A / DD audit', hint: 'Pre-acquisition coherence pack, RFI governance' }
] as const satisfies readonly Option[];
export type SourceModeCode = (typeof SOURCE_MODES)[number]['code'];
export const isSourceModeCode = (value: unknown): value is SourceModeCode =>
	SOURCE_MODES.some((m) => m.code === value);

/* ── Rule families (default-pattern profile) ──────────────────────────── */
export const RULE_FAMILIES = [
	{ code: 'pricing_money', label: 'Pricing & money' },
	{ code: 'access_security', label: 'Access & security' },
	{ code: 'data_validation', label: 'Data validation' },
	{ code: 'sla_quality', label: 'SLA & quality' },
	{ code: 'compliance_legal', label: 'Compliance & legal' },
	{ code: 'workflow_state', label: 'Workflow & state' },
	{ code: 'ux_behavior', label: 'UX & behavior' },
	{ code: 'ai_guardrail', label: 'AI guardrail' }
] as const satisfies readonly Option[];
export type RuleFamilyCode = (typeof RULE_FAMILIES)[number]['code'];

/* ── Project mode (collaboration) ─────────────────────────────────────── */
export const PROJECT_MODES = [
	{ code: 'solo', label: 'Solo project', hint: 'You are the only collaborator' },
	{ code: 'team', label: 'Team project', hint: 'Multiple collaborators share this project' }
] as const satisfies readonly Option[];
export type ProjectModeCode = (typeof PROJECT_MODES)[number]['code'];

/* ── KPI units ────────────────────────────────────────────────────────── */
export const KPI_UNITS: readonly string[] = [
	'%',
	'days',
	'hours',
	'min',
	'count',
	'EUR',
	'USD',
	'/month',
	'x'
];
