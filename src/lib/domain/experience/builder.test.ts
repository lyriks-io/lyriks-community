import { describe, it, expect } from 'vitest';
import {
	emptyBuilder,
	emptyPrototype,
	ensureScreenRoot,
	createGroupNode,
	createElementNode,
	addNode,
	moveNode,
	reorderChild,
	removeNode,
	setFlexProps,
	flexClasses,
	childNodes,
	descendantIds,
	isDescendant,
	initRunState,
	fireInteraction,
	isGatePassing,
	resolveGate,
	evalVisibility,
	hasInteractionFor,
	isRunClickable,
	isWiredElement,
	visibilityDismissValue,
	validateRule,
	fieldErrorsFor,
	setFieldValue,
	screenHasInvalid,
	createValidation,
	getState,
	fieldStatePath,
	resolveText,
	journeyScreenStops,
	runnableJourneys,
	createEmptyExperienceDraft,
	createScreen,
	createJourney,
	createStep,
	ensureSurfaceRoot,
	cloneTreeOnto,
	duplicateNode,
	HEADER_SURFACE_ID,
	type BuilderElementNode
} from '$domain/experience';
import { parseExperienceBuilder } from '$application/parse-experience-builder';

/** Build a Login screen: root → Header(heading) + Form row(input + wired button), plus a Home screen. */
function buildLoginScreen() {
	const b = emptyBuilder();
	const screenId = 'scr-login';
	const root = ensureScreenRoot(b, screenId); // creates root group + sets entry

	const header = createGroupNode(screenId, root, 'Header');
	addNode(b, header);
	const heading = createElementNode(screenId, header.id, 'heading');
	heading.label = 'Welcome back';
	addNode(b, heading);

	const row = createGroupNode(screenId, root, 'Form row');
	addNode(b, row);
	setFlexProps(b, row.id, { direction: 'row', justify: 'between', align: 'center', gap: 4 });

	const email = createElementNode(screenId, row.id, 'input');
	email.label = 'Email';
	addNode(b, email);

	const submit = createElementNode(screenId, row.id, 'button');
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

	ensureScreenRoot(b, 'scr-home'); // navigation target
	b.stateSeeds.push({ path: 'auth.ok', value: 'false' });

	return { b, screenId, root, ids: { header: header.id, row: row.id, email: email.id, submit: submit.id } };
}

describe('Experience Builder — building a wireframe/screen', () => {
	it('nests groups-in-groups with elements and tracks the tree', () => {
		const { b, screenId, root, ids } = buildLoginScreen();

		// root exists and is the screen's surface root
		expect(b.screenRoots[screenId]).toBe(root);
		expect(b.entryScreenId).toBe(screenId); // first screen became entry

		// root has two child groups, in order
		const kids = childNodes(b, root);
		expect(kids.map((n) => n.kind)).toEqual(['group', 'group']);
		expect((kids[1] as { label: string }).label).toBe('Form row');

		// depth-3 nesting: root → Form row → button
		expect(descendantIds(b, root)).toContain(ids.submit);
		expect(b.nodes[ids.submit].parentId).toBe(ids.row);
		expect(isDescendant(b, ids.submit, root)).toBe(true);
	});

	it('emits deterministic flex classes for a group', () => {
		const { b, ids } = buildLoginScreen();
		const row = b.nodes[ids.row];
		expect(row.kind).toBe('group');
		// A row is responsive by default: it force-wraps so children reflow instead
		// of overflowing on a narrow viewport (see flexClasses).
		expect(flexClasses((row as { flex: Parameters<typeof flexClasses>[0] }).flex)).toBe(
			'flex flex-row justify-between items-center gap-4 flex-wrap p-3'
		);
	});

	it('guards moves: no root, no element-parent, no cycles; valid move works', () => {
		const { b, root, ids } = buildLoginScreen();
		// can't move a root
		expect(moveNode(b, root, ids.row, 0)).toBe(false);
		// can't move into an element
		expect(moveNode(b, ids.header, ids.submit, 0)).toBe(false);
		// cycle: can't move a group into its own descendant
		const sub = createGroupNode('scr-login', ids.header, 'Sub');
		addNode(b, sub);
		expect(moveNode(b, ids.header, sub.id, 0)).toBe(false);
		// valid: move the button out of the row, under the header
		expect(moveNode(b, ids.submit, ids.header, 0)).toBe(true);
		expect(b.nodes[ids.submit].parentId).toBe(ids.header);
		expect(childNodes(b, ids.row).some((n) => n.id === ids.submit)).toBe(false);
	});

	it('reorders children and cascade-removes a subtree', () => {
		const { b, root, ids } = buildLoginScreen();
		const before = childNodes(b, root).map((n) => n.id);
		reorderChild(b, root, 0, 1);
		expect(childNodes(b, root).map((n) => n.id)).toEqual([before[1], before[0]]);

		removeNode(b, ids.row); // removes row + input + button
		expect(b.nodes[ids.row]).toBeUndefined();
		expect(b.nodes[ids.email]).toBeUndefined();
		expect(b.nodes[ids.submit]).toBeUndefined();
	});

	it('duplicates a complete subtree with fresh ids and independent data', () => {
		const { b, ids } = buildLoginScreen();
		const row = b.nodes[ids.row];
		expect(row.kind).toBe('group');
		if (row.kind !== 'group') return;
		row.presentation = 'tabs';
		row.tabsKey = 'form.tab';
		const sourceChildIds = [...row.childIds];

		const duplicateId = duplicateNode(b, ids.row);
		expect(duplicateId).toBeTruthy();
		const duplicate = b.nodes[duplicateId!];
		expect(duplicate).toMatchObject({ kind: 'group', presentation: 'tabs', tabsKey: 'form.tab' });
		if (duplicate.kind !== 'group') return;
		expect(duplicate.childIds).toHaveLength(sourceChildIds.length);
		expect(duplicate.childIds).not.toEqual(sourceChildIds);

		(b.nodes[duplicate.childIds[0]] as BuilderElementNode).label = 'Changed copy';
		expect((b.nodes[sourceChildIds[0]] as BuilderElementNode).label).not.toBe('Changed copy');
	});

	it('preserves modern node properties when cloning a template tree', () => {
		const b = emptyBuilder();
		const root = ensureSurfaceRoot(b, 'tpl', 'Template');
		const group = b.nodes[root];
		expect(group.kind).toBe('group');
		if (group.kind !== 'group') return;
		group.presentation = 'overlay';
		group.visibleWhen = { path: 'modal.open', op: 'truthy' };
		group.componentId = 'cmp-shell';
		const image = createElementNode('tpl', root, 'image');
		image.variant = 'hero';
		image.appearance = { width: 'full', radius: 18, shadow: true };
		image.media = { src: '/assets/hero.png', alt: 'Hero', fit: 'cover', aspectRatio: '3 / 2' };
		addNode(b, image);

		const clonedRoot = cloneTreeOnto(b, root, 'scr-clone');
		expect(clonedRoot).toBeTruthy();
		const clonedGroup = b.nodes[clonedRoot!];
		expect(clonedGroup).toMatchObject({
			kind: 'group',
			presentation: 'overlay',
			componentId: 'cmp-shell',
			visibleWhen: { path: 'modal.open', op: 'truthy' }
		});
		if (clonedGroup.kind !== 'group') return;
		const clonedImage = b.nodes[clonedGroup.childIds[0]] as BuilderElementNode;
		expect(clonedImage.appearance).toEqual(image.appearance);
		expect(clonedImage.media).toEqual(image.media);
	});
});

describe('Experience Builder — running the wireframe', () => {
	it('click drives state + navigation and passes a satisfied scenario', () => {
		const { b, ids } = buildLoginScreen();
		let rs = initRunState(b, null); // author run, starts on entry (scr-login)
		expect(rs.currentScreenId).toBe('scr-login');
		expect(rs.state['auth.ok']).toBe(false);

		rs = fireInteraction(rs, b.nodes[ids.submit] as BuilderElementNode, 'click', b);
		expect(rs.state['auth.ok']).toBe(true); // setState transition
		expect(rs.currentScreenId).toBe('scr-home'); // navigate transition
		expect(rs.errors).toHaveLength(0); // scenario Then (auth.ok truthy) passed
	});

	it('action binding emits a signal counter and traces activity', () => {
		const { b, ids } = buildLoginScreen(); // submit binds to action "auth.login"
		let rs = initRunState(b, null);
		rs = fireInteraction(rs, b.nodes[ids.submit] as BuilderElementNode, 'click', b);
		// the bound action bumps a namespaced run-state counter…
		expect(rs.state['action.auth.login']).toBe(1);
		// …and is recorded in the activity trace, alongside its effects
		expect(rs.activity.some((a) => a.kind === 'action' && a.label === 'auth.login')).toBe(true);
		expect(rs.activity.some((a) => a.kind === 'effect' && a.label === 'navigate')).toBe(true);
	});

	it('event binding emits an observable counter — the "bus"', () => {
		const { b, ids } = buildLoginScreen();
		(b.nodes[ids.submit] as BuilderElementNode).wiring.binding = {
			targetKind: 'event',
			targetRef: 'loggedIn'
		};
		let rs = initRunState(b, null);
		rs = fireInteraction(rs, b.nodes[ids.submit] as BuilderElementNode, 'click', b);
		expect(rs.state['event.loggedIn']).toBe(1);
		expect(rs.activity.some((a) => a.kind === 'event' && a.label === 'loggedIn')).toBe(true);
		// another element can observe the emit through the existing visibility engine
		expect(evalVisibility(rs.state, { path: 'event.loggedIn', op: 'truthy' })).toBe(true);
	});

	it('surfaces a real-time error when a scenario Then fails', () => {
		const { b, ids } = buildLoginScreen();
		// make the button's Then demand auth.ok be FALSY after click — it won't be
		(b.nodes[ids.submit] as BuilderElementNode).wiring.scenarios[0].then[0].op = 'falsy';
		let rs = initRunState(b, null);
		rs = fireInteraction(rs, b.nodes[ids.submit] as BuilderElementNode, 'click', b);
		expect(rs.errors.some((e) => e.kind === 'scenario')).toBe(true);
	});

	it('flags an inert interactive element (no binding AND no transitions)', () => {
		const { b, ids } = buildLoginScreen();
		const submit = b.nodes[ids.submit] as BuilderElementNode;
		submit.wiring.binding = null;
		submit.wiring.transitions = []; // truly inert — clicking it does nothing
		let rs = initRunState(b, null);
		rs = fireInteraction(rs, submit, 'click', b);
		expect(rs.errors.some((e) => e.kind === 'binding')).toBe(true);
	});

	it('does not flag an actuator wired by a transition (a transition IS binding)', () => {
		const { b, ids } = buildLoginScreen();
		const submit = b.nodes[ids.submit] as BuilderElementNode;
		submit.wiring.binding = null; // no explicit binding, but it still has setState/navigate transitions
		let rs = initRunState(b, null);
		rs = fireInteraction(rs, submit, 'click', b);
		expect(rs.errors.some((e) => e.kind === 'binding')).toBe(false);
	});

	it('resolves persona gating', () => {
		const gate = { personaIds: ['role-admin'], mode: 'visible' as const, allow: true };
		expect(isGatePassing(gate, 'role-admin')).toEqual({ visible: true, enabled: true });
		expect(isGatePassing(gate, 'role-guest')).toEqual({ visible: false, enabled: true });
		expect(isGatePassing(gate, null)).toEqual({ visible: true, enabled: true }); // author run = open
	});
});

describe('Experience Builder — state-driven effects & visibility', () => {
	/** A single screen with one button whose click effect we swap per test. */
	function screenWithButton() {
		const b = emptyBuilder();
		const screenId = 'scr';
		const root = ensureScreenRoot(b, screenId);
		const btn = createElementNode(screenId, root, 'button');
		btn.label = 'Act';
		btn.wiring.binding = { targetKind: 'action', targetRef: 'noop' };
		addNode(b, btn);
		return { b, screenId, root, btn };
	}

	it('toggleState flips a boolean each click', () => {
		const { b, btn } = screenWithButton();
		btn.wiring.transitions.push({
			id: 't',
			trigger: 'click',
			effect: { kind: 'toggleState', target: 'menu.open' }
		});
		let rs = initRunState(b, null);
		rs = fireInteraction(rs, btn, 'click', b);
		expect(rs.state['menu.open']).toBe(true);
		rs = fireInteraction(rs, btn, 'click', b);
		expect(rs.state['menu.open']).toBe(false);
	});

	it('incrementState adds the step (default 1) to a numeric path', () => {
		const { b, btn } = screenWithButton();
		btn.wiring.transitions.push({
			id: 't',
			trigger: 'click',
			effect: { kind: 'incrementState', target: 'cart.count', value: '2' }
		});
		let rs = initRunState(b, null);
		rs = fireInteraction(rs, btn, 'click', b); // undefined → 0 + 2
		rs = fireInteraction(rs, btn, 'click', b); // 2 + 2
		expect(rs.state['cart.count']).toBe(4);

		btn.wiring.transitions[0].effect.value = undefined; // blank step → default 1
		rs = fireInteraction(rs, btn, 'click', b);
		expect(rs.state['cart.count']).toBe(5);
	});

	it('resolveGate hides a node until its state condition holds (persona-independent)', () => {
		const { b, btn } = screenWithButton();
		btn.wiring.visibleWhen = { path: 'submitted', op: 'truthy' };
		// author run, condition false → hidden
		expect(resolveGate(btn, null, {}).visible).toBe(false);
		// condition true → visible
		expect(resolveGate(btn, null, { submitted: true }).visible).toBe(true);
		// absent condition is always visible
		expect(evalVisibility({}, undefined)).toBe(true);
		expect(evalVisibility({}, null)).toBe(true);
	});

	it('resolveGate intersects persona gating with state visibility (never widens)', () => {
		const { b, btn } = screenWithButton();
		btn.wiring.gate = { personaIds: ['role-admin'], mode: 'visible', allow: true };
		btn.wiring.visibleWhen = { path: 'ready', op: 'truthy' };
		// right persona but state not ready → still hidden
		expect(resolveGate(btn, 'role-admin', {}).visible).toBe(false);
		// right persona and ready → visible
		expect(resolveGate(btn, 'role-admin', { ready: true }).visible).toBe(true);
		// wrong persona, even when ready → hidden by persona gate
		expect(resolveGate(btn, 'role-guest', { ready: true }).visible).toBe(false);
	});
});

describe('Experience Builder — input-driven triggers (change / submit)', () => {
	function screenWithInput() {
		const b = emptyBuilder();
		const screenId = 'scr';
		const root = ensureScreenRoot(b, screenId);
		const input = createElementNode(screenId, root, 'input');
		input.label = 'Search';
		input.wiring.binding = { targetKind: 'state', targetRef: 'q' };
		addNode(b, input);
		ensureScreenRoot(b, 'scr-results'); // navigation target
		return { b, screenId, input };
	}

	it('a change transition fires on typing and drives other state', () => {
		const { b, input } = screenWithInput();
		input.wiring.transitions.push({
			id: 't',
			trigger: 'change',
			effect: { kind: 'setState', target: 'searching', value: 'true' }
		});
		let rs = initRunState(b, null);
		// mirror the renderer: write the field value, then fire change
		rs = setFieldValue(rs, input, 'hel');
		rs = fireInteraction(rs, input, 'change', b);
		expect(rs.state['q']).toBe('hel'); // typed value landed on the bound path
		expect(rs.state['searching']).toBe(true); // the change transition ran
		expect(rs.errors).toHaveLength(0);
	});

	it('a submit transition navigates on Enter', () => {
		const { b, input } = screenWithInput();
		input.wiring.transitions.push({
			id: 't',
			trigger: 'submit',
			effect: { kind: 'navigate', target: 'scr-results' }
		});
		let rs = initRunState(b, null);
		rs = fireInteraction(rs, input, 'submit', b);
		expect(rs.currentScreenId).toBe('scr-results');
	});

	it('an unbound input never raises a binding precondition error', () => {
		const { b, input } = screenWithInput();
		input.wiring.binding = null; // self-binding via synthetic field path
		input.wiring.transitions.push({
			id: 't',
			trigger: 'change',
			effect: { kind: 'toggleState', target: 'x' }
		});
		let rs = initRunState(b, null);
		rs = fireInteraction(rs, input, 'change', b);
		expect(rs.errors.some((e) => e.kind === 'binding')).toBe(false);
	});

	it('hasInteractionFor reflects wired triggers (gate for live firing)', () => {
		const { input } = screenWithInput();
		expect(hasInteractionFor(input, 'change')).toBe(false);
		input.wiring.transitions.push({
			id: 't',
			trigger: 'change',
			effect: { kind: 'setState', target: 'a', value: '1' }
		});
		expect(hasInteractionFor(input, 'change')).toBe(true);
		expect(hasInteractionFor(input, 'submit')).toBe(false);
	});
});

describe('Experience Builder: run-mode click targets (isRunClickable / isWiredElement)', () => {
	function pill(): BuilderElementNode {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 'scr');
		const el = createElementNode('scr', root, 'text');
		el.variant = 'pill';
		addNode(b, el);
		return el;
	}

	it('a plain display element is neither clickable nor wired', () => {
		const el = pill();
		expect(isRunClickable(el)).toBe(false);
		expect(isWiredElement(el)).toBe(false);
	});

	it('a click transition makes any kind a click target', () => {
		const el = pill();
		el.wiring.transitions.push({
			id: 't',
			trigger: 'click',
			effect: { kind: 'navigate', target: 'scr-2' }
		});
		expect(isRunClickable(el)).toBe(true);
		expect(isWiredElement(el)).toBe(true);
	});

	it('a click (or submit) scenario alone makes it clickable: the renderer must reach it', () => {
		const el = pill();
		el.wiring.scenarios.push({
			id: 's',
			title: 'runs on click',
			given: [],
			whenTrigger: 'click',
			then: []
		});
		expect(isRunClickable(el)).toBe(true);
		el.wiring.scenarios[0].whenTrigger = 'submit'; // fireInteraction runs these on click
		expect(isRunClickable(el)).toBe(true);
	});

	it('an action/event binding alone makes it clickable; state/entity bindings do not', () => {
		const el = pill();
		el.wiring.binding = { targetKind: 'action', targetRef: 'zap.run' };
		expect(isRunClickable(el)).toBe(true);
		expect(isWiredElement(el)).toBe(true);
		el.wiring.binding = { targetKind: 'state', targetRef: 'usage.pct' };
		expect(isRunClickable(el)).toBe(false);
		expect(isWiredElement(el)).toBe(false);
	});

	it('interactive kinds stay clickable with no wiring (input excepted: it is typed into)', () => {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 'scr');
		const button = createElementNode('scr', root, 'button');
		const input = createElementNode('scr', root, 'input');
		expect(isRunClickable(button)).toBe(true);
		expect(isRunClickable(input)).toBe(false);
	});
});

describe('Experience Builder: menu dismissal (visibilityDismissValue)', () => {
	it('writes a value that falsifies the condition, whatever the operator', () => {
		const cases: Array<{ op: 'truthy' | 'falsy' | 'eq' | 'neq'; expected?: string }> = [
			{ op: 'truthy' },
			{ op: 'falsy' },
			{ op: 'eq', expected: 'open' },
			{ op: 'eq', expected: '' },
			{ op: 'neq', expected: 'closed' },
			{ op: 'neq' }
		];
		for (const c of cases) {
			const cond = { path: 'menu.open', op: c.op, expected: c.expected };
			const state = { 'menu.open': visibilityDismissValue(cond) };
			expect(evalVisibility(state, cond), `${c.op}/${c.expected ?? '(none)'}`).toBe(false);
		}
	});
});

describe('Experience Builder — persistence round-trip', () => {
	it('survives JSON serialization through the anti-corruption parser', () => {
		const { b, ids } = buildLoginScreen();
		const wire = JSON.parse(JSON.stringify(b)); // simulate save → load
		const parsed = parseExperienceBuilder(wire, emptyPrototype());

		expect(Object.keys(parsed.nodes).length).toBe(Object.keys(b.nodes).length);
		expect(parsed.entryScreenId).toBe('scr-login');
		const submit = parsed.nodes[ids.submit] as BuilderElementNode;
		expect(submit.wiring.binding?.targetRef).toBe('auth.login');
		expect(submit.wiring.transitions).toHaveLength(2);
		expect(submit.wiring.scenarios[0].then[0].path).toBe('auth.ok');
		expect(parsed.stateSeeds).toEqual([{ path: 'auth.ok', value: 'false' }]);
	});

	it('preserves the row-interaction vocabulary through the parser (list layout, select source, selectRecord)', () => {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 'scr');

		const list = createElementNode('scr', root, 'list');
		list.wiring.binding = { targetKind: 'entity', targetRef: 'ConnectorApp' };
		list.componentId = 'cmp-row';
		list.rowLayout = 'cards';
		list.rowColumns = 2;
		addNode(b, list);

		const pick = createElementNode('scr', root, 'select');
		pick.options = ['Slack', 'Gmail'];
		pick.optionsFrom = { collection: 'Connection', field: 'name', filterField: 'app', filterPath: 'editor.app' };
		addNode(b, pick);

		const connect = createElementNode('scr', root, 'button');
		connect.wiring.transitions.push({
			id: 't',
			trigger: 'click',
			effect: { kind: 'selectRecord', target: 'catalog.app' }
		});
		addNode(b, connect);

		const parsed = parseExperienceBuilder(JSON.parse(JSON.stringify(b)), emptyPrototype());
		const parsedList = parsed.nodes[list.id] as BuilderElementNode;
		expect(parsedList.rowLayout).toBe('cards');
		expect(parsedList.rowColumns).toBe(2);
		const parsedPick = parsed.nodes[pick.id] as BuilderElementNode;
		expect(parsedPick.elementKind).toBe('select');
		expect(parsedPick.options).toEqual(['Slack', 'Gmail']);
		expect(parsedPick.optionsFrom).toEqual({
			collection: 'Connection',
			field: 'name',
			filterField: 'app',
			filterPath: 'editor.app'
		});
		const parsedConnect = parsed.nodes[connect.id] as BuilderElementNode;
		expect(parsedConnect.wiring.transitions[0].effect).toEqual({
			kind: 'selectRecord',
			target: 'catalog.app',
			value: undefined
		});
	});

	it('drops a half-authored dependent filter and an out-of-range column count', () => {
		const raw = {
			nodes: {
				n1: {
					id: 'n1',
					surfaceId: 'scr',
					parentId: null,
					kind: 'element',
					elementKind: 'select',
					label: 'App',
					rowColumns: 9,
					options: ['  ', 'Slack'],
					optionsFrom: { collection: 'Connection', field: 'name', filterField: 'app' },
					wiring: {}
				}
			},
			screenRoots: {},
			entryScreenId: null,
			stateSeeds: []
		};
		const parsed = parseExperienceBuilder(raw, emptyPrototype());
		const n = parsed.nodes.n1 as BuilderElementNode;
		expect(n.options).toEqual(['Slack']);
		expect(n.optionsFrom).toEqual({ collection: 'Connection', field: 'name' });
		expect(n.rowColumns).toBe(4); // clamped, never a 9-column grid
	});

	it('preserves new state effects and visibility conditions through the parser', () => {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 'scr');
		const btn = createElementNode('scr', root, 'button');
		btn.wiring.binding = { targetKind: 'action', targetRef: 'noop' };
		btn.wiring.transitions.push({
			id: 't',
			trigger: 'click',
			effect: { kind: 'toggleState', target: 'menu.open' }
		});
		btn.wiring.visibleWhen = { path: 'ready', op: 'eq', expected: 'yes' };
		addNode(b, btn);

		const parsed = parseExperienceBuilder(JSON.parse(JSON.stringify(b)), emptyPrototype());
		const out = parsed.nodes[btn.id] as BuilderElementNode;
		expect(out.wiring.transitions[0].effect.kind).toBe('toggleState');
		expect(out.wiring.visibleWhen).toEqual({ path: 'ready', op: 'eq', expected: 'yes' });
	});

	it('preserves group presentation/component/visibility, element variant, and transition guards', () => {
		const b = emptyBuilder();
		const root = ensureScreenRoot(b, 'scr');
		// An overlay group, gated open by state, that reuses a component.
		const modal = b.nodes[root] as import('$domain/experience').BuilderGroupNode;
		modal.presentation = 'overlay';
		modal.visibleWhen = { path: 'modal.open', op: 'truthy' };
		modal.componentId = 'cmp-1';
		// A status element with a variant.
		const status = createElementNode('scr', root, 'status');
		status.variant = 'error';
		status.appearance = {
			width: 'fit',
			align: 'center',
			textAlign: 'center',
			fontSize: 18,
			fontWeight: 700,
			color: '#112233',
			background: '#ffffff',
			borderColor: '#334455',
			borderWidth: 1,
			radius: 12,
			maxWidth: 40,
			paddingX: 16,
			paddingY: 8,
			shadow: true,
			opacity: 0.9
		};
		addNode(b, status);
		// A guarded (if/else) navigation.
		const go = createElementNode('scr', root, 'button');
		go.wiring.transitions.push({
			id: 'g',
			trigger: 'click',
			effect: { kind: 'navigate', target: 'scr' },
			when: { path: 'authed', op: 'truthy' }
		});
		addNode(b, go);

		const parsed = parseExperienceBuilder(JSON.parse(JSON.stringify(b)), emptyPrototype());
		const pm = parsed.nodes[root] as import('$domain/experience').BuilderGroupNode;
		expect(pm.presentation).toBe('overlay');
		expect(pm.visibleWhen).toEqual({ path: 'modal.open', op: 'truthy' });
		expect(pm.componentId).toBe('cmp-1');
		expect((parsed.nodes[status.id] as BuilderElementNode).variant).toBe('error');
		expect((parsed.nodes[status.id] as BuilderElementNode).appearance).toEqual(status.appearance);
		expect((parsed.nodes[go.id] as BuilderElementNode).wiring.transitions[0].when).toEqual({
			path: 'authed',
			op: 'truthy'
		});
	});

	it('migrates a legacy prototype into the builder', () => {
		const proto = {
			screens: [{ id: 'p1', name: 'Login', order: 0 }],
			elements: [
				{
					id: 'pe1',
					screenId: 'p1',
					order: 0,
					kind: 'button' as const,
					label: 'Go',
					bindTargetKind: 'action' as const,
					bindTargetRef: 'do.it',
					onSuccess: { kind: 'navigate' as const, value: 'p1' },
					onError: null
				}
			],
			entryScreenId: 'p1'
		};
		const parsed = parseExperienceBuilder(undefined, proto);
		expect(parsed.entryScreenId).toBe('p1');
		const els = Object.values(parsed.nodes).filter((n) => n.kind === 'element');
		expect(els).toHaveLength(1);
		expect((els[0] as BuilderElementNode).wiring.transitions[0]?.effect.kind).toBe('navigate');
	});
});

describe('Experience Builder — input validation & blocking submit', () => {
	function loginWithValidation() {
		const b = emptyBuilder();
		const screenId = 'scr-login';
		const root = ensureScreenRoot(b, screenId);
		const email = createElementNode(screenId, root, 'input');
		email.label = 'Email';
		email.wiring.inputType = 'email';
		email.wiring.binding = { targetKind: 'state', targetRef: 'form.email' };
		email.wiring.validations = [createValidation('required'), createValidation('email')];
		addNode(b, email);
		const submit = createElementNode(screenId, root, 'button');
		submit.label = 'Sign in';
		submit.wiring.requireValid = true;
		submit.wiring.transitions.push({
			id: 't1',
			trigger: 'click',
			effect: { kind: 'setState', target: 'submitted', value: 'true' }
		});
		addNode(b, submit);
		return { b, screenId, ids: { email: email.id, submit: submit.id } };
	}

	it('validateRule covers required / email / min / pattern', () => {
		expect(validateRule('', createValidation('required'))).toBe(false);
		expect(validateRule('x', createValidation('required'))).toBe(true);
		expect(validateRule('nope', createValidation('email'))).toBe(false);
		expect(validateRule('a@b.co', createValidation('email'))).toBe(true);
		expect(validateRule('ab', createValidation('min'))).toBe(false);
		expect(validateRule('abc', createValidation('min'))).toBe(true);
	});

	it('treats min/max as numeric bounds on a number input (rejects a negative below min)', () => {
		const min0 = { ...createValidation('min'), param: '0' };
		const max100 = { ...createValidation('max'), param: '100' };
		// numeric = false (default, text): length semantics
		expect(validateRule('-5', min0)).toBe(true); // "-5" has length 2 ≥ 0
		// numeric = true (number input): value semantics
		expect(validateRule('-5', min0, true)).toBe(false); // -5 < 0 → blocked
		expect(validateRule('10', min0, true)).toBe(true);
		expect(validateRule('250', max100, true)).toBe(false); // 250 > 100 → blocked
		expect(validateRule('', min0, true)).toBe(true); // empty deferred to `required`
	});

	it('flags a wrong email live and clears when corrected', () => {
		const { b, ids } = loginWithValidation();
		let rs = initRunState(b, null);
		const emailNode = b.nodes[ids.email] as BuilderElementNode;

		rs = setFieldValue(rs, emailNode, 'not-an-email');
		expect(fieldErrorsFor(emailNode, getState(rs.state, fieldStatePath(emailNode))).length).toBeGreaterThan(0);

		rs = setFieldValue(rs, emailNode, 'jane@expensa.io');
		expect(fieldErrorsFor(emailNode, getState(rs.state, fieldStatePath(emailNode)))).toHaveLength(0);
	});

	it('blocks a require-valid submit while invalid, allows it when valid', () => {
		const { b, screenId, ids } = loginWithValidation();
		const emailNode = b.nodes[ids.email] as BuilderElementNode;
		const submitNode = b.nodes[ids.submit] as BuilderElementNode;

		// empty email → invalid → submit blocked
		let rs = initRunState(b, null);
		expect(screenHasInvalid(b, screenId, rs)).toBe(true);
		rs = fireInteraction(rs, submitNode, 'click', b);
		expect(rs.state['submitted']).toBeUndefined();
		expect(rs.errors.some((e) => e.kind === 'validation')).toBe(true);

		// valid email → submit goes through
		rs = setFieldValue(rs, emailNode, 'jane@expensa.io');
		expect(screenHasInvalid(b, screenId, rs)).toBe(false);
		rs = fireInteraction(rs, submitNode, 'click', b);
		expect(rs.state['submitted']).toBe(true);
	});

	it('hover never surfaces submit-guard or binding errors — only intentful click/submit do', () => {
		const { b, ids } = loginWithValidation();
		const submitNode = b.nodes[ids.submit] as BuilderElementNode;
		submitNode.wiring.binding = null; // also unbound, to exercise the binding precondition

		// hovering a require-valid, unbound button on an invalid screen stays silent
		let rs = initRunState(b, null);
		rs = fireInteraction(rs, submitNode, 'hover', b);
		expect(rs.errors).toHaveLength(0);

		// clicking it reveals both the validation errors and (were it reached) the binding warning
		rs = fireInteraction(rs, submitNode, 'click', b);
		expect(rs.errors.some((e) => e.kind === 'validation')).toBe(true);
	});
});

describe('Run-mode label resolution (resolveText)', () => {
	it('resolves counts, record fields and state without clobbering dotted state paths', () => {
		const collections = {
			expenses: [
				{ Title: 'Lunch', Amount: 12 },
				{ Title: 'Taxi', Amount: 30 }
			]
		};
		const state = { 'cart.itemCount': 3, user: 'Ada' };
		// count
		expect(resolveText('{#Expenses} expenses', state, collections)).toBe('2 expenses');
		// first record field (default row 0) + explicit Nth row
		expect(resolveText('Latest: {Expenses.Title}', state, collections)).toBe('Latest: Lunch');
		expect(resolveText('Row 2: {Expenses.1.Title}', state, collections)).toBe('Row 2: Taxi');
		// a dotted STATE path is left for state interpolation (not treated as a collection)
		expect(resolveText('You have {cart.itemCount} items', state, collections)).toBe('You have 3 items');
		// plain state + missing field
		expect(resolveText('Hi {user}, {Expenses.Nope}', state, collections)).toBe('Hi Ada, ');
	});
});

describe('Guided run — journey screen stops', () => {
	it('lists only steps that link an existing screen, and only runnable journeys', () => {
		const draft = createEmptyExperienceDraft('p1');
		const home = createScreen({ name: 'Home' });
		const review = createScreen({ name: 'Review' });
		draft.screens.push(home, review);

		const j = createJourney('core-1', 0, { name: 'Submit expense' });
		draft.journeys.push(j);
		const s1 = createStep(j.id, 0, { name: 'Open' });
		s1.linkedScreenId = home.id;
		const s2 = createStep(j.id, 1, { name: 'No screen' }); // unlinked → skipped
		const s3 = createStep(j.id, 2, { name: 'Review' });
		s3.linkedScreenId = review.id;
		const s4 = createStep(j.id, 3, { name: 'Ghost' });
		s4.linkedScreenId = 'missing-screen'; // dangling → skipped
		draft.steps.push(s1, s2, s3, s4);

		const stops = journeyScreenStops(draft, j.id);
		expect(stops.map((s) => s.name)).toEqual(['Open', 'Review']);
		expect(stops.map((s) => s.screenId)).toEqual([home.id, review.id]);

		expect(runnableJourneys(draft).map((x) => x.id)).toEqual([j.id]);

		// a journey with no linked steps is not runnable
		const empty = createJourney('core-2', 1, { name: 'Empty' });
		draft.journeys.push(empty);
		draft.steps.push(createStep(empty.id, 0, { name: 'nope' }));
		expect(runnableJourneys(draft).map((x) => x.id)).toEqual([j.id]);
	});
});

describe('App shell', () => {
	it('defaults to disabled and its surfaces never hijack the entry screen', () => {
		const b = emptyBuilder();
		expect(b.shell).toEqual({ headerEnabled: false, footerEnabled: false });
		expect(b.entryScreenId).toBeNull();

		// Building the header surface adds a root but leaves entryScreenId alone
		// (entry is a screen-only concept; the shell is chrome around screens).
		const headerRoot = ensureSurfaceRoot(b, HEADER_SURFACE_ID, 'Header');
		expect(b.screenRoots[HEADER_SURFACE_ID]).toBe(headerRoot);
		expect(b.entryScreenId).toBeNull();
	});
});
