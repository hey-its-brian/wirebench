// Every id or file name that reaches the file system goes through these first.

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/
const IMAGE = /^([a-z0-9][a-z0-9-]{0,63})\.(png|jpg|jpeg|webp)$/

export function isSafeId(s: unknown): s is string {
  return typeof s === 'string' && ID.test(s)
}

export function isSafeImageName(s: unknown): s is string {
  return typeof s === 'string' && IMAGE.test(s)
}
