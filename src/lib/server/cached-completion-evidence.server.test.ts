import { describe, expect, it, vi } from 'vitest';
import { createEmptyScopeDraft, type CompletionEvidence, type ProjectScopeDraft } from '$domain/scope';
import type { ProjectModelRevisionPort } from '$application/ports';
import { CachedCompletionEvidence } from './cached-completion-evidence.server';

const scope = (overrides: Partial<ProjectScopeDraft> = {}): ProjectScopeDraft => ({
	...createEmptyScopeDraft('project-1'),
	mode: 'full_product',
	...overrides
});

const evidence = (overrides: Partial<CompletionEvidence> = {}): CompletionEvidence => ({
	sourceIds: [],
	featureMaturity: {},
	behaviorEntities: [],
	dataEntityNames: [],
	settledApprovalIds: [],
	coherenceReady: true,
	coherenceDetail: '',
	experienceReady: true,
	experienceDetail: '',
	currentScopeFingerprint: 'scope-fp',
	currentModelFingerprint: 'model-fp',
	...overrides
});

/** A revision reader whose answer the test can move, like a real edit would. */
function revisions(initial = 'rev-1') {
	let value = initial;
	const port: ProjectModelRevisionPort = { fingerprint: async () => value };
	return { port, set: (next: string) => (value = next) };
}

function setup(
	build: (projectId: string, draft: ProjectScopeDraft) => Promise<CompletionEvidence>,
	opts: { kernel?: () => string; revision?: ReturnType<typeof revisions>; now?: () => number } = {}
) {
	const rev = opts.revision ?? revisions();
	let kernel = opts.kernel ?? (() => 'kernel-1');
	const spy = vi.fn(build);
	const cache = new CachedCompletionEvidence(
		{ execute: spy },
		rev.port,
		() => kernel(),
		opts.now ?? (() => 0)
	);
	return { cache, spy, rev, setKernel: (next: () => string) => (kernel = next) };
}

describe('CachedCompletionEvidence', () => {
	it('reads the evidence once while nothing about the project changed', async () => {
		const { cache, spy } = setup(async () => evidence());

		const first = await cache.execute('project-1', scope());
		const second = await cache.execute('project-1', scope());

		expect(spy).toHaveBeenCalledTimes(1);
		expect(second).toBe(first);
	});

	it('reads again once a section was saved', async () => {
		const rev = revisions();
		const { cache, spy } = setup(async () => evidence(), { revision: rev });

		await cache.execute('project-1', scope());
		rev.set('rev-2');
		await cache.execute('project-1', scope());

		expect(spy).toHaveBeenCalledTimes(2);
	});

	it('reads again once behavior was written straight into the kernel', async () => {
		let signature = 'kernel-1';
		const { cache, spy } = setup(async () => evidence(), { kernel: () => signature });

		await cache.execute('project-1', scope());
		signature = 'kernel-2';
		await cache.execute('project-1', scope());

		expect(spy).toHaveBeenCalledTimes(2);
	});

	it('reads again once the authored scope changed', async () => {
		const { cache, spy } = setup(async () => evidence());

		await cache.execute('project-1', scope());
		await cache.execute(
			'project-1',
			scope({
				capabilities: [
					{
						id: 'cap-1',
						name: 'Send a message',
						description: '',
						sourceIds: [],
						featureIds: [],
						disposition: 'included',
						rationale: '',
						approvalId: null
					}
				]
			})
		);

		expect(spy).toHaveBeenCalledTimes(2);
	});

	it('runs one computation for callers that arrive together', async () => {
		let release: (value: CompletionEvidence) => void = () => {};
		const pending = new Promise<CompletionEvidence>((resolve) => (release = resolve));
		const { cache, spy } = setup(() => pending);

		const both = Promise.all([
			cache.execute('project-1', scope()),
			cache.execute('project-1', scope())
		]);
		release(evidence());
		const [a, b] = await both;

		expect(spy).toHaveBeenCalledTimes(1);
		expect(a).toBe(b);
	});

	it('keeps a reading taken while the engine was over budget only briefly', async () => {
		let now = 0;
		const { cache, spy } = setup(async () => evidence({ provisional: true }), { now: () => now });

		await cache.execute('project-1', scope());
		now = 30_000;
		await cache.execute('project-1', scope());
		expect(spy).toHaveBeenCalledTimes(1); // still inside the provisional window

		now = 60_000;
		await cache.execute('project-1', scope());
		expect(spy).toHaveBeenCalledTimes(2); // and a retry gets a real attempt
	});

	it('keeps a complete reading past that window', async () => {
		let now = 0;
		const { cache, spy } = setup(async () => evidence(), { now: () => now });

		await cache.execute('project-1', scope());
		now = 60_000;
		await cache.execute('project-1', scope());

		expect(spy).toHaveBeenCalledTimes(1);
	});
});
