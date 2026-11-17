import type { EngineAnswer, UnspaghettitAdvisorPort } from '$application/ports';

export interface AuthorProjectBehaviorInput {
	readonly projectId: string;
	readonly operations: readonly Record<string, unknown>[];
	readonly dryRun: boolean;
}

export type AuthorProjectBehaviorResult =
	{ readonly kind: 'refused'; readonly errors: readonly string[] } | EngineAnswer;

/** The core registry is declared from the feature tree, never written here. */
const CORE_OPS = new Set(['declare_core_feature', 'update_core_feature', 'remove_core_feature']);
const PROMOTE = 'promote_to_project_library';
const DEFINITION_KINDS = new Set(['entity', 'resource', 'persona']);

/**
 * Author what holds across a project's features: cross-feature invariants and
 * canonical state variables in one atomic engine batch, or one promotion of a
 * feature's entity, resource or persona into the project library.
 *
 * Two refusals of its own, before the engine is asked: a core declared by hand
 * (the tree is the one source, a second would drift), and a promotion mixed
 * with other operations (it rewrites several features, so it cannot share the
 * batch's all-or-nothing save).
 */
export class AuthorProjectBehaviorUseCase {
	constructor(
		private readonly advisor: Pick<
			UnspaghettitAdvisorPort,
			'applyProjectBatch' | 'promoteToProjectLibrary'
		>
	) {}

	async execute(input: AuthorProjectBehaviorInput): Promise<AuthorProjectBehaviorResult | null> {
		const kinds = input.operations.map((op) => String(op.kind ?? op.op ?? ''));
		const cores = kinds
			.map((kind, i) => (CORE_OPS.has(kind) ? `op[${i}] (${kind})` : null))
			.filter((row): row is string => row !== null);
		if (cores.length > 0) {
			return {
				kind: 'refused',
				errors: cores.map(
					(row) =>
						`${row}: the cores are declared from the feature tree; add, rename or remove the core there (patch_section features) and the registry follows.`
				)
			};
		}
		if (kinds.includes(PROMOTE)) {
			if (input.operations.length !== 1) {
				return {
					kind: 'refused',
					errors: [
						`${PROMOTE} rewrites several features, so it runs alone: send it as the only operation.`
					]
				};
			}
			const op = input.operations[0];
			const definitionKind = String(op.definitionKind ?? '');
			if (
				typeof op.featureId !== 'string' ||
				typeof op.id !== 'string' ||
				!DEFINITION_KINDS.has(definitionKind)
			) {
				return {
					kind: 'refused',
					errors: [
						`${PROMOTE} takes { featureId, definitionKind: "entity" | "resource" | "persona", id, dedupe? }.`
					]
				};
			}
			if (input.dryRun) {
				return {
					kind: 'refused',
					errors: [`${PROMOTE} has no dry run: it moves the definition when sent.`]
				};
			}
			return this.advisor.promoteToProjectLibrary({
				expectedProjectId: input.projectId,
				featureId: op.featureId,
				definitionKind: definitionKind as 'entity' | 'resource' | 'persona',
				id: op.id,
				...(op.dedupe === false ? { dedupe: false } : {})
			});
		}
		return this.advisor.applyProjectBatch(
			input.projectId,
			input.operations.map((op) =>
				op.kind === undefined && op.op !== undefined ? { ...op, kind: op.op } : op
			),
			input.dryRun
		);
	}
}
