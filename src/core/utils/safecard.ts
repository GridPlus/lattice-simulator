export type SafeCardUidKind = 'external' | 'internal'

const UID_LENGTH = 64

export function generateSafeCardUid(id: number, kind: SafeCardUidKind = 'external'): string {
  const normalizedId = Number.isFinite(id) ? Math.max(0, Math.floor(id)) : 0
  const idHex = normalizedId.toString(16).padStart(8, '0')
  const kindHex = kind === 'internal' ? 'bb' : 'aa'
  const base = `${kindHex}${idHex}`
  return base.repeat(Math.ceil(UID_LENGTH / base.length)).slice(0, UID_LENGTH)
}

export function defaultSafeCardName(id: number): string {
  return `SafeCard #${id}`
}
