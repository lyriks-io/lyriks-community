import { describe, it, expect } from 'vitest';
import { SaveRulesDraftUseCase } from './save-rules-draft';
import { createEmptyRulesDraft } from '$domain/rules';
import { createEmptyDefinitionDraft } from '$domain/foundation';
import type {
	ClockPort,
	ExperienceDraftRepositoryPort,
	FoundationDefinitionRepositoryPort,
	RulesDraftRepositoryPort,
	TelemetryPort,
	UsersDraftRepositoryPort
} from '../ports';

const clock: ClockPort = { nowIso: () => '2026-07-19T00:00:00.000Z' };
const telemetry = { emit: () => {} } as unknown as TelemetryPort;
const nullLoader = <T>() => ({ load: async (): Promise<T | null> => null });

/** Definition with one upstream declaration, so a real inventory can be consolidated. */
function definitionWithOneRule() {
	const f = createEmptyDefinitionDraft('p1');
	f.security.authentication = ['email_password'];
	return f;
}

describe('SaveRulesDraftUseCase — inventory is derived before scoring', () => {
	it('does not emit the empty-inventory penalty when the author leaves inventory [] but upstream steps declare rules', async () => {
		const rulesDrafts = { save: async () => {}, load: async () => null } as unknown as RulesDraftRepositoryPort;
		const definitionDrafts = { load: async () => definitionWithOneRule() } as unknown as FoundationDefinitionRepositoryPort;
		const usersDrafts = nullLoader() as unknown as UsersDraftRepositoryPort;
		const experienceDrafts = nullLoader() as unknown as ExperienceDraftRepositoryPort;

		const uc = new SaveRulesDraftUseCase(rulesDrafts, clock, telemetry, definitionDrafts, usersDrafts, experienceDrafts);
		const draft = { ...createEmptyRulesDraft('p1'), inventory: [] }; // exactly what the MCP guidance says to send
		const res = await uc.execute(draft);

		expect(res.coherenceIssues).not.toContain('Rule inventory is empty — refresh it from the earlier steps.');
	});

	it('still reports the empty-inventory issue when nothing upstream declares any rule', async () => {
		const rulesDrafts = { save: async () => {}, load: async () => null } as unknown as RulesDraftRepositoryPort;
		const definitionDrafts = nullLoader() as unknown as FoundationDefinitionRepositoryPort;
		const usersDrafts = nullLoader() as unknown as UsersDraftRepositoryPort;
		const experienceDrafts = nullLoader() as unknown as ExperienceDraftRepositoryPort;

		const uc = new SaveRulesDraftUseCase(rulesDrafts, clock, telemetry, definitionDrafts, usersDrafts, experienceDrafts);
		const res = await uc.execute({ ...createEmptyRulesDraft('p1'), inventory: [] });

		expect(res.coherenceIssues).toContain('Rule inventory is empty. Refresh it from the earlier steps.');
	});
});
