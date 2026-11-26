// Thin wrappers over the local file API (see server/fileApi.ts).

import type { PartDef, Project, ProjectSummary, Settings } from '../model/types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    let message = `${res.status}`
    try {
      message = ((await res.json()) as { error?: string }).error ?? message
    } catch {
      // The body was not JSON; the status code is all we have.
    }
    throw new Error(`${init?.method ?? 'GET'} ${url} failed: ${message}`)
  }
  return (await res.json()) as T
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  getLibrary: () => request<PartDef[]>('/api/library'),
  putPart: (def: PartDef) => request<{ ok: true }>(`/api/library/${def.id}`, json('PUT', def)),
  getSettings: () => request<Settings>('/api/settings'),
  putSettings: (s: Settings) => request<{ ok: true }>('/api/settings', json('PUT', s)),
  listProjects: () => request<ProjectSummary[]>('/api/projects'),
  getProject: (id: string) => request<Project>(`/api/projects/${id}`),
  putProject: (p: Project) => request<{ ok: true }>(`/api/projects/${p.id}`, json('PUT', p)),
  deleteProject: (id: string) => request<{ ok: true }>(`/api/projects/${id}`, { method: 'DELETE' }),
  uploadImage: (name: string, data: Blob) =>
    request<{ file: string }>(`/api/images/${name}`, { method: 'POST', body: data }),
  deleteImage: (name: string) => request<{ ok: true }>(`/api/images/${name}`, { method: 'DELETE' }),
}
