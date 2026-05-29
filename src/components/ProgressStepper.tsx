interface ProgressEvent {
  step: string
  progress: number
  message: string
}

interface Props {
  progress: ProgressEvent
  events: ProgressEvent[]
}

const stepLabels: Record<string, string> = {
  parse: '解析',
  search: '搜索',
  extract: '提取',
  analyze: '分析',
  save: '保存',
  done: '完成',
}

export default function ProgressStepper({ progress, events }: Props) {
  const steps = ['parse', 'search', 'extract', 'analyze', 'save', 'done']
  const currentStepIndex = steps.indexOf(progress.step)

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg">
      <div className="flex items-center gap-2 mb-3">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center gap-2 flex-1">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                i < currentStepIndex
                  ? 'bg-green-500 text-white'
                  : i === currentStepIndex
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-400'
              }`}
            >
              {i < currentStepIndex ? '✓' : i + 1}
            </div>
            <span
              className={`text-xs ${
                i <= currentStepIndex ? 'text-gray-700' : 'text-gray-300'
              }`}
            >
              {stepLabels[step]}
            </span>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 ${
                  i < currentStepIndex ? 'bg-green-400' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${progress.progress}%` }}
        />
      </div>

      <p className="text-sm text-gray-600">{progress.message}</p>

      {/* Event log */}
      {events.length > 1 && (
        <div className="mt-3 pt-3 border-t border-gray-100 max-h-32 overflow-y-auto">
          {events.map((e, i) => (
            <p key={i} className="text-xs text-gray-400 py-0.5">
              {e.message}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
