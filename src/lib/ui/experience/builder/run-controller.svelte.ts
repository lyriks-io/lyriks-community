/**
 * Ephemeral run-mode state holder. Wraps the pure builder-runtime engine in a
 * Svelte 5 runes object so the Runner + NodeRenderer re-render reactively after
 * every interaction. Never persisted, never touched through the draft store.
 */
import {
	evalVisibility,
	fieldErrorsFor,
	fieldStatePath,
	fireInteraction,
	resolveText,
	getState,
	initRunState,
	inputNodesOfScreen,
	isInteractiveBuilderKind,
	listRowsFor,
	resolveCall,
	resolveGate,
	resolveRowText,
	screenHasInvalid,
	selectOptions,
	setFieldValue,
	canAccessScreen,
	type BuilderElementNode,
	type RowContext,
	type ExperienceBuilder,
	type RunState,
	type ScreenAccessMap,
	type TransitionTrigger
} from '$domain/experience';
import type { RunController, RunGate } from './run-types';

export class BuilderRunController implements RunController {
	rs = $state<RunState>(null as unknown as RunState);
	/** Input nodes the user has interacted with — gates inline validation display
	 * so a fresh run never shows "required" errors on fields nobody touched. */
	#touched = $state<Set<string>>(new Set());
	readonly #builder: ExperienceBuilder;
	/** Screen-area permission map; null = no gating (all screens open). */
	readonly #access: ScreenAccessMap | null;

	constructor(
		builder: ExperienceBuilder,
		personaId: string | null,
		startScreenId?: string | null,
		access: ScreenAccessMap | null = null
	) {
		this.#builder = builder;
		this.#access = access;
		this.rs = initRunState(builder, personaId, startScreenId);
	}

	get rootId(): string | null {
		return this.rs.currentScreenId ? (this.#builder.screenRoots[this.rs.currentScreenId] ?? null) : null;
	}

	/** Whether the active persona is permitted to open a given screen (per the
	 * Users & Permissions matrix). Reactive on the active persona. */
	screenAccessible = (screenId: string): boolean =>
		canAccessScreen(this.#access, screenId, this.rs.activePersonaId);

	/** Whether the screen currently on stage is permitted for the active persona. */
	get currentScreenAccessible(): boolean {
		return this.rs.currentScreenId ? this.screenAccessible(this.rs.currentScreenId) : true;
	}

	gateOf = (nodeId: string, ctx?: RowContext | null): RunGate => {
		const n = this.#builder.nodes[nodeId];
		if (!n) return { visible: true, enabled: true };
		// Groups carry only state-driven visibility (what opens/closes an overlay).
		if (n.kind !== 'element')
			return { visible: evalVisibility(this.rs.state, n.visibleWhen, ctx), enabled: true };
		return resolveGate(n, this.rs.activePersonaId, this.rs.state, ctx);
	};

	interact = (nodeId: string, trigger: TransitionTrigger, ctx?: RowContext | null): void => {
		const n = this.#builder.nodes[nodeId];
		if (!n || n.kind !== 'element') return;
		this.rs = fireInteraction(this.rs, n, trigger, this.#builder, ctx);
		// A submit attempt (clicking/Entering a require-valid actuator) is the
		// moment to reveal every field's error, like a real form submit.
		if (n.wiring.requireValid && (trigger === 'click' || trigger === 'submit'))
			this.#markScreenTouched(n.surfaceId);
		// Async calls: leave loading raised now, resolve each after its latency so
		// the run actually feels asynchronous (a spinner, then the result/error).
		if (this.rs.pendingCalls.length) {
			const calls = this.rs.pendingCalls;
			this.rs = { ...this.rs, pendingCalls: [] };
			for (const call of calls)
				setTimeout(() => {
					this.rs = resolveCall(this.rs, call);
				}, Math.max(0, call.latencyMs ?? 600));
		}
	};

	/** Touch key: per (field, row) so one row's untouched checkbox stays quiet. */
	#touchKey = (nodeId: string, rowKey?: string | null): string =>
		rowKey ? `${nodeId}@${rowKey}` : nodeId;

	/** True once the user has touched (blurred) this field, or submitted the screen. */
	isTouched = (nodeId: string, rowKey?: string | null): boolean =>
		this.#touched.has(this.#touchKey(nodeId, rowKey));

	markTouched = (nodeId: string, rowKey?: string | null): void => {
		const key = this.#touchKey(nodeId, rowKey);
		if (this.#touched.has(key)) return;
		this.#touched = new Set(this.#touched).add(key);
	};

	#markScreenTouched = (surfaceId: string): void => {
		const next = new Set(this.#touched);
		let changed = false;
		for (const inp of inputNodesOfScreen(this.#builder, surfaceId))
			if (!next.has(inp.id)) {
				next.add(inp.id);
				changed = true;
			}
		if (changed) this.#touched = next;
	};

	#element = (nodeId: string): BuilderElementNode | null => {
		const n = this.#builder.nodes[nodeId];
		return n && n.kind === 'element' ? n : null;
	};

	inputValue = (nodeId: string, rowKey?: string | null): string => {
		const n = this.#element(nodeId);
		if (!n) return '';
		const v = getState(this.rs.state, fieldStatePath(n, rowKey));
		return v === undefined || v === null ? '' : String(v);
	};

	setFieldValue = (nodeId: string, value: string, rowKey?: string | null): void => {
		const n = this.#element(nodeId);
		if (!n) return;
		this.rs = setFieldValue(this.rs, n, value, rowKey);
	};

	fieldErrors = (nodeId: string, rowKey?: string | null): string[] => {
		const n = this.#element(nodeId);
		if (!n) return [];
		return fieldErrorsFor(n, getState(this.rs.state, fieldStatePath(n, rowKey)));
	};

	selectOptions = (nodeId: string): string[] => {
		const n = this.#element(nodeId);
		return n ? selectOptions(n, this.rs.state, this.rs.collections) : [];
	};

	isBlocked = (nodeId: string): boolean => {
		const n = this.#element(nodeId);
		if (!n || !isInteractiveBuilderKind(n.elementKind) || !n.wiring.requireValid) return false;
		return screenHasInvalid(this.#builder, n.surfaceId, this.rs);
	};

	resolve = (text: string): string => resolveText(text, this.rs.state, this.rs.collections);

	resolveRow = (text: string, row: Record<string, unknown>): string =>
		resolveRowText(text, row, this.rs.state, this.rs.collections);

	stateValue = (path: string): unknown => getState(this.rs.state, path);

	setState = (path: string, value: unknown): void => {
		if (!path) return;
		this.rs = { ...this.rs, state: { ...this.rs.state, [path]: value } };
	};

	listRows = (nodeId: string): Record<string, unknown>[] => {
		const n = this.#element(nodeId);
		// Live search included: `listRowsFor` is the single definition of "what row N
		// is", shared with the headless simulator so both drive the same record.
		return n ? listRowsFor(n, this.rs.state, this.rs.collections) : [];
	};

	navigateTo = (screenId: string): void => {
		const history =
			this.rs.currentScreenId && this.rs.currentScreenId !== screenId
				? [...this.rs.history, this.rs.currentScreenId]
				: this.rs.history;
		this.rs = { ...this.rs, history, currentScreenId: screenId };
	};

	get canGoBack(): boolean {
		return this.rs.history.length > 0;
	}

	back = (): void => {
		const history = [...this.rs.history];
		const prev = history.pop();
		if (prev) this.rs = { ...this.rs, history, currentScreenId: prev };
	};

	setPersona = (personaId: string | null): void => {
		this.rs = { ...this.rs, activePersonaId: personaId };
	};

	restart = (): void => {
		this.rs = initRunState(this.#builder, this.rs.activePersonaId, this.#builder.entryScreenId);
		this.#touched = new Set();
	};
}
