// The wire table: one row per wire, exactly as drawn.

import { BOARD_CATEGORY, resolveWireColor, wireAutoType } from './colors'
import { resolveDef } from './parts'
import type { Library, PinRef, Project, Settings } from './types'

export interface WireRow {
  wireId: string
  fromPart: string
  fromPin: string
  fn: string
  toPart: string
  toPin: string
  color: string
  hex: string
}

/** Display names for placed parts: the label, or the part name with #2, #3 on repeats. */
export function partDisplayNames(project: Project, lib: Library): Record<string, string> {
  const seen = new Map<string, number>()
  const names: Record<string, string> = {}
  for (const placed of project.parts) {
    if (placed.label) {
      names[placed.id] = placed.label
      continue
    }
    const base = lib[placed.partId]?.name ?? `Missing part (${placed.partId})`
    const n = (seen.get(placed.partId) ?? 0) + 1
    seen.set(placed.partId, n)
    names[placed.id] = n === 1 ? base : `${base} #${n}`
  }
  return names
}

export function colorName(hex: string, settings: Settings): string {
  const hit = settings.palette.find((p) => p.color.toLowerCase() === hex.toLowerCase())
  return hit ? hit.name : hex
}

export function buildWireList(project: Project, lib: Library, settings: Settings): WireRow[] {
  const names = partDisplayNames(project, lib)
  const info = (ref: PinRef) => {
    const placed = project.parts.find((p) => p.id === ref.part)
    const def = placed ? resolveDef(lib, placed) : undefined
    const pin = def?.pins.find((p) => p.id === ref.pin)
    return {
      part: names[ref.part] ?? 'Missing part',
      pin: pin?.name ?? ref.pin,
      isBoard: def?.category === BOARD_CATEGORY,
    }
  }
  return project.wires.map((w) => {
    const a = info(w.a)
    const b = info(w.b)
    // The board end reads first, like the wiring tables in Brian's notes.
    const [from, to] = !a.isBoard && b.isBoard ? [b, a] : [a, b]
    const type = wireAutoType(w, project, lib)
    const hex = resolveWireColor(w, project, lib, settings)
    return {
      wireId: w.id,
      fromPart: from.part,
      fromPin: from.pin,
      fn: settings.pinTypes.find((t) => t.id === type)?.label ?? '',
      toPart: to.part,
      toPin: to.pin,
      color: colorName(hex, settings),
      hex,
    }
  })
}

const cell = (s: string) => s.replace(/\|/g, '\\|')

export function wireListMarkdown(rows: WireRow[]): string {
  const head = ['From part', 'From pin', 'Function', 'To part', 'To pin', 'Wire color']
  const lines = [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`]
  for (const r of rows) {
    lines.push(`| ${[r.fromPart, r.fromPin, r.fn, r.toPart, r.toPin, r.color].map(cell).join(' | ')} |`)
  }
  return lines.join('\n') + '\n'
}
