// A net is a set of pins that are electrically one: joined by wires, or joined
// inside a part (all of a board's GND pins, for example). Nets are computed,
// never stored.

import { resolveDef } from './parts'
import type { Library, PinRef, Project } from './types'

export function pinKey(ref: PinRef): string {
  return `${ref.part}:${ref.pin}`
}

function parseKey(key: string): PinRef {
  const i = key.indexOf(':')
  return { part: key.slice(0, i), pin: key.slice(i + 1) }
}

function buildSets(project: Project, lib: Library) {
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    if (!parent.has(k)) parent.set(k, k)
    let root = k
    while (parent.get(root) !== root) root = parent.get(root)!
    // Path compression keeps repeated lookups cheap.
    let cur = k
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!
      parent.set(cur, root)
      cur = next
    }
    return root
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  for (const placed of project.parts) {
    const def = resolveDef(lib, placed)
    for (const group of def?.links ?? []) {
      for (let i = 1; i < group.length; i++) {
        union(pinKey({ part: placed.id, pin: group[0] }), pinKey({ part: placed.id, pin: group[i] }))
      }
    }
  }
  for (const w of project.wires) union(pinKey(w.a), pinKey(w.b))
  return { parent, find }
}

/** Every net with two or more pins. */
export function computeNets(project: Project, lib: Library): PinRef[][] {
  const { parent, find } = buildSets(project, lib)
  const groups = new Map<string, PinRef[]>()
  for (const key of parent.keys()) {
    const root = find(key)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(parseKey(key))
  }
  return [...groups.values()].filter((g) => g.length > 1)
}

/** The other pins on the same net as ref. Empty when the pin is open. */
export function connectionsOf(project: Project, lib: Library, ref: PinRef): PinRef[] {
  const key = pinKey(ref)
  const net = computeNets(project, lib).find((n) => n.some((r) => pinKey(r) === key))
  return net ? net.filter((r) => pinKey(r) !== key) : []
}
