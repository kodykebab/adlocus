'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Button } from '@/components/ui/button'

export function ConnectWallet() {
  const { address, isConnected, isConnecting, isReconnecting } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  if (isReconnecting) {
    return (
      <div className="text-sm text-muted-foreground font-mono">
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
            Connect {connector.name}
          </Button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-sm text-muted-foreground">
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </span>
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
