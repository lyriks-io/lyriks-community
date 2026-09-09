// The seam between the open-source gateway and the Enterprise overlay.
//
// The Community edition serves every tool from the platform. Enterprise links
// `ee/` into `src/ee/` (scripts/ee.mjs), and that overlay fills this contract;
// what it adds, and how, lives in the overlay. Nothing under src/ outside
// src/ee/ imports the overlay directly: it reaches it through `enterprise` in
// ./index.ts, which is null on the open-source tree. scripts/oss-boundary.test.mjs
// enforces that.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

/**
 * The portfolio tools as one edition answers them. Same tool names and
 * arguments on both editions, so an agent's playbook works on either.
 */
export interface PortfolioTools {
  listWorkspaces(args: unknown): Promise<unknown>
  listProjects(args: { workspace_id?: string }): Promise<unknown>
  getProject(args: { project_id: string; summary?: boolean; paths?: string[] }): Promise<unknown>
  createProject(args: { workspace_id: string; name: string; description?: string }): Promise<unknown>
  updateProject(args: { project_id: string; name?: string; description?: string }): Promise<unknown>
  deleteProject(args: { project_id: string }): Promise<unknown>
  /** Adds what this edition knows about each wizard card; never throws. */
  annotateWizardPortfolio(portfolio: unknown): Promise<unknown>
}

/** The overlay bound to one caller's token. */
export interface BoundOverlay {
  portfolio: PortfolioTools
  /**
   * Registers the tools only this edition serves, with their real arguments.
   * The open-source tree registers a stand-in under each of those names
   * instead (src/tools/enterprise-standins.ts), so the tool list is the same.
   */
  registerTools(mcp: McpServer): void
}

export interface EnterpriseOverlay {
  /** Whether this install has the Enterprise services to talk to at all. */
  configured(): boolean
  /** One line for the boot log. */
  describe(): string
  /** The overlay bound to the caller's token. */
  bind(token: string): BoundOverlay
  /** A token for a request that carries none, when auth is not required. */
  devToken(): Promise<string>
}
