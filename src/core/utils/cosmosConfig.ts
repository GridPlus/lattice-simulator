import { HARDENED_OFFSET } from '../constants'

export interface CosmosChainConfig {
  key: string
  name: string
  bech32Prefix: string
  bip44CoinType: number
}

const DEFAULT_COSMOS_CHAIN: CosmosChainConfig = {
  key: 'cosmos',
  name: 'Cosmos Hub',
  bech32Prefix: 'cosmos',
  bip44CoinType: 118,
}

const parseNumber = (value?: string): number | undefined => {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

const normalizeChainKey = (value?: string): string | null => {
  const sanitized = value?.trim().toLowerCase()
  return sanitized ? sanitized : null
}

const normalizePrefix = (value?: string): string | undefined => {
  const sanitized = value?.trim().toLowerCase()
  return sanitized ? sanitized : undefined
}

const parseCustomChainConfigs = (): CosmosChainConfig[] => {
  const raw = process.env.COSMOS_CHAIN_CONFIGS
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((entry: any) => {
        const key = normalizeChainKey(entry?.key)
        const prefix = normalizePrefix(entry?.bech32Prefix)
        const bip44CoinType =
          typeof entry?.bip44CoinType === 'number'
            ? entry.bip44CoinType
            : parseNumber(entry?.bip44CoinType)
        if (!key || !prefix || typeof bip44CoinType !== 'number') {
          return null
        }
        const name =
          typeof entry?.name === 'string' && entry.name.trim().length > 0
            ? entry.name.trim()
            : key.toUpperCase()

        return {
          key,
          name,
          bech32Prefix: prefix,
          bip44CoinType,
        }
      })
      .filter((entry: CosmosChainConfig | null): entry is CosmosChainConfig => !!entry)
  } catch {
    return []
  }
}

const getRegistry = (): Map<string, CosmosChainConfig> => {
  const registry = new Map<string, CosmosChainConfig>()
  registry.set(DEFAULT_COSMOS_CHAIN.key, DEFAULT_COSMOS_CHAIN)

  for (const config of parseCustomChainConfigs()) {
    registry.set(config.key, config)
  }

  return registry
}

const applyEnvOverrides = (config: CosmosChainConfig): CosmosChainConfig => {
  const prefixOverride = normalizePrefix(process.env.COSMOS_BECH32_PREFIX)
  const coinTypeOverride = parseNumber(process.env.COSMOS_COIN_TYPE)

  return {
    ...config,
    bech32Prefix: prefixOverride ?? config.bech32Prefix,
    bip44CoinType: coinTypeOverride ?? config.bip44CoinType,
  }
}

export const normalizeBip44CoinType = (coinType: number): number => {
  return coinType >= HARDENED_OFFSET ? coinType - HARDENED_OFFSET : coinType
}

export const getDefaultCosmosChainConfig = (): CosmosChainConfig => {
  const registry = getRegistry()
  const chainKey = normalizeChainKey(process.env.COSMOS_CHAIN)
  const base =
    (chainKey && registry.get(chainKey)) ||
    registry.get(DEFAULT_COSMOS_CHAIN.key) ||
    DEFAULT_COSMOS_CHAIN

  return applyEnvOverrides(base)
}

export const getCosmosChainConfigs = (): CosmosChainConfig[] => {
  const registry = getRegistry()
  const defaultConfig = getDefaultCosmosChainConfig()
  registry.set(defaultConfig.key, defaultConfig)
  return Array.from(registry.values())
}

export const isCosmosCoinType = (coinType: number): boolean => {
  const normalized = normalizeBip44CoinType(coinType)
  return getCosmosChainConfigs().some(config => config.bip44CoinType === normalized)
}

export const getCosmosChainConfigByCoinType = (coinType: number): CosmosChainConfig => {
  const normalized = normalizeBip44CoinType(coinType)
  const configs = getCosmosChainConfigs()
  const match = configs.find(config => config.bip44CoinType === normalized)
  if (match) {
    return match
  }

  const fallback = getDefaultCosmosChainConfig()
  return {
    ...fallback,
    bip44CoinType: normalized,
  }
}
