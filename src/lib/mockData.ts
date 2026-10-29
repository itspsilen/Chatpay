/**
 * Mock data service. Returns clearly labeled mock data until real
 * Arc explorer / RPC sources are wired up. Never fabricates real addresses.
 */

export interface TokenData {
  name: string
  symbol: string
  contract: string
  price: string
  marketCap: string
  liquidity: string
  holders: number
  recentTxCount: number
  createdAt: string
  riskFlags: string[]
  isMock: true
}

export interface NFTCollection {
  name: string
  contract: string
  mintDate: string
  supply: number
  mintPrice: string
  creator: string
  recentActivity: string
  isMock: true
}

export interface UpcomingMint {
  name: string
  date: string
  price: string
  sourceLink: string
  isMock: true
}

export interface NewToken extends TokenData {
  launchTime: string
}

export interface WebSearchResult {
  title: string
  snippet: string
  url: string
  isMock: true
}

export function mockLookupToken(query: string): TokenData {
  return {
    name: `${query} Token (MOCK)`,
    symbol: query.toUpperCase().slice(0, 6),
    contract: 'No real contract \u2014 this is mock data',
    price: '$0.00 (mock)',
    marketCap: '$0 (mock)',
    liquidity: '$0 (mock)',
    holders: 0,
    recentTxCount: 0,
    createdAt: 'N/A',
    riskFlags: ['[MOCK DATA \u2014 real data source not connected]'],
    isMock: true,
  }
}

export function mockListNewTokens(timeWindow: string): NewToken[] {
  void timeWindow // param reserved for real implementation
  const now = new Date().toISOString()
  return [
    {
      name: 'Mock Token A',
      symbol: 'MCKA',
      contract: 'No real contract \u2014 mock data',
      price: '$0.00',
      marketCap: '$0',
      liquidity: '$0',
      holders: 0,
      recentTxCount: 0,
      createdAt: now,
      launchTime: now,
      riskFlags: ['[MOCK DATA \u2014 real data source not connected]'],
      isMock: true as const,
    },
    {
      name: 'Mock Token B',
      symbol: 'MCKB',
      contract: 'No real contract \u2014 mock data',
      price: '$0.00',
      marketCap: '$0',
      liquidity: '$0',
      holders: 0,
      recentTxCount: 0,
      createdAt: now,
      launchTime: now,
      riskFlags: ['[MOCK DATA \u2014 real data source not connected]'],
      isMock: true as const,
    },
  ]
}

export function mockLookupNFT(collection: string): NFTCollection {
  return {
    name: `${collection} Collection (MOCK)`,
    contract: 'No real contract \u2014 mock data',
    mintDate: 'N/A',
    supply: 0,
    mintPrice: '$0.00',
    creator: 'N/A',
    recentActivity: 'No real activity \u2014 mock data',
    isMock: true,
  }
}

export function mockUpcomingMints(): UpcomingMint[] {
  return [
    {
      name: 'Mock NFT Project (MOCK)',
      date: 'TBD',
      price: 'TBD',
      sourceLink: '#',
      isMock: true,
    },
  ]
}

export function mockWebSearch(query: string): WebSearchResult[] {
  return [
    {
      title: `[MOCK] Search results for: ${query}`,
      snippet: 'Real web search is not connected. Results here are mock placeholders.',
      url: '#',
      isMock: true,
    },
  ]
}
