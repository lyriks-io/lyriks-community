import { describe, expect, it } from 'vitest';
import type { OperatorProfileRepositoryPort, SessionPort, WorkspaceMemberNamePort } from '../ports';
import { ResolveActiveMemberNameUseCase } from './resolve-active-member-name';

const session = (email?: string): SessionPort => ({
	current: () => ({ isAuthenticated: true, email })
});
const memberName = (name: string | (() => Promise<string>)): WorkspaceMemberNamePort => ({
	nameOf: typeof name === 'string' ? async () => name : name
});
const operator = (displayName: string): OperatorProfileRepositoryPort =>
	({ load: async () => ({ displayName }) }) as unknown as OperatorProfileRepositoryPort;

describe('ResolveActiveMemberNameUseCase', () => {
	it('prefers the name the workspace knows the caller by', async () => {
		const useCase = new ResolveActiveMemberNameUseCase(
			session('ada@corp.io'),
			memberName('Ada Lovelace'),
			operator('Local Operator')
		);
		expect(await useCase.execute('ws-1')).toBe('Ada Lovelace');
	});

	it('falls back to the operator profile when the workspace has no name for the caller', async () => {
		const useCase = new ResolveActiveMemberNameUseCase(
			session('ada@corp.io'),
			memberName(''),
			operator('Local Operator')
		);
		expect(await useCase.execute('ws-1')).toBe('Local Operator');
	});

	it('never asks a workspace when there is none', async () => {
		let asked = false;
		const useCase = new ResolveActiveMemberNameUseCase(
			session('ada@corp.io'),
			memberName(async () => {
				asked = true;
				return 'Ada Lovelace';
			}),
			operator('')
		);
		expect(await useCase.execute(null)).toBe('Ada');
		expect(asked).toBe(false);
	});

	it('survives a membership IO failure', async () => {
		const useCase = new ResolveActiveMemberNameUseCase(
			session('ada@corp.io'),
			memberName(async () => {
				throw new Error('back down');
			}),
			operator('')
		);
		expect(await useCase.execute('ws-1')).toBe('Ada');
	});
});
