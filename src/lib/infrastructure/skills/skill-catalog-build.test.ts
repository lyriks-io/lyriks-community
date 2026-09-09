import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	PUBLISHED_SKILL_IDS,
	buildInstallTargets,
	buildSkillCatalog,
	diffSkillCatalog,
	fnv1aHash,
	injectContentHash,
	parseFrontmatter,
	pointerMarkers,
	portableInstallPath
} from './skill-catalog-build';

const skillFile = (name: string, description: string, body = '# Playbook\nDo the thing.') =>
	`---\nname: ${name}\ndescription: "${description}"\n---\n\n${body}\n`;

describe('parseFrontmatter', () => {
	it('reads key: value pairs from the fenced header', () => {
		const meta = parseFrontmatter(skillFile('lyriks-build', 'Build a project end-to-end.'));
		expect(meta.name).toBe('lyriks-build');
		expect(meta.description).toBe('Build a project end-to-end.');
	});

	it('unquotes double-quoted values (colons inside stay intact)', () => {
		const meta = parseFrontmatter('---\ndescription: "Trigger: use it, always."\n---\nbody');
		expect(meta.description).toBe('Trigger: use it, always.');
	});

	it('returns empty for a file without frontmatter', () => {
		expect(parseFrontmatter('# Just markdown\nno header')).toEqual({});
	});
});

describe('injectContentHash', () => {
	it('inserts the hash line before the closing fence, leaving the rest byte-identical', () => {
		const raw = skillFile('lyriks-build', 'End-to-end authoring.');
		const stamped = injectContentHash(raw, 'deadbeef');
		expect(stamped).toContain('\ncontentHash: deadbeef\n---');
		// Removing exactly the injected line restores the original bytes.
		expect(stamped.replace('contentHash: deadbeef\n', '')).toBe(raw);
	});

	it('produces frontmatter our own parser still reads (name + hash)', () => {
		const stamped = injectContentHash(skillFile('lyriks-design', 'Design discipline.'), '12ab34cd');
		const meta = parseFrontmatter(stamped);
		expect(meta.name).toBe('lyriks-design');
		expect(meta.description).toBe('Design discipline.');
		expect(meta.contentHash).toBe('12ab34cd');
	});

	it('prepends a minimal header when the file has no frontmatter', () => {
		const stamped = injectContentHash('# Bare markdown\n', 'cafe0000');
		expect(parseFrontmatter(stamped).contentHash).toBe('cafe0000');
		expect(stamped.endsWith('# Bare markdown\n')).toBe(true);
	});
});

describe('buildInstallTargets', () => {
	const targets = buildInstallTargets('lyriks-build', 'lyriks-build', 'End-to-end authoring.');
	const of = (client: string) => targets.find((t) => t.client === client)!;

	it('gives Claude its native layout and no pointer file to edit', () => {
		expect(of('claude').path).toBe('.claude/skills/lyriks-build/SKILL.md');
		expect(of('claude').pointerPath).toBeUndefined();
		expect(of('claude').pointerBlock).toBeUndefined();
	});

	it('sends every other runtime to the shared portable path', () => {
		for (const client of ['codex', 'gemini', 'copilot', 'generic']) {
			expect(of(client).path).toBe(portableInstallPath('lyriks-build'));
		}
	});

	it('points each runtime at the file it already reads', () => {
		expect(of('codex').pointerPath).toBe('AGENTS.md');
		expect(of('gemini').pointerPath).toBe('GEMINI.md');
		expect(of('copilot').pointerPath).toBe('.github/copilot-instructions.md');
		expect(of('generic').pointerPath).toBe('AGENTS.md');
	});

	it('fences the pointer block so a re-install replaces only its own region', () => {
		const { open, close } = pointerMarkers('lyriks-build');
		const block = of('codex').pointerBlock!;
		expect(block.startsWith(open)).toBe(true);
		expect(block.trimEnd().endsWith(close)).toBe(true);
		// The block must name the file the agent has to open, not merely mention the skill.
		expect(block).toContain(portableInstallPath('lyriks-build'));
	});

	it('gives every pointer runtime the same block (one body, many readers)', () => {
		expect(of('gemini').pointerBlock).toBe(of('codex').pointerBlock);
		expect(of('copilot').pointerBlock).toBe(of('codex').pointerBlock);
	});
});

describe('buildSkillCatalog', () => {
	const files = {
		'/.claude/skills/lyriks-build/SKILL.md': skillFile('lyriks-build', 'End-to-end authoring.'),
		'/.claude/skills/lyriks-design/SKILL.md': skillFile('lyriks-design', 'Design discipline.'),
		'/.claude/skills/lyriks-behavior/SKILL.md': skillFile('lyriks-behavior', 'Behavior depth.'),
		'/.claude/skills/lyriks-retrospec/SKILL.md': skillFile('lyriks-retrospec', 'Retro-spec law.'),
		'/.claude/skills/lyriks-delivery/SKILL.md': skillFile('lyriks-delivery', 'Spec to tickets.'),
		'/.claude/skills/graphify/SKILL.md': skillFile('graphify', 'Repo-internal, excluded.')
	};

	it('publishes only the lyriks-* allowlist, in allowlist order', () => {
		const catalog = buildSkillCatalog(files);
		expect(catalog.map((s) => s.id)).toEqual([
			'lyriks-build',
			'lyriks-design',
			'lyriks-behavior',
			'lyriks-retrospec',
			'lyriks-delivery'
		]);
	});

	it('carries the raw content verbatim plus size and a stable hash', () => {
		const [build] = buildSkillCatalog(files);
		expect(build.content).toBe(files['/.claude/skills/lyriks-build/SKILL.md']);
		expect(build.sizeBytes).toBe(new TextEncoder().encode(build.content).length);
		expect(build.contentHash).toBe(fnv1aHash(build.content));
		expect(build.contentHash).toMatch(/^[0-9a-f]{8}$/);
	});

	it('stamps installContent with the hash of the ORIGINAL content', () => {
		const [build] = buildSkillCatalog(files);
		expect(build.installContent).toBe(injectContentHash(build.content, build.contentHash));
		expect(parseFrontmatter(build.installContent).contentHash).toBe(build.contentHash);
	});

	it('attaches one install layout per supported runtime', () => {
		const [build] = buildSkillCatalog(files);
		expect(build.installTargets.map((t) => t.client)).toEqual([
			'claude',
			'codex',
			'gemini',
			'copilot',
			'generic'
		]);
	});

	it('tolerates a missing allowlisted file (catalog just omits it)', () => {
		const partial = buildSkillCatalog({
			'/.claude/skills/lyriks-design/SKILL.md': files['/.claude/skills/lyriks-design/SKILL.md']
		});
		expect(partial.map((s) => s.id)).toEqual(['lyriks-design']);
	});

	it('falls back to the folder id when frontmatter has no name', () => {
		const catalog = buildSkillCatalog({
			'/.claude/skills/lyriks-build/SKILL.md': '# No header\nbody only'
		});
		expect(catalog[0].name).toBe('lyriks-build');
		expect(catalog[0].description).toBe('');
	});
});

describe('diffSkillCatalog', () => {
	const files = {
		'/.claude/skills/lyriks-build/SKILL.md': skillFile('lyriks-build', 'End-to-end authoring.'),
		'/.claude/skills/lyriks-design/SKILL.md': skillFile('lyriks-design', 'Design discipline.'),
		'/.claude/skills/lyriks-behavior/SKILL.md': skillFile('lyriks-behavior', 'Behavior depth.')
	};
	const catalog = buildSkillCatalog(files);
	const hashOf = (id: string) => catalog.find((s) => s.id === id)!.contentHash;
	const entry = (result: ReturnType<typeof diffSkillCatalog>, id: string) =>
		result.skills.find((s) => s.id === id)!;

	it('reports a matching hash as up-to-date, with no installContent', () => {
		const result = diffSkillCatalog(catalog, [
			{ id: 'lyriks-build', contentHash: hashOf('lyriks-build') }
		]);
		const build = entry(result, 'lyriks-build');
		expect(build.status).toBe('up-to-date');
		expect(build.installContent).toBeUndefined();
	});

	it('reports a stale hash as update, install content attached', () => {
		const result = diffSkillCatalog(catalog, [{ id: 'lyriks-build', contentHash: 'ffffffff' }]);
		const build = entry(result, 'lyriks-build');
		expect(build.status).toBe('update');
		expect(build.installContent).toBe(catalog[0].installContent);
		expect(build.installPath).toBe('.claude/skills/lyriks-build/SKILL.md');
	});

	it('treats a report without a hash as update (client cannot prove freshness)', () => {
		const result = diffSkillCatalog(catalog, [{ id: 'lyriks-design' }]);
		expect(entry(result, 'lyriks-design').status).toBe('update');
		expect(entry(result, 'lyriks-design').installContent).toBeDefined();
	});

	it('reports a published skill missing from the client as new', () => {
		const result = diffSkillCatalog(catalog, [
			{ id: 'lyriks-build', contentHash: hashOf('lyriks-build') }
		]);
		expect(entry(result, 'lyriks-design').status).toBe('new');
		expect(entry(result, 'lyriks-behavior').status).toBe('new');
		expect(entry(result, 'lyriks-design').installContent).toBeDefined();
	});

	it('lists unpublished reported ids under unknown, untouched by the skills list', () => {
		const result = diffSkillCatalog(catalog, [
			{ id: 'my-private-skill', contentHash: 'abc' },
			{ id: 'graphify' }
		]);
		expect(result.unknown).toEqual(['my-private-skill', 'graphify']);
		expect(result.skills.map((s) => s.id)).toEqual([
			'lyriks-build',
			'lyriks-design',
			'lyriks-behavior'
		]);
	});

	it('an empty installed set marks everything new (fresh machine)', () => {
		const result = diffSkillCatalog(catalog, []);
		expect(result.skills.every((s) => s.status === 'new' && s.installContent)).toBe(true);
		expect(result.unknown).toEqual([]);
	});

	it('narrows the layouts to the calling runtime when it names itself', () => {
		const result = diffSkillCatalog(catalog, [], 'codex');
		const build = entry(result, 'lyriks-build');
		expect(build.installTargets).toHaveLength(1);
		expect(build.installTargets[0].client).toBe('codex');
		expect(build.installTargets[0].pointerPath).toBe('AGENTS.md');
	});

	it('returns every layout when the client stays anonymous', () => {
		const build = entry(diffSkillCatalog(catalog, []), 'lyriks-build');
		expect(build.installTargets).toHaveLength(5);
	});
});

describe('every published skill actually ships', () => {
	// The catalog is bundled at BUILD time from `.claude/skills/`, and that
	// directory is excluded twice: gitignored, AND excluded from the Docker
	// build context by `.dockerignore`, each with one exception line per
	// published skill. Add a skill to PUBLISHED_SKILL_IDS and forget either
	// exception, and the appliance ships without it while everyone believes it
	// shipped: the .gitignore miss keeps it on the author's machine alone
	// (the original lyriks-retrospec incident), the .dockerignore miss keeps a
	// git-tracked file out of the image (the recurrence, which lost
	// lyriks-retrospec and lyriks-delivery from the appliance catalog).
	//
	// Checking the file exists on disk would pass on the author's machine, which
	// is the machine where the bug is invisible. So the assertion is that git
	// TRACKS it.
	it.each(PUBLISHED_SKILL_IDS)('%s is tracked by git', (id) => {
		const path = `.claude/skills/${id}/SKILL.md`;
		const tracked = execFileSync('git', ['ls-files', '--', path], {
			encoding: 'utf8'
		}).trim();
		expect(
			tracked,
			`${path} is not tracked. Add an exception for it in .gitignore AND a \`!.claude/skills/${id}\` re-include in .dockerignore, or the appliance ships without it.`
		).toBe(path);
	});

	// git tracking is not enough: `.dockerignore` excludes `.claude` from the
	// Docker build context, so a tracked SKILL.md still misses the image unless
	// it has its own re-include line. This is the failure mode the git test
	// above cannot see.
	const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));
	const dockerignoreLines = readFileSync(join(repoRoot, '.dockerignore'), 'utf8')
		.split(/\r?\n/)
		.map((line) => line.trim());
	it.each(PUBLISHED_SKILL_IDS)('%s is re-included by .dockerignore', (id) => {
		expect(
			dockerignoreLines,
			`.dockerignore has no \`!.claude/skills/${id}\` line: the Docker build context drops the skill and the image ships without it.`
		).toContain(`!.claude/skills/${id}`);
	});
});

describe('scripts/check-skill-catalog.mjs (the Docker build gate)', () => {
	// The script runs in the Dockerfile between `COPY . .` and `pnpm build` and
	// must fail the IMAGE build when a published SKILL.md is absent from the
	// context; the server itself only logs (a runtime throw would crash-loop
	// customer appliances). Exercise both verdicts here so the gate cannot rot.
	const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));
	const script = join(repoRoot, 'scripts', 'check-skill-catalog.mjs');
	const run = (args: string[]) => {
		try {
			const stdout = execFileSync('node', [script, ...args], { encoding: 'utf8', cwd: repoRoot });
			return { status: 0, stdout, stderr: '' };
		} catch (error) {
			const failed = error as { status?: number | null; stdout?: string; stderr?: string };
			return { status: failed.status ?? 1, stdout: failed.stdout ?? '', stderr: failed.stderr ?? '' };
		}
	};

	it('passes on the real tree (every published SKILL.md present)', () => {
		const result = run([]);
		expect(result.status, result.stderr).toBe(0);
	});

	it('fails and names the missing ids when a published SKILL.md is absent', () => {
		const dir = mkdtempSync(join(tmpdir(), 'skill-catalog-check-'));
		try {
			// A fake skills root holding every published skill except the last one.
			const present = PUBLISHED_SKILL_IDS.slice(0, -1);
			const missing = PUBLISHED_SKILL_IDS[PUBLISHED_SKILL_IDS.length - 1];
			for (const id of present) {
				mkdirSync(join(dir, id), { recursive: true });
				writeFileSync(join(dir, id, 'SKILL.md'), `---\nname: ${id}\n---\nbody\n`);
			}
			const result = run(['--skills-root', dir]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain(missing);
			for (const id of present) {
				expect(result.stderr).not.toContain(`${id}/SKILL.md`);
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
