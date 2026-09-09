import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackLinkRepositoryPort, BackProjectLink, ProjectMirrorPort } from '../ports';
import { PushEnvelopeToBackUseCase } from './push-envelope-to-back';

function mutableRepository(value: Record<string, unknown>) {
	return {
		value,
		load: async () => value,
		save: async () => 1,
		currentRevision: async () => 1
	};
}

function linkFixture(overrides: Partial<BackProjectLink> = {}): BackProjectLink {
	return {
		localProjectId: 'project-1',
		backProjectId: 'back-1',
		backWorkspaceId: 'ws-1',
		status: 'linked',
		...overrides
	};
}

function backLinksStub(link: BackProjectLink | null = linkFixture()) {
	return {
		find: vi.fn(async () => link),
		save: vi.fn(async () => {}),
		markStatus: vi.fn(async () => {}),
		nextEnvelopeVersion: vi.fn(async () => 1)
	} satisfies BackLinkRepositoryPort;
}

function createUseCase(
	pushEnvelope: ProjectMirrorPort['pushEnvelope'],
	identity = mutableRepository({ productName: 'Project' }),
	backLinks: BackLinkRepositoryPort = backLinksStub(),
	kernel?: {
		behavior: { readProject: () => Promise<unknown>; readFeature: (p: string, f: string) => Promise<unknown> };
		signature: (projectId: string) => string;
		propagateFeature: (...a: unknown[]) => Promise<void>;
	}
) {
	const names = [
		'scope',
		'definition',
		'users',
		'features',
		'experience',
		'rules',
		'data',
		'architecture',
		'coherence',
		'operations',
		'glossary',
		'documents',
		'baselines',
		'approvals',
		'supervision',
		'finops'
	] as const;
	const repositories = names.map((name) => mutableRepository({ marker: name }));
	const client = {
		enabled: true,
		ensureProject: vi.fn(async () => 'back-1'),
		pushEnvelope,
		...(kernel ? { propagateFeature: kernel.propagateFeature } : {})
	} as unknown as ProjectMirrorPort;
	const args = [
		identity,
		...repositories,
		client,
		backLinks,
		...(kernel ? [kernel.behavior, kernel.signature] : [])
	] as unknown as ConstructorParameters<typeof PushEnvelopeToBackUseCase>;
	return { useCase: new PushEnvelopeToBackUseCase(...args), identity, client, backLinks };
}

describe('PushEnvelopeToBackUseCase', () => {
	it('closes the gap for a project that no longer exists locally instead of failing forever', async () => {
		const pushEnvelope = vi.fn(async () => 'synced' as const);
		const gone = { load: async () => null, save: async () => {} } as unknown as ReturnType<typeof mutableRepository>;
		const { useCase, client } = createUseCase(pushEnvelope, gone);
		await expect(useCase.execute('find-my-home')).resolves.toBe(true);
		expect(client.ensureProject).not.toHaveBeenCalled();
		expect(pushEnvelope).not.toHaveBeenCalled();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('mirrors every project-owned section in one envelope', async () => {
		const pushEnvelope = vi.fn<ProjectMirrorPort['pushEnvelope']>(async () => 'synced');
		const { useCase } = createUseCase(pushEnvelope);

		expect(await useCase.execute('project-1')).toBe(true);
		expect(pushEnvelope).toHaveBeenCalledOnce();
		const envelope = pushEnvelope.mock.calls[0][1];
		expect(Object.keys(envelope)).toEqual([
			'foundation',
			'scope',
			'users',
			'features',
			'experience',
			'rules',
			'data',
			'architecture',
			'coherence',
			'glossary',
			'documents',
			'baselines',
			'approvals',
			'supervision',
			'finops'
		]);
	});

	it('serializes concurrent pushes and sends the latest state last', async () => {
		let releaseFirst!: () => void;
		const firstPush = new Promise<void>((resolve) => (releaseFirst = resolve));
		const pushEnvelope = vi.fn<ProjectMirrorPort['pushEnvelope']>(async () => {
			if (pushEnvelope.mock.calls.length === 1) await firstPush;
			return 'synced';
		});
		const identity = mutableRepository({ productName: 'First' });
		const { useCase } = createUseCase(pushEnvelope, identity);

		const first = useCase.execute('project-1');
		await vi.waitFor(() => expect(pushEnvelope).toHaveBeenCalledTimes(1));
		identity.value.productName = 'Latest';
		const second = useCase.execute('project-1');
		releaseFirst();
		await Promise.all([first, second]);

		expect(pushEnvelope).toHaveBeenCalledTimes(2);
		expect(pushEnvelope.mock.calls[1][1].foundation).toMatchObject({
			identity: { productName: 'Latest' }
		});
	});

	it('records last_error on the back link and warns when the push fails', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { useCase, backLinks } = createUseCase(async () => 'failed');

		expect(await useCase.execute('project-1')).toBe(false);
		expect(backLinks.markStatus).toHaveBeenCalledWith(
			'project-1',
			'linked',
			expect.stringContaining('local save is newer than back')
		);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('envelope mirror failed [project-1]'),
			expect.any(String)
		);
	});

	it('restores healthy link state on the next successful push', async () => {
		const link = linkFixture({ lastError: 'envelope push to back failed' });
		const { useCase, backLinks } = createUseCase(async () => 'synced' as const, undefined, backLinksStub(link));

		expect(await useCase.execute('project-1')).toBe(true);
		expect(backLinks.markStatus).toHaveBeenCalledWith('project-1', 'linked');
	});

	it('leaves a healthy link untouched on success', async () => {
		const { useCase, backLinks } = createUseCase(async () => 'synced');

		expect(await useCase.execute('project-1')).toBe(true);
		expect(backLinks.markStatus).not.toHaveBeenCalled();
	});

	it('preserves a stale link error instead of overwriting it', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const stale = linkFixture({ status: 'stale', lastError: 'back project not found (404)' });
		const { useCase, backLinks } = createUseCase(async () => 'failed' as const, undefined, backLinksStub(stale));

		expect(await useCase.execute('project-1')).toBe(false);
		expect(backLinks.markStatus).not.toHaveBeenCalled();
	});

	it('never rejects: a draft load failure resolves false and is recorded', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const identity = {
			value: {},
			load: async () => {
				throw new Error('pg down');
			},
			save: async () => 1,
			currentRevision: async () => 1
		} as unknown as ReturnType<typeof mutableRepository>;
		const { useCase, backLinks } = createUseCase(async () => 'synced' as const, identity);

		await expect(useCase.execute('project-1')).resolves.toBe(false);
		expect(backLinks.markStatus).toHaveBeenCalledWith(
			'project-1',
			'linked',
			expect.stringContaining('pg down')
		);
		expect(warn).toHaveBeenCalled();
	});

	it('never rejects even when recording the failure itself fails', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const backLinks: BackLinkRepositoryPort = {
			find: vi.fn(async () => {
				throw new Error('pg down');
			}),
			save: vi.fn(async () => {}),
			markStatus: vi.fn(async () => {}),
			nextEnvelopeVersion: vi.fn(async () => 1)
		};
		const { useCase } = createUseCase(async () => 'failed' as const, undefined, backLinks);

		await expect(useCase.execute('project-1')).resolves.toBe(false);
	});

	it('sends the bumped envelope_version with the push', async () => {
		const pushEnvelope = vi.fn<ProjectMirrorPort['pushEnvelope']>(async () => 'synced');
		const { useCase, backLinks } = createUseCase(pushEnvelope);

		await useCase.execute('project-1');
		expect(backLinks.nextEnvelopeVersion).toHaveBeenCalledWith('project-1');
		expect(pushEnvelope.mock.calls[0][2]).toBe(1);
	});

	it('treats a stale (409) push as terminal success — the newer mirror owns the gap', async () => {
		const { useCase, backLinks } = createUseCase(async () => 'stale' as const);

		await expect(useCase.execute('project-1')).resolves.toBe(true);
		// Terminal success clears any recorded mirror error instead of recording one.
		expect(backLinks.find).toHaveBeenCalled();
	});

	it('pushes unversioned when no link row can be bumped (legacy last-write-wins)', async () => {
		const pushEnvelope = vi.fn<ProjectMirrorPort['pushEnvelope']>(async () => 'synced');
		const links = backLinksStub();
		(links.nextEnvelopeVersion as ReturnType<typeof vi.fn>).mockResolvedValue(null);
		const { useCase } = createUseCase(pushEnvelope, undefined, links);

		await expect(useCase.execute('project-1')).resolves.toBe(true);
		expect(pushEnvelope.mock.calls[0][2]).toBeUndefined();
	});
});

describe('feeding the formal graph', () => {
	const snapshot = (id: string) => ({ format: 'unspaghettit', version: 1, feature: { id } });
	function kernelStub(signature: string) {
		return {
			behavior: {
				readProject: vi.fn(async () => ({ project: { featureIds: ['feat-a', 'feat-b'] } })),
				readFeature: vi.fn(async (_p: string, f: string) => (f === 'feat-b' ? null : snapshot(f)))
			},
			signature: vi.fn(() => signature),
			propagateFeature: vi.fn(async () => {})
		};
	}

	it('pushes every feature snapshot after the envelope, once per kernel signature', async () => {
		const pushEnvelope = vi.fn<ProjectMirrorPort['pushEnvelope']>(async () => 'synced');
		const kernel = kernelStub('sig-1');
		const { useCase } = createUseCase(pushEnvelope, undefined, undefined, kernel);
		await useCase.execute('p1');
		expect(kernel.propagateFeature).toHaveBeenCalledTimes(1);
		expect(kernel.propagateFeature).toHaveBeenCalledWith('p1', 'feat-a', snapshot('feat-a'));
		// Same kernel: nothing to republish.
		await useCase.execute('p1');
		expect(kernel.propagateFeature).toHaveBeenCalledTimes(1);
		// Changed kernel: republished.
		kernel.signature.mockReturnValue('sig-2');
		await useCase.execute('p1');
		expect(kernel.propagateFeature).toHaveBeenCalledTimes(2);
	});

	it('never feeds the graph when the envelope itself did not land', async () => {
		const pushEnvelope = vi.fn<ProjectMirrorPort['pushEnvelope']>(async () => 'failed' as never);
		const kernel = kernelStub('sig-1');
		const { useCase } = createUseCase(pushEnvelope, undefined, undefined, kernel);
		await useCase.execute('p1');
		expect(kernel.propagateFeature).not.toHaveBeenCalled();
	});

	it('pushes the envelope alone when no kernel is wired', async () => {
		const pushEnvelope = vi.fn<ProjectMirrorPort['pushEnvelope']>(async () => 'synced');
		const { useCase } = createUseCase(pushEnvelope);
		await expect(useCase.execute('p1')).resolves.toBe(true);
	});
});
