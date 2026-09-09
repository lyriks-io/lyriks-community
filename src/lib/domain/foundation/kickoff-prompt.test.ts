import { describe, it, expect } from 'vitest';
import { KICKOFF_SOURCES, kickoffPrompt, mcpEndpointFor, mcpRegistrationCommands } from './kickoff-prompt';

describe('mcpEndpointFor', () => {
	it('appends /mcp to the origin', () => {
		expect(mcpEndpointFor('https://lyriks.example.corp')).toBe('https://lyriks.example.corp/mcp');
	});

	it('never doubles the slash when the origin carries one', () => {
		expect(mcpEndpointFor('http://localhost:3000/')).toBe('http://localhost:3000/mcp');
	});
});

describe('kickoffPrompt from a codebase', () => {
	const prompt = kickoffPrompt({
		productName: 'Returns Portal',
		projectId: 'returns-portal-a1b2c3',
		sourceMode: 'code_to_spec'
	});

	it('is one sentence that names the target and nothing else', () => {
		expect(prompt).toBe(
			'With the help of the Lyriks MCP, ingest this entire codebase into the Lyriks project "Returns Portal" (id returns-portal-a1b2c3).'
		);
	});

	it('leaves the procedure and the rules to the MCP and the shipped skills', () => {
		expect(prompt).not.toMatch(/sync_skills|lyriks-retrospec|attach_source|claude mcp add/);
		expect(prompt.split('\n')).toHaveLength(1);
	});

	it('ignores ticked sources: the codebase is the source', () => {
		expect(
			kickoffPrompt({ productName: 'X', projectId: 'x-1', sourceMode: 'code_to_spec', sources: ['jira'] })
		).not.toContain('Jira');
	});
});

describe('kickoffPrompt from scratch', () => {
	const base = { productName: 'Returns Portal', projectId: 'returns-portal-a1b2c3', sourceMode: 'greenfield' as const };

	it('interviews the user when nothing is ticked', () => {
		expect(kickoffPrompt(base)).toBe(
			'With the help of the Lyriks MCP, specify the Lyriks project "Returns Portal" (id returns-portal-a1b2c3) from scratch: interview me for what you need and build the spec as we go.'
		);
	});

	it('names the ticked sources, reachable through their MCPs, and keeps the rest for the user', () => {
		const prompt = kickoffPrompt({ ...base, sources: ['jira', 'notion', 'bmad'] });
		expect(prompt).toBe(
			'With the help of the Lyriks MCP, specify the Lyriks project "Returns Portal" (id returns-portal-a1b2c3) from scratch, from the Jira backlog, the Notion pages and the BMAD documents of this repository (PRD, architecture, stories) (through their MCPs connected here, or the files of this repository), and ask me what they cannot tell you.'
		);
	});

	it('reads "a and b" for two sources and stays one line', () => {
		const prompt = kickoffPrompt({ ...base, sources: ['figma', 'documents'] });
		expect(prompt).toContain('from the Figma files and the documents I hand you');
		expect(prompt.split('\n')).toHaveLength(1);
	});

	it('treats every origin but the codebase as from scratch', () => {
		expect(kickoffPrompt({ ...base, sourceMode: 'from_document' })).toContain('from scratch');
		expect(kickoffPrompt({ ...base, sourceMode: null })).toContain('from scratch');
	});

	it('offers the source families an agent reaches through MCPs or the repository', () => {
		expect(KICKOFF_SOURCES.map((s) => s.code)).toEqual([
			'jira',
			'notion',
			'confluence',
			'bmad',
			'speckit',
			'figma',
			'documents'
		]);
	});

	it('falls back to a neutral name when the product has none yet', () => {
		expect(kickoffPrompt({ ...base, productName: '   ' })).toContain('"this product"');
	});
});

describe('kickoffPrompt before the project exists', () => {
	it('asks the agent to create the project, filed in the domain, then ingest the codebase', () => {
		expect(
			kickoffPrompt({ productName: 'Returns Portal', sourceMode: 'code_to_spec', domainName: 'Customer Success' })
		).toBe(
			'With the help of the Lyriks MCP, create the Lyriks project "Returns Portal" in the domain "Customer Success" and ingest this entire codebase into it.'
		);
	});

	it('asks the agent to create the project from scratch, from the ticked sources', () => {
		expect(kickoffPrompt({ productName: 'Returns Portal', sourceMode: 'greenfield', sources: ['jira'] })).toBe(
			'With the help of the Lyriks MCP, create the Lyriks project "Returns Portal" from scratch, from the Jira backlog (through their MCPs connected here, or the files of this repository), and ask me what they cannot tell you.'
		);
		expect(kickoffPrompt({ productName: 'Returns Portal', sourceMode: 'greenfield' })).toContain(
			'create the Lyriks project "Returns Portal" from scratch: interview me'
		);
	});

	it('names no domain when the project is filed nowhere', () => {
		expect(kickoffPrompt({ productName: 'X', sourceMode: 'greenfield', domainName: '  ' })).not.toContain('domain');
	});
});

describe('mcpRegistrationCommands', () => {
	it('gives the registration command for the two clients the docs cover', () => {
		const c = mcpRegistrationCommands('https://lyriks.example.corp/mcp');
		expect(c.claudeCode).toBe('claude mcp add --scope user --transport http lyriks https://lyriks.example.corp/mcp');
		expect(c.codex).toBe('codex mcp add lyriks --url https://lyriks.example.corp/mcp');
	});
});
