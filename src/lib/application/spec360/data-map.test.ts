import { describe, expect, it } from 'vitest';
import { createEmptyDataDraft, type EntityField, type ProjectDataDraft } from '$domain/data';
import { dataConnections, dataPlaces, dataSummary, databaseNotes, tableUses } from './data-map';

const table = (id: string, databaseId: string | null, extra: Record<string, unknown> = {}) =>
	({ id, name: id, databaseId, description: '', derivedFrom: 'manual', sourceRefId: null, ...extra }) as ProjectDataDraft['entities'][number];
const relation = (entityId: string, name: string, target: string): EntityField => ({
	id: `${entityId}.${name}`,
	entityId,
	name,
	type: 'relation',
	isId: false,
	isUnique: false,
	isRequired: false,
	isList: false,
	defaultValue: '',
	relationTargetEntityId: target
});

/** A Kutt-like model: six tables in one SQLite database, an empty Redis cache, both on one on-prem machine. */
function kutt(): ProjectDataDraft {
	const d = createEmptyDataDraft('p');
	d.hosts = [{ id: 'h', name: 'Instance server', kind: 'onprem', provider: '', region: '', description: '' }];
	d.databases = [
		{ id: 'db', hostId: 'h', name: 'Kutt database', engine: 'sqlite', description: 'Every record of the product.' },
		{ id: 'cache', hostId: 'h', name: 'Cache', engine: 'redis', description: '' }
	];
	d.entities = ['User', 'Link', 'Domain', 'Host', 'Visit'].map((n) => table(n, 'db'));
	d.entities.push(table('Ip', 'db'));
	d.fields = [
		relation('User', 'bannedBy', 'User'),
		relation('Link', 'owner', 'User'),
		relation('Link', 'bannedBy', 'User'),
		relation('Link', 'domain', 'Domain'),
		relation('Domain', 'owner', 'User'),
		relation('Visit', 'link', 'Link')
	];
	return d;
}

/** Where the data lives and how it connects [criterion:0f4c8334]. */
describe('the data map in words [criterion:0f4c8334]', () => {
	it('says how many tables, in which databases and on which machine, counting only the databases that hold tables', () => {
		expect(dataSummary(kutt())).toBe('6 tables in one SQLite database, on Instance server.');
	});

	it('names the engines of several databases, the machines when there are several, and the tables in no database', () => {
		const d = kutt();
		d.hosts.push({ id: 'h2', name: 'Cache box', kind: 'cloud', provider: '', region: 'eu-west-3', description: '' });
		d.databases[1].hostId = 'h2';
		d.entities[1].databaseId = 'cache';
		d.entities[2].databaseId = null;
		expect(dataSummary(d)).toBe('6 tables in 2 databases (SQLite and Redis), on 2 machines; 1 not in a database yet.');
		d.databases[1].engine = 'sqlite';
		expect(dataSummary(d)).toBe('6 tables in 2 SQLite databases, on 2 machines; 1 not in a database yet.');
	});

	it('invents no database nor machine the model does not hold', () => {
		const d = createEmptyDataDraft('p');
		expect(dataSummary(d)).toBeNull();
		d.entities = [table('A', null), table('B', null)];
		expect(dataSummary(d)).toBe('2 tables not placed in a database yet.');
		d.databases = [{ id: 'db', hostId: '', name: 'Main', engine: 'postgres', description: '' }];
		d.entities[0].databaseId = 'db';
		expect(dataSummary(d)).toBe('2 tables in one PostgreSQL database; 1 not in a database yet.');
	});

	it('names no engine the model calls other', () => {
		const d = kutt();
		d.databases[0].engine = 'other';
		expect(dataSummary(d)).toBe('6 tables in one database, on Instance server.');
		expect(dataPlaces(d)[0].engines).toEqual(['Redis']);
	});

	it('keeps what the spec says of each database it describes', () => {
		expect(databaseNotes(kutt())).toEqual([{ name: 'Kutt database', engine: 'SQLite', description: 'Every record of the product.' }]);
	});

	it('lists each machine with its kind, its region and the engines on it, then the databases on no machine', () => {
		const d = kutt();
		d.hosts[0].region = 'eu-west-3';
		d.databases.push({ id: 'x', hostId: '', name: 'Loose', engine: 'mongodb', description: '' });
		expect(dataPlaces(d)).toEqual([
			{ key: 'h', machine: 'Instance server', detail: 'On-prem · eu-west-3', engines: ['Redis', 'SQLite'] },
			{ key: '__none__', machine: null, detail: 'on no machine described', engines: ['MongoDB'] }
		]);
	});

	it('names the hub when at least two other tables point at it, and the tables related to none', () => {
		expect(dataConnections(kutt())).toBe('User is the hub: 2 of the 5 other tables point at it. Host and Ip are related to no other table.');
	});

	it('counts the relations when no table is a hub, and says when none points at another', () => {
		const d = kutt();
		d.fields = [relation('Visit', 'link', 'Link')];
		expect(dataConnections(d)).toMatch(/^1 relation joins the tables\. /);
		d.fields = [];
		expect(dataConnections(d)).toMatch(/^No table points at another yet\. /);
	});

	it('counts the tables related to none once they are too many to name', () => {
		const d = kutt();
		d.fields = [relation('Link', 'owner', 'User'), relation('Domain', 'owner', 'User')];
		expect(dataConnections(d)).toBe('User is the hub: 2 of the 5 other tables point at it. Host, Visit and Ip are related to no other table.');
		d.fields = [];
		expect(dataConnections(d)).toBe('No table points at another yet. 6 tables are related to no other table.');
	});

	it('does not call a table standing alone on purpose unrelated', () => {
		const d = kutt();
		d.entities[5] = table('Ip', 'db', { standalone: true, description: 'Kept by the schema only.' });
		expect(dataConnections(d)).toBe('User is the hub: 2 of the 5 other tables point at it. Host is related to no other table.');
	});
});

/** Where a table applies, in its drawer [criterion:3750dbba]. */
describe('the features that use a table [criterion:3750dbba]', () => {
	const cores = [
		{ id: 'c1', name: 'Links', description: '', features: [{ id: 'f1', name: 'Shorten a link', description: '' }, { id: 'f2', name: 'Manage my links', description: '' }] },
		{ id: 'c2', name: 'Admin', description: '', features: [{ id: 'f3', name: 'Ban a link', description: '' }] }
	];

	it('lists them in the order of the feature tree, with their core feature', () => {
		const uses = tableUses('Link', { f3: ['Link'], f1: ['Link', 'User'], f2: ['User'] }, cores);
		expect(uses).toEqual([
			{ id: 'f1', name: 'Shorten a link', core: 'Links' },
			{ id: 'f3', name: 'Ban a link', core: 'Admin' }
		]);
		expect(tableUses('Visit', { f1: ['Link'] }, cores)).toEqual([]);
	});
});
