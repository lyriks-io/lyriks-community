/**
 * Brand & Design — the visual language captured alongside the Experience.
 *
 * This is deliberately DECOUPLED from the simulator's live `SimTheme`
 * (`builder.theme`): it is rich, LLM-brief-oriented documentation (identity,
 * tokens, markers, per-component styling, page principles, good/bad examples)
 * so a downstream model can ship on-brand UI without guessing. Nothing here
 * skins the running simulator — it is pure, framework-free spec data.
 *
 * Shape ported 1:1 from the prototype's `data.brand`.
 */

/* ── Uploaded file references ────────────────────────────────────────────── */
export interface BrandFileRef {
	name: string;
	dataUrl: string;
}

export interface BrandAttachment {
	id: string;
	name: string;
	dataUrl: string;
	size: number;
}

/* ── Identity ────────────────────────────────────────────────────────────── */
export interface BrandIdentity {
	name: string;
	baseline: string;
	missionOneLiner: string;
	toneAdjectives: string[];
	toneDoSay: string;
	toneDontSay: string;
	brandbookFile: BrandFileRef | null;
	brandbookUrl: string;
	brandbookSummary: string;
	visualPersonality: string;
}

/* ── Logo & assets ───────────────────────────────────────────────────────── */
export interface BrandLogoVariant {
	id: string;
	label: string;
	file: BrandFileRef | null;
	url: string;
	role: string;
}

export interface BrandLogoRules {
	clearSpace: string;
	backgroundsAllowed: string;
	backgroundsForbidden: string;
	additionalDoDont: string;
}

export interface BrandLogo {
	variants: BrandLogoVariant[];
	rules: BrandLogoRules;
}

/* ── Colors ──────────────────────────────────────────────────────────────── */
export interface BrandColorToken {
	id: string;
	name: string;
	value: string;
	usage: string;
}

export type BrandSemanticKey =
	| 'background'
	| 'surface'
	| 'text'
	| 'textMuted'
	| 'border'
	| 'success'
	| 'warning'
	| 'error'
	| 'info';

export type BrandSemanticColors = Record<BrandSemanticKey, string>;

export interface BrandColors {
	tokens: BrandColorToken[];
	semantic: BrandSemanticColors;
}

/** Semantic color slots, in display order, with their human label. */
export const BRAND_SEMANTIC_KEYS: { key: BrandSemanticKey; label: string }[] = [
	{ key: 'background', label: 'Page background' },
	{ key: 'surface', label: 'Cards / panels' },
	{ key: 'text', label: 'Body text' },
	{ key: 'textMuted', label: 'Muted / secondary text' },
	{ key: 'border', label: 'Borders / dividers' },
	{ key: 'success', label: 'Success / confirmation' },
	{ key: 'warning', label: 'Warning / attention' },
	{ key: 'error', label: 'Error / destructive' },
	{ key: 'info', label: 'Info / neutral accent' }
];

/* ── Typography ──────────────────────────────────────────────────────────── */
export interface BrandFontFamily {
	stack: string;
	fallback: string;
}

export type BrandFontSlot = 'heading' | 'body' | 'mono';

export interface BrandTypeSize {
	id: string;
	name: string;
	valuePx: number;
	lineHeight: number;
	usage: string;
}

export interface BrandFontWeight {
	id: string;
	name: string;
	value: number;
	usage: string;
}

export interface BrandTypography {
	families: Record<BrandFontSlot, BrandFontFamily>;
	scale: BrandTypeSize[];
	weights: BrandFontWeight[];
}

/* ── Foundation (kept for export parity; no dedicated editor) ────────────── */
export interface BrandFoundationToken {
	id: string;
	name: string;
	valuePx: number;
	usage: string;
}

export interface BrandFoundationShadow {
	id: string;
	name: string;
	value: string;
	usage: string;
}

export interface BrandFoundation {
	space: BrandFoundationToken[];
	radius: BrandFoundationToken[];
	shadow: BrandFoundationShadow[];
	breakpoints: BrandFoundationToken[];
}

/* ── Design markers ──────────────────────────────────────────────────────── */
export type BrandMarkerKey =
	| 'cornerStyle'
	| 'density'
	| 'shadowStyle'
	| 'borderStyle'
	| 'motion'
	| 'caseStyle'
	| 'iconStyle'
	| 'typeContrast'
	| 'accentLevel';

export type BrandMarkers = Record<BrandMarkerKey, string>;

export interface BrandMarkerOption {
	v: string;
	l: string;
	preview: string;
}

export interface BrandMarkerDef {
	key: BrandMarkerKey;
	label: string;
	hint: string;
	/**
	 * The simulator cannot render this trait — the offline icon set is stroke-only,
	 * and accent frequency is an authoring instruction, not a token. It still ships
	 * in the exported brief, so say so rather than let the panel imply otherwise.
	 */
	briefOnly?: boolean;
	options: BrandMarkerOption[];
}

/** High-level UI traits that translate into concrete CSS across every component. */
export const BRAND_MARKER_DEFS: BrandMarkerDef[] = [
	{
		key: 'cornerStyle',
		label: 'Corner style',
		hint: 'How rounded are containers, buttons, inputs?',
		options: [
			{ v: 'square', l: 'Square', preview: 'radius 0' },
			{ v: 'rounded', l: 'Rounded', preview: 'radius 8px' },
			{ v: 'pill', l: 'Pill', preview: 'radius 9999' }
		]
	},
	{
		key: 'density',
		label: 'Density',
		hint: 'How much padding inside interactive surfaces?',
		options: [
			{ v: 'compact', l: 'Compact', preview: 'padding 6/10' },
			{ v: 'comfortable', l: 'Comfortable', preview: 'padding 10/16' },
			{ v: 'spacious', l: 'Spacious', preview: 'padding 14/22' }
		]
	},
	{
		key: 'shadowStyle',
		label: 'Shadow style',
		hint: 'Depth and prominence of elevations.',
		options: [
			{ v: 'none', l: 'None', preview: 'no shadow' },
			{ v: 'subtle', l: 'Subtle', preview: '0 1 2 / .05' },
			{ v: 'elevated', l: 'Elevated', preview: '0 10 20 / .12' }
		]
	},
	{
		key: 'borderStyle',
		label: 'Border style',
		hint: 'How visible are dividers and outlines?',
		options: [
			{ v: 'hairline', l: 'Hairline', preview: '1px low-α' },
			{ v: 'soft', l: 'Soft', preview: '1px med-α' },
			{ v: 'strong', l: 'Strong', preview: '1.5px solid' }
		]
	},
	{
		key: 'motion',
		label: 'Motion',
		hint: 'Default transition feel.',
		options: [
			{ v: 'instant', l: 'Instant', preview: '0ms' },
			{ v: 'smooth', l: 'Smooth', preview: '150ms ease' },
			{ v: 'playful', l: 'Playful', preview: '280ms bezier' }
		]
	},
	{
		key: 'caseStyle',
		label: 'Label case',
		hint: 'Default casing for labels and buttons.',
		options: [
			{ v: 'as-is', l: 'As written', preview: 'Submit' },
			{ v: 'lowercase', l: 'lowercase', preview: 'submit' },
			{ v: 'uppercase', l: 'UPPERCASE', preview: 'SUBMIT' }
		]
	},
	{
		key: 'iconStyle',
		label: 'Icon style',
		hint: 'Stroke or fill style for icons.',
		briefOnly: true,
		options: [
			{ v: 'outline', l: 'Outline', preview: 'stroke' },
			{ v: 'solid', l: 'Solid', preview: 'fill' },
			{ v: 'duotone', l: 'Duotone', preview: '2-color' }
		]
	},
	{
		key: 'typeContrast',
		label: 'Type contrast',
		hint: 'Difference between headlines and body.',
		options: [
			{ v: 'low', l: 'Low', preview: '1.2 ratio' },
			{ v: 'medium', l: 'Medium', preview: '1.5 ratio' },
			{ v: 'high', l: 'High', preview: '2.0 ratio' }
		]
	},
	{
		key: 'accentLevel',
		label: 'Accent use',
		hint: 'How often the brand accent shows up.',
		briefOnly: true,
		options: [
			{ v: 'minimal', l: 'Minimal', preview: 'rare' },
			{ v: 'balanced', l: 'Balanced', preview: 'measured' },
			{ v: 'generous', l: 'Generous', preview: 'frequent' }
		]
	}
];

/* ── Component styling ───────────────────────────────────────────────────── */
export interface BrandComponentTokens {
	bgColor: string;
	textColor: string;
	fontFamily: string;
	fontSize: string;
	fontWeight: string;
}

export interface BrandComponent {
	id: string;
	refName: string;
	refKind: string;
	variants: string[];
	states: string[];
	dos: string;
	donts: string;
	codeExample: string;
	tokens: BrandComponentTokens;
}

/* ── Pages & layouts ─────────────────────────────────────────────────────── */
export interface BrandPage {
	id: string;
	type: string;
	principles: string;
	densityNote: string;
	screenshotRefs: BrandFileRef[];
	referenceUrls: string[];
}

/* ── Good / bad examples ─────────────────────────────────────────────────── */
export interface BrandExample {
	id: string;
	title: string;
	goodSnippet: string;
	goodCode: string;
	badSnippet: string;
	badCode: string;
	explanation: string;
}

/* ── Aggregate ───────────────────────────────────────────────────────────── */
export type BrandSection =
	| 'identity'
	| 'logo'
	| 'colors'
	| 'typography'
	| 'markers'
	| 'components'
	| 'pages'
	| 'examples';

export interface ProjectBrand {
	identity: BrandIdentity;
	logo: BrandLogo;
	colors: BrandColors;
	typography: BrandTypography;
	foundation: BrandFoundation;
	markers: BrandMarkers;
	components: BrandComponent[];
	pages: BrandPage[];
	examples: BrandExample[];
	attachments: Partial<Record<BrandSection, BrandAttachment[]>>;
}

/* ── Defaults ────────────────────────────────────────────────────────────── */
function emptySemantic(): BrandSemanticColors {
	return {
		background: '',
		surface: '',
		text: '',
		textMuted: '',
		border: '',
		success: '',
		warning: '',
		error: '',
		info: ''
	};
}

function emptyFamilies(): Record<BrandFontSlot, BrandFontFamily> {
	return {
		heading: { stack: '', fallback: '' },
		body: { stack: '', fallback: '' },
		mono: { stack: '', fallback: '' }
	};
}

/** Seed marker choices — some differ from `options[0]` (the prototype's seed). */
export function defaultMarkers(): BrandMarkers {
	return {
		cornerStyle: 'rounded',
		density: 'comfortable',
		shadowStyle: 'subtle',
		borderStyle: 'soft',
		motion: 'smooth',
		caseStyle: 'as-is',
		iconStyle: 'outline',
		typeContrast: 'medium',
		accentLevel: 'minimal'
	};
}

export function defaultBrand(): ProjectBrand {
	return {
		identity: {
			name: '',
			baseline: '',
			missionOneLiner: '',
			toneAdjectives: [],
			toneDoSay: '',
			toneDontSay: '',
			brandbookFile: null,
			brandbookUrl: '',
			brandbookSummary: '',
			visualPersonality: ''
		},
		logo: {
			variants: [],
			rules: {
				clearSpace: '',
				backgroundsAllowed: '',
				backgroundsForbidden: '',
				additionalDoDont: ''
			}
		},
		colors: { tokens: [], semantic: emptySemantic() },
		typography: { families: emptyFamilies(), scale: [], weights: [] },
		foundation: { space: [], radius: [], shadow: [], breakpoints: [] },
		markers: defaultMarkers(),
		components: [],
		pages: [],
		examples: [],
		attachments: {}
	};
}

/* ── Anti-corruption parse (tolerant merge over defaults) ────────────────── */
function str(v: unknown, fallback = ''): string {
	return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback: number): number {
	return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function strArray(v: unknown): string[] {
	return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function id(v: unknown): string {
	return typeof v === 'string' && v ? v : crypto.randomUUID();
}
function fileRef(v: unknown): BrandFileRef | null {
	if (!v || typeof v !== 'object') return null;
	const o = v as Record<string, unknown>;
	if (typeof o.dataUrl !== 'string') return null;
	return { name: str(o.name), dataUrl: o.dataUrl };
}
function rows<T>(v: unknown, map: (o: Record<string, unknown>) => T): T[] {
	return Array.isArray(v) ? v.map((r) => map((r ?? {}) as Record<string, unknown>)) : [];
}

export function coerceBrand(input: unknown): ProjectBrand {
	const base = defaultBrand();
	if (!input || typeof input !== 'object') return base;
	const src = input as Record<string, unknown>;

	const identity = (src.identity ?? {}) as Record<string, unknown>;
	const logo = (src.logo ?? {}) as Record<string, unknown>;
	const logoRules = (logo.rules ?? {}) as Record<string, unknown>;
	const colors = (src.colors ?? {}) as Record<string, unknown>;
	const semantic = (colors.semantic ?? {}) as Record<string, unknown>;
	const typo = (src.typography ?? {}) as Record<string, unknown>;
	const families = (typo.families ?? {}) as Record<string, unknown>;
	const foundation = (src.foundation ?? {}) as Record<string, unknown>;
	const markers = (src.markers ?? {}) as Record<string, unknown>;
	const attachmentsIn = (src.attachments ?? {}) as Record<string, unknown>;

	const family = (slot: BrandFontSlot): BrandFontFamily => {
		const f = (families[slot] ?? {}) as Record<string, unknown>;
		return { stack: str(f.stack), fallback: str(f.fallback) };
	};

	const semanticOut = emptySemantic();
	for (const { key } of BRAND_SEMANTIC_KEYS) semanticOut[key] = str(semantic[key]);

	const markersOut = defaultMarkers();
	for (const def of BRAND_MARKER_DEFS) {
		if (typeof markers[def.key] === 'string') markersOut[def.key] = markers[def.key] as string;
	}

	const attachments: Partial<Record<BrandSection, BrandAttachment[]>> = {};
	const sections: BrandSection[] = [
		'identity',
		'logo',
		'colors',
		'typography',
		'markers',
		'components',
		'pages',
		'examples'
	];
	for (const s of sections) {
		if (Array.isArray(attachmentsIn[s])) {
			attachments[s] = rows<BrandAttachment>(attachmentsIn[s], (o) => ({
				id: id(o.id),
				name: str(o.name),
				dataUrl: str(o.dataUrl),
				size: num(o.size, 0)
			}));
		}
	}

	const foundationTokens = (v: unknown): BrandFoundationToken[] =>
		rows(v, (o) => ({ id: id(o.id), name: str(o.name), valuePx: num(o.valuePx, 0), usage: str(o.usage) }));

	return {
		identity: {
			name: str(identity.name),
			baseline: str(identity.baseline),
			missionOneLiner: str(identity.missionOneLiner),
			toneAdjectives: strArray(identity.toneAdjectives),
			toneDoSay: str(identity.toneDoSay),
			toneDontSay: str(identity.toneDontSay),
			brandbookFile: fileRef(identity.brandbookFile),
			brandbookUrl: str(identity.brandbookUrl),
			brandbookSummary: str(identity.brandbookSummary),
			visualPersonality: str(identity.visualPersonality)
		},
		logo: {
			variants: rows(logo.variants, (o) => ({
				id: id(o.id),
				label: str(o.label),
				file: fileRef(o.file),
				url: str(o.url),
				role: str(o.role)
			})),
			rules: {
				clearSpace: str(logoRules.clearSpace),
				backgroundsAllowed: str(logoRules.backgroundsAllowed),
				backgroundsForbidden: str(logoRules.backgroundsForbidden),
				additionalDoDont: str(logoRules.additionalDoDont)
			}
		},
		colors: {
			tokens: rows(colors.tokens, (o) => ({
				id: id(o.id),
				name: str(o.name),
				value: str(o.value, '#000000'),
				usage: str(o.usage)
			})),
			semantic: semanticOut
		},
		typography: {
			families: { heading: family('heading'), body: family('body'), mono: family('mono') },
			scale: rows(typo.scale, (o) => ({
				id: id(o.id),
				name: str(o.name),
				valuePx: num(o.valuePx, 16),
				lineHeight: num(o.lineHeight, 1.5),
				usage: str(o.usage)
			})),
			weights: rows(typo.weights, (o) => ({
				id: id(o.id),
				name: str(o.name),
				value: num(o.value, 400),
				usage: str(o.usage)
			}))
		},
		foundation: {
			space: foundationTokens(foundation.space),
			radius: foundationTokens(foundation.radius),
			shadow: rows(foundation.shadow, (o) => ({
				id: id(o.id),
				name: str(o.name),
				value: str(o.value),
				usage: str(o.usage)
			})),
			breakpoints: foundationTokens(foundation.breakpoints)
		},
		markers: markersOut,
		components: rows(src.components, (o) => {
			const t = (o.tokens ?? {}) as Record<string, unknown>;
			return {
				id: id(o.id),
				refName: str(o.refName),
				refKind: str(o.refKind),
				variants: strArray(o.variants),
				states: strArray(o.states),
				dos: str(o.dos),
				donts: str(o.donts),
				codeExample: str(o.codeExample),
				tokens: {
					bgColor: str(t.bgColor),
					textColor: str(t.textColor),
					fontFamily: str(t.fontFamily),
					fontSize: str(t.fontSize),
					fontWeight: str(t.fontWeight)
				}
			};
		}),
		pages: rows(src.pages, (o) => ({
			id: id(o.id),
			type: str(o.type),
			principles: str(o.principles),
			densityNote: str(o.densityNote),
			screenshotRefs: Array.isArray(o.screenshotRefs)
				? (o.screenshotRefs.map(fileRef).filter(Boolean) as BrandFileRef[])
				: [],
			referenceUrls: strArray(o.referenceUrls)
		})),
		examples: rows(src.examples, (o) => ({
			id: id(o.id),
			title: str(o.title),
			goodSnippet: str(o.goodSnippet),
			goodCode: str(o.goodCode),
			badSnippet: str(o.badSnippet),
			badCode: str(o.badCode),
			explanation: str(o.explanation)
		})),
		attachments
	};
}

/* ── Pure resolvers (markers → CSS, token name → value) ──────────────────── */
export interface ResolvedMarkers {
	radius: string;
	padding: string;
	shadow: string;
	border: string;
	transition: string;
	textTransform: string;
	iconStyle: string;
	typeContrast: string;
	accentLevel: string;
	fallbackBg: string;
	fallbackText: string;
	fallbackBorder: string;
}

/** Translate markers + semantic colors into concrete CSS for previews & export. */
export function resolveMarkers(brand: ProjectBrand): ResolvedMarkers {
	const m = brand.markers ?? ({} as BrandMarkers);
	const sem = brand.colors?.semantic ?? emptySemantic();
	const radiusMap: Record<string, string> = { square: '0', rounded: '8px', pill: '9999px' };
	const padMap: Record<string, string> = {
		compact: '6px 10px',
		comfortable: '10px 16px',
		spacious: '14px 22px'
	};
	const shadowMap: Record<string, string> = {
		none: 'none',
		subtle: '0 1px 2px rgba(0,0,0,0.05)',
		elevated: '0 10px 20px rgba(0,0,0,0.12)'
	};
	const borderMap: Record<string, string> = {
		hairline: '1px solid rgba(0,0,0,0.06)',
		soft: '1px solid rgba(0,0,0,0.12)',
		strong: '1.5px solid rgba(0,0,0,0.35)'
	};
	const motionMap: Record<string, string> = {
		instant: '0ms linear',
		smooth: '150ms ease-out',
		playful: '280ms cubic-bezier(.34,1.56,.64,1)'
	};
	const caseMap: Record<string, string> = { 'as-is': 'none', lowercase: 'lowercase', uppercase: 'uppercase' };
	return {
		radius: radiusMap[m.cornerStyle] || '8px',
		padding: padMap[m.density] || '10px 16px',
		shadow: shadowMap[m.shadowStyle] || 'none',
		border: borderMap[m.borderStyle] || '1px solid rgba(0,0,0,0.12)',
		transition: motionMap[m.motion] || '150ms ease-out',
		textTransform: caseMap[m.caseStyle] || 'none',
		iconStyle: m.iconStyle || 'outline',
		typeContrast: m.typeContrast || 'medium',
		accentLevel: m.accentLevel || 'balanced',
		fallbackBg: sem.surface || '#FFFFFF',
		fallbackText: sem.text || '#111827',
		fallbackBorder: sem.border || 'rgba(0,0,0,0.12)'
	};
}

export type BrandTokenGroup = 'color' | 'fontSize' | 'fontWeight' | 'fontFamily';

/** Resolve a token name (or a raw value) against the brand token catalog. */
export function resolveToken(brand: ProjectBrand, group: BrandTokenGroup, key: string): string | null {
	if (!key) return null;
	const k = key.trim();
	if (/^(#|rgb|hsl)/i.test(k)) return k;
	if (/^[\d.]+(px|rem|em)$/i.test(k)) return k;
	if (group === 'color') {
		const t = (brand.colors?.tokens ?? []).find((t) => t.name === k);
		if (t) return t.value;
		const sem = brand.colors?.semantic ?? emptySemantic();
		if (sem[k as BrandSemanticKey]) return sem[k as BrandSemanticKey];
	} else if (group === 'fontSize') {
		const t = (brand.typography?.scale ?? []).find((t) => t.name === k);
		if (t) return `${t.valuePx}px`;
	} else if (group === 'fontWeight') {
		const t = (brand.typography?.weights ?? []).find((t) => t.name === k);
		if (t) return String(t.value);
	} else if (group === 'fontFamily') {
		const slot = brand.typography?.families?.[k as BrandFontSlot];
		if (slot) return [slot.stack, slot.fallback].filter(Boolean).join(', ');
	}
	return k;
}

/** Stable id for a new brand row. */
export function brandNewId(prefix: string): string {
	return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}
