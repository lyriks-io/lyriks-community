import { describe, it, expect } from 'vitest';
import {
	emptyBuilder,
	ensureScreenRoot,
	createGroupNode,
	createElementNode,
	createBackendCollection,
	createBackendField,
	addNode,
	ensureSurfaceRoot,
	fieldStatePath,
	selectOptions,
	simulate,
	resolveRowText,
	filterRows,
	type BuilderElementNode
} from '$domain/experience';

/**
 * Login → Home: an email input, a "Sign in" button that sets `auth.ok`,
 * navigates to Home, and carries a scenario asserting the login succeeded plus
 * a persona gate (admin-only). Mirrors builder.test's fixture so the headless
 * `simulate` is exercised against the same shape the browser Runner uses.
 */
function buildLoginScreen() {
	const b = emptyBuilder();
	const screenId = 'scr-login';
	const root = ensureScreenRoot(b, screenId);

	const email = createElementNode(screenId, root, 'input');
	email.label = 'Email';
	email.wiring.binding = { targetKind: 'state', targetRef: 'form.email' };
	addNode(b, email);

	const submit = createElementNode(screenId, root, 'button');
	submit.label = 'Sign in';
	submit.wiring.binding = { targetKind: 'action', targetRef: 'auth.login' };
	submit.wiring.transitions.push({
		id: 't1',
		trigger: 'click',
		effect: { kind: 'setState', target: 'auth.ok', value: 'true' }
	});
	submit.wiring.transitions.push({
		id: 't2',
		trigger: 'click',
		effect: { kind: 'navigate', target: 'scr-home' }
	});
	submit.wiring.scenarios.push({
		id: 's1',
		title: 'must authenticate',
		given: [],
		whenTrigger: 'click',
		then: [{ id: 'a1', path: 'auth.ok', op: 'truthy', message: 'login did not succeed' }]
	});
	submit.wiring.gate = { personaIds: ['role-admin'], mode: 'visible', allow: true };
	addNode(b, submit);

	ensureScreenRoot(b, 'scr-home');
	b.stateSeeds.push({ path: 'auth.ok', value: 'false' });

	return { b, screenId, ids: { email: email.id, submit: submit.id } };
}

describe('simulate — headless prototype run', () => {
	it('starts on the entry screen and seeds state', () => {
		const { b } = buildLoginScreen();
		const r = simulate(b, {});
		expect(r.startScreenId).toBe('scr-login');
		expect(r.finalScreenId).toBe('scr-login');
		expect(r.state['auth.ok']).toBe(false);
		expect(r.ok).toBe(true);
		expect(r.visited).toEqual(['scr-login']);
	});

	it('drives a click: sets state, navigates, satisfies the scenario, no errors', () => {
		const { b, ids } = buildLoginScreen();
		const r = simulate(b, { actions: [{ nodeId: ids.submit, trigger: 'click' }] });
		expect(r.state['auth.ok']).toBe(true);
		expect(r.finalScreenId).toBe('scr-home');
		expect(r.visited).toEqual(['scr-login', 'scr-home']);
		expect(r.ok).toBe(true);
		expect(r.actions[0]).toMatchObject({ resolvedNodeId: ids.submit, screenAfter: 'scr-home' });
	});

	it('resolves elements by label and types into inputs', () => {
		const { b } = buildLoginScreen();
		const r = simulate(b, {
			actions: [
				{ label: 'Email', type: 'a@b.co' },
				{ label: 'Sign in', trigger: 'click' }
			]
		});
		// field state path defaults to the input binding (form.email)
		expect(r.state['form.email']).toBe('a@b.co');
		expect(r.finalScreenId).toBe('scr-home');
		expect(r.actions[0].action).toBe('type');
	});

	it('reports an unresolved action as an error rather than throwing', () => {
		const { b } = buildLoginScreen();
		const r = simulate(b, { actions: [{ label: 'Nope', trigger: 'click' }] });
		expect(r.ok).toBe(false);
		expect(r.actions[0].action).toBe('unresolved');
		expect(r.errors[0].message).toContain('no element matched');
	});

	it('lets the gated persona through (admin can fire the admin-only button)', () => {
		const { b, ids } = buildLoginScreen();
		const r = simulate(b, { personaId: 'role-admin', actions: [{ nodeId: ids.submit, trigger: 'click' }] });
		expect(r.actions[0].action).toBe('interact');
		expect(r.state['auth.ok']).toBe(true);
		expect(r.ok).toBe(true);
	});

	it('blocks a persona gate even when the interaction targets a stable nodeId (RBAC is not a UI-only concern)', () => {
		const { b, ids } = buildLoginScreen();
		const r = simulate(b, { personaId: 'role-guest', actions: [{ nodeId: ids.submit, trigger: 'click' }] });
		expect(r.actions[0].action).toBe('blocked');
		expect(r.state['auth.ok']).toBe(false); // effect never fired
		expect(r.finalScreenId).toBe('scr-login'); // no navigation
		expect(r.ok).toBe(false);
		expect(r.errors[0].kind).toBe('permission');
		expect(r.errors[0].message).toContain('blocked by its access gate');
	});

	it('blocks typing into an element the persona cannot see', () => {
		const { b, ids } = buildLoginScreen();
		// Gate the email input to admins only, then act as a guest.
		const emailNode = b.nodes[ids.email];
		if (emailNode.kind !== 'element') throw new Error('email node should be an element');
		emailNode.wiring.gate = { personaIds: ['role-admin'], mode: 'visible', allow: true };
		const r = simulate(b, { personaId: 'role-guest', actions: [{ nodeId: ids.email, type: 'x@y.co' }] });
		expect(r.actions[0].action).toBe('blocked');
		expect(r.state['form.email']).toBeUndefined();
		expect(r.ok).toBe(false);
	});

	it('author runs (no persona) ignore gates entirely', () => {
		const { b, ids } = buildLoginScreen();
		const r = simulate(b, { actions: [{ nodeId: ids.submit, trigger: 'click' }] });
		expect(r.actions[0].action).toBe('interact');
		expect(r.ok).toBe(true);
	});

	it('branches on guarded transitions (if/else navigation)', () => {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 'scr-gate');
		ensureScreenRoot(b, 'scr-in');
		ensureScreenRoot(b, 'scr-out');
		const go = createElementNode('scr-gate', root, 'button');
		go.label = 'Continue';
		go.wiring.binding = { targetKind: 'action', targetRef: 'go' };
		// authed → scr-in, else → scr-out (complementary guards on the same click)
		go.wiring.transitions.push({
			id: 'g1',
			trigger: 'click',
			effect: { kind: 'navigate', target: 'scr-in' },
			when: { path: 'authed', op: 'truthy' }
		});
		go.wiring.transitions.push({
			id: 'g2',
			trigger: 'click',
			effect: { kind: 'navigate', target: 'scr-out' },
			when: { path: 'authed', op: 'falsy' }
		});
		addNode(b, go);

		// not authed → out
		expect(simulate(b, { actions: [{ nodeId: go.id }] }).finalScreenId).toBe('scr-out');
		// authed seed → in
		b.stateSeeds.push({ path: 'authed', value: 'true' });
		expect(simulate(b, { actions: [{ nodeId: go.id }] }).finalScreenId).toBe('scr-in');
	});

	it('resolveRowText: row fields win, other tokens fall through to state/collections', () => {
		const row = { Name: 'Ada', Email: 'ada@x.co' };
		const state = { 'session.user': 'Bob', count: 3 };
		// `{Field}` → row value; `{state.path}` → state; unknown bare token → state path.
		expect(resolveRowText('{Name} <{Email}>', row, state, {})).toBe('Ada <ada@x.co>');
		expect(resolveRowText('by {session.user}', row, state, {})).toBe('by Bob');
		expect(resolveRowText('{Name}: {count}', row, state, {})).toBe('Ada: 3');
		// A bare token that is neither a row field nor state resolves to '' (clean).
		expect(resolveRowText('{Missing}', row, {}, {})).toBe('');
	});

	it('resolves an async call: headless simulate clears loading and applies the outcome', () => {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 'scr');
		const load = createElementNode('scr', root, 'button');
		load.label = 'Load';
		load.wiring.binding = { targetKind: 'action', targetRef: 'load' };
		load.wiring.transitions.push({
			id: 'c',
			trigger: 'click',
			effect: {
				kind: 'call',
				target: '',
				call: { label: 'Load data', loadingPath: 'loading', outcome: 'success', resultPath: 'loaded' }
			}
		});
		addNode(b, load);
		b.stateSeeds.push({ path: 'loading', value: 'false' });

		const ok = simulate(b, { actions: [{ nodeId: load.id }] });
		expect(ok.state['loading']).toBe(false); // resolved → loading cleared
		expect(ok.state['loaded']).toBe(true); // success outcome applied
		expect(ok.ok).toBe(true);

		// Error outcome drives the error path instead.
		load.wiring.transitions[0].effect.call = {
			label: 'Load data',
			loadingPath: 'loading',
			outcome: 'error',
			errorPath: 'failed'
		};
		const bad = simulate(b, { actions: [{ nodeId: load.id }] });
		expect(bad.state['failed']).toBe(true);
		expect(bad.state['loading']).toBe(false);
	});

	it('filterRows: case-insensitive substring across all fields; blank query passes all', () => {
		const rows = [
			{ Name: 'Ada Lovelace', City: 'London' },
			{ Name: 'Alan Turing', City: 'Manchester' },
			{ Name: 'Grace Hopper', City: 'New York' }
		];
		expect(filterRows(rows, '')).toHaveLength(3);
		expect(filterRows(rows, '  ')).toHaveLength(3);
		expect(filterRows(rows, 'man').map((r) => r.Name)).toEqual(['Alan Turing']); // matches "Manchester"
		expect(filterRows(rows, 'a').length).toBe(3); // every name has an 'a'/'A'
		expect(filterRows(rows, 'zzz')).toHaveLength(0);
	});

	it('applies persona gates: a gated button is invisible to a non-allowed persona', () => {
		const { b, ids } = buildLoginScreen();
		// role-user is NOT in the admin-only gate. A non-allowed persona could never
		// click this button in the browser Runner (it isn't rendered), so the headless
		// run must not fire it either — it blocks and records the reason in the trace.
		const r = simulate(b, { personaId: 'role-user', actions: [{ nodeId: ids.submit, trigger: 'click' }] });
		expect(r.startScreenId).toBe('scr-login');
		expect(r.finalScreenId).toBe('scr-login'); // blocked → no navigation
		expect(r.actions[0].action).toBe('blocked');
		expect(r.errors[0].kind).toBe('permission');
	});

	it('expectError consumes a deliberate failure (the run stays ok) and records it on the action', () => {
		const { b, ids } = buildLoginScreen();
		const r = simulate(b, {
			personaId: 'role-user',
			actions: [{ nodeId: ids.submit, trigger: 'click', expectError: true }]
		});
		expect(r.actions[0].action).toBe('blocked');
		expect(r.actions[0].expectedErrorMet).toBe(true);
		expect(r.actions[0].newErrors[0].kind).toBe('permission'); // still visible on the action
		expect(r.errors).toEqual([]); // ...but consumed from the run
		expect(r.ok).toBe(true);
	});

	it('expectError fails the run when the promised error never happens', () => {
		const { b, ids } = buildLoginScreen();
		const r = simulate(b, { actions: [{ nodeId: ids.submit, trigger: 'click', expectError: true }] });
		expect(r.actions[0].expectedErrorMet).toBe(false);
		expect(r.ok).toBe(false);
		expect(r.errors[0].message).toContain('expectError');
	});

	/** A create-Zap form whose input label ("Zap name") differs from the field name ("name"). */
	function buildCreateZapScreen(fieldMap?: Record<string, string>) {
		const b = emptyBuilder();
		b.collections.push(
			createBackendCollection({
				name: 'Zaps',
				fields: [createBackendField({ name: 'name', kind: 'fullName' })],
				seedCount: 0
			})
		);
		const screenId = 'scr-new-zap';
		const root = ensureScreenRoot(b, screenId);
		const input = createElementNode(screenId, root, 'input');
		input.label = 'Zap name';
		addNode(b, input);
		const submit = createElementNode(screenId, root, 'button');
		submit.label = 'Create Zap';
		submit.wiring.binding = { targetKind: 'action', targetRef: 'zaps.create' };
		submit.wiring.transitions.push({
			id: 't1',
			trigger: 'click',
			effect: { kind: 'createRecord', target: 'Zaps', ...(fieldMap ? { fieldMap } : {}) }
		});
		addNode(b, submit);
		return { b, ids: { input: input.id, submit: submit.id } };
	}

	it('warns when a createRecord captures no input (label ≠ field name), instead of dropping silently', () => {
		const { b, ids } = buildCreateZapScreen();
		const r = simulate(b, {
			actions: [
				{ nodeId: ids.input, type: 'My first Zap' },
				{ nodeId: ids.submit, trigger: 'click' }
			]
		});
		expect(r.collectionCounts['zaps']).toBe(1); // the row still lands (seeded values)
		expect(r.warnings).toHaveLength(1);
		expect(r.warnings[0].message).toContain('captured no input values');
		expect(r.ok).toBe(true); // a warning is not an error
	});

	it('fieldMap routes a mismatched input label into the collection field (and the warning disappears)', () => {
		const { b, ids } = buildCreateZapScreen({ name: 'Zap name' });
		const r = simulate(b, {
			actions: [
				{ nodeId: ids.input, type: 'My first Zap' },
				{ nodeId: ids.submit, trigger: 'click' }
			]
		});
		expect(r.warnings).toEqual([]);
		expect(r.collectionCounts['zaps']).toBe(1);
	});
});

/**
 * A connector catalog: a bound list repeating ONE authored row template, whose
 * "Connect" button must act on the row it is rendered in. This is the shape every
 * real catalog / pricing table / inbox has, and the reason interactions carry a
 * row context at all.
 */
function buildCatalogScreen() {
	const b = emptyBuilder();
	b.collections.push({
		id: 'col-apps',
		name: 'ConnectorApp',
		fields: [
			createBackendField({ name: 'id', kind: 'id' }),
			createBackendField({ name: 'name', kind: 'fullName' }),
			createBackendField({ name: 'category', kind: 'category' })
		],
		seedCount: 0,
		rows: [
			{ id: 'app-slack', name: 'Slack', category: 'chat' },
			{ id: 'app-gmail', name: 'Gmail', category: 'email' },
			{ id: 'app-stripe', name: 'Stripe', category: 'payments' }
		]
	});

	// Row template (a component surface, like the real builder authors it).
	const rowSurface = 'cmp-app-row';
	const rowRoot = ensureSurfaceRoot(b, rowSurface, 'App row');
	const rowName = createElementNode(rowSurface, rowRoot, 'text');
	rowName.label = '{name} — {category}';
	addNode(b, rowName);
	const pick = createElementNode(rowSurface, rowRoot, 'checkbox');
	pick.label = 'Select';
	addNode(b, pick);
	const connect = createElementNode(rowSurface, rowRoot, 'button');
	connect.label = 'Connect this app';
	connect.wiring.transitions.push(
		{ id: 'r1', trigger: 'click', effect: { kind: 'selectRecord', target: 'catalog.app' } },
		{ id: 'r2', trigger: 'click', effect: { kind: 'setState', target: 'catalog.appName', value: '{name}' } },
		{ id: 'r3', trigger: 'click', effect: { kind: 'navigate', target: 'scr-authorize' } }
	);
	addNode(b, connect);

	// Catalog screen: search input + the bound list using that row template.
	const screenId = 'scr-catalog';
	const root = ensureScreenRoot(b, screenId);
	const search = createElementNode(screenId, root, 'input');
	search.label = 'Search apps';
	search.wiring.binding = { targetKind: 'state', targetRef: 'catalog.query' };
	addNode(b, search);
	const list = createElementNode(screenId, root, 'list');
	list.label = 'Apps';
	list.componentId = rowSurface;
	list.filterStatePath = 'catalog.query';
	list.rowLayout = 'cards';
	list.rowColumns = 3;
	list.wiring.binding = { targetKind: 'entity', targetRef: 'ConnectorApp' };
	addNode(b, list);
	ensureScreenRoot(b, 'scr-authorize');

	return { b, ids: { search: search.id, list: list.id, connect: connect.id, pick: pick.id } };
}

describe('simulate — per-row interactions', () => {
	it('acts on the row it was clicked in: selectRecord publishes that record, {Field} resolves per row', () => {
		const { b, ids } = buildCatalogScreen();
		const r = simulate(b, { actions: [{ nodeId: ids.connect, rowIndex: 1 }] });
		expect(r.ok).toBe(true);
		expect(r.state['catalog.app']).toBe('app-gmail'); // the row's identity
		expect(r.state['catalog.app.name']).toBe('Gmail'); // every field published
		expect(r.state['catalog.app.category']).toBe('email');
		expect(r.state['catalog.appName']).toBe('Gmail'); // {name} resolved against the row
		expect(r.finalScreenId).toBe('scr-authorize');
		expect(r.actions[0].rowKey).toBe('app-gmail');
	});

	it('a different row selects a different record from the same authored button', () => {
		const { b, ids } = buildCatalogScreen();
		const r = simulate(b, { actions: [{ nodeId: ids.connect, rowIndex: 2 }] });
		expect(r.state['catalog.app.name']).toBe('Stripe');
		expect(r.state['catalog.app']).toBe('app-stripe');
	});

	it('row indexes follow the live search filter, so row 0 is what the user actually sees', () => {
		const { b, ids } = buildCatalogScreen();
		const r = simulate(b, {
			actions: [
				{ nodeId: ids.search, type: 'gmail' },
				{ nodeId: ids.connect, rowIndex: 0 }
			]
		});
		expect(r.state['catalog.app.name']).toBe('Gmail');
	});

	it('per-row fields keep their own value (a checkbox in every row is N checkboxes)', () => {
		const { b, ids } = buildCatalogScreen();
		const r = simulate(b, {
			actions: [
				{ nodeId: ids.pick, rowIndex: 0, type: 'true' },
				{ nodeId: ids.pick, rowIndex: 2, type: 'true' }
			]
		});
		// The engine owns the path shape (id → safe segment + row key), so ask it.
		const pickNode = b.nodes[ids.pick] as BuilderElementNode;
		expect(r.state[fieldStatePath(pickNode, 'app-slack')]).toBe(true);
		expect(r.state[fieldStatePath(pickNode, 'app-stripe')]).toBe(true);
		expect(r.state[fieldStatePath(pickNode, 'app-gmail')]).toBeUndefined();
	});

	it('a visibleWhen naming a ROW FIELD gates per row (a Reconnect button only on the expired ones)', () => {
		const { b, ids } = buildCatalogScreen();
		const connect = b.nodes[ids.connect];
		if (connect.kind !== 'element') throw new Error('expected an element');
		// Only offer "Connect" for chat apps → row 0 (Slack) yes, row 1 (Gmail) no.
		connect.wiring.visibleWhen = { path: 'category', op: 'eq', expected: 'chat' };

		const allowed = simulate(b, { personaId: 'role-user', actions: [{ nodeId: ids.connect, rowIndex: 0 }] });
		expect(allowed.ok).toBe(true);
		expect(allowed.state['catalog.app.name']).toBe('Slack');

		const hidden = simulate(b, { personaId: 'role-user', actions: [{ nodeId: ids.connect, rowIndex: 1 }] });
		expect(hidden.actions[0].action).toBe('blocked');
		expect(hidden.state['catalog.app']).toBeUndefined();
	});

	it('a row index that does not exist is an error, not a silent no-op', () => {
		const { b, ids } = buildCatalogScreen();
		const r = simulate(b, { actions: [{ nodeId: ids.connect, rowIndex: 9 }] });
		expect(r.ok).toBe(false);
		expect(r.errors[0].message).toContain('row 9 does not exist');
		expect(r.state['catalog.app']).toBeUndefined();
	});

	it('rowIndex on an element that is not in a row template is an error', () => {
		const { b, ids } = buildCatalogScreen();
		const r = simulate(b, { actions: [{ nodeId: ids.search, rowIndex: 0, type: 'x' }] });
		expect(r.ok).toBe(false);
		expect(r.errors[0].message).toContain('not inside a list row template');
	});

	it('selectRecord outside a row template warns instead of writing a half-record', () => {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 'scr');
		const btn = createElementNode('scr', root, 'button');
		btn.label = 'Select';
		btn.wiring.transitions.push({
			id: 't',
			trigger: 'click',
			effect: { kind: 'selectRecord', target: 'selected.thing' }
		});
		addNode(b, btn);
		const r = simulate(b, { actions: [{ nodeId: btn.id }] });
		expect(r.ok).toBe(true); // authoring smell, not a run failure
		expect(r.warnings[0].message).toContain('outside a list row template');
		expect(r.state['selected.thing']).toBeUndefined();
	});
});

describe('select options', () => {
	/** Connections keyed by app — the dependent-dropdown case. */
	function buildPicker() {
		const b = emptyBuilder();
		b.collections.push({
			id: 'col-conn',
			name: 'Connection',
			fields: [createBackendField({ name: 'name', kind: 'fullName' }), createBackendField({ name: 'app', kind: 'id' })],
			seedCount: 0,
			rows: [
				{ name: 'Slack — Marketing', app: 'Slack' },
				{ name: 'Slack — Ops', app: 'Slack' },
				{ name: 'Gmail — Inbox', app: 'Gmail' }
			]
		});
		const root = ensureScreenRoot(b, 'scr');
		const sel = createElementNode('scr', root, 'select');
		sel.label = 'Connection';
		sel.wiring.binding = { targetKind: 'state', targetRef: 'editor.connection' };
		sel.optionsFrom = { collection: 'Connection', field: 'name', filterField: 'app', filterPath: 'editor.app' };
		addNode(b, sel);
		return { b, sel };
	}

	it('narrows the choices to the rows matching the live state value', () => {
		const { b, sel } = buildPicker();
		const rows = Object.fromEntries(b.collections.map((c) => [c.name.toLowerCase(), c.rows ?? []]));
		expect(selectOptions(sel, { 'editor.app': 'Slack' }, rows)).toEqual([
			'Slack — Marketing',
			'Slack — Ops'
		]);
		expect(selectOptions(sel, { 'editor.app': 'Gmail' }, rows)).toEqual(['Gmail — Inbox']);
		// No app chosen yet → nothing matches, so the picker is honestly empty.
		expect(selectOptions(sel, {}, rows)).toEqual([]);
	});

	it('refuses a value the select does not offer (a scripted run cannot out-type the UI)', () => {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 'scr');
		const sel = createElementNode('scr', root, 'select');
		sel.label = 'Trigger app';
		sel.wiring.binding = { targetKind: 'state', targetRef: 'editor.app' };
		sel.options = ['Slack', 'Gmail'];
		addNode(b, sel);
		const bad = simulate(b, { actions: [{ nodeId: sel.id, type: 'Stripe' }] });
		expect(bad.ok).toBe(false);
		expect(bad.errors[0].message).toContain('is not offered by');
		const good = simulate(b, { actions: [{ nodeId: sel.id, type: 'Gmail' }] });
		expect(good.ok).toBe(true);
		expect(good.state['editor.app']).toBe('Gmail');
	});

	it('falls back to the authored list when no collection source is set', () => {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 'scr');
		const sel = createElementNode('scr', root, 'select');
		sel.options = ['Every 15 min', 'Every 5 min', ''];
		addNode(b, sel);
		expect(selectOptions(sel, {}, {})).toEqual(['Every 15 min', 'Every 5 min']);
	});

	it('a select writes its choice into state and can fire a change flow', () => {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 'scr');
		const sel = createElementNode('scr', root, 'select');
		sel.label = 'Trigger app';
		sel.wiring.binding = { targetKind: 'state', targetRef: 'editor.app' };
		sel.options = ['Slack', 'Gmail'];
		sel.wiring.transitions.push({
			id: 'c',
			trigger: 'change',
			effect: { kind: 'setState', target: 'editor.tested', value: 'false' }
		});
		addNode(b, sel);
		b.stateSeeds.push({ path: 'editor.tested', value: 'true' });
		const r = simulate(b, {
			actions: [{ nodeId: sel.id, type: 'Gmail' }, { nodeId: sel.id, trigger: 'change' }]
		});
		expect(r.state['editor.app']).toBe('Gmail');
		expect(r.state['editor.tested']).toBe(false);
		expect(r.ok).toBe(true);
	});
});

describe('simulate: tab switching', () => {
	/** A screen with a two-panel tabs group, the shape the renderer's tab bar drives. */
	function buildTabbedScreen() {
		const b = emptyBuilder();
		const screenId = 'scr-tabbed';
		const root = ensureScreenRoot(b, screenId);
		const tabs = createGroupNode(screenId, root, 'Settings tabs');
		tabs.presentation = 'tabs';
		tabs.tabsKey = 'tabs.settings';
		addNode(b, tabs);
		addNode(b, createGroupNode(screenId, tabs.id, 'General'));
		addNode(b, createGroupNode(screenId, tabs.id, 'Advanced'));
		return { b, tabs };
	}

	it('sets the tabs state path to the requested panel, like the tab bar does', () => {
		const { b, tabs } = buildTabbedScreen();
		const r = simulate(b, { actions: [{ nodeId: tabs.id, tab: 1 }] });
		expect(r.state['tabs.settings']).toBe(1);
		expect(r.ok).toBe(true);
		expect(r.actions[0]).toMatchObject({ resolvedNodeId: tabs.id, action: 'tab' });
	});

	it('resolves the tabs group by label and defaults the state path to tabs.<id>', () => {
		const { b, tabs } = buildTabbedScreen();
		tabs.tabsKey = undefined;
		const r = simulate(b, { actions: [{ label: 'Settings tabs', tab: 1 }] });
		expect(r.state[`tabs.${tabs.id}`]).toBe(1);
		expect(r.ok).toBe(true);
	});

	it('a panel that does not exist is an error, not a silent clamp', () => {
		const { b, tabs } = buildTabbedScreen();
		const r = simulate(b, { actions: [{ nodeId: tabs.id, tab: 5 }] });
		expect(r.ok).toBe(false);
		expect(r.errors[0]?.message).toContain('tab 5 does not exist');
	});

	it('tab on a node that is not a tabs group is unresolved, not a state write', () => {
		const { b } = buildTabbedScreen();
		const r = simulate(b, { actions: [{ nodeId: 'nope', tab: 0 }] });
		expect(r.ok).toBe(false);
		expect(r.actions[0]?.action).toBe('unresolved');
	});

	it('drives a sidebar group the same way (aside nav shares the tabs contract)', () => {
		const { b, tabs } = buildTabbedScreen();
		tabs.presentation = 'sidebar';
		const r = simulate(b, { actions: [{ nodeId: tabs.id, tab: 1 }] });
		expect(r.state['tabs.settings']).toBe(1);
		expect(r.ok).toBe(true);
		expect(r.actions[0]).toMatchObject({ resolvedNodeId: tabs.id, action: 'tab' });
	});
});
