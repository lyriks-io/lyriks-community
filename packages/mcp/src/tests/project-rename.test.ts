import { expect, it } from 'vitest'
import { createMcpServer } from '../server.js'

// Criterion 60d1fbca of feat-project-lifecycle (lyriks-feb747): update_wizard_project
// name:"linkding" answered updated:true while every list kept showing Linkding.
it('tells the client the answer carries the name kept, with its first letter made a capital', () => {
  // @ts-expect-error reading the registered tools the way the SDK does
  const tools = createMcpServer(null)._registeredTools as Record<string, { description: string }>
  const described = tools.update_wizard_project.description
  expect(described).toContain('Every project name opens on a capital')
  expect(described).toContain('`nameStyled` { sent, kept, reason }')
  expect(described).toContain('report the name kept')
})
