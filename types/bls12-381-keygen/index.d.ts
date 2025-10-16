declare module 'bls12-381-keygen' {
  export function deriveSeedTree(seed: Uint8Array, path: number[]): Uint8Array
}
