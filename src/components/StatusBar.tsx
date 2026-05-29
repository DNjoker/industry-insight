type Props = {
  status: 'connecting' | 'connected' | 'disconnected'
}

export default function StatusBar({ status }: Props) {
  const statusConfig = {
    connecting: { color: 'bg-yellow-400', text: '后端连接中...' },
    connected: { color: 'bg-green-400', text: '后端已连接' },
    disconnected: { color: 'bg-red-400', text: '后端未连接' },
  }

  const config = statusConfig[status]

  return (
    <div className="flex items-center gap-2 px-4 py-1 bg-gray-800 text-gray-300 text-xs">
      <span className={`w-2 h-2 rounded-full ${config.color}`} />
      <span>{config.text}</span>
    </div>
  )
}
