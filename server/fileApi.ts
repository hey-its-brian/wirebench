// Vite plugin: a small file API so the library, projects and settings live as
// plain JSON under data/. It only ever touches files inside data/.

import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'
import { DEFAULT_SETTINGS } from '../src/model/defaults.ts'
import { isSafeId, isSafeImageName } from './ids.ts'

const MAX_JSON = 2 * 1024 * 1024
const MAX_IMAGE = 15 * 1024 * 1024

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(new HttpError(413, 'body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJson(file: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return undefined
  }
}

/** Write through a temp file so a crash never leaves half a JSON file. */
async function writeFileAtomic(file: string, data: string | Buffer) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, data)
  await fs.rename(tmp, file)
}

async function listJson(dir: string): Promise<unknown[]> {
  let names: string[] = []
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  const out: unknown[] = []
  for (const name of names.sort()) {
    if (!name.endsWith('.json')) continue
    const v = await readJson(path.join(dir, name))
    if (v !== undefined) out.push(v)
  }
  return out
}

export function createHandler(dataDir: string) {
  const libDir = path.join(dataDir, 'library')
  const imgDir = path.join(libDir, 'images')
  const projDir = path.join(dataDir, 'projects')
  const settingsFile = path.join(dataDir, 'settings.json')

  async function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const raw = await readBody(req, MAX_JSON)
    let v: unknown
    try {
      v = JSON.parse(raw.toString('utf8'))
    } catch {
      throw new HttpError(400, 'invalid JSON')
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'expected an object')
    return v as Record<string, unknown>
  }

  /** Returns true when the request was handled. */
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let pathname: string
    try {
      pathname = decodeURIComponent(url.pathname)
    } catch {
      send(res, 400, { error: 'bad path' })
      return true
    }
    const method = req.method ?? 'GET'
    const isApi = pathname.startsWith('/api/')
    const isImage = pathname.startsWith('/images/')
    if (!isApi && !isImage) return false

    try {
      if (isImage) {
        const name = pathname.slice('/images/'.length)
        if (!isSafeImageName(name)) throw new HttpError(400, 'bad image name')
        if (method !== 'GET') throw new HttpError(405, 'method not allowed')
        let data: Buffer
        try {
          data = await fs.readFile(path.join(imgDir, name))
        } catch {
          throw new HttpError(404, 'no such image')
        }
        res.statusCode = 200
        res.setHeader('Content-Type', MIME[name.split('.').pop()!] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-store')
        res.end(data)
        return true
      }

      const parts = pathname.slice('/api/'.length).split('/')
      const [kind, id, ...rest] = parts
      if (rest.length) throw new HttpError(404, 'not found')

      if (kind === 'settings' && id === undefined) {
        if (method === 'GET') {
          const v = await readJson(settingsFile)
          const ok = v && typeof v === 'object' && Array.isArray((v as { pinTypes?: unknown }).pinTypes)
          send(res, 200, ok ? { ...DEFAULT_SETTINGS, ...(v as object) } : DEFAULT_SETTINGS)
          return true
        }
        if (method === 'PUT') {
          const body = await parseJsonBody(req)
          await writeFileAtomic(settingsFile, JSON.stringify(body, null, 2) + '\n')
          send(res, 200, { ok: true })
          return true
        }
        throw new HttpError(405, 'method not allowed')
      }

      if (kind === 'library') {
        if (id === undefined) {
          if (method !== 'GET') throw new HttpError(405, 'method not allowed')
          send(res, 200, await listJson(libDir))
          return true
        }
        if (!isSafeId(id)) throw new HttpError(400, 'bad part id')
        if (method === 'PUT') {
          const body = await parseJsonBody(req)
          if (body.id !== id) throw new HttpError(400, 'id does not match the path')
          await writeFileAtomic(path.join(libDir, `${id}.json`), JSON.stringify(body, null, 2) + '\n')
          send(res, 200, { ok: true })
          return true
        }
        throw new HttpError(405, 'method not allowed')
      }

      if (kind === 'projects') {
        if (id === undefined) {
          if (method !== 'GET') throw new HttpError(405, 'method not allowed')
          const all = (await listJson(projDir)) as { id?: string; name?: string; updated?: string }[]
          send(
            res,
            200,
            all
              .filter((p) => isSafeId(p.id))
              .map((p) => ({ id: p.id, name: p.name ?? p.id, updated: p.updated }))
              .sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? '')),
          )
          return true
        }
        if (!isSafeId(id)) throw new HttpError(400, 'bad project id')
        const file = path.join(projDir, `${id}.json`)
        if (method === 'GET') {
          const v = await readJson(file)
          if (v === undefined) throw new HttpError(404, 'no such project')
          send(res, 200, v)
          return true
        }
        if (method === 'PUT') {
          const body = await parseJsonBody(req)
          if (body.id !== id) throw new HttpError(400, 'id does not match the path')
          await writeFileAtomic(file, JSON.stringify(body, null, 2) + '\n')
          send(res, 200, { ok: true })
          return true
        }
        if (method === 'DELETE') {
          await fs.rm(file, { force: true })
          send(res, 200, { ok: true })
          return true
        }
        throw new HttpError(405, 'method not allowed')
      }

      if (kind === 'images') {
        if (!isSafeImageName(id)) throw new HttpError(400, 'bad image name')
        const file = path.join(imgDir, id)
        if (method === 'POST') {
          const data = await readBody(req, MAX_IMAGE)
          if (!data.length) throw new HttpError(400, 'empty image')
          await writeFileAtomic(file, data)
          send(res, 200, { file: id })
          return true
        }
        if (method === 'DELETE') {
          await fs.rm(file, { force: true })
          send(res, 200, { ok: true })
          return true
        }
        throw new HttpError(405, 'method not allowed')
      }

      throw new HttpError(404, 'not found')
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500
      send(res, status, { error: err instanceof Error ? err.message : 'error' })
      return true
    }
  }
}

export function fileApi(): Plugin {
  let handle: ReturnType<typeof createHandler>
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    handle(req, res).then(
      (handled) => {
        if (!handled) next()
      },
      () => next(),
    )
  }
  return {
    name: 'wirebench-file-api',
    configResolved(config) {
      handle = createHandler(path.join(config.root, 'data'))
    },
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
