import type { LyriksClient } from '../lyriks-client.js'

export function updateWizardProjectHandler(
  args: {
    project_id: string
    name?: string
    description?: string
    domain_id?: string | null
    stage?: string
  },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.patch(`/api/projects/${encodeURIComponent(args.project_id)}`, {
    name: args.name,
    description: args.description,
    domainId: args.domain_id,
    stage: args.stage,
  })
}

export function deleteWizardProjectHandler(
  args: { project_id: string; confirm_name: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.delete(`/api/projects/${encodeURIComponent(args.project_id)}`, {
    confirmName: args.confirm_name,
  })
}

export function listDomainsHandler(_args: unknown, lyriks: LyriksClient): Promise<unknown> {
  return lyriks.get('/api/domains')
}

export function createDomainHandler(
  args: { name: string; description?: string; icon?: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post('/api/domains', args)
}

export function updateDomainHandler(
  args: { domain_id: string; name?: string; description?: string; icon?: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.patch(`/api/domains/${encodeURIComponent(args.domain_id)}`, {
    name: args.name,
    description: args.description,
    icon: args.icon,
  })
}

export function deleteDomainHandler(
  args: { domain_id: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.delete(`/api/domains/${encodeURIComponent(args.domain_id)}`)
}
