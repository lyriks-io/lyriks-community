import { describe, it, expect } from 'vitest';
import {
	createEmptyExperienceDraft,
	createScreen,
	createComponent,
	createJourney,
	createStep,
	ensureScreenRoot,
	createElementNode,
	createGroupNode,
	addNode,
	buildAcceptanceSpec,
	deriveJourneyFlow,
	generateAcceptanceTests,
	generateRepoScaffold,
	simulate
} from '$domain/experience';

/** A 2-screen journey: Login → Home, with a "Continue" button wiring the nav. */
function loginToHomeDraft() {
	const draft = createEmptyExperienceDraft('p');
	const login = createScreen({ name: 'Login' });
	const home = createScreen({ name: 'Home' });
	draft.screens.push(login, home);
	ensureScreenRoot(draft.builder, login.id);
	ensureScreenRoot(draft.builder, home.id);

	const go = createElementNode(login.id, draft.builder.screenRoots[login.id], 'button');
	go.label = 'Continue';
	go.wiring.binding = { targetKind: 'action', targetRef: 'go' };
	go.wiring.transitions.push({
		id: 't',
		trigger: 'click',
		effect: { kind: 'navigate', target: home.id }
	});
	go.wiring.scenarios.push({
		id: 's',
		title: 'advances to Home',
		given: [],
		whenTrigger: 'click',
		then: [{ id: 'a', path: 'arrived', op: 'truthy', message: 'did not arrive' }]
	});
	addNode(draft.builder, go);

	const j = createJourney('core', 0, { name: 'Sign in' });
	draft.journeys.push(j);
	draft.steps.push(
		createStep(j.id, 0, { name: 'Open login', linkedScreenId: login.id }),
		createStep(j.id, 1, { name: 'Reach home', linkedScreenId: home.id })
	);
	return { draft, login, home, go, j };
}

describe('acceptance spec — prototype as build constraint', () => {
	it('derives a happy-path script that navigates between consecutive step screens', () => {
		const { draft, home, go, j } = loginToHomeDraft();
		const flow = deriveJourneyFlow(draft, j);
		expect(flow.stops.map((s) => s.screen)).toEqual(['Login', 'Home']);
		expect(flow.script).toEqual([{ nodeId: go.id, trigger: 'click' }]);
		expect(flow.finalScreenId).toBe(home.id);
		expect(flow.flowGaps).toEqual([]);
		// And that derived script actually reaches Home when simulated.
		const run = simulate(draft.builder, { startScreenId: flow.startScreenId, actions: flow.script });
		expect(run.finalScreenId).toBe(home.id);
	});

	it('sees navigation carried by an embedded reusable component (sidebar link)', () => {
		const { draft, login, home, go, j } = loginToHomeDraft();
		// Move the nav OFF the screen: it now lives only inside a reused component.
		go.wiring.transitions = [];
		const sidebar = createComponent({ name: 'Sidebar' });
		draft.components.push(sidebar);
		ensureScreenRoot(draft.builder, sidebar.id);
		const navLink = createElementNode(sidebar.id, draft.builder.screenRoots[sidebar.id], 'link');
		navLink.label = 'Home';
		navLink.wiring.transitions.push({
			id: 't-side',
			trigger: 'click',
			effect: { kind: 'navigate', target: home.id }
		});
		addNode(draft.builder, navLink);
		// Host the component on the Login screen via a group reference.
		const host = createGroupNode(login.id, draft.builder.screenRoots[login.id], 'Nav');
		host.componentId = sidebar.id;
		addNode(draft.builder, host);

		const flow = deriveJourneyFlow(draft, j);
		expect(flow.flowGaps).toEqual([]);
		expect(flow.script).toEqual([{ nodeId: navLink.id, trigger: 'click' }]);
		// The derived script really reaches Home through the component's link,
		// and a label lookup on the host screen resolves the component element too.
		const run = simulate(draft.builder, { startScreenId: flow.startScreenId, actions: flow.script });
		expect(run.finalScreenId).toBe(home.id);
		const byLabel = simulate(draft.builder, {
			startScreenId: login.id,
			actions: [{ label: 'Home', trigger: 'click' }]
		});
		expect(byLabel.finalScreenId).toBe(home.id);
	});

	it('records a flow gap when no navigation connects two step screens', () => {
		const { draft, go, j } = loginToHomeDraft();
		// Break the wiring: point the nav at a non-existent screen.
		go.wiring.transitions[0].effect.target = 'nope';
		const flow = deriveJourneyFlow(draft, j);
		expect(flow.script).toEqual([]);
		expect(flow.flowGaps).toHaveLength(1);
		expect(flow.flowGaps[0]).toContain('No navigation');
	});

	it('lifts authored scenarios into criteria and renders Gherkin', () => {
		const { draft } = loginToHomeDraft();
		const spec = buildAcceptanceSpec(draft);
		expect(spec.features).toHaveLength(1);
		expect(spec.criteriaCount).toBe(1);
		expect(spec.gherkin).toContain('Feature: Sign in');
		expect(spec.gherkin).toContain('Scenario: advances to Home');
		expect(spec.gherkin).toContain('Then arrived is set');
	});

	it('generates a Playwright scaffold that gotos the entry route and clicks the nav element', () => {
		const { draft } = loginToHomeDraft();
		const tests = generateAcceptanceTests(draft);
		expect(tests.journeyCount).toBe(1);
		expect(tests.playwright).toContain("import { test, expect } from '@playwright/test'");
		expect(tests.playwright).toContain('await page.goto("/login")');
		// clicks the "Continue" button by role + accessible name, then asserts URL → Home
		expect(tests.playwright).toContain("page.getByRole('button', { name: \"Continue\" })");
		expect(tests.playwright).toContain('toHaveURL(/\\/home/)');
		// no element observes `arrived`, so the scenario stays a manual annotation
		expect(tests.playwright).toContain('// acceptance (bind manually): arrived is set');
		expect(tests.annotatedAssertions).toBe(1);
	});

	it('auto-binds a scenario state to a REAL assertion via visibleWhen, and honors a TargetMap', () => {
		const { draft, home } = loginToHomeDraft();
		// An element gated by `arrived` → the scenario "arrived is set" becomes a real
		// visibility assertion instead of an annotation (mined from the prototype).
		const welcome = createElementNode(home.id, draft.builder.screenRoots[home.id], 'heading');
		welcome.label = 'Welcome';
		welcome.wiring.visibleWhen = { path: 'arrived', op: 'truthy' };
		addNode(draft.builder, welcome);

		const tests = generateAcceptanceTests(draft, {
			routes: { Login: '/auth/sign-in' },
			selectors: { Continue: '[data-testid=continue]' }
		});
		expect(tests.playwright).toContain('await expect(page.getByText("Welcome")).toBeVisible();');
		expect(tests.boundAssertions).toBeGreaterThanOrEqual(1);
		// TargetMap retargets the same spec onto an existing app:
		expect(tests.playwright).toContain('await page.goto("/auth/sign-in")');
		expect(tests.playwright).toContain('page.locator("[data-testid=continue]")');
	});

	it('repo scaffold: emits the drop-in bundle with a pre-filled map', () => {
		const { draft } = loginToHomeDraft();
		const scaffold = generateRepoScaffold(draft);
		const paths = scaffold.files.map((f) => f.path);
		expect(paths).toContain('tests/acceptance/acceptance.spec.ts');
		expect(paths).toContain('playwright.config.ts');
		expect(paths).toContain('.github/workflows/acceptance.yml');
		expect(paths).toContain('lyriks.map.json');
		// the starter map lists the prototype's screens with their current routes
		const mapFile = scaffold.files.find((f) => f.path === 'lyriks.map.json')!;
		const parsed = JSON.parse(mapFile.content);
		expect(parsed.routes.Login).toBe('/login');
		expect(parsed.routes.Home).toBe('/home');
		// the nav element label is offered as a selector slot to fill
		expect(parsed.selectors).toHaveProperty('Continue');
		expect(scaffold.summary.journeyCount).toBe(1);
	});
});

describe('a happy path fills the form it submits', () => {
	/** The login screen as people actually model it: required inputs, guarded submit. */
	function guardedLoginDraft() {
		const { draft, login, go, j, home } = loginToHomeDraft();
		go.wiring.requireValid = true;

		const email = createElementNode(login.id, draft.builder.screenRoots[login.id], 'input');
		email.label = 'Email';
		email.wiring.inputType = 'email';
		email.wiring.binding = { targetKind: 'state', targetRef: 'form.email' };
		email.wiring.validations.push({
			id: 'v1',
			kind: 'required',
			description: 'Email must be filled.',
			message: 'Email is required.'
		});
		addNode(draft.builder, email);

		const password = createElementNode(login.id, draft.builder.screenRoots[login.id], 'input');
		password.label = 'Password';
		password.wiring.inputType = 'password';
		password.wiring.binding = { targetKind: 'state', targetRef: 'form.password' };
		password.wiring.validations.push(
			{
				id: 'v2',
				kind: 'required',
				description: 'Password must be filled.',
				message: 'Password is required.'
			},
			{
				id: 'v3',
				kind: 'min',
				param: '12',
				description: 'Password must contain at least 12 characters.',
				message: 'Password is too short.'
			}
		);
		addNode(draft.builder, password);
		return { draft, login, home, go, email, password, j };
	}

	it('types into each blocking input before pressing the guarded button', () => {
		const { draft, go, email, password, j } = guardedLoginDraft();
		const flow = deriveJourneyFlow(draft, j);
		expect(flow.script).toEqual([
			{ nodeId: email.id, type: 'user@example.com' },
			// Padded by one character to satisfy its own min-length rule.
			{ nodeId: password.id, type: 'Passw0rd!23x' },
			{ nodeId: go.id, trigger: 'click' }
		]);
	});

	it('reaches the next screen instead of reporting it unreachable', () => {
		// Before the fill, this run stopped on the login screen and every journey
		// behind a form was reported as a blocker. The only cheap way to make it
		// green was to drop `requireValid` from the specification.
		const { draft, home, j } = guardedLoginDraft();
		const flow = deriveJourneyFlow(draft, j);
		const run = simulate(draft.builder, { startScreenId: flow.startScreenId, actions: flow.script });
		// The borrowed fixture carries a scenario of its own that this journey never
		// satisfies; what matters here is that no FIELD blocked the submit.
		expect(run.errors.filter((e) => e.kind === 'validation')).toEqual([]);
		expect(run.finalScreenId).toBe(home.id);
	});

	it('leaves an unguessable field empty, so the run still names it', () => {
		const { draft, login, go, j } = guardedLoginDraft();
		const code = createElementNode(login.id, draft.builder.screenRoots[login.id], 'input');
		code.label = 'Invite code';
		code.wiring.binding = { targetKind: 'state', targetRef: 'form.code' };
		code.wiring.validations.push(
			{
				id: 'v4',
				kind: 'required',
				description: 'Invite code must be filled.',
				message: 'Invite code is required.'
			},
			{
				id: 'v5',
				kind: 'pattern',
				param: '^INV-[0-9]{6}$',
				description: 'Invite code must match the expected format.',
				message: 'Invite code is malformed.'
			}
		);
		addNode(draft.builder, code);

		const flow = deriveJourneyFlow(draft, j);
		expect(flow.script.some((a) => a.nodeId === code.id)).toBe(false);
		const run = simulate(draft.builder, { startScreenId: flow.startScreenId, actions: flow.script });
		expect(run.errors.some((e) => e.message.includes('Invite code'))).toBe(true);
		expect(run.finalScreenId).toBe(go.surfaceId);
	});
});
