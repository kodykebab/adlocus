'use client'

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'
import { Button } from '@/components/ui/button'

export function ConnectWallet() {
  const { address, isConnected, isConnecting, isReconnecting } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const isWrongNetwork = isConnected && chainId !== baseSepolia.id

  if (isReconnecting) {
    return (
      <div className="text-sm text-muted-foreground font-mono animate-pulse">
        Reconnecting...
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col gap-2">
        {connectors.map((connector) => (
          <Button
            key={connector.uid}
            variant="outline"
            size="sm"
            onClick={() => connect({ connector })}
            disabled={isConnecting}
            className="rounded-full border-foreground/20 hover:bg-foreground/5 font-mono text-sm"
          >
            {isConnecting ? 'Connecting...' : `Connect ${connector.name}`}
          </Button>
        ))}
      </div>
    )
  }

  if (isWrongNetwork) {
    return (
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1 rounded-full">
          Wrong network
        </span>
        <Button
          size="sm"
          onClick={() => switchChain({ chainId: baseSepolia.id })}
          className="rounded-full text-sm bg-amber-500 hover:bg-amber-400 text-black"
        >
          Switch to Base Sepolia
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className="font-mono text-sm text-muted-foreground">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/50 border border-foreground/10 px-1.5 py-0.5 rounded">
          Base Sepolia
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => disconnect()}
        className="rounded-full border-foreground/20 hover:bg-foreground/5 text-sm"
      >
        Disconnect
      </Button>
    </div>
  )
}
