/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { getDefaultConfig } from 'connectkit'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

const wcProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined

export const config = wcProjectId
  ? createConfig(
      getDefaultConfig({
        appName: 'ChatPay',
        walletConnectProjectId: wcProjectId,
        chains: [arcTestnet, mainnet],
        transports: {
          [arcTestnet.id]: http(),
          [mainnet.id]: http(),
        },
      }),
    )
  : createConfig({
      chains: [arcTestnet, mainnet],
      connectors: [injected()],
      transports: {
        [arcTestnet.id]: http(),
        [mainnet.id]: http(),
      },
    })
