import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: string
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message || String(error) }
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-gray-50">
          <div className="text-center max-w-md p-8">
            <h2 className="text-xl font-bold text-gray-800 mb-3">页面出错了</h2>
            <p className="text-sm text-gray-500 mb-2">应用遇到了一个未预期的错误，请尝试刷新页面。</p>
            {this.state.error && (
              <p className="text-xs text-red-500 bg-red-50 p-2 rounded mb-4 break-all">{this.state.error}</p>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: '' })
                window.location.reload()
              }}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              刷新页面
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
