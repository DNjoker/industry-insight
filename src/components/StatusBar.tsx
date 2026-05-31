type Props = {
  status: 'connecting' | 'connected' | 'disconnected' | 'restarting'
}

export default function StatusBar({ status }: Props) {
  const statusConfig: Record<string, { color: string; text: string }> = {
    connecting: { color: 'bg-yellow-400', text: '后端连接中...' },
    connected: { color: 'bg-green-400', text: '后端已连接' },
    disconnected: { color: 'bg-red-400', text: '后端未连接 — 请重启应用' },
    restarting: { color: 'bg-yellow-400 animate-pulse', text: '后端异常重启中...' },
  }

  const config = statusConfig[status] || statusConfig.connected

  return (
    <div className="flex items-center gap-2 px-4 py-1 bg-gray-800 text-gray-300 text-xs">
      <span className={`w-2 h-2 rounded-full ${config.color}`} />
      <span>{config.text}</span>
    </div>
  )
}
