/**
 * Data service for onchain data. Reads Arc RPC/explorer when available.
 * Falls back to clearly labeled mock data when sources are not connected.
 */
import {
  mockLookupToken,
  mockListNewTokens,
  mockLookupNFT,
  mockUpcomingMints,
  mockWebSearch,
  type TokenData,
  type NFTCollection,
  type UpcomingMint,
  type NewToken,
  type WebSearchResult,
} from '../src/lib/mockData'

const ARC_EXPLORER = process.env.ARC_EXPLORER_URL ?? ''

/** Look up a token by name/symbol or contract address. */
export async function lookupToken(query: string): Promise<TokenData> {
  // When a real Arc explorer API is available, call it here.
  // For now, return mock data clearly labeled.
  if (ARC_EXPLORER && query.startsWith('0x')) {
    // Placeholder for: GET ${ARC_EXPLORER}/api/v2/tokens/${query}
  }
  return mockLookupToken(query)
}

/** List new tokens launched in a time window. */
export async function listNewTokens(timeWindow: string): Promise<NewToken[]> {
  // Placeholder for Arc explorer token list endpoint
  return mockListNewTokens(timeWindow)
}

/** Look up an NFT collection. */
export async function lookupNFT(collection: string): Promise<NFTCollection> {
  return mockLookupNFT(collection)
}

/** Upcoming NFT mints on Arc. */
export async function upcomingMints(): Promise<UpcomingMint[]> {
  return mockUpcomingMints()
}

/** Web search for context (placeholder). */
export async function webSearch(query: string): Promise<WebSearchResult[]> {
  return mockWebSearch(query)
}
