import { existsSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isHttpError } from '@sveltejs/kit';
import type { AccessDecision } from '$application/ports';
import type { StateDeletionCheckPort } from '$application/ports/state-deletion-check';
import { AuthorBehaviorUseCase } from '$application/specification/author-behavior';
import { DeleteBehaviorStateUseCase } from '$application/specification/delete-behavior-state';
import { SimulateBehaviorUseCase } from '$application/analysis/simulate-behavior';
import { createEmptyFeaturesDraft } from '$domain/features/draft';
import { McpUnspaghettitAdvisor } from '$infrastructure/unspaghettit/mcp-unspaghettit-advisor.server';
import { UnspaEngineClient } from '$infrastructure/unspaghettit/unspa-engine-client.server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';

/**
 * The write door of a feature's behaviour, run as a scenario sees it: the
 * platform's route, guards and use cases, and the behaviour engine this
 * platform installs, started as the subprocess production starts. Only what
 * lives outside the platform is played here: who the caller is to the project
 * (the access decision of the workspace), another project claiming the id, and
 * the verdict of the formal engine of an Enterprise installation.
 *
 * The engine runs behind a small launcher that can make it unreachable (an
 * engine out of reach) and move its clock forward (minutes passing), so the
 * scenarios about time and silence run the real code too.
 */

export const ENGINE = resolve('node_modules/unspaghettit');

export type Role = 'designer' | 'operator' | 'viewer' | 'none';

export interface Situation {
	/** installation.signInRequired */
	readonly signIn?: boolean;
	/** installation.edition */
	readonly edition?: 'enterprise' | 'community';
	/** session.workspaceRole */
	readonly role?: Role;
	/** feature.inProject */
	readonly inProject?: boolean;
	/** feature.idHeldElsewhere */
	readonly idHeldElsewhere?: boolean;
	/** engine.answering, as the write door reaches it */
	readonly engineAnswering?: boolean;
	/** formalEngine.answering */
	readonly formalAnswering?: boolean;
}

export const PROJECT = 'p-behaviour';

export class EngineRoute {
	readonly root: string;
	readonly engine: UnspaEngineClient;
	readonly advisor: McpUnspaghettitAdvisor;
	readonly #offset: string;
	readonly #downFlag: string;
	readonly #silent: McpUnspaghettitAdvisor;
	featureId = '';

	constructor(label: string) {
		this.root = mkdtempSync(join(tmpdir(), 'lyriks-route-'));
		this.#offset = join(this.root, 'clock-offset-ms');
		this.#downFlag = join(this.root, 'engine-down');
		writeFileSync(this.#offset, '0');
		const launcher = join(this.root, 'engine-launcher.cjs');
		writeFileSync(
			launcher,
			[
				"const fs = require('fs');",
				`if (fs.existsSync(${JSON.stringify(this.#downFlag)})) process.exit(1);`,
				'const realNow = Date.now;',
				`Date.now = () => realNow() + Number(fs.readFileSync(${JSON.stringify(this.#offset)}, 'utf8') || 0);`,
				`require(${JSON.stringify(join(ENGINE, 'mcp-server/bin.cjs'))});`
			].join('\n')
		);
		const cfg = { snapshotsRoot: this.root, mcpBinPath: launcher, proofs: false };
		this.engine = new UnspaEngineClient(cfg, label);
		this.advisor = new McpUnspaghettitAdvisor(cfg, this.engine);
		// A door whose engine never starts: what the platform holds while the engine is out of reach.
		this.#silent = new McpUnspaghettitAdvisor({ ...cfg, mcpBinPath: join(this.root, 'no-engine-here.cjs') }, new UnspaEngineClient({ ...cfg, mcpBinPath: join(this.root, 'no-engine-here.cjs') }, `${label}-silent`));
	}

	/** Moves the engine's clock forward, as minutes passing would. */
	advanceEngineClock(ms: number): void {
		writeFileSync(this.#offset, String(ms));
	}

	/** Makes the engine unreachable (true) or reachable again (false) for the next start. */
	engineOutOfReach(down: boolean): void {
		if (down) writeFileSync(this.#downFlag, '1');
		else if (existsSync(this.#downFlag)) unlinkSync(this.#downFlag);
	}

	async call<T = Record<string, unknown>>(tool: string, args: Record<string, unknown>): Promise<T> {
		const answer = await this.engine.callJsonOrError(tool, args);
		if (!answer?.ok) throw new Error(`The engine refused ${tool}: ${answer ? answer.error : 'no answer'}`);
		return answer.value as T;
	}

	/** A fresh feature built by these operations, whose id the door then serves. */
	async newFeature(name: string, operations: Record<string, unknown>[]): Promise<Record<string, string>> {
		const created = await this.call<{ id: string }>('create_feature', { name, description: `${name}, for a scenario.` });
		this.featureId = String(created.id);
		const built = await this.call<{ ok: boolean; refs: Record<string, string> }>('apply_batch', { featureId: this.featureId, operations });
		if (!built.ok) throw new Error(`The engine refused the fixture: ${JSON.stringify(built)}`);
		return built.refs;
	}

	/** The feature as the engine holds it now. */
	read(): Promise<Record<string, unknown>> {
		return this.call('get_feature', { featureId: this.featureId, verbose: true });
	}

	services(situation: Situation = {}, formal: StateDeletionCheckPort | null = null) {
		const role = situation.role ?? 'designer';
		const decide = (action: string): AccessDecision =>
			role === 'none' ? { ok: false, reason: 'not_found' } : role === 'viewer' && action !== 'read' ? { ok: false, reason: 'forbidden' } : { ok: true };
		const advisor = situation.engineAnswering === false ? this.#silent : this.advisor;
		const edition = situation.edition ?? 'enterprise';
		const formalPort: StateDeletionCheckPort | undefined =
			edition === 'community' ? undefined : situation.formalAnswering === false ? { checkStateDeletion: async () => null } : (formal ?? undefined);
		const reader = { readFeature: async () => ({ format: 'unspaghettit' as const, version: 1 as const, feature: await this.read() }) };
		const deleteBehaviorState = new DeleteBehaviorStateUseCase(reader as never, advisor, formalPort);
		const featureId = this.featureId;
		return servicesWith({
			installEdition: () => edition,
			resolveActiveProject: { execute: async () => null },
			projectAccess: { authorize: async (_p: string, _t: string | null, action: string) => decide(action) },
			enterpriseHooks: null,
			loadFeaturesDraft: {
				execute: async (projectId: string) => {
					const draft = createEmptyFeaturesDraft(projectId);
					if (situation.inProject !== false)
						draft.features = [{ id: featureId, name: 'Behaviour', coreId: 'c', parentFamilyId: null, description: '', unspaghettitFeatureId: featureId }];
					return draft;
				}
			},
			detectFeatureIdCollision: { execute: async () => (situation.idHeldElsewhere ? ['p-elsewhere'] : []) },
			authorBehavior: new AuthorBehaviorUseCase(advisor, deleteBehaviorState),
			deleteBehaviorState,
			simulateBehavior: new SimulateBehaviorUseCase(advisor),
			scheduleBackSync: async () => {},
			syncDataRules: { execute: async () => {} },
			proveFeatureRules: { warm: async () => {} },
			behaviorAdvisories: { touch: () => {} }
		} as never);
	}

	/** What a route answered: its JSON, or the HTTP refusal it threw. */
	async post(
		handler: (event: never) => Response | Promise<Response>,
		body: Record<string, unknown>,
		situation: Situation = {},
		formal: StateDeletionCheckPort | null = null
	): Promise<{ status: number; body: Record<string, unknown> | null; message?: string }> {
		const event = requestEvent({
			method: 'POST',
			authRequired: situation.signIn ?? true,
			cookies: { lyriks_session: 'jwt' },
			services: this.services(situation, formal),
			body: JSON.stringify({ projectId: PROJECT, featureId: this.featureId, ...body })
		});
		try {
			const response = await handler(event as never);
			return { status: response.status, body: (await response.json()) as Record<string, unknown> };
		} catch (failure) {
			if (isHttpError(failure)) return { status: failure.status, body: null, message: failure.body.message };
			throw failure;
		}
	}

	async close(): Promise<void> {
		await this.engine.connected?.close();
		rmSync(this.root, { recursive: true, force: true });
	}
}

/** The batch of a rejected or accepted write, as the apply route answers it. */
export const batchOf = (answer: { body: Record<string, unknown> | null }) =>
	(answer.body?.batch ?? null) as { ok: boolean; errors?: string[]; commitToken?: string | null; raw?: Record<string, unknown> } | null;
