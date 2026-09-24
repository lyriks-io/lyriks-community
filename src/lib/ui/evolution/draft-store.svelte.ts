import {
	ALL_BLOCK_FIELDS,
	acceptanceDebt,
	blockFieldByPath,
	blocksFor,
	blockingFindingCount,
	canAdvance,
	canCloseRequest,
	canCrossToImplementation,
	canDecide,
	canDeleteRequest,
	canExcludeFromReadiness,
	canLiftWaiver,
	canRestoreToReadiness,
	canLogObservation,
	canAcceptProposal,
	canOpenRequest,
	canRebrief,
	canRefuseProposal,
	canRewordProposal,
	canRule,
	canAnswerOpenQuestion,
	canMarkOpenQuestion,
	canMarkAnswered,
	canPostOnField,
	canSign,
	canTurnIntoChange,
	canWaive,
	canWithdrawSignature,
	createEvolutionRequest,
	createObservation,
	excludeFromReadiness,
	fieldKey,
	filledKeysOfReadings,
	freeze,
	amend,
	highestImpactSeverity,
	holdsValue,
	latestThread,
	markAnswered,
	openThread,
	openThreadCount,
	post,
	nextStage,
	openRequest,
	openWaiver,
	pendingProposals,
	protectedLineIds,
	readCoherence,
	readMaturity,
	readReadiness,
	record,
	restoreToReadiness,
	sign,
	signedBy,
	standingSignatures,
	supportedStage,
	turnIntoChange,
	voidSignaturesOnEdit,
	withdraw,
	switchHypothesis,
	undecidedCount,
	validatedNotFoldedBack,
	type Actor,
	type EvolutionRequest,
	type Guarded,
	type HistoryEntryType,
	type ImpactHypothesis,
	type LineDecision,
	type MaturityReading,
	type ReadinessReading,
	type CoherenceReading,
	type CapabilityReading,
	type Proposal,
	type ObservationRuling,
	type ProjectEvolutionDraft,
	type RequestOrigin,
	type RequestStage
} from '$domain/evolution';
import type { Session, ToastNotifierPort } from '$application/ports';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';

export type { SaveStatus };

/**
 * The Evolution store.
 *
 * Every act goes through the domain guard that owns it, and a refusal is
 * surfaced with the reason the SPECIFICATION wrote rather than a message
 * invented here. That is deliberate: the guards are the product rules, so a
 * refusal the user reads on screen is the one that was specified, and the store
 * has no second opinion about when something is allowed.
 *
 * `filled` is the set of dossier field paths that currently hold a value. The
 * dossier keeps NO copy of those values (they live in the sections that own
 * them), so what is tracked here is only their presence, which is what the
 * maturity score reads.
 */
export class EvolutionStore {
	draft = $state<ProjectEvolutionDraft>(null as unknown as ProjectEvolutionDraft);
	selectedRequestId = $state<string | null>(null);
	/**
	 * Inline field paths read back as holding a value in the section that owns
	 * them. Transient on purpose: it is re-read from those sections on every
	 * open, so it can never disagree with them.
	 *
	 * The capability blocks are the other half, and they are NOT here: nothing
	 * cheap tells the page whether a leaf's invariants were authored in the
	 * kernel, so their marks live on the request itself and are persisted.
	 */
	filledFields = $state<Record<string, string[]>>({});
	/** Per-leaf TRL, as read at load. Displayed, never typed here. */
	trlByLeaf = $state<Record<string, number | null>>({});
	/** The capability readings per request, as read at load. */
	readings = $state<Record<string, CapabilityReading[]>>({});

	readonly session: Session;
	readonly notifier: ToastNotifierPort;
	readonly actor: Actor;
	readonly #autosave: SectionAutosave<ProjectEvolutionDraft>;
	readonly #now: () => string;

	constructor(
		initial: ProjectEvolutionDraft,
		session: Session,
		notifier: ToastNotifierPort,
		actor: Actor,
		revision = 0,
		now: () => string = () => new Date().toISOString(),
		/**
		 * The inline fields already holding a value, read server-side. Without it
		 * the first paint scores a third of the truth, and anything reading the
		 * score before the sections answer reads a request that looks emptier than
		 * it is.
		 */
		filled: Record<string, string[]> = {},
		/**
		 * The TRL of every leaf feature, read server-side: a hand-set override, or
		 * the engine maturity projected onto the 1-9 scale, or null when neither
		 * exists yet. Readiness is the average over the leaves a request touches.
		 */
		trlByLeaf: Record<string, number | null> = {},
		/**
		 * The readings of the blocks edited in a capability of their own, per
		 * request, computed server-side from what the touched features hold and
		 * what the impact report moves. Nothing on the dossier is ticked by hand.
		 */
		readings: Record<string, CapabilityReading[]> = {}
	) {
		this.draft = initial;
		this.filledFields = filled;
		this.trlByLeaf = trlByLeaf;
		this.readings = readings;
		this.session = session;
		this.notifier = notifier;
		this.actor = actor;
		this.#now = now;
		this.#autosave = new SectionAutosave({
			endpoint: '/api/draft/evolution',
			session,
			notifier,
			getDraft: () => this.draft,
			applyRemote: (draft) => (this.draft = draft),
			onSaved: (savedAt) => (this.draft.lastSavedAt = savedAt),
			revision
		});
		this.#healStages();
	}

	/**
	 * Take back any stage the request does not support.
	 *
	 * It exists because a stage used to be settable by hand, and a request could
	 * end up in a column no gate had opened, with nothing to undo it. Crossing is
	 * a deliberate act and stays one, so nothing here moves a request FORWARD and
	 * nothing is written to the timeline: a stage that was never earned was never
	 * a decision, and there is no decision to record when it is given back.
	 */
	#healStages = () => {
		let healed = false;
		this.draft.requests = this.draft.requests.map((r) => {
			const supported = this.stageOf(r);
			if (supported === r.stage) return r;
			healed = true;
			return { ...r, stage: supported };
		});
		if (healed) this.#touch();
	};

	get saveStatus(): SaveStatus {
		return this.#autosave.status;
	}
	get lastError(): string | null {
		return this.#autosave.lastError;
	}

	hydrate = (incoming: ProjectEvolutionDraft, revision = 0) =>
		this.#autosave.hydrate(incoming, revision);

	#touch = () => this.#autosave.touch();

	/** Requests still in flight; a deleted dossier leaves the board. */
	live = $derived(this.draft.requests.filter((r) => r.status !== 'deleted'));

	selected = $derived<EvolutionRequest | null>(
		this.live.find((r) => r.id === this.selectedRequestId) ?? null
	);

	/**
	 * Everything the dossier holds as filled for one request: what its sections
	 * answered for the inline fields, plus what the readings answered for the
	 * blocks edited in a capability of their own. A mark left on a legacy
	 * dossier is not read: a reading is answered by what is written, never by
	 * what was ticked.
	 */
	filledKeysOf = (request: EvolutionRequest): Set<string> =>
		new Set([
			...filledKeysOfReadings(this.readings[request.id] ?? []),
			...(this.filledFields[request.id] ?? [])
		]);

	/** The reading of one capability field home, if the server produced one. */
	readingOf = (request: EvolutionRequest, fieldPath: string, leafId: string | null) =>
		(this.readings[request.id] ?? []).find((r) => r.key === fieldKey(fieldPath, leafId));

	/**
	 * Read over the blocks the page shows for this request: the ten core ones
	 * plus whatever the change is known to touch. An open question counts as
	 * empty, in amber, and lowers nothing on the other fields.
	 */
	maturityOf = (request: EvolutionRequest): MaturityReading =>
		readMaturity(
			this.filledKeysOf(request),
			request.openQuestionKeys,
			request.leafIds,
			blocksFor(request)
		);

	/** The maturity of the open request, read off which of its fields are filled. */
	maturity = $derived<MaturityReading>(
		this.selected ? this.maturityOf(this.selected) : readMaturity(new Set<string>())
	);

	/** What the engine found against the existing product, weighted by severity. */
	coherenceOf = (request: EvolutionRequest): CoherenceReading => readCoherence(request);

	/** The average TRL of the touched features, excluded ones aside. */
	readinessOf = (request: EvolutionRequest): ReadinessReading =>
		readReadiness(request, this.trlByLeaf);

	/** Take a touched feature out of the readiness average, with a traced reason. */
	excludeFromReadiness = (request: EvolutionRequest, leafId: string, reason: string): boolean => {
		const allowed = canExcludeFromReadiness(this.actor, {
			touched: request.leafIds.includes(leafId),
			alreadyExcluded: request.readinessExclusions.some((e) => e.leafId === leafId),
			reason
		});
		if (!this.#allow(allowed)) return false;
		this.#patch(request.id, (r) =>
			this.#history(
				excludeFromReadiness(r, {
					id: crypto.randomUUID(),
					leafId,
					reason,
					by: this.actor.id,
					at: this.#now()
				}),
				'readiness_exclusion',
				`Excluded ${leafId} from readiness: ${reason}`
			)
		);
		return true;
	};

	/** Bring a feature back into the average; traced like the exclusion. */
	restoreToReadiness = (request: EvolutionRequest, leafId: string): boolean => {
		const excluded = request.readinessExclusions.some((e) => e.leafId === leafId);
		if (!this.#allow(canRestoreToReadiness(this.actor, excluded))) return false;
		this.#patch(request.id, (r) =>
			this.#history(
				restoreToReadiness(r, leafId),
				'readiness_exclusion',
				`Brought ${leafId} back into readiness`
			)
		);
		return true;
	};

	/**
	 * Where a request stands, which is read from the request and never from where
	 * a card was put down. A stage past a gate that is not met, and that no
	 * waiver excuses, is shown at the last stage the request actually earned.
	 * The gate reads the named blocker, never the percentage.
	 */
	stageOf = (request: EvolutionRequest): RequestStage =>
		supportedStage(request, this.maturityOf(request).criticalEmptyCount);

	requestsInStage = (stage: RequestStage): EvolutionRequest[] =>
		this.live.filter((r) => this.stageOf(r) === stage);

	/** Board-card readings, all derived so a card never disagrees with the dossier. */
	cardOf = (request: EvolutionRequest) => ({
		maturity: this.maturityOf(request).score,
		readiness: this.readinessOf(request).average,
		coherenceDelta: request.coherenceReport.requestDelta,
		highestImpactSeverity: highestImpactSeverity(request),
		hasUnliftedWaiver: openWaiver(request) !== null,
		blockingFindings: blockingFindingCount(request),
		acceptanceDebt: acceptanceDebt(request)
	});

	/** Report a refusal with the reason the specification wrote. Returns whether it passed. */
	#allow = (guarded: Guarded): boolean => {
		if (guarded.ok) return true;
		this.notifier.notify('error', guarded.reason);
		return false;
	};

	#patch = (id: string, fn: (r: EvolutionRequest) => EvolutionRequest) => {
		this.draft.requests = this.draft.requests.map((r) => (r.id === id ? fn(r) : r));
		this.#touch();
	};

	/** Append to the append-only timeline. Nothing here ever removes an entry. */
	#history = (
		request: EvolutionRequest,
		type: HistoryEntryType,
		summary: string,
		extra: { proposalId?: string | null; acceptedByPersonId?: string | null } = {}
	): EvolutionRequest =>
		record(request, {
			id: crypto.randomUUID(),
			type,
			summary,
			actor: this.actor,
			at: this.#now(),
			...extra
		});

	select = (id: string | null) => {
		this.selectedRequestId = id;
	};

	/** A new dossier starts as a draft: it is not on the board until it is opened. */
	startDraft = (): string => {
		const request = createEvolutionRequest({ requester: this.actor.id, createdAt: this.#now() });
		this.draft.requests = [request, ...this.draft.requests];
		this.selectedRequestId = request.id;
		this.#touch();
		return request.id;
	};

	editRequest = (id: string, patch: Partial<EvolutionRequest>) => {
		this.#patch(id, (r) => ({ ...r, ...patch }));
	};

	setOrigin = (id: string, origin: RequestOrigin) => this.editRequest(id, { origin });

	/**
	 * Add or drop one of the features the change touches. A request routinely
	 * spans several, and the list is a set: naming the same leaf twice says
	 * nothing more than naming it once.
	 */
	toggleLeaf = (id: string, leafId: string) => {
		this.#patch(id, (r) => ({
			...r,
			leafIds: r.leafIds.includes(leafId)
				? r.leafIds.filter((l) => l !== leafId)
				: [...r.leafIds, leafId]
		}));
	};

	/** Replace the whole set, which is what the impact report does when it lands. */
	setLeaves = (id: string, leafIds: readonly string[]) => {
		this.#patch(id, (r) => ({ ...r, leafIds: [...new Set(leafIds)] }));
	};

	/** Turn a draft into a real request: title, origin and one main leaf. */
	open = (id: string): boolean => {
		const request = this.draft.requests.find((r) => r.id === id);
		if (!request || !this.#allow(canOpenRequest(request))) return false;
		this.#patch(id, (r) =>
			this.#history(openRequest(r, this.#now()), 'stage_crossing', 'Request opened in specification')
		);
		return true;
	};

	/** Move forward one gate. The gate itself is checked by the caller's panel. */
	advance = (id: string, gateGuard: Guarded = { ok: true }): boolean => {
		const request = this.draft.requests.find((r) => r.id === id);
		if (!request) return false;
		const target = nextStage(request.stage);
		if (!target) return false;
		if (!this.#allow(canAdvance(request, target)) || !this.#allow(gateGuard)) return false;
		this.#patch(id, (r) =>
			this.#history({ ...r, stage: target }, 'stage_crossing', `Crossed into ${target}`)
		);
		return true;
	};

	/**
	 * Cross the stage 3 gate, or refuse with the named blocker. Crossing freezes
	 * the specification under the next version number: from here on what is
	 * built is compared against a numbered, dated thing.
	 */
	crossToImplementation = (id: string): boolean => {
		const request = this.draft.requests.find((r) => r.id === id);
		if (!request) return false;
		const crossed = this.advance(
			id,
			canCrossToImplementation(request, this.maturityOf(request).criticalEmptyCount)
		);
		if (crossed) this.#freeze(id);
		return crossed;
	};

	/** The freeze itself, recorded with its version and date. */
	#freeze = (id: string) => {
		this.#patch(id, (r) => {
			const frozen = freeze(r, this.actor, this.#now());
			return this.#history(
				frozen,
				'spec_frozen',
				`Specification frozen as version ${frozen.specVersion}`
			);
		});
	};

	/** Cross a closed gate deliberately, at the cost of a named reason. */
	waive = (id: string, reason: string): boolean => {
		const request = this.draft.requests.find((r) => r.id === id);
		if (!request) return false;
		const met = canCrossToImplementation(request, this.maturityOf(request).criticalEmptyCount).ok;
		if (!this.#allow(canWaive(this.actor, reason, met))) return false;
		const target = nextStage(request.stage);
		this.#patch(id, (r) => {
			// A waiver crosses the gate the freeze belongs to, so it freezes too: the
			// report still needs a numbered version to be judged against.
			const base = target === 'implementation' ? freeze(r, this.actor, this.#now()) : r;
			const waived: EvolutionRequest = {
				...base,
				stage: target ?? r.stage,
				waivers: [
					...r.waivers,
					{
						id: crypto.randomUUID(),
						stage: target ?? r.stage,
						reason,
						grantedBy: this.actor.id,
						grantedAt: this.#now(),
						liftedBy: null,
						liftedAt: null
					}
				]
			};
			return this.#history(waived, 'waiver', `Gate waived: ${reason}`);
		});
		return true;
	};

	/** Lifting states the gate is now genuinely met, so it is an admin act. */
	liftWaiver = (id: string): boolean => {
		const request = this.draft.requests.find((r) => r.id === id);
		if (!request || !this.#allow(canLiftWaiver(this.actor, request))) return false;
		const standing = openWaiver(request);
		if (!standing) return false;
		this.#patch(id, (r) =>
			this.#history(
				{
					...r,
					waivers: r.waivers.map((w) =>
						w.id === standing.id
							? { ...w, liftedBy: this.actor.id, liftedAt: this.#now() }
							: w
					)
				},
				'waiver',
				'Waiver lifted'
			)
		);
		return true;
	};

	/**
	 * Move backward on purpose, when what was specified was the wrong thing.
	 * The spec moves again: the frozen version stays readable, and the next
	 * crossing into Verify produces the next one.
	 */
	rebrief = (id: string): boolean => {
		const request = this.draft.requests.find((r) => r.id === id);
		if (!request || !this.#allow(canRebrief(request))) return false;
		this.#patch(id, (r) => {
			const back = this.#history(
				{ ...amend(r), stage: 'specification', coherenceGateClosed: true },
				'stage_crossing',
				'Sent back to specification for rebrief'
			);
			return r.frozen
				? this.#history(back, 'spec_amended', `Specification amended after version ${r.specVersion}`)
				: back;
		});
		return true;
	};

	close = (id: string): boolean => {
		const request = this.draft.requests.find((r) => r.id === id);
		if (!request || !this.#allow(canCloseRequest(request))) return false;
		this.#patch(id, (r) => this.#history({ ...r, status: 'closed' }, 'stage_crossing', 'Request closed'));
		return true;
	};

	/** Only the dossier goes; every field it wrote into a section stays. */
	remove = (id: string): boolean => {
		const request = this.draft.requests.find((r) => r.id === id);
		if (!request || !this.#allow(canDeleteRequest(request))) return false;
		this.#patch(id, (r) => ({ ...r, status: 'deleted' }));
		if (this.selectedRequestId === id) this.selectedRequestId = null;
		return true;
	};

	/**
	 * Say that a field cannot be answered yet. It turns amber, counts as open,
	 * and lowers nothing on the other fields: a declared unknown, never a fault.
	 */
	markOpenQuestion = (
		id: string,
		fieldPath: string,
		leafId: string | null,
		blockState: string,
		canEdit: boolean
	): boolean => {
		const request = this.draft.requests.find((r) => r.id === id);
		if (!request) return false;
		const key = fieldKey(fieldPath, leafId);
		const allowed = canMarkOpenQuestion({
			canEdit,
			fieldSelected: fieldPath !== '',
			alreadyOpen: request.openQuestionKeys.includes(key),
			blockState
		});
		if (!this.#allow(allowed)) return false;
		this.#patch(id, (r) => ({ ...r, openQuestionKeys: [...new Set([...r.openQuestionKeys, key])] }));
		return true;
	};

	/** Replace the amber with a value, or simply take the mark back. */
	answerOpenQuestion = (
		id: string,
		fieldPath: string,
		leafId: string | null,
		canEdit: boolean
	): boolean => {
		const request = this.draft.requests.find((r) => r.id === id);
		if (!request) return false;
		const key = fieldKey(fieldPath, leafId);
		const allowed = canAnswerOpenQuestion({ canEdit, isOpen: request.openQuestionKeys.includes(key) });
		if (!this.#allow(allowed)) return false;
		this.#patch(id, (r) => ({ ...r, openQuestionKeys: r.openQuestionKeys.filter((k) => k !== key) }));
		return true;
	};

	isOpenQuestion = (request: EvolutionRequest, fieldPath: string, leafId: string | null): boolean =>
		request.openQuestionKeys.includes(fieldKey(fieldPath, leafId));

	/**
	 * The value a signature refers to: the text the owning section holds for an
	 * inline field, the word `written` for a field ticked as done in its own
	 * capability. A signature is a receipt of exactly that.
	 */
	signableValueOf = (request: EvolutionRequest, fieldPath: string, leafId: string | null): string => {
		const key = fieldKey(fieldPath, leafId);
		// A reading is not signed: it is what the spec holds, read back.
		if (blockFieldByPath(fieldPath)?.editor === 'capability') return '';
		return this.fieldValues[key]?.value ?? '';
	};

	/** Who stands behind the value shown for one field home. */
	signaturesOf = (request: EvolutionRequest, fieldPath: string, leafId: string | null) =>
		standingSignatures(request, fieldKey(fieldPath, leafId), this.signableValueOf(request, fieldPath, leafId));

	signedByMe = (request: EvolutionRequest, fieldPath: string, leafId: string | null): boolean =>
		signedBy(
			request,
			fieldKey(fieldPath, leafId),
			this.signableValueOf(request, fieldPath, leafId),
			this.actor.id
		);

	/** Whether the reader may sign this home right now, with the specified refusal otherwise. */
	canSignField = (request: EvolutionRequest, fieldPath: string, leafId: string | null): Guarded => {
		const key = fieldKey(fieldPath, leafId);
		const value = this.signableValueOf(request, fieldPath, leafId);
		const field = blockFieldByPath(fieldPath);
		return canSign(this.actor, {
			canReview: this.actor.role !== 'viewer',
			alreadySignedByMe: signedBy(request, key, value, this.actor.id),
			filled: field ? (field.editor === 'capability' ? value === 'written' : holdsValue(field, value)) : false,
			openQuestion: request.openQuestionKeys.includes(key)
		});
	};

	/** Say, by name and date, that you stand behind the value shown. */
	signField = (request: EvolutionRequest, fieldPath: string, leafId: string | null): boolean => {
		if (!this.#allow(this.canSignField(request, fieldPath, leafId))) return false;
		const key = fieldKey(fieldPath, leafId);
		const signedValue = this.signableValueOf(request, fieldPath, leafId);
		this.#patch(request.id, (r) =>
			this.#history(
				sign(r, { id: crypto.randomUUID(), key, actor: this.actor, at: this.#now(), signedValue }),
				'field_signature',
				`Signed ${fieldPath}${leafId ? ` for ${leafId}` : ''}`
			)
		);
		return true;
	};

	/** Take back your own signature, and only yours. */
	withdrawSignature = (request: EvolutionRequest, fieldPath: string, leafId: string | null): boolean => {
		const key = fieldKey(fieldPath, leafId);
		const value = this.signableValueOf(request, fieldPath, leafId);
		if (!this.#allow(canWithdrawSignature(signedBy(request, key, value, this.actor.id)))) return false;
		this.#patch(request.id, (r) =>
			this.#history(
				withdraw(r, key, value, this.actor.id),
				'field_signature',
				`Withdrew the signature on ${fieldPath}${leafId ? ` for ${leafId}` : ''}`
			)
		);
		return true;
	};

	/** The latest thread on one field home. */
	threadOf = (request: EvolutionRequest, fieldPath: string, leafId: string | null) =>
		latestThread(request, fieldKey(fieldPath, leafId));

	/** Open threads on the request, or under one block. */
	openThreads = (request: EvolutionRequest, blockId?: string): number =>
		openThreadCount(request, blockId);

	/**
	 * Post on a field, under your name. A thread that became a change takes no
	 * message, so posting on it opens a new thread on the new value.
	 */
	postOnField = (
		request: EvolutionRequest,
		fieldPath: string,
		leafId: string | null,
		body: string
	): boolean => {
		const key = fieldKey(fieldPath, leafId);
		const current = latestThread(request, key);
		const startsNew = current === undefined || current.state === 'turned_into_change';
		const allowed = canPostOnField(this.actor, {
			canComment: true,
			thread: startsNew ? undefined : current
		});
		if (!this.#allow(allowed)) return false;
		const message = {
			id: crypto.randomUUID(),
			author: this.actor.id,
			authorKind: this.actor.kind,
			body,
			postedAt: this.#now()
		};
		this.#patch(request.id, (r) => ({
			...r,
			fieldThreads: startsNew
				? [...r.fieldThreads, openThread({ id: crypto.randomUUID(), key, message })]
				: r.fieldThreads.map((t) => (t.id === current.id ? post(t, message) : t))
		}));
		return true;
	};

	/** Say, as a person, that the question got its answer. */
	answerThread = (request: EvolutionRequest, fieldPath: string, leafId: string | null): boolean => {
		const current = latestThread(request, fieldKey(fieldPath, leafId));
		if (!this.#allow(canMarkAnswered(this.actor, current)) || !current) return false;
		this.#patch(request.id, (r) =>
			this.#history(
				{ ...r, fieldThreads: r.fieldThreads.map((t) => (t.id === current.id ? markAnswered(t) : t)) },
				'field_thread',
				`Thread on ${fieldPath}${leafId ? ` for ${leafId}` : ''} answered`
			)
		);
		return true;
	};

	/**
	 * End the thread by writing a new value of the field, under your name. The
	 * value is written through to the owning section first; a refused write
	 * leaves the thread open.
	 */
	turnThreadIntoChange = async (
		request: EvolutionRequest,
		fieldPath: string,
		leafId: string | null,
		value: string
	): Promise<boolean> => {
		const key = fieldKey(fieldPath, leafId);
		const current = latestThread(request, key);
		const canEdit = this.actor.role !== 'viewer';
		if (!this.#allow(canTurnIntoChange(this.actor, { canEdit, thread: current }))) return false;
		const refused = await this.saveField(
			request,
			fieldPath,
			leafId ?? '',
			value,
			this.fieldValues[key]?.sourceIds ?? []
		);
		if (refused) {
			this.notifier.notify('error', refused.reason);
			return false;
		}
		const at = this.#now();
		const message = {
			id: crypto.randomUUID(),
			author: this.actor.id,
			authorKind: this.actor.kind,
			body: value,
			postedAt: at
		};
		this.#patch(request.id, (r) => {
			const ended = current
				? r.fieldThreads.map((t) =>
						t.id === current.id
							? turnIntoChange(post(t, message), { value, actorId: this.actor.id, at })
							: t
					)
				: [
						...r.fieldThreads,
						turnIntoChange(openThread({ id: crypto.randomUUID(), key, message }), {
							value,
							actorId: this.actor.id,
							at
						})
					];
			return this.#history(
				{ ...r, fieldThreads: ended },
				'field_thread',
				`Thread on ${fieldPath}${leafId ? ` for ${leafId}` : ''} turned into a change`
			);
		});
		return true;
	};

	/**
	 * The value moved on under standing signatures: void them, visibly, and let
	 * the history keep who had signed what. The editor is told how many names
	 * their edit sent back to the signers.
	 */
	#voidOnEdit = (requestId: string, key: string, newValue: string, fieldPath: string) => {
		const request = this.draft.requests.find((r) => r.id === requestId);
		if (!request) return;
		const { request: voided, voided: count } = voidSignaturesOnEdit(
			request,
			key,
			newValue,
			this.actor,
			this.#now()
		);
		if (count === 0) return;
		this.#patch(requestId, () =>
			this.#history(
				voided,
				'field_signature',
				`Edited ${fieldPath}: ${count} ${count === 1 ? 'signature' : 'signatures'} voided`
			)
		);
		this.notifier.notify(
			'info',
			`Your edit voided ${count} ${count === 1 ? 'signature' : 'signatures'}. The signers are told in the history.`
		);
	};

	/**
	 * Record that an inline dossier field now holds a value in its owning
	 * section. The value itself is never stored here: only its presence, which
	 * is what the maturity score reads. A capability block is never marked: it
	 * is read.
	 */
	markFieldFilled = (
		requestId: string,
		fieldPath: string,
		filled: boolean,
		leafId: string | null = null
	) => {
		const key = fieldKey(fieldPath, leafId);
		if (blockFieldByPath(fieldPath)?.editor === 'capability') return;
		const current = new Set(this.filledFields[requestId] ?? []);
		if (filled) current.add(key);
		else current.delete(key);
		this.filledFields = { ...this.filledFields, [requestId]: [...current] };
	};

	/**
	 * The values of the inline fields, read back from the sections that own them
	 * and keyed by `fieldKey`. The dossier holds them only for the time it shows
	 * them: nothing here is persisted into the evolution section.
	 */
	fieldValues = $state<Record<string, { value: string; sourceIds: string[] }>>({});

	/** Pull every inline field of a request's leaves from its owning section. */
	loadFieldValues = async (request: EvolutionRequest): Promise<void> => {
		if (request.leafIds.length === 0) return;
		const fieldPaths = ALL_BLOCK_FIELDS.filter((f) => f.editor === 'inline').map((f) => f.path);
		try {
			const res = await fetch('/api/draft/evolution/field', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					op: 'read',
					projectId: this.draft.projectId,
					leafIds: request.leafIds,
					fieldPaths
				})
			});
			if (!res.ok) return;
			const body = (await res.json()) as {
				values: Record<string, { value: string; sourceIds: string[] }>;
			};
			this.fieldValues = body.values ?? {};
			// Presence follows the value: a field is filled when its section holds
			// something, never because somebody ticked a box on the dossier. A list
			// of blank lines holds nothing.
			const filled = new Set<string>();
			for (const [key, held] of Object.entries(this.fieldValues)) {
				const field = blockFieldByPath(key.split('@')[0]);
				if (field ? holdsValue(field, held.value) : held.value.trim() !== '') filled.add(key);
			}
			// Only the inline half is rebuilt here. The marks for the blocks edited
			// in a capability of their own live on the request and are untouched by
			// a read that cannot see into those editors.
			this.filledFields = { ...this.filledFields, [request.id]: [...filled] };
		} catch (err) {
			this.notifier.notify('error', err instanceof Error ? err.message : 'could not read the fields');
		}
	};

	/**
	 * Write one field into the section that owns it. Returns the refusal when the
	 * section refuses, so the field can report it in place and roll back.
	 */
	saveField = async (
		request: EvolutionRequest,
		fieldPath: string,
		leafId: string,
		value: string,
		sourceIds: string[]
	): Promise<{ reason: string } | null> => {
		try {
			const res = await fetch('/api/draft/evolution/field', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					projectId: this.draft.projectId,
					fieldPath,
					leafId,
					value,
					sourceIds
				})
			});
			if (res.status === 403) return { reason: 'You are not allowed to write in the section that owns this field.' };
			if (!res.ok) return { reason: `The write failed (${res.status}).` };
			const body = (await res.json()) as { status: string; reason?: string };
			if (body.status === 'refused') return { reason: body.reason ?? 'The section refused the value.' };
			const key = fieldKey(fieldPath, leafId);
			const field = blockFieldByPath(fieldPath);
			const holds = field ? holdsValue(field, value) : value.trim() !== '';
			this.fieldValues = { ...this.fieldValues, [key]: { value, sourceIds } };
			this.markFieldFilled(request.id, fieldPath, holds, leafId);
			this.#voidOnEdit(request.id, key, value, fieldPath);
			// A value answers the question: the amber goes with it.
			if (holds && request.openQuestionKeys.includes(key)) {
				this.#patch(request.id, (r) => ({
					...r,
					openQuestionKeys: r.openQuestionKeys.filter((k) => k !== key)
				}));
			}
			return null;
		} catch (err) {
			return { reason: err instanceof Error ? err.message : 'the write failed' };
		}
	};

	/** The previous result never carries over to another hypothesis. */
	setHypothesis = (id: string, hypothesis: ImpactHypothesis) => {
		this.#patch(id, (r) => switchHypothesis(r, hypothesis));
	};

	setImpactDepth = (id: string, depth: number) => {
		this.#patch(id, (r) => ({
			...r,
			impactReport: { ...r.impactReport, depth, status: 'not_run', ranAt: null }
		}));
	};

	/** Dispose of one line of the implementation report. */
	decideLine = (id: string, lineId: string, decision: LineDecision): boolean => {
		const request = this.draft.requests.find((r) => r.id === id);
		if (!request || !this.#allow(canDecide(request, this.actor))) return false;
		this.#patch(id, (r) =>
			this.#history(
				{
					...r,
					implementationFindings: r.implementationFindings.map((l) =>
						l.id === lineId
							? {
									...l,
									decision,
									decidedBy: this.actor.id,
									decidedAt: this.#now(),
									// Adoption writes the missing criterion into its canonical
									// section, and the line is then re-evaluated as conform.
									verdict: decision === 'adopted' ? 'conform' : l.verdict
								}
							: l
					)
				},
				'verdict_decision',
				`Line ${decision}`
			)
		);
		return true;
	};

	/** The only batch the panel ever offers: one bucket at a time. */
	decideBucket = (id: string, verdict: string, decision: LineDecision): boolean => {
		const request = this.draft.requests.find((r) => r.id === id);
		if (!request || !this.#allow(canDecide(request, this.actor))) return false;
		this.#patch(id, (r) =>
			this.#history(
				{
					...r,
					implementationFindings: r.implementationFindings.map((l) =>
						l.iteration === r.iteration && l.verdict === verdict && l.decision === 'undecided'
							? { ...l, decision, decidedBy: this.actor.id, decidedAt: this.#now() }
							: l
					)
				},
				'verdict_decision',
				`Bucket ${verdict} ${decision}`
			)
		);
		return true;
	};

	undecided = (request: EvolutionRequest): number => undecidedCount(request);
	protectedLines = (request: EvolutionRequest): string[] => protectedLineIds(request);

	/**
	 * The values a model offered for the fields nobody has filled.
	 *
	 * The whole point of the dossier is that the writing is done for you and the
	 * signing is not: a proposal reaches its canonical section the moment a
	 * PERSON accepts it, never before, and the acceptance is stamped on the
	 * timeline with the proposal it came from.
	 */
	proposalsFor = (request: EvolutionRequest, fieldPath: string): Proposal[] =>
		pendingProposals(request).filter((p) => p.targetField === fieldPath);

	/**
	 * Sign a proposed value. An inline field is written through to its section
	 * here and now; a field whose home has an editor of its own was written by
	 * the client that proposed it, and what acceptance adds is the signature and
	 * the mark that the block is answered.
	 */
	acceptProposal = async (request: EvolutionRequest, proposalId: string): Promise<boolean> => {
		const proposal = request.proposals.find((p) => p.id === proposalId);
		if (!proposal || !this.#allow(canAcceptProposal(this.actor, proposal))) return false;
		const field = blockFieldByPath(proposal.targetField);
		if (field?.editor === 'inline') {
			const leafId = proposal.canonicalPath.split('.').at(-2) ?? '';
			const refused = await this.saveField(
				request,
				proposal.targetField,
				leafId,
				proposal.value,
				proposal.citedSourceIds
			);
			if (refused) {
				this.notifier.notify('error', refused.reason);
				return false;
			}
		} else {
			this.markFieldFilled(request.id, proposal.targetField, true);
		}
		this.#patch(request.id, (r) =>
			this.#history(
				{
					...r,
					proposals: r.proposals.map((p) =>
						p.id === proposalId
							? { ...p, decision: 'accepted' as const, acceptedBy: this.actor.id, acceptedAt: this.#now() }
							: p
					)
				},
				'accepted_proposal',
				`Accepted the proposed ${proposal.targetField}`,
				{ proposalId, acceptedByPersonId: this.actor.id }
			)
		);
		return true;
	};

	/** Refusing is a decision like the others, and it belongs to a person. */
	refuseProposal = (request: EvolutionRequest, proposalId: string, comment: string): boolean => {
		if (!this.#allow(canRefuseProposal(this.actor))) return false;
		this.#patch(request.id, (r) => ({
			...r,
			proposals: r.proposals.map((p) =>
				p.id === proposalId ? { ...p, decision: 'refused' as const, comment } : p
			)
		}));
		return true;
	};

	/** Rewording keeps the card open and clears the glossary flag it was raised on. */
	rewordProposal = (request: EvolutionRequest, proposalId: string, value: string): boolean => {
		const proposal = request.proposals.find((p) => p.id === proposalId);
		if (!proposal || !this.#allow(canRewordProposal(proposal))) return false;
		this.#patch(request.id, (r) => ({
			...r,
			proposals: r.proposals.map((p) =>
				p.id === proposalId
					? { ...p, value, decision: 'reworded' as const, bannedSynonymDetected: false, flaggedWords: [] }
					: p
			)
		}));
		return true;
	};

	/** Put a typed, anchored, illustrated observation into the notebook. */
	logObservation = (id: string, patch: Partial<ReturnType<typeof createObservation>>): boolean => {
		const observation = createObservation({ ...patch, status: 'draft' });
		if (!this.#allow(canLogObservation(observation))) return false;
		this.#patch(id, (r) => ({
			...r,
			observations: [...r.observations, { ...observation, status: 'logged' }]
		}));
		return true;
	};

	/** A thread ends in exactly one ruling, and never one recorded by a model. */
	ruleObservation = (
		id: string,
		observationId: string,
		ruling: ObservationRuling,
		reason = ''
	): boolean => {
		const request = this.draft.requests.find((r) => r.id === id);
		const observation = request?.observations.find((o) => o.id === observationId);
		if (!request || !observation) return false;
		if (!this.#allow(canRule(this.actor, observation))) return false;
		this.#patch(id, (r) =>
			this.#history(
				{
					...r,
					observations: r.observations.map((o) =>
						o.id === observationId ? { ...o, ruling, rulingReason: reason } : o
					)
				},
				'acceptance_ruling',
				`Observation ${ruling}`
			)
		);
		return true;
	};

	acceptanceOwed = (request: EvolutionRequest): number => validatedNotFoldedBack(request);
}
