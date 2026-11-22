import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdoptionResult, BehaviorPort } from '$application/ports';
import { MoveIndexPositionsUseCase } from '$application/use-cases';
import { McpCodeAdoption } from './mcp-code-adoption.server';
import { UnspaEngineClient } from './unspa-engine-client.server';

/**
 * A move of located lines against the engine this platform installs, not a
 * stub (feat-100, criterion e9699cc6): the engine has no positions-only write,
 * so the platform lands each touched report again with what it located. Only
 * the real engine proves that what it stores afterwards is the same coverage,
 * with the moved places, and that the proof of the action (verifiedAt) stays.
 */
let root: string;
let engine: UnspaEngineClient;

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), 'lyriks-positions-'));
	engine = new UnspaEngineClient({ snapshotsRoot: root, mcpBinPath: resolve('node_modules/unspaghettit/mcp-server/bin.cjs'), proofs: false }, 'positions-contract-test');
});

afterAll(async () => {
	await engine.connected?.close();
	rmSync(root, { recursive: true, force: true });
});

type Row = Record<string, unknown>;

function valueOf(result: AdoptionResult | null): Readonly<Row> {
	if (!result?.ok) throw new Error(`The engine refused: ${result ? result.error : 'no answer'}`);
	return result.value;
}

async function call(name: string, args: Row): Promise<Row> {
	const answer = await engine.callJsonOrError(name, args);
	if (!answer?.ok) throw new Error(`${name} refused: ${answer ? answer.error : 'no answer'}`);
	return answer.value as Row;
}

/** Where each entity of the action report now stands, and its proof. */
function actionReport(status: Readonly<Row>, actionId: string) {
	const report = (status.actions as Row[]).find((a) => a.actionId === actionId)!;
	const found = Object.fromEntries(
		(report.foundEntities as Row[]).map((f) => {
			const [location] = f.locations as Row[];
			return [`${f.entityType}:${f.entityId}`, { line: location.line, snippet: location.snippet }];
		})
	);
	return { found, missing: (report.missingEntities as Row[]).map((m) => `${m.entityType}:${m.entityId}`), verifiedAt: (report.auditMeta as Row | undefined)?.verifiedAt };
}

describe('MoveIndexPositionsUseCase against the installed engine', () => {
	it('moves the place of a located rule, keeps the coverage and the proof, and lists a rule never located [criterion:e9699cc6]', async () => {
		const project = await call('create_project', { name: 'Shop', description: 'A shop.', features: [{ name: 'Cart', description: 'Pay for a cart.' }] });
		const projectId = String(project.id);
		const featureId = String((project.features as Row[])[0].id);
		const batch = await call('apply_batch', {
			featureId,
			operations: [
				{ kind: 'add_surface', ref: 's', name: 'Cart', type: 'screen', description: 'The cart.' },
				{ kind: 'add_state_definition', surfaceRef: 's', path: 'cart.total', type: 'number', defaultValue: 0, description: 'What the cart costs.' },
				{ kind: 'add_action', ref: 'a', surfaceRef: 's', name: 'Pay', intent: 'Pay the cart.' },
				{ kind: 'add_action_rule', surfaceRef: 's', actionRef: 'a', ref: 'r1', rule: { category: 'validation', condition: { left: 'cart.total', operator: 'equals', right: 0 }, effect: { type: 'block_action', reason: 'Empty cart' }, description: 'Nothing to pay.' } },
				{ kind: 'add_action_rule', surfaceRef: 's', actionRef: 'a', ref: 'r2', rule: { category: 'validation', condition: { left: 'cart.total', operator: 'greater_than', right: 1000 }, effect: { type: 'block_action', reason: 'Too much' }, description: 'A ceiling.' } }
			]
		});
		const refs = ((batch.batch as Row | undefined)?.refs ?? batch.refs) as Record<string, string>;
		const [surfaceId, actionId, ruleOne, ruleTwo] = [refs.s, refs.a, refs.r1, refs.r2];
		const feature = (await call('get_feature', { featureId, verbose: true })) as Row;

		const adoption = new McpCodeAdoption(engine);
		const at = (line: number, signature: string) => ({ status: 'implemented', file: 'src/pay.ts', line, signature });
		valueOf(
			await adoption.syncImplementationIndex(projectId, {
				[`surface:${surfaceId}`]: at(1, 'export const cart = {'),
				'state:cart.total': at(2, 'total: 0,'),
				[`action:${actionId}`]: { ...at(10, 'export function pay(cart) {'), verifiedAt: '2026-11-20T00:00:00.000Z' },
				[`rule:${ruleOne}`]: at(11, 'if (cart.total === 0) throw new Error("Empty cart");')
			})
		);
		const before = actionReport(valueOf(await adoption.getImplementationStatus(featureId)), actionId);
		expect(before.missing).toEqual([`rule:${ruleTwo}`]);

		const behavior = {
			readProject: async () => ({ project: { featureIds: [featureId] } }),
			readFeature: async () => ({ feature: (feature.feature ?? feature) as Row })
		} as unknown as BehaviorPort;
		const outcome = await new MoveIndexPositionsUseCase(behavior, adoption).execute(projectId, {
			[`rule:${ruleOne}`]: at(15, 'if (cart.total === 0) throw new Error("Empty cart");'),
			[`rule:${ruleTwo}`]: at(16, 'if (cart.total > 1000) throw new Error("Too much");')
		});
		expect(outcome).toMatchObject({ ok: true, failures: [] });
		if (!outcome?.ok) throw new Error('the move did not land');
		expect(outcome.plan).toMatchObject({ moved: [`rule:${ruleOne}`], notLocated: [`rule:${ruleTwo}`], units: [`action:${actionId}`] });

		const after = actionReport(valueOf(await adoption.getImplementationStatus(featureId)), actionId);
		// Same coverage, the proof kept, only the moved place changed.
		expect(after.missing).toEqual(before.missing);
		expect(Object.keys(after.found).sort()).toEqual(Object.keys(before.found).sort());
		expect(after.verifiedAt).toBe('2026-11-20T00:00:00.000Z');
		expect(after.found[`rule:${ruleOne}`]).toEqual({ line: 15, snippet: 'if (cart.total === 0) throw new Error("Empty cart");' });
		expect(after.found[`action:${actionId}`]).toEqual(before.found[`action:${actionId}`]);
	}, 60_000);
});
