'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'

export function ConnectWallet() {
  const { address, isConnected, isConnecting, isReconnecting } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  if (isReconnecting) return <div>Reconnecting...</div>

  if (!isConnected) {
    return (
      <div className="flex flex-col gap-2">
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            onClick={() => connect({ connector })}
            disabled={isConnecting}
          >
            Connect {connector.name}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-sm">
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </span>
      <button onClick={() => disconnect()}>Disconnect</button>
    </div>
  )
}