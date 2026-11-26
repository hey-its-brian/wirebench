import { describe, expect, it } from 'vitest'
import { isSafeId, isSafeImageName } from '../server/ids'

describe('isSafeId', () => {
  it('accepts plain lowercase slugs', () => {
    expect(isSafeId('nrf24l01')).toBe(true)
    expect(isSafeId('esp32-devkit-v1')).toBe(true)
  })
  it('rejects anything that could leave the data folder', () => {
    for (const bad of ['', '../x', 'a/b', 'Abc', 'a.b', 'a'.repeat(65), '-a', 'a b', '..']) {
      expect(isSafeId(bad), bad).toBe(false)
    }
    expect(isSafeId(undefined)).toBe(false)
  })
})

describe('isSafeImageName', () => {
  it('accepts a slug with an image extension', () => {
    expect(isSafeImageName('nrf24l01-front.png')).toBe(true)
    expect(isSafeImageName('cyd-flipped.webp')).toBe(true)
  })
  it('rejects other extensions and paths', () => {
    for (const bad of ['x.svg', '../x.png', 'x.png/..', 'x', 'X.png', 'a/b.png', '.png']) {
      expect(isSafeImageName(bad), bad).toBe(false)
    }
  })
})
