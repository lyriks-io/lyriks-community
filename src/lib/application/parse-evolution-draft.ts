import {
	createEmptyEvolutionDraft,
	isAuthorKind,
	isCoherenceAxis,
	isFindingSeverity,
	isHistoryEntryType,
	isImpactHypothesis,
	isCodeWork,
	isImpactNodeKind,
	isImpactSection,
	isImpactSeverity,
	isImplementationVerdict,
	isInjectionKind,
	isLineDecision,
	isObservationRuling,
	isObservationType,
	isProposalDecision,
	isRequestOrigin,
	isRequestStage,
	isRequestStatus,
	isWalkthroughTarget,
	isCanonicalSection,
	isFieldThreadState,
	MAX_IMPACT_DEPTH,
	blockById,
	fieldKey,
	isLeafScoped,
	type CoherenceFinding,
	type EvolutionRequest,
	type FieldSignature,
	type FieldThread,
	type FieldThreadMessage,
	type FrozenVersion,
	type ReadinessExclusion,
	type GateWaiver,
	type HistoryEntry,
	type ImpactFinding,
	type ImplementationFinding,
	type Iteration,
	type Observation,
	type ObservationMessage,
	type ProjectEvolutionDraft,
	type Proposal
} from '$domain/evolution';

/**
 * Anti-corruption parse for the Evolution draft.
 *
 * Nothing crosses this boundary unchecked: every enum falls back to its safe
 * default, every number is clamped to the range the specification allows, and a
 * row without a usable id is dropped rather than half-read. The one shape rule
 * the parser enforces beyond typing is the request invariant that a main leaf is
 * never also a secondary one.
 */

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);
const nullableStr = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const strList = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : [];

function num(v: unknown, fallback: number, min?: number, max?: number): number {
	const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
	const lower = min === undefined ? n : Math.max(min, n);
	return max === undefined ? lower : Math.min(max, lower);
}

/** Rows keyed by a non-empty, unique id; anything else is skipped. */
function rows(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const out: Record<string, unknown>[] = [];
	for (const item of value) {
		if (!item || typeof item !== 'object') continue;
		const record = item as Record<string, unknown>;
		const id = record.id;
		if (typeof id !== 'string' || id === '' || seen.has(id)) continue;
		seen.add(id);
		out.push(record);
	}
	return out;
}

function parseWaiver(src: Record<string, unknown>): GateWaiver {
	return {
		id: src.id as string,
		stage: isRequestStage(src.stage) ? src.stage : 'implementation',
		reason: str(src.reason),
		grantedBy: str(src.grantedBy),
		grantedAt: str(src.grantedAt),
		liftedBy: nullableStr(src.liftedBy),
		liftedAt: nullableStr(src.liftedAt)
	};
}

function parseSignature(src: Record<string, unknown>): FieldSignature {
	return {
		id: src.id as string,
		key: str(src.key),
		signerId: str(src.signerId),
		signedAt: str(src.signedAt),
		signedValue: str(src.signedValue),
		voidedAt: nullableStr(src.voidedAt),
		voidedBy: nullableStr(src.voidedBy)
	};
}

function parseThreadMessage(src: Record<string, unknown>): FieldThreadMessage {
	return {
		id: src.id as string,
		author: str(src.author),
		authorKind: isAuthorKind(src.authorKind) ? src.authorKind : 'person',
		body: str(src.body),
		postedAt: str(src.postedAt)
	};
}

function parseFieldThread(src: Record<string, unknown>): FieldThread {
	return {
		id: src.id as string,
		key: str(src.key),
		state: isFieldThreadState(src.state) ? src.state : 'open',
		// A message with no author answers none of the questions a thread exists for.
		messages: rows(src.messages)
			.map(parseThreadMessage)
			.filter((m) => m.author.trim() !== ''),
		changeValue: nullableStr(src.changeValue),
		changedBy: nullableStr(src.changedBy),
		changedAt: nullableStr(src.changedAt)
	};
}

function parseFrozenVersion(src: Record<string, unknown>): FrozenVersion {
	return { version: num(src.version, 0, 0), at: str(src.at), by: str(src.by) };
}

function parseReadinessExclusion(src: Record<string, unknown>): ReadinessExclusion {
	return {
		id: src.id as string,
		leafId: str(src.leafId),
		reason: str(src.reason),
		by: str(src.by),
		at: str(src.at)
	};
}

function parseCoherenceFinding(src: Record<string, unknown>): CoherenceFinding {
	return {
		id: src.id as string,
		axis: isCoherenceAxis(src.axis) ? src.axis : 'semantic',
		severity: isFindingSeverity(src.severity) ? src.severity : 'minor',
		title: str(src.title),
		requestNodeId: str(src.requestNodeId),
		existingNodeId: str(src.existingNodeId),
		fixNowTarget: str(src.fixNowTarget),
		published: bool(src.published)
	};
}

function parseImpactFinding(src: Record<string, unknown>): ImpactFinding {
	const ruleWork = src.ruleWork;
	const migration = src.migrationImplied;
	return {
		id: src.id as string,
		hypothesis: isImpactHypothesis(src.hypothesis) ? src.hypothesis : 'add',
		section: isImpactSection(src.section) ? src.section : 'leaves',
		nodeId: str(src.nodeId),
		nodeLabel: str(src.nodeLabel),
		// A row of unknown kind is read as a feature: it is the granularity the
		// section is named after, so it understates rather than invents.
		nodeKind: isImpactNodeKind(src.nodeKind) ? src.nodeKind : 'feature',
		groupPath: strList(src.groupPath),
		note: str(src.note),
		codeWork: isCodeWork(src.codeWork) ? src.codeWork : null,
		depth: num(src.depth, 1, 1, MAX_IMPACT_DEPTH),
		severity: isImpactSeverity(src.severity) ? src.severity : 'none',
		migrationImplied: typeof migration === 'boolean' ? migration : null,
		ruleWork: ruleWork === 'replay' || ruleWork === 'rewrite' ? ruleWork : null
	};
}

function parseImplementationFinding(src: Record<string, unknown>): ImplementationFinding {
	return {
		id: src.id as string,
		iteration: num(src.iteration, 1, 1),
		verdict: isImplementationVerdict(src.verdict) ? src.verdict : 'missing',
		requirement: str(src.requirement),
		filePath: str(src.filePath),
		lineRange: str(src.lineRange),
		specStatement: str(src.specStatement),
		codeStatement: str(src.codeStatement),
		hasRequirementAnchor: bool(src.hasRequirementAnchor, true),
		anchorForeignLeaf: bool(src.anchorForeignLeaf),
		acceptanceTestPassing: bool(src.acceptanceTestPassing),
		specVersion: num(src.specVersion, 0, 0),
		decision: isLineDecision(src.decision) ? src.decision : 'undecided',
		decidedBy: nullableStr(src.decidedBy),
		decidedAt: nullableStr(src.decidedAt)
	};
}

function parseProposal(src: Record<string, unknown>): Proposal {
	return {
		id: src.id as string,
		targetField: str(src.targetField),
		canonicalSection: isCanonicalSection(src.canonicalSection) ? src.canonicalSection : 'features',
		canonicalPath: str(src.canonicalPath),
		value: str(src.value),
		reasoning: str(src.reasoning),
		reasoningSeparatesReadFromInferred: bool(src.reasoningSeparatesReadFromInferred),
		citedSourceIds: strList(src.citedSourceIds),
		bannedSynonymDetected: bool(src.bannedSynonymDetected),
		decision: isProposalDecision(src.decision) ? src.decision : 'pending',
		comment: str(src.comment),
		acceptedBy: nullableStr(src.acceptedBy),
		acceptedAt: nullableStr(src.acceptedAt),
		reviewerIds: strList(src.reviewerIds),
		// A verdict with no author stands behind nothing: dropped.
		verdicts: (Array.isArray(src.verdicts) ? src.verdicts : [])
			.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
			.map((v) => ({
				by: str(v.by),
				verdict: v.verdict === 'invalidated' ? ('invalidated' as const) : ('validated' as const),
				comment: str(v.comment),
				at: str(v.at)
			}))
			.filter((v) => v.by.trim() !== '')
	};
}

function parseMessage(src: Record<string, unknown>): ObservationMessage {
	return {
		id: src.id as string,
		channel: src.channel === 'llm' ? 'llm' : 'human',
		author: str(src.author),
		authorKind: isAuthorKind(src.authorKind) ? src.authorKind : 'person',
		body: str(src.body),
		postedAt: str(src.postedAt)
	};
}

function parseObservation(src: Record<string, unknown>): Observation {
	return {
		id: src.id as string,
		type: isObservationType(src.type) ? src.type : 'defect',
		target: isWalkthroughTarget(src.target) ? src.target : 'prototype',
		body: str(src.body),
		screenId: str(src.screenId),
		elementId: str(src.elementId),
		captureAttached: bool(src.captureAttached),
		captureAnnotated: bool(src.captureAnnotated),
		status: src.status === 'logged' ? 'logged' : 'draft',
		ruling: isObservationRuling(src.ruling) ? src.ruling : 'open',
		rulingReason: str(src.rulingReason),
		assignee: nullableStr(src.assignee),
		messages: rows(src.messages).map(parseMessage),
		linkedRequestId: nullableStr(src.linkedRequestId),
		foldedBackAt: nullableStr(src.foldedBackAt),
		foldedBackBy: nullableStr(src.foldedBackBy),
		foldedBackKind: isInjectionKind(src.foldedBackKind) ? src.foldedBackKind : null,
		foldedBackLeafId: nullableStr(src.foldedBackLeafId)
	};
}

function parseHistoryEntry(src: Record<string, unknown>): HistoryEntry {
	return {
		id: src.id as string,
		type: isHistoryEntryType(src.type) ? src.type : 'stage_crossing',
		summary: str(src.summary),
		authorId: str(src.authorId),
		authorKind: isAuthorKind(src.authorKind) ? src.authorKind : 'person',
		recordedAt: str(src.recordedAt),
		proposalId: nullableStr(src.proposalId),
		acceptedByPersonId: nullableStr(src.acceptedByPersonId),
		supersededById: nullableStr(src.supersededById),
		channel: src.channel === 'page' || src.channel === 'ai_client' ? src.channel : null
	};
}

function parseIteration(src: Record<string, unknown>, index: number): Iteration {
	const status = src.reportStatus;
	return {
		number: num(src.number, index + 1, 1),
		startedAt: str(src.startedAt),
		brief: str(src.brief),
		protectedLineIds: strList(src.protectedLineIds),
		reportStatus: status === 'ready' || status === 'closed' ? status : 'building'
	};
}

/**
 * A dossier written before open questions existed carried parked BLOCKS. A
 * parked block is exactly a block whose every field is an open question, so the
 * old mark is read as the new one rather than dropped: the author's holes stay
 * declared.
 */
function openQuestionsOfParkedBlocks(
	src: Record<string, unknown>,
	leafIds: readonly string[]
): string[] {
	const keys: string[] = [];
	for (const blockId of strList(src.skippedBlockIds)) {
		for (const field of blockById(blockId)?.fields ?? []) {
			if (!isLeafScoped(field)) keys.push(fieldKey(field.path));
			else for (const leafId of leafIds) keys.push(fieldKey(field.path, leafId));
		}
	}
	return keys;
}

function parseRequest(src: Record<string, unknown>): EvolutionRequest {
	const coherence = (src.coherenceReport ?? {}) as Record<string, unknown>;
	const impact = (src.impactReport ?? {}) as Record<string, unknown>;
	const coherenceStatus = coherence.status;
	// The features the change touches, deduplicated: the set says WHAT is
	// touched, not how often. Legacy dossiers carried a main leaf and a list
	// beside it; both are folded into the one set, main leaf first.
	const leafIds = [
		...new Set([...strList(src.mainLeafId ? [src.mainLeafId] : []), ...strList(src.leafIds), ...strList(src.secondaryLeafIds)])
	];
	return {
		id: src.id as string,
		title: str(src.title),
		origin: isRequestOrigin(src.origin) ? src.origin : null,
		requester: str(src.requester),
		stage: isRequestStage(src.stage) ? src.stage : 'draft',
		status: isRequestStatus(src.status) ? src.status : 'open',
		leafIds,
		iteration: num(src.iteration, 1, 1),
		iterations: (Array.isArray(src.iterations) ? src.iterations : [])
			.filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
			.map(parseIteration),
		specVersion: num(src.specVersion, 0, 0),
		frozen: bool(src.frozen),
		frozenVersions: (Array.isArray(src.frozenVersions) ? src.frozenVersions : [])
			.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
			.map(parseFrozenVersion)
			.filter((v) => v.version >= 1),
		createdAt: str(src.createdAt),
		openQuestionKeys: [
			...new Set([...strList(src.openQuestionKeys), ...openQuestionsOfParkedBlocks(src, leafIds)])
		],
		// A signature with no signer or no home stands behind nothing: dropped.
		fieldSignatures: rows(src.fieldSignatures)
			.map(parseSignature)
			.filter((s) => s.signerId !== '' && s.key !== ''),
		fieldThreads: rows(src.fieldThreads)
			.map(parseFieldThread)
			.filter((t) => t.key !== ''),
		// An exclusion with no leaf or no author traces nothing: dropped.
		readinessExclusions: rows(src.readinessExclusions)
			.map(parseReadinessExclusion)
			.filter((e) => e.leafId !== '' && e.by !== ''),
		filledFieldKeys: strList(src.filledFieldKeys),
		coherenceGateClosed: bool(src.coherenceGateClosed),
		coherenceReport: {
			status:
				coherenceStatus === 'ready' || coherenceStatus === 'running' ? coherenceStatus : 'not_run',
			projectScore: num(coherence.projectScore, 0, 0, 100),
			requestDelta: num(coherence.requestDelta, 0, -100, 100),
			ranAt: nullableStr(coherence.ranAt)
		},
		impactReport: {
			status: impact.status === 'ready' ? 'ready' : 'not_run',
			hypothesis: isImpactHypothesis(impact.hypothesis) ? impact.hypothesis : 'add',
			depth: num(impact.depth, 2, 1, MAX_IMPACT_DEPTH),
			ranAt: nullableStr(impact.ranAt)
		},
		coherenceFindings: rows(src.coherenceFindings).map(parseCoherenceFinding),
		impactFindings: rows(src.impactFindings).map(parseImpactFinding),
		implementationFindings: rows(src.implementationFindings).map(parseImplementationFinding),
		proposals: rows(src.proposals).map(parseProposal),
		observations: rows(src.observations).map(parseObservation),
		waivers: rows(src.waivers).map(parseWaiver),
		// The history never holds an unattributed decision. The write guard refuses
		// one, and so does this boundary: an out-of-process author writing straight
		// to the section must not be able to slip one past the guard.
		history: rows(src.history)
			.map(parseHistoryEntry)
			.filter((entry) => entry.authorId.trim() !== '')
	};
}

export function parseEvolutionDraft(input: unknown, projectId: string): ProjectEvolutionDraft {
	const base = createEmptyEvolutionDraft(projectId);
	if (!input || typeof input !== 'object') return base;
	const src = input as Record<string, unknown>;
	return { ...base, projectId, requests: rows(src.requests).map(parseRequest) };
}
