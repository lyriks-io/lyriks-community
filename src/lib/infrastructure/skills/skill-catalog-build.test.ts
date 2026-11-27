import { describe, expect, it } from 'vitest';
import type { SkillClientId } from '$application/ports';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	GUIDE_MAX_SERIALIZED_CHARS,
	PLAYBOOK_MAX_CHARS,
	PUBLISHED_SKILL_IDS,
	buildInstallTargets,
	buildSkillCatalog,
	diffSkillCatalog,
	fnv1aHash,
	injectContentHash,
	parseFrontmatter,
	pointerMarkers,
	portableInstallPath,
	BINDING_HOOK_PATH,
	BINDING_STOP_HOOK_PATH,
	BINDING_TOOLS_HOOK_PATH,
	BINDING_MARKERS,
	BINDING_TOOLS,
	BINDING_TOOLS_DIR,
	buildBinding,
	buildBindingBlock,
	buildBindingTools,
	injectScriptHash
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
		'/.claude/skills/lyriks-evolution/SKILL.md': skillFile('lyriks-evolution', 'Change requests.'),
		'/.claude/skills/graphify/SKILL.md': skillFile('graphify', 'Repo-internal, excluded.')
	};

	it('publishes only the lyriks-* allowlist, in allowlist order', () => {
		const catalog = buildSkillCatalog(files);
		expect(catalog.map((s) => s.id)).toEqual([
			'lyriks-build',
			'lyriks-design',
			'lyriks-behavior',
			'lyriks-retrospec',
			'lyriks-delivery',
			'lyriks-evolution'
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

	it('selects only requested guides without marking omitted published skills unknown', () => {
		const result = diffSkillCatalog(catalog, [{ id: 'lyriks-design' }], 'codex', { skillIds: ['lyriks-behavior', 'unknown-guide'] });
		expect(result.skills.map(s => s.id)).toEqual(['lyriks-behavior']);
		expect(result.skills[0].installContent).toBe(catalog.find(s => s.id === 'lyriks-behavior')!.installContent);
		expect(result.unknown).toEqual(['unknown-guide']);
	});

	it('supports metadata-only reconciliation without implying that missing content was installed', () => {
		const result = diffSkillCatalog(catalog, [], 'codex', { includeContent: false });
		expect(result.skills).toHaveLength(3);
		for (const skill of result.skills) {
			expect(skill.status).toBe('new');
			expect(skill.contentDeferred).toBe(true);
			expect(skill.installContent).toBeUndefined();
		}
		expect(diffSkillCatalog(catalog, [], 'codex', { skillIds: [] }).skills).toEqual([]);
	});
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

	it('answers a guide the client holds with its id, status and hash alone [criterion:526377e2]', () => {
		// Every session starts with this check: the description and the layouts of a
		// guide already installed only made it heavier (18,000 characters for nothing).
		const result = diffSkillCatalog(catalog, [{ id: 'lyriks-build', contentHash: hashOf('lyriks-build') }], 'claude');
		expect(entry(result, 'lyriks-build')).toEqual({ id: 'lyriks-build', name: catalog[0].name, contentHash: hashOf('lyriks-build'), status: 'up-to-date' });
		// What the client still has to write keeps everything it needs.
		expect(entry(result, 'lyriks-design')).toMatchObject({ status: 'new', installPath: '.claude/skills/lyriks-design/SKILL.md' });
		expect(entry(result, 'lyriks-design').installTargets).toHaveLength(1);
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
		expect(build.installTargets![0].client).toBe('codex');
		expect(build.installTargets![0].pointerPath).toBe('AGENTS.md');
	});

	it('returns every layout when the client stays anonymous', () => {
		const build = entry(diffSkillCatalog(catalog, []), 'lyriks-build');
		expect(build.installTargets).toHaveLength(5);
	});
});

describe('every published guide travels alone in one client answer [criterion:526377e2]', () => {
	const root = fileURLToPath(new URL('../../../..', import.meta.url));
	it.each(PUBLISHED_SKILL_IDS)('%s stays under the serialized size one answer carries', (id) => {
		const raw = readFileSync(join(root, `.claude/skills/${id}/SKILL.md`), 'utf8');
		const [skill] = buildSkillCatalog({ [`/.claude/skills/${id}/SKILL.md`]: raw });
		const size = JSON.stringify(skill.installContent).length;
		expect(
			size,
			`${id} weighs ${size} characters serialized, past ${GUIDE_MAX_SERIALIZED_CHARS}: split it into two guides, or clients refuse the answer that carries it.`
		).toBeLessThanOrEqual(GUIDE_MAX_SERIALIZED_CHARS);
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

describe('buildBinding (the repository stays bound to its Lyriks project)', () => {
	const script = '// the hook';
	const targetsOf = (client?: SkillClientId) => buildBinding(script, client).targets;
	const of = (client: SkillClientId) => targetsOf().find((target) => target.client === client)!;

	it('fences the block with the binding markers and names the project when told', () => {
		const block = buildBindingBlock('vector-rally');
		expect(block.startsWith(BINDING_MARKERS.open)).toBe(true);
		expect(block.endsWith(BINDING_MARKERS.close)).toBe(true);
		expect(block).toContain('the Lyriks project `vector-rally`');
		expect(block).toContain('SPEC CHANGE first');
		expect(block).toContain('spec READ first');
		expect(buildBindingBlock()).toContain('its Lyriks project');
		expect(buildBindingBlock()).not.toContain('vector-rally');
	});

	it('asks the AI to name what it talks about by its name, never by an id alone [criterion:94d58173]', () => {
		// "feature 100" tells the person nothing: they know the product by its names.
		const line = buildBindingBlock('vector-rally').split('\n').find((l) => l.includes('by its name'));
		expect(line).toBeDefined();
		expect(line).toContain('as the spec writes it');
		expect(line).toContain('never stand alone');
	});

	it('makes a change spec first, and leaves Evolution to the person who asks for it', () => {
		// The MCP server instructions, this block and the per-prompt hook are loaded
		// together by one client: they must state ONE rule, or the agent picks
		// whichever text it read last.
		const block = buildBindingBlock();
		const change = block.split('\n').find((line) => line.includes('SPEC CHANGE first'))!;
		for (const cue of ['apply_behavior_batch', 'patch_section', 'sync_implementation_index']) {
			expect(change).toContain(cue);
		}
		// Evolution is a tool the person reaches for, not a toll on every change.
		const optional = block.split('\n').find((line) => line.includes('Evolution is OPTIONAL'))!;
		expect(optional).toContain('only when the person asks for one');
		expect(optional).toContain('QUALIFIED');
		expect(optional).toContain('Never open a dossier on your own');
		for (const gone of ['NO threshold', 'EVOLUTION REQUEST first', 'The door binds'])
			expect(block).not.toContain(gone);
	});

	it('says what Lyriks answers and what the code tools answer [criterion:4cfd9e34]', () => {
		// Same division as the MCP server instructions (SPEC_AND_CODE_TOOLS) and the per-prompt hook.
		const block = buildBindingBlock();
		const line = block.split('\n').find((l) => l.includes('your own code tools'))!;
		for (const cue of [
			'Lyriks answers what the product must do, why, and where the code implements it',
			'answer how the code is written',
			'`code` on a `get_behavior_feature` read',
			'tell the person instead of resolving it either way',
			'A question about the code alone',
			'without a Lyriks call'
		])
			expect(line, cue).toContain(cue);
		// The spec read stays first for a question about the product.
		expect(block).toContain('Never answer it from the code alone or from memory.');
	});

	it('sends every runtime to the instruction file it always loads, with one shared block', () => {
		expect(of('claude').pointerPath).toBe('CLAUDE.md');
		expect(of('codex').pointerPath).toBe('AGENTS.md');
		expect(of('gemini').pointerPath).toBe('GEMINI.md');
		expect(of('copilot').pointerPath).toBe('.github/copilot-instructions.md');
		expect(of('generic').pointerPath).toBe('AGENTS.md');
		expect(new Set(targetsOf().map((target) => target.pointerBlock)).size).toBe(1);
	});

	it('gives Claude Code, and only it, the per-prompt hook wired in the project settings', () => {
		const hook = of('claude').hook!;
		expect(hook.path).toBe(BINDING_HOOK_PATH);
		expect(hook.content).toBe(injectScriptHash(script, fnv1aHash(script)));
		expect(hook.unchanged).toBeUndefined();
		expect(hook.settingsPath).toBe('.claude/settings.json');
		expect(hook.settingsEvent).toBe('UserPromptSubmit');
		expect(hook.settingsEntry.command).toContain(BINDING_HOOK_PATH);
		const settings = JSON.parse(hook.settingsContent);
		expect(settings.hooks.UserPromptSubmit[0].hooks[0]).toEqual(hook.settingsEntry);
		for (const client of ['codex', 'gemini', 'copilot', 'generic'] as const) {
			expect(of(client).hook).toBeUndefined();
		}
	});

	it('gives Claude Code, and only it, the hook that allows the Lyriks tools, wired for every MCP tool [criterion:ac-leaf-ac-mcp-binding-allows-tools]', () => {
		const tools = '#!/usr/bin/env node\n// the tools hook\n';
		const target = (client: SkillClientId) => buildBinding(script, undefined, null, {}, [], tools).targets.find((t) => t.client === client)!;
		const hook = target('claude').toolsHook!;
		expect(hook.path).toBe(BINDING_TOOLS_HOOK_PATH);
		expect(hook.content).toBe(injectScriptHash(tools, fnv1aHash(tools)));
		expect(hook.settingsPath).toBe('.claude/settings.json');
		expect(hook.settingsEvent).toBe('PreToolUse');
		expect(hook.settingsMatcher).toBe('^mcp__.*');
		expect(hook.settingsEntry.command).toContain(BINDING_TOOLS_HOOK_PATH);
		const settings = JSON.parse(hook.settingsContent);
		expect(settings.hooks.PreToolUse[0]).toEqual({ matcher: '^mcp__.*', hooks: [hook.settingsEntry] });
		for (const client of ['codex', 'gemini', 'copilot', 'generic'] as const) expect(target(client).toolsHook).toBeUndefined();
		// A client that holds this version gets nothing to write.
		const held = buildBinding(script, 'claude', null, {}, [{ path: BINDING_TOOLS_HOOK_PATH, contentHash: fnv1aHash(tools) }], tools);
		expect(held.targets[0].toolsHook).toMatchObject({ unchanged: true });
		expect(held.targets[0].toolsHook!.content).toBeUndefined();
	});

	it('gives Claude Code, and only it, the end-of-turn hook, wired on Stop [criterion:7b37377d]', () => {
		const stop = '#!/usr/bin/env node\n// the end-of-turn hook\n';
		const target = (client: SkillClientId) => buildBinding(script, undefined, null, {}, [], undefined, stop).targets.find((t) => t.client === client)!;
		const hook = target('claude').stopHook!;
		expect(hook.path).toBe(BINDING_STOP_HOOK_PATH);
		expect(hook.content).toBe(injectScriptHash(stop, fnv1aHash(stop)));
		expect(hook.settingsPath).toBe('.claude/settings.json');
		expect(hook.settingsEvent).toBe('Stop');
		expect(hook.settingsEntry.command).toBe(`node ${BINDING_STOP_HOOK_PATH}`);
		expect(JSON.parse(hook.settingsContent).hooks.Stop[0]).toEqual({ hooks: [hook.settingsEntry] });
		for (const client of ['codex', 'gemini', 'copilot', 'generic'] as const) expect(target(client).stopHook).toBeUndefined();
		const held = buildBinding(script, 'claude', null, {}, [{ path: BINDING_STOP_HOOK_PATH, contentHash: fnv1aHash(stop) }], undefined, stop);
		expect(held.targets[0].stopHook).toMatchObject({ unchanged: true });
	});

	it('tells every runtime to say on the person\'s pages why it stops [criterion:7b37377d]', () => {
		const block = buildBindingBlock('kutt-c76982');
		expect(block).toContain('before ending a turn on a question, or stopping for any other reason');
		expect(block).toContain('`update_evolution_session` (`ask` for the one question you wait on, `stopped` for why you stop)');
		expect(block).toContain('`start_evolution_session` given the project alone');
	});

	it('narrows to the calling runtime, and falls back to every target for an unknown one', () => {
		expect(targetsOf('codex').map((target) => target.client)).toEqual(['codex']);
		expect(targetsOf('martian' as SkillClientId)).toHaveLength(5);
		expect(buildBinding(script, undefined, ' vector-rally ').projectId).toBe('vector-rally');
		expect(buildBinding(script).projectId).toBeNull();
	});
});

describe('the helper scripts ship with the binding, for every runtime', () => {
	const toolsDir = fileURLToPath(new URL('./tools/', import.meta.url));
	// What the adapter's glob hands over: `./tools/<file>` to the raw script.
	const bundled = Object.fromEntries(
		readdirSync(toolsDir)
			.filter((file) => file.endsWith('.mjs'))
			.map((file) => [`./tools/${file}`, readFileSync(join(toolsDir, file), 'utf8')])
	);

	it('installs each script verbatim under .lyriks/tools/, with its hash and what it is for', () => {
		const tools = buildBindingTools(bundled);
		expect(tools.map((tool) => tool.path)).toEqual(BINDING_TOOLS.map(({ file }) => `${BINDING_TOOLS_DIR}/${file}`));
		expect(BINDING_TOOLS_DIR).toBe('.lyriks/tools');
		for (const tool of tools) {
			const file = tool.path.slice(BINDING_TOOLS_DIR.length + 1);
			expect(tool.contentHash).toBe(fnv1aHash(bundled[`./tools/${file}`]));
			expect(tool.content).toBe(injectScriptHash(bundled[`./tools/${file}`], tool.contentHash));
			expect(tool.purpose!.length).toBeGreaterThan(20);
		}
	});

	it('lists every script of the folder, since they import each other side by side', () => {
		// A script added to the folder and not to BINDING_TOOLS would never reach a
		// customer; one imported by another and not listed would break it there.
		expect(Object.keys(bundled).map((path) => path.slice('./tools/'.length)).sort()).toEqual(
			BINDING_TOOLS.map(({ file }) => file).sort()
		);
		for (const [path, content] of Object.entries(bundled)) {
			for (const imported of content.matchAll(/(?:from |import\()'\.\/([^']+)'/g)) {
				expect(Object.keys(bundled), `${path} imports ${imported[1]}`).toContain(`./tools/${imported[1]}`);
			}
			// Dependency free: only Node built-ins and the sibling scripts.
			for (const imported of content.matchAll(/from '([^'.][^']*)'/g)) {
				expect(imported[1], `${path} imports ${imported[1]}`).toMatch(/^node:/);
			}
			expect(content.split('\n').length, `${path} stays a small script`).toBeLessThanOrEqual(200);
		}
	});

	it('ships the script that brings test results back into the index, right after the checker', () => {
		const tools = buildBindingTools(bundled);
		const ingest = tools.find((tool) => tool.path === `${BINDING_TOOLS_DIR}/ingest-results.mjs`);
		expect(ingest, 'ingest-results.mjs is installed').toBeDefined();
		// An agent picks a script from its purpose alone: the command line, the token
		// it looks for, and that a located entry is not a proven one.
		expect(ingest!.purpose).toContain(
			'node .lyriks/tools/ingest-results.mjs <report.json> [--criteria <map.json>] [--kind <kind>] [--revision <sha>] [--dry-run] [--json]'
		);
		// The Verify step: this is how an acceptance criterion becomes verified.
		expect(ingest!.purpose).toContain('how an acceptance criterion becomes verified');
		expect(ingest!.purpose).toContain('[criterion:<id>]');
		expect(ingest!.purpose).toContain('verification.lastResult { passed, at, summary, revision }');
		expect(ingest!.purpose).toContain('[unspa:<surfaceId>:<actionId>:<scenarioId>]');
		expect(ingest!.purpose).toContain('verifiedAt');
		expect(ingest!.purpose).toContain('Located and proven are two claims');
		// Check, prove, then send: the proof must be in the file before sync-index carries it.
		const order = tools.map((tool) => tool.path.slice(BINDING_TOOLS_DIR.length + 1));
		expect(order.indexOf('check-index.mjs')).toBeLessThan(order.indexOf('ingest-results.mjs'));
		expect(order.indexOf('ingest-results.mjs')).toBeLessThan(order.indexOf('sync-index.mjs'));
		// It writes the index, so it must be the offline kind: no MCP client import.
		expect(ingest!.content).not.toContain('mcp-client.mjs');
		expect(ingest!.content).toContain("from './index-file.mjs'");
	});

	it('hands the same scripts to every runtime, narrowed or not, and none when the bundle has none', () => {
		const all = buildBinding('// the hook', undefined, null, bundled);
		expect(all.tools).toHaveLength(BINDING_TOOLS.length);
		for (const client of ['claude', 'codex', 'gemini', 'copilot', 'generic'] as const) {
			expect(buildBinding('// the hook', client, null, bundled).tools).toEqual(all.tools);
		}
		expect(buildBinding('// the hook').tools).toEqual([]);
	});

	it('leaves out a script missing from the bundle instead of throwing inside an appliance', () => {
		const { './tools/apply-batch.mjs': _dropped, ...partial } = bundled;
		const tools = buildBindingTools(partial);
		expect(tools.map((tool) => tool.path)).not.toContain(`${BINDING_TOOLS_DIR}/apply-batch.mjs`);
		expect(tools).toHaveLength(BINDING_TOOLS.length - 1);
	});

	it('is named by the binding block in one sentence', () => {
		const line = buildBindingBlock().split('\n').find((candidate) => candidate.includes(BINDING_TOOLS_DIR))!;
		expect(line).toContain('`check-index.mjs --fix`');
		expect(line).toContain('`sync-index.mjs`');
		expect(line).toContain('`apply-batch.mjs`');
		expect(line).toContain('`index-file.mjs upsert`');
		expect(line).toContain('`// contentHash:` line');
		expect(line).toContain('`installed_tools`');
		expect(line.match(/\. /g) ?? []).toHaveLength(0);
	});

	it('names index-file.mjs as the command that edits the index, with its whole syntax', () => {
		const { purpose } = BINDING_TOOLS.find(({ file }) => file === 'index-file.mjs')!;
		expect(purpose).toContain(
			'`node .lyriks/tools/index-file.mjs upsert <entries.json | -> [--sync [--feature <featureId>]] [--project <id>] [--dry-run] [--json]`'
		);
		expect(purpose).toContain('`... remove <key...>`');
		expect(purpose).toContain('`... set-project <id>`');
		expect(purpose).toContain('never rewrite the index with another tool');
		expect(purpose).not.toMatch(/^Not run directly/);
	});
});

describe('installed tools: a sync sends only the scripts the client lacks', () => {
	const toolsDir = fileURLToPath(new URL('./tools/', import.meta.url));
	const bundled = Object.fromEntries(
		readdirSync(toolsDir)
			.filter((file) => file.endsWith('.mjs'))
			.map((file) => [`./tools/${file}`, readFileSync(join(toolsDir, file), 'utf8')])
	);
	const hookScript = '#!/usr/bin/env node\n// the hook\n';
	/** What a client reads back from its installed copy: the `// contentHash:` line, as the binding text says. */
	const reportedHash = (content: string) => /^\/\/ contentHash: (\S+)$/m.exec(content.split('\n').slice(0, 2).join('\n'))?.[1];

	it('puts the hash line first, or second after a shebang, and changes nothing else', () => {
		expect(injectScriptHash('#!/usr/bin/env node\nrun();\n', 'abc')).toBe('#!/usr/bin/env node\n// contentHash: abc\nrun();\n');
		expect(injectScriptHash('// a library\n', 'abc')).toBe('// contentHash: abc\n// a library\n');
		expect(injectScriptHash('#!/usr/bin/env node', 'abc')).toBe('#!/usr/bin/env node\n// contentHash: abc\n');
	});

	it('sends every file whole when the client reports nothing (the original contract)', () => {
		const binding = buildBinding(hookScript, 'claude', null, bundled);
		expect(binding.tools.every((tool) => typeof tool.content === 'string' && tool.unchanged === undefined)).toBe(true);
		expect(binding.targets[0].hook!.content).toBeDefined();
	});

	it('leaves out the content of every file reported with its published hash, read from the installed copy', () => {
		const first = buildBinding(hookScript, 'claude', null, bundled);
		const held = [...first.tools, first.targets[0].hook!].map((file) => ({ path: file.path, contentHash: reportedHash(file.content!) }));
		expect(held.every((ref) => typeof ref.contentHash === 'string')).toBe(true);
		const second = buildBinding(hookScript, 'claude', null, bundled, held);
		for (const tool of second.tools) {
			// Neither its content nor its purpose: the installed file's header says both.
			expect(tool).toEqual({ path: tool.path, contentHash: tool.contentHash, unchanged: true });
		}
		const hook = second.targets[0].hook!;
		expect(hook.content).toBeUndefined();
		expect(hook.unchanged).toBe(true);
		// Still wired: the settings entry comes back whatever the content does.
		expect(hook.settingsEntry.command).toContain(BINDING_HOOK_PATH);
		// The point of it all: a routine sync weighs a fraction of a first one.
		expect(JSON.stringify(second).length).toBeLessThan(JSON.stringify(first).length / 5);
		expect(JSON.stringify(second.tools).length).toBeLessThan(100 * second.tools.length);
	});

	it('sends a file again when its hash differs, is missing, or was never reported', () => {
		const first = buildBinding(hookScript, 'claude', null, bundled);
		const [stale, unhashed, ...rest] = first.tools;
		const held = [
			{ path: stale.path, contentHash: 'deadbeef' },
			{ path: unhashed.path },
			...rest.slice(1).map((tool) => ({ path: `./${tool.path}`, contentHash: tool.contentHash }))
		];
		const tools = buildBinding(hookScript, 'claude', null, bundled, held).tools;
		expect(tools[0].content).toBe(stale.content);
		expect(tools[1].content).toBe(unhashed.content);
		expect(tools[2].content).toBe(rest[0].content);
		expect(tools.slice(3).every((tool) => tool.unchanged === true && tool.content === undefined)).toBe(true);
	});
});

describe('the bundled binding hook (Claude Code, UserPromptSubmit)', () => {
	const hook = fileURLToPath(new URL('./lyriks-bound-prompt.hook.mjs', import.meta.url));
	const run = (input: string) =>
		JSON.parse(execFileSync('node', [hook], { input, encoding: 'utf8' })) as {
			hookSpecificOutput: { hookEventName: string; additionalContext: string };
		};

	it('restates the binding on every prompt and names the last project a Lyriks tool was given', () => {
		const dir = mkdtempSync(join(tmpdir(), 'lyriks-hook-'));
		const transcript = join(dir, 'session.jsonl');
		writeFileSync(
			transcript,
			[
				JSON.stringify({
					type: 'assistant',
					message: {
						content: [{ type: 'tool_use', name: 'mcp__lyriks__list_wizard_projects', input: {} }]
					}
				}),
				JSON.stringify({
					type: 'assistant',
					message: {
						content: [
							{
								type: 'tool_use',
								name: 'mcp__lyriks__get_section',
								input: { project_id: 'vector-rally', section: 'features' }
							}
						]
					}
				}),
				'not json at all'
			].join('\n')
		);
		const out = run(JSON.stringify({ cwd: dir, prompt: 'add a nitro boost', transcript_path: transcript }));
		expect(out.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
		expect(out.hookSpecificOutput.additionalContext).toContain('(project vector-rally)');
		expect(out.hookSpecificOutput.additionalContext).toContain('spec first');
		rmSync(dir, { recursive: true, force: true });
	});

	it('states the same rule as the binding block: spec first, Evolution optional', () => {
		const context = run(JSON.stringify({ cwd: tmpdir(), prompt: 'we should add a nitro boost' }))
			.hookSpecificOutput.additionalContext;
		expect(context).toContain('spec first');
		expect(context).toContain('is optional');
		expect(context).not.toContain('too small for a dossier');
		// The cues are the same words in both texts, so neither can drift alone.
		const block = buildBindingBlock();
		for (const cue of ['apply_behavior_batch', 'sync_implementation_index', 'get_evolution']) {
			expect(context).toContain(cue);
			expect(block).toContain(cue);
		}
	});

	it('stays silent on a harness event, which is not a request about the product', () => {
		const raw = (prompt: string) =>
			execFileSync('node', [hook], { input: JSON.stringify({ cwd: tmpdir(), prompt }), encoding: 'utf8' });
		expect(raw('<task-notification>\n<task-id>abc</task-id>')).toBe('');
		expect(raw('  <system-reminder>\nnot user input')).toBe('');
		expect(raw('[SYSTEM NOTIFICATION - NOT USER INPUT]')).toBe('');
		// A person quoting one of those words mid-sentence is still a person asking.
		expect(raw('why did I get a <task-notification> about the sync?')).toContain('spec first');
	});

	it('falls back to the project named by the binding block in CLAUDE.md', () => {
		const dir = mkdtempSync(join(tmpdir(), 'lyriks-hook-'));
		writeFileSync(join(dir, 'CLAUDE.md'), `# mine\n\n${buildBindingBlock('causette')}\n`);
		const out = run(JSON.stringify({ cwd: dir, prompt: 'hi' }));
		expect(out.hookSpecificOutput.additionalContext).toContain('(project causette)');
		rmSync(dir, { recursive: true, force: true });
	});

	it('still answers, without a project, on garbage input', () => {
		const out = run('not json');
		expect(out.hookSpecificOutput.additionalContext).toMatch(/^Lyriks-bound repository: /);
	});

	// Agents were told to go through Lyriks while the Lyriks MCP refused every
	// connection. The transcript already says so: no network needed to read it.
	describe('when the Lyriks MCP is down', () => {
		const call = (id: string, name = 'mcp__lyriks__get_section') =>
			JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input: { project_id: 'vector-rally' } }] } });
		const result = (id: string, content: unknown, isError: boolean, timestamp = '2026-09-24T10:12:03.120Z') =>
			JSON.stringify({ type: 'user', timestamp, message: { role: 'user', content: [{ tool_use_id: id, type: 'tool_result', content, is_error: isError }] } });
		const contextFor = (lines: string[]) => {
			const dir = mkdtempSync(join(tmpdir(), 'lyriks-hook-'));
			try {
				const transcript = join(dir, 'session.jsonl');
				writeFileSync(transcript, lines.join('\n'));
				return run(JSON.stringify({ cwd: dir, prompt: 'what does the boost do?', transcript_path: transcript })).hookSpecificOutput.additionalContext;
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		};

		it('says first that the MCP failed, when, why, and what to do, and keeps the rest', () => {
			const context = contextFor([
				call('t1'),
				result('t1', '{"ok":true}', false, '2026-09-24T09:00:00Z'),
				call('t2'),
				result('t2', [{ type: 'text', text: 'Error: connect ECONNREFUSED 127.0.0.1:3000' }], true)
			]);
			expect(context).toMatch(/^The Lyriks MCP failed at 2026-09-24 10:12 UTC \(connection refused\) and no Lyriks call has succeeded since: /);
			expect(context).toContain('tell the person now and point them to /mcp');
			expect(context).toContain('do not guess specified behavior from the code');
			expect(context).toContain('Lyriks-bound repository (project vector-rally)');
			expect(context).toContain('spec first');
		});

		it('names the other ways a server goes missing', () => {
			for (const [text, reason] of [
				['MCP error -32000: Connection closed', 'server not connected'],
				['TypeError: fetch failed', 'fetch failed'],
				['MCP server "lyriks" is not connected', 'server not connected'],
				['502 Bad Gateway', 'server unavailable']
			]) {
				expect(contextFor([call('t1'), result('t1', text, true)])).toContain(`(${reason})`);
			}
		});

		it('forgets the failure once a later Lyriks call came back, even with a tool error', () => {
			const recovered = contextFor([call('t1'), result('t1', 'fetch failed', true), call('t2'), result('t2', '{"ok":true}', false)]);
			expect(recovered).toMatch(/^Lyriks-bound repository/);
			const refused = contextFor([call('t1'), result('t1', 'fetch failed', true), call('t2'), result('t2', 'feature_id is required', true)]);
			expect(refused).toMatch(/^Lyriks-bound repository/);
		});

		it('ignores the failures of other tools and servers', () => {
			const context = contextFor([
				call('t1'),
				result('t1', '{"ok":true}', false),
				call('t2', 'mcp__github__get_issue'),
				result('t2', 'connect ECONNREFUSED', true)
			]);
			expect(context).toMatch(/^Lyriks-bound repository/);
		});
	});
});

describe('what the playbooks say of who acts, of time, of the system and of documents', () => {
	const root = fileURLToPath(new URL('../../../..', import.meta.url));
	// Read as prose: a paragraph re-wrapped says the same thing, so line breaks never count.
	const playbook = (id: string) => readFileSync(join(root, `.claude/skills/${id}/SKILL.md`), 'utf8').replace(/\s+/g, ' ');

	it('models who acts, what time does and what the system does, one feature verified at a time [criterion:0ec9f244]', () => {
		const behavior = playbook('lyriks-behavior');
		const section = behavior.slice(behavior.indexOf('## Who acts, what time does, what the system does'));
		expect(section.startsWith('## Who acts, what time does, what the system does')).toBe(true);
		for (const law of [
			'**Who is acting is a given, not an action.**',
			'**What time does is an action of a schedule.**',
			'**What the world does is an action of the system.**',
			'**Read the cause the engine gives.**',
			'**One feature at a time, verified before the next.**'
		])
			expect(section, law).toContain(law);
		expect(behavior).toContain('declare the role ONCE for the whole project, under the same path and the same values in every feature');
		expect(behavior).toContain('advance_time (`{type:"advance_time", by}`');
		expect(behavior).toContain('one per role a guard of the feature reads');
		expect(behavior).not.toContain('declare `session.role` (enum owner|builder|operator|viewer) per feature');
		expect(playbook('lyriks-build')).toContain('Give every role the values the behaviour reads it by (`roles[].behaviorValues');
	});

	it('counts the pages of a documentation and puts each kind of page in its place [criterion:c45098f2]', () => {
		const retrospec = playbook('lyriks-retrospec');
		const section = retrospec.slice(retrospec.indexOf('## A product known from its documentation'));
		expect(section).toContain('**The pages are the denominator**');
		expect(section).toContain('*Where each kind of document goes*');
		expect(retrospec).toContain('each is an actor of the journey it serves (sign-in, API)');
		expect(retrospec).toContain('each with its `behaviorValues` (lyriks-build step 9)');
		const build = playbook('lyriks-build');
		const table = build.slice(build.indexOf('## Where each kind of document goes'));
		for (const row of ['`evidence`', '`decision` status', '`foundation.painPointLinks`', '`foundation.slas`', 'Legal or Compliance', 'one `api` action per endpoint', 'a `rules` issue'])
			expect(table, row).toContain(row);
	});
});

describe('what the playbooks make a retrospec count and a CI check', () => {
	const root = fileURLToPath(new URL('../../../..', import.meta.url));
	// Read as prose: a paragraph re-wrapped says the same thing, so line breaks never count.
	const playbook = (id: string) => readFileSync(join(root, `.claude/skills/${id}/SKILL.md`), 'utf8').replace(/\s+/g, ' ');

	it('counts the screens, the settings and the rules on sensitive data whatever the spine [criterion:c3526104]', () => {
		const retrospec = playbook('lyriks-retrospec');
		const ledger = retrospec.slice(retrospec.indexOf('Whatever the spine, five lists always enter the ledger:'));
		expect(ledger.startsWith('Whatever the spine, five lists always enter the ledger:')).toBe(true);
		for (const list of [
			'**The API, endpoint by endpoint.**',
			'**Every access check of the code.**',
			'**Every screen, administration and settings pages included.**',
			'**Every setting that changes what the product does.**',
			'**Every rule on personal or sensitive data.**'
		])
			expect(ledger, list).toContain(list);
		expect(ledger).toContain('a page declared in metadata or configuration counts as much as a coded one');
		expect(ledger).toContain('a rule spanned on the code that enforces it');
		expect(retrospec).not.toContain('two lists always enter the ledger');
	});

	it('reads a prototype whole, counts its layers and sorts product from sample and control [criterion:d8b6bf0d]', () => {
		const retrospec = playbook('lyriks-retrospec');
		const part = retrospec.slice(retrospec.indexOf('## A product known from its prototype or its design'));
		expect(part.startsWith('## A product known from its prototype or its design')).toBe(true);
		for (const law of [
			'**Read every file whole, and say so.**',
			'Measure each file and its longest line first',
			'Never cut in silence.',
			'**Count before writing, layer by layer, in the ledger:**',
			'every interaction with what its handler really does',
			'(`readonly`, `disabled`, `aria-*`)',
			'**Sort every element into product, sample data or prototype control, and write the sort down.**',
			'**A sample catalogue states rules: take the rule, never the instance.**',
			'**A label is not a behaviour.**',
			'**The prototype is a source like any other:**',
			'**Prove the end with three readings, never with an impression:**'
		])
			expect(part, law).toContain(law);
		expect(retrospec).toContain('with `source_mode: "from_figma"`');
		expect(retrospec).toContain('| a clickable prototype or a design (one HTML file, a design canvas, a Figma prototype) |');
		expect(retrospec).toContain("'spec this prototype'");
	});

	it('ends on the checks, never on an impression, and tells its own work from a decision [criterion:f383eddf]', () => {
		const retrospec = playbook('lyriks-retrospec');
		expect(retrospec).toContain('**Read what done means first:** `assess_project_completeness` on the empty project lists what your work ends on');
		const protocol = retrospec.slice(retrospec.indexOf('## Low-intervention protocol'));
		expect(protocol).toContain('**Your work, or a person\'s decision.** Only the `scope.mode`, approvals');
		expect(protocol).toContain('every feature\'s behaviour (never left at 0% unless shells or a target stage were asked)');
		expect(protocol).toContain('never report them as "a decision" or "to do on request".');
		expect(protocol).toContain('**Done is proven, never felt.**');
		expect(protocol).toContain('hand over a coverage report');
	});

	it('gives the CI job that keeps the places true between two runs [criterion:b9881b7c]', () => {
		const delivery = playbook('lyriks-delivery');
		const ci = delivery.slice(delivery.indexOf('## Keep the places true between two runs (CI)'));
		expect(ci.startsWith('## Keep the places true between two runs (CI)')).toBe(true);
		for (const cue of [
			'node .lyriks/tools/check-index.mjs --fix',
			'no network',
			'fails, naming the entry, when a code line is found nowhere',
			'node .lyriks/tools/sync-index.mjs',
			'`LYRIKS_MCP_URL`',
			'`LYRIKS_MCP_TOKEN` held as a CI secret',
			'such a token expires',
			'Never edit a line number by hand'
		])
			expect(ci, cue).toContain(cue);
	});
});

describe('every published playbook names nothing of ours and is short enough to be read whole [criterion:5d8e23b4]', () => {
	const root = fileURLToPath(new URL('../../../..', import.meta.url));
	const playbook = (id: string) => readFileSync(join(root, `.claude/skills/${id}/SKILL.md`), 'utf8');
	// The products we ran the playbooks on. A lesson a run taught stays as the rule it taught.
	const ourRuns = ['linkding', 'kutt', 'taskora', 'zappier', 'big island'];

	it.each(PUBLISHED_SKILL_IDS)('%s tells no story of a run of ours', (id) => {
		const text = playbook(id).toLowerCase();
		for (const name of ourRuns) expect(text, `${id} names ${name}`).not.toMatch(new RegExp(`\\b${name}\\b`));
		expect(text, `${id} dates a run`).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
		expect(text, `${id} tells a run`).not.toMatch(/\bin the \w+ run\b|\bfield run\b|\bproven end-to-end on\b/);
	});

	it.each(PUBLISHED_SKILL_IDS)('%s points to nothing the client does not hold', (id) => {
		const text = playbook(id);
		expect(text, `${id} links a memory`).not.toContain('[[');
		expect(text, `${id} names a file of our repository`).not.toMatch(/docs\/skills\/|localhost:\d+/);
	});

	it.each(PUBLISHED_SKILL_IDS)('%s stays under the length a client reads whole', (id) => {
		const length = playbook(id).length;
		expect(length, `${id} holds ${length} characters, past ${PLAYBOOK_MAX_CHARS}: say a rule once and cut before adding.`).toBeLessThanOrEqual(PLAYBOOK_MAX_CHARS);
	});
});
