import { SPEC_BLOCKS, fieldKey, fieldsOf, isLeafScoped, type BlockField, type SpecBlock } from './blocks';
import type { EvolutionRequest, ImpactFinding } from './draft';
import { findingsForCurrentHypothesis } from './impact';

/**
 * The blocks whose home has an editor of its own are READINGS, never fields to
 * fill by hand. The dossier says what the change implies and what already
 * exists for the features it touches, read from the specification itself
 * (the behaviour model, the access matrix, the data model, the dependencies)
 * and from the impact report. Nothing here is ticked: a reading is answered
 * by what is written where it lives, and an empty reading is exactly what the
 * completion, through the MCP, goes and writes.
 */

export interface LeafBehaviour {
	readonly surfaces: number;
	readonly actions: number;
	readonly rules: number;
	readonly invariants: number;
	/** Entity names the model declares. */
	readonly entities: string[];
	/** What the model says, by name: a surface and the actions it holds. */
	readonly surfaceNames: readonly { name: string; actions: readonly string[] }[];
	/** Each guard as the action it gates and what refuses it, one line per guard, no repeat. */
	readonly guardReasons: readonly string[];
	readonly invariantNames: readonly string[];
	/** When the model was last written, to say whether it moved since the request opened. */
	readonly updatedAt: string | null;
	/** The engine's maturity of the model, when the score cache holds it. */
	readonly maturity: { percentage: number; criticalCount: number } | null;
	/** How much of the model the code index located, when a sync ran. */
	readonly coverage: { found: number; expected: number; percent: number } | null;
}

/** The one line that says whether a model is proven and built, not only present. */
function behaviourStatus(model: LeafBehaviour, openedAt: string): string {
	const parts: string[] = [];
	if (model.maturity)
		parts.push(
			`model ${model.maturity.percentage}%${model.maturity.criticalCount > 0 ? `, ${plural(model.maturity.criticalCount, 'critical issue')}` : ''}`
		);
	if (model.updatedAt && openedAt) parts.push(model.updatedAt > openedAt ? 'edited since this request opened' : 'not edited since this request opened');
	if (model.coverage) parts.push(`code: ${model.coverage.found} of ${model.coverage.expected} located`);
	return parts.join(' · ');
}

export interface ReadingInputs {
	/** The behaviour model of every touched leaf; null when none is authored. */
	readonly behaviourByLeaf: Readonly<Record<string, LeafBehaviour | null>>;
	readonly grants: readonly { roleId: string; capabilityId: string; action?: string }[];
	readonly roles: readonly { id: string; name: string }[];
	/** Entity names the data model holds. */
	readonly dataEntities: readonly string[];
	readonly dependsOnByLeaf: Readonly<Record<string, readonly string[]>>;
	/** What the project-wide sections hold today, by canonical path. */
	readonly held: Readonly<Record<string, { summary: string; names: string[] }>>;
	/**
	 * The edge cases of the rules section that hang under an issue of a touched
	 * feature, as the Given / When / Then sentences a person reads.
	 */
	readonly edgeCasesByLeaf: Readonly<Record<string, readonly EdgeCaseSentence[]>>;
}

export interface EdgeCaseSentence {
	readonly title: string;
	readonly given: string;
	readonly when: string;
	readonly then: string;
	readonly expectedOutcome: string;
}

/** One node the change moves in the section a reading covers, with what to do and why. */
export interface MovingNode {
	readonly kind: string;
	readonly label: string;
	/** Rules: replay or rewrite. Entities: whether a migration is implied. */
	readonly work: string | null;
	/** Why it moves, in full: never shortened to fit a row. */
	readonly note: string;
	readonly severity: string;
}

export interface CapabilityReading {
	readonly key: string;
	readonly fieldPath: string;
	readonly leafId: string | null;
	/** Answered by what is written where it lives. */
	readonly filled: boolean;
	readonly summary: string;
	/** What exists, by name. */
	readonly names: readonly string[];
	/** What this change moves there, per the impact report, each with its reason. */
	readonly moving: readonly MovingNode[];
}

/** An edge case as one sentence: what happens, when, and what is expected. */
export function edgeCaseSentence(edge: EdgeCaseSentence): string {
	const given = edge.given.trim();
	const when = edge.when.trim();
	const then = edge.then.trim();
	const parts = [
		given ? `Given ${given.replace(/^given\s+/i, '')}` : '',
		when ? `when ${when.replace(/^when\s+/i, '')}` : '',
		then ? `then ${then.replace(/^then\s+/i, '')}` : ''
	].filter((p) => p !== '');
	const sentence = parts.join(', ') || edge.title;
	return `${sentence} (expected: ${edge.expectedOutcome})`;
}

function movingOf(findings: readonly ImpactFinding[]): MovingNode[] {
	return findings.map((f) => ({
		kind: f.nodeKind,
		label: f.nodeLabel,
		work:
			f.ruleWork === 'replay'
				? 'replay the rule: the text still holds, run it again'
				: f.ruleWork === 'rewrite'
					? 'rewrite the rule: a person writes it afresh'
					: f.migrationImplied === true
						? 'a data migration is implied'
						: f.migrationImplied === false
							? 'no migration implied'
							: null,
		note: f.note,
		severity: f.severity
	}));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The impact findings of the current hypothesis that sit in one section. */
function impactsIn(request: EvolutionRequest, section: ImpactFinding['section']): ImpactFinding[] {
	return findingsForCurrentHypothesis(request).filter((f) => f.section === section);
}

function readBehaviour(
	field: BlockField,
	leafId: string,
	model: LeafBehaviour | null,
	openedAt: string
): CapabilityReading {
	const key = fieldKey(field.path, leafId);
	if (!model) {
		return {
			key,
			fieldPath: field.path,
			leafId,
			filled: false,
			summary: 'no behaviour model authored yet',
			names: [],
			moving: []
		};
	}
	const status = behaviourStatus(model, openedAt);
	const withStatus = (line: string) => (status ? `${line} · ${status}` : line);
	if (field.path === '06-behavioural.surfaces') {
		const some = model.surfaces + model.actions > 0;
		return {
			key,
			fieldPath: field.path,
			leafId,
			filled: true,
			summary: some
				? withStatus(`${plural(model.surfaces, 'surface')}, ${plural(model.actions, 'action')}`)
				: withStatus('no surface and no action in the model'),
			names: model.surfaceNames.map((s) =>
				s.actions.length > 0 ? `${s.name}: ${s.actions.join(', ')}` : s.name
			),
			moving: []
		};
	}
	if (field.path === '06-behavioural.rules') {
		return {
			key,
			fieldPath: field.path,
			leafId,
			filled: true,
			summary: withStatus(model.rules > 0 ? plural(model.rules, 'guard') : 'no guard in the model'),
			names: [...model.guardReasons],
			moving: []
		};
	}
	return {
		key,
		fieldPath: field.path,
		leafId,
		filled: true,
		summary: withStatus(
			model.invariants > 0 ? plural(model.invariants, 'invariant') : 'no invariant in the model'
		),
		names: [...model.invariantNames],
		moving: []
	};
}

function readGrants(
	field: BlockField,
	request: EvolutionRequest,
	inputs: ReadingInputs,
	impactRan: boolean
): CapabilityReading {
	const key = fieldKey(field.path);
	const roleName = (id: string) => inputs.roles.find((r) => r.id === id)?.name || id;
	if (request.leafIds.length === 0) {
		return {
			key,
			fieldPath: field.path,
			leafId: null,
			filled: false,
			summary: 'name what this change touches to read its grants',
			names: [],
			moving: []
		};
	}
	const perLeaf = request.leafIds.map((leafId) => {
		const rows = inputs.grants.filter((g) => g.capabilityId === leafId);
		const byRole = new Map<string, Set<string>>();
		for (const g of rows) {
			const verbs = byRole.get(g.roleId) ?? new Set<string>();
			verbs.add(g.action ?? 'all');
			byRole.set(g.roleId, verbs);
		}
		return { leafId, byRole };
	});
	const impacted = impactsIn(request, 'permissions');
	if (field.path === '03-personas.roles') {
		const roleIds = [...new Set(perLeaf.flatMap((p) => [...p.byRole.keys()]))];
		return {
			key,
			fieldPath: field.path,
			leafId: null,
			// Answered once read: "nobody may use it yet" is an answer, and the
			// impact report saying what moves is another.
			filled: impactRan || roleIds.length > 0,
			summary:
				roleIds.length > 0
					? `${plural(roleIds.length, 'role')} may use what this change touches`
					: 'no role may use what this change touches yet',
			names: roleIds.map(roleName),
			moving: []
		};
	}
	const granted = perLeaf.every((p) => p.byRole.size > 0);
	const filled = impactRan || granted;
	const names = perLeaf.flatMap((p) =>
		[...p.byRole.entries()].map(
			([roleId, verbs]) =>
				`${roleName(roleId)}: ${[...verbs].join(', ')}${request.leafIds.length > 1 ? ` on ${p.leafId}` : ''}`
		)
	);
	return {
		key,
		fieldPath: field.path,
		leafId: null,
		filled,
		summary: granted
			? `${plural(names.length, 'grant')} on the touched ${plural(request.leafIds.length, 'feature')}${impacted.length > 0 ? `, ${plural(impacted.length, 'grant')} moving per the impact report` : impactRan ? ', nothing moves per the impact report' : ''}`
			: impactRan
				? `no grant on the touched ${plural(request.leafIds.length, 'feature')} today${impacted.length > 0 ? `; the impact report names ${plural(impacted.length, 'grant')} moving` : '; nothing moves per the impact report'}`
				: 'not read yet: run the impact report',
		names,
		moving: movingOf(impacted)
	};
}

function readEntities(
	field: BlockField,
	request: EvolutionRequest,
	inputs: ReadingInputs,
	impactRan: boolean
): CapabilityReading {
	const key = fieldKey(field.path);
	const declared = [
		...new Set(request.leafIds.flatMap((leafId) => inputs.behaviourByLeaf[leafId]?.entities ?? []))
	];
	const inModel = declared.filter((name) =>
		inputs.dataEntities.some((e) => e.trim().toLowerCase() === name.trim().toLowerCase())
	);
	const impacted = impactsIn(request, 'entities_and_fields');
	const filled = declared.length > 0 || impactRan;
	return {
		key,
		fieldPath: field.path,
		leafId: null,
		filled,
		summary: filled
			? `${plural(declared.length, 'entity', 'entities')} declared by the touched features, ${inModel.length} in the data model${impacted.length > 0 ? `; ${plural(impacted.length, 'node')} moving per the impact report` : ''}`
			: 'not read yet: run the impact report',
		names: declared,
		moving: movingOf(impacted)
	};
}

function readDependencies(
	field: BlockField,
	leafId: string,
	inputs: ReadingInputs,
	impactRan: boolean
): CapabilityReading {
	const key = fieldKey(field.path, leafId);
	const deps = inputs.dependsOnByLeaf[leafId] ?? [];
	const filled = deps.length > 0 || impactRan;
	return {
		key,
		fieldPath: field.path,
		leafId,
		filled,
		summary: filled
			? deps.length > 0
				? `depends on ${plural(deps.length, 'feature')}${impactRan ? '; neighbourhood read by the impact report' : ''}`
				: 'depends on nothing declared; neighbourhood read by the impact report'
			: 'not read yet: run the impact report',
		names: [...deps],
		moving: []
	};
}

function readSection(
	field: BlockField,
	request: EvolutionRequest,
	inputs: ReadingInputs,
	impactRan: boolean
): CapabilityReading {
	const key = fieldKey(field.path);
	const there = inputs.held[field.canonicalPath];
	const section =
		field.section === 'glossary'
			? 'glossary_terms'
			: field.section === 'experience'
				? 'screens_and_journeys'
				: field.section === 'rules'
					? 'rules_and_scenarios'
					: null;
	const impacted = section ? impactsIn(request, section) : [];
	// Product-wide sections: the reading is what they hold today and, when the
	// impact report covers them, what this change moves there.
	const filled = section ? impactRan : (there?.summary ?? '') !== '' && !/^0 /.test(there?.summary ?? '');
	const moving =
		impacted.length > 0
			? `${plural(impacted.length, 'node')} moving here per the impact report`
			: impactRan && section
				? 'nothing moves here per the impact report'
				: null;
	// The edge cases of the touched features, as sentences a person reads.
	const edges =
		field.path === '12-edge-cases.scenarios'
			? request.leafIds.flatMap((leafId) => inputs.edgeCasesByLeaf[leafId] ?? [])
			: [];
	return {
		key,
		fieldPath: field.path,
		leafId: null,
		filled: filled || edges.length > 0,
		summary:
			[
				edges.length > 0 ? `${plural(edges.length, 'edge case')} written for the touched features` : null,
				there ? `holds ${there.summary} today` : null,
				moving
			]
				.filter((s): s is string => s !== null)
				.join('; ') ||
			(section ? 'not read yet: run the impact report' : 'nothing written here yet'),
		names: edges.length > 0 ? edges.map(edgeCaseSentence) : (there?.names ?? []).slice(0, 8),
		moving: movingOf(impacted)
	};
}

/**
 * Every reading of a request, one per field home, for the blocks whose home
 * has an editor of its own. Inline prose fields are not here: they are read
 * back from the section that owns them.
 */
export function capabilityReadings(
	request: EvolutionRequest,
	inputs: ReadingInputs,
	blocks: readonly SpecBlock[] = SPEC_BLOCKS
): CapabilityReading[] {
	const impactRan = request.impactReport.status === 'ready';
	const out: CapabilityReading[] = [];
	for (const field of fieldsOf(blocks)) {
		if (field.editor !== 'capability') continue;
		if (field.path.startsWith('06-behavioural.')) {
			for (const leafId of request.leafIds)
				out.push(
					readBehaviour(field, leafId, inputs.behaviourByLeaf[leafId] ?? null, request.createdAt)
				);
			continue;
		}
		if (field.path === '08-graph.dependencies') {
			for (const leafId of request.leafIds)
				out.push(readDependencies(field, leafId, inputs, impactRan));
			continue;
		}
		if (field.path === '03-personas.roles' || field.path === '04-permissions.grants') {
			out.push(readGrants(field, request, inputs, impactRan));
			continue;
		}
		if (field.path === '07-data.entities') {
			out.push(readEntities(field, request, inputs, impactRan));
			continue;
		}
		if (isLeafScoped(field)) continue;
		out.push(readSection(field, request, inputs, impactRan));
	}
	return out;
}

/** The presence keys a request's readings answer, for the maturity. */
export function filledKeysOfReadings(readings: readonly CapabilityReading[]): string[] {
	return readings.filter((r) => r.filled).map((r) => r.key);
}
