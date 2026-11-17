import { expect, it, vi } from 'vitest'
import { createMcpServer } from '../server.js'
import { updateWizardProjectHandler } from '../tools/lyriks-portfolio.js'
import type { LyriksClient } from '../lyriks-client.js'

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

it('relays the name the platform kept and why', async () => {
  const kept = { updated: true, projectId: 'linkding-2fa72d', name: 'Linkding', nameStyled: { sent: 'linkding', kept: 'Linkding', reason: 'one style' } }
  const patch = vi.fn().mockResolvedValue(kept)
  const answer = await updateWizardProjectHandler({ project_id: 'linkding-2fa72d', name: 'linkding' }, { patch } as unknown as LyriksClient)
  expect(answer).toEqual(kept)
  expect(patch.mock.calls[0][1]).toMatchObject({ name: 'linkding' })
})
