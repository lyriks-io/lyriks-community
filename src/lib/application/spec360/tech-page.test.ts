import { describe, expect, it } from 'vitest';
import { ALL_FORM_FACTORS, createEmptyDefinitionDraft, createEmptyIdentityDraft, createEmptyOperationsDraft } from '$domain/foundation';
import { createDatabase, createEmptyDataDraft, createEntity } from '$domain/data';
import { dataFacts, environmentsReading, formFactorDevices, healthItems, implementationReading, languagesReading, runtimeReading } from './tech';

const P = 'p1';
const cov = (featureId: string, found: number, expected: number) => ({ featureId, found, expected, percent: 0, updatedAt: null, specUpdatedAt: null });

/** Health reads how much the code holds and where the product runs [criterion:8a696e52]. */
describe('the Health page [criterion:8a696e52]', () => {
	it('sums the spec elements located in the code and the features fully implemented', () => {
		const r = implementationReading([cov('a', 10, 10), cov('b', 0, 5), cov('c', 4, 5), cov('d', 0, 0)]);
		expect(r).toMatchObject({ found: 14, expected: 20, share: '70 %', measured: 3, complete: 1, none: 1 });
		expect(r?.ratio).toBeCloseTo(0.7);
	});

	it('reads one decimal at most and never 100 % before every element is found', () => {
		expect(implementationReading([cov('a', 3830, 3840)])?.share).toBe('99.7 %');
		expect(implementationReading([cov('a', 3839, 3840)])?.share).toBe('99.9 %');
		expect(implementationReading([cov('a', 608, 608)])?.share).toBe('100 %');
	});

	it('says nothing when the code was never located', () => {
		expect(implementationReading([])).toBeNull();
		expect(implementationReading([cov('a', 0, 0)])).toBeNull();
	});

	it('draws each form factor with a device where it has one, and each machine with its kind and place', () => {
		expect(formFactorDevices(['mobile_touch', 'web_interface', 'api', 'tui']).map((d) => `${d.label}:${d.shape}`)).toEqual([
			'API:braces',
			'Mobile touch:phone',
			'TUI:terminal-panel',
			'Web interface:browser'
		]);
		const data = createEmptyDataDraft(P);
		data.hosts = [
			{ id: 'h', name: 'EU VPS', kind: 'cloud', provider: 'Scaleway', region: 'eu-west-3', description: 'Two EU VPS.' },
			{ id: 'x', name: ' ', kind: 'internal', provider: '', region: '', description: '' }
		];
		const identity = createEmptyIdentityDraft(P);
		identity.formFactors = ['tablet_kiosk'];
		const env = environmentsReading({ data, identity });
		expect(env.devices.map((d) => d.shape)).toEqual(['tablet']);
		expect(env.machines).toEqual([{ id: 'h', name: 'EU VPS', kind: 'Cloud', place: 'eu-west-3 · Scaleway', description: 'Two EU VPS.' }]);
	});

	it('reads a form factor written by its short name as the catalog one, once', () => {
		expect(new Set(formFactorDevices(['desktop', 'Web', 'mobile', 'tablet']).map((d) => `${d.code}:${d.shape}`))).toEqual(
			new Set(['desktop_gui:desktop', 'web_interface:browser', 'mobile_touch:phone', 'tablet_kiosk:tablet'])
		);
		expect(formFactorDevices(['desktop', 'desktop_gui'])).toHaveLength(1);
	});

	it('says what a level of audit logs means', () => {
		const definition = { ...createEmptyDefinitionDraft(P), lastSavedAt: '2026-11-03T00:00:00.000Z' };
		definition.security = { ...definition.security, auditLogs: 'partial' };
		const items = healthItems({ data: createEmptyDataDraft(P), definition, operations: createEmptyOperationsDraft(P), coverage: [] });
		expect(items.find((i) => i.key === 'audit-logs')).toEqual({
			key: 'audit-logs',
			title: 'Audit logs',
			description: 'Some actions leave a trace in the audit log, not all of them.',
			chips: ['Partial']
		});
	});

	it('says what the performance and availability targets mean, unless the spec notes say it', () => {
		const definition = createEmptyDefinitionDraft(P);
		definition.technical.availability = 'Business hours';
		const operations = createEmptyOperationsDraft(P);
		operations.quality = { ...operations.quality, latencyP95Ms: '300' };
		const read = () => healthItems({ data: createEmptyDataDraft(P), definition, operations, coverage: [] });
		expect(read().map((i) => [i.key, i.description])).toEqual([
			['performance', 'How fast the product must answer.'],
			['availability', 'How much of the time the product must be up.']
		]);
		operations.quality = { ...operations.quality, perfNotes: 'Measured on a 4G phone.' };
		expect(read().find((i) => i.key === 'performance')?.description).toBe('Measured on a 4G phone.');
	});
});

/** The Requirements read as drawn answers [criterion:4af7cac8]. */
describe('the Requirements page [criterion:4af7cac8]', () => {
	it('reads where it must run: the devices, the platforms and the browsers', () => {
		const identity = createEmptyIdentityDraft(P);
		identity.formFactors = ['mobile_touch', 'tablet_kiosk'];
		const definition = createEmptyDefinitionDraft(P);
		definition.technical.compatibilities = ['iOS', ' '];
		const operations = createEmptyOperationsDraft(P);
		operations.quality.browsers = 'Safari (last 2 versions)';
		const r = runtimeReading({ identity, definition, operations });
		expect(r.devices.map((d) => d.label)).toEqual(['Mobile touch', 'Tablet / kiosk']);
		expect(r.platforms).toEqual(['iOS']);
		expect(r.browsers).toEqual(['Safari (last 2 versions)']);
	});

	it('draws every form factor of the catalog, so none is left as a chip', () => {
		const devices = formFactorDevices(ALL_FORM_FACTORS.map((f) => f.code));
		expect(devices.filter((d) => !d.shape).map((d) => d.code)).toEqual([]);
		// Each its own drawing: no two form factors read alike.
		expect(new Set(devices.map((d) => d.shape)).size).toBe(devices.length);
	});

	it('reads a form factor the catalog does not know as a chip', () => {
		expect(formFactorDevices(['smart_fridge'])).toEqual([{ code: 'smart_fridge', label: 'smart_fridge', shape: null }]);
	});

	it('marks the primary language among the languages, and the formats the spec states', () => {
		const definition = createEmptyDefinitionDraft(P);
		definition.market.languages = ['en', 'fr', 'de'];
		const operations = createEmptyOperationsDraft(P);
		operations.i18n.primaryLocale = 'en-GB';
		operations.i18n.locales = [{ code: 'fr', label: 'Français', rtl: false }];
		operations.i18n.currency = 'EUR';
		const r = languagesReading({ definition, operations });
		expect(r.languages).toEqual([
			{ label: 'English', primary: true },
			{ label: 'Français', primary: false },
			{ label: 'German', primary: false }
		]);
		expect(r.formats).toEqual([{ label: 'Currency', values: ['EUR'] }]);
	});

	it('puts the primary language first when it is not among the languages', () => {
		const definition = createEmptyDefinitionDraft(P);
		definition.market.languages = ['fr'];
		const operations = createEmptyOperationsDraft(P);
		operations.i18n.primaryLocale = 'en';
		expect(languagesReading({ definition, operations }).languages).toEqual([
			{ label: 'English', primary: true },
			{ label: 'French', primary: false }
		]);
	});
});

/** Each database under the data map says what it holds and opens the map on it [criterion:e8a213be]. */
describe('the databases under the data map [criterion:e8a213be]', () => {
	it('count their tables, name a real engine only, and carry the id the map filters on', () => {
		const data = createEmptyDataDraft(P);
		data.databases.push(createDatabase('h', { id: 'erp', name: 'Base ERP (GP)', engine: 'other' }));
		data.databases.push(createDatabase('h', { id: 'fin', name: 'Base Silog Finance', engine: 'postgres' }));
		data.entities.push(createEntity({ id: 'a', name: 'Article', databaseId: 'erp' }), createEntity({ id: 'b', name: 'Client', databaseId: 'erp' }));
		const item = dataFacts(createEmptyDefinitionDraft(P), data).find((i) => i.key === 'databases');
		expect(item?.chips).toEqual(['Base ERP (GP) · 2 tables', 'Base Silog Finance · PostgreSQL · no table']);
		expect(item?.chipRefs).toEqual(['erp', 'fin']);
	});
});
