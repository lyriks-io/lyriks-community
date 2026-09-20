import type {
	BrandColorToken,
	BrandComponent,
	BrandExample,
	BrandFontRole,
	BrandFontWeight,
	BrandFoundationShadow,
	BrandFoundationToken,
	BrandLogoVariant,
	BrandPage,
	BrandTypeSize
} from './brand';

/**
 * One item per list of the brand draft, keyed by the dotted path of the list.
 *
 * An empty draft shows every list as `[]`, which tells an author (a person
 * reading the section contract, or an AI client calling describe_section)
 * nothing about what goes in it. Each sample is typed against the model, so
 * the compiler refuses one that drifts from the shape it documents.
 */
export const BRAND_LIST_SAMPLES = {
	'brand.logo.variants': {
		id: 'logo-primary',
		label: 'Primary, full colour',
		file: null,
		url: 'https://example.com/brand/logo.svg',
		role: 'primary'
	} satisfies BrandLogoVariant,
	'brand.colors.tokens': { id: 'col-brand', name: 'brand', value: '#4F46E5', usage: 'Primary actions and links' } satisfies BrandColorToken,
	'brand.typography.roles': {
		id: 'fr-display',
		name: 'display',
		stack: '"Playfair Display", serif',
		fallback: 'Georgia, serif',
		usage: 'Titles only, 64 px and up; never body text'
	} satisfies BrandFontRole,
	'brand.typography.scale': { id: 'sz-base', name: 'base', valuePx: 16, lineHeight: 1.5, usage: 'Body copy' } satisfies BrandTypeSize,
	'brand.typography.weights': { id: 'wt-medium', name: 'medium', value: 500, usage: 'Emphasis' } satisfies BrandFontWeight,
	'brand.foundation.space (same item shape for radius and breakpoints)': {
		id: 'sp-4',
		name: '4',
		valuePx: 16,
		usage: 'Default gap between controls'
	} satisfies BrandFoundationToken,
	'brand.foundation.shadow': { id: 'sh-card', name: 'card', value: '0 1px 2px rgba(0,0,0,0.08)', usage: 'Cards' } satisfies BrandFoundationShadow,
	'brand.components': {
		id: 'bc-button',
		refName: 'Button',
		refKind: 'component',
		variants: ['primary', 'ghost'],
		states: ['default', 'hover', 'disabled'],
		dos: 'One primary action per view.',
		donts: 'Never two primary buttons side by side.',
		codeExample: '<Button variant="primary">Save</Button>',
		tokens: { bgColor: 'brand', textColor: 'surface', fontFamily: 'body', fontSize: 'base', fontWeight: 'medium' }
	} satisfies BrandComponent,
	'brand.pages': {
		id: 'bp-dashboard',
		type: 'Dashboard',
		principles: 'Numbers first, one chart per question.',
		densityNote: 'Comfortable on desktop, compact tables allowed.',
		screenshotRefs: [],
		referenceUrls: ['https://example.com/brand/dashboard.png']
	} satisfies BrandPage,
	'brand.examples': {
		id: 'be-empty-state',
		title: 'Empty state',
		goodSnippet: 'Says what the list is for and offers the one action that fills it.',
		goodCode: '',
		badSnippet: 'A bare "No data" line.',
		badCode: '',
		explanation: 'An empty screen is the first thing a new user sees.'
	} satisfies BrandExample,
};
