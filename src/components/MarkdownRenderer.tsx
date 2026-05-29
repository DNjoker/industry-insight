import ReactMarkdown from 'react-markdown'

interface Props {
  content: string
}

export default function MarkdownRenderer({ content }: Props) {
  return (
    <div className="text-sm text-gray-800 leading-relaxed space-y-1">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => {
            const text = typeof children === 'string' ? children : ''
            if (href && href.startsWith('[[')) {
              return (
                <span className="text-blue-600 cursor-pointer hover:underline">
                  {text}
                </span>
              )
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                {children}
              </a>
            )
          },

          h2: ({ children }) => (
            <h2 className="text-base font-bold mt-5 mb-2 pb-1.5 border-b border-gray-200 text-gray-900">
              {children}
            </h2>
          ),

          h3: ({ children }) => (
            <h3 className="text-sm font-semibold mt-4 mb-1.5 text-gray-900">
              {children}
            </h3>
          ),

          h4: ({ children }) => (
            <h4 className="text-sm font-medium mt-3 mb-1 text-gray-800">
              {children}
            </h4>
          ),

          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-blue-400 pl-3 my-3 text-gray-600 text-xs">
              {children}
            </blockquote>
          ),

          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="min-w-full border-collapse border border-gray-300 text-xs">
                {children}
              </table>
            </div>
          ),

          th: ({ children }) => (
            <th className="border border-gray-300 px-3 py-1.5 bg-gray-100 text-left font-semibold text-gray-700">
              {children}
            </th>
          ),

          td: ({ children }) => (
            <td className="border border-gray-300 px-3 py-1.5 text-gray-700">
              {children}
            </td>
          ),

          code: ({ className, children }) => {
            const isInline = !className
            if (isInline) {
              return (
                <code className="bg-gray-100 text-red-600 px-1 py-0.5 rounded text-xs font-mono">
                  {children}
                </code>
              )
            }
            return (
              <code className={`${className} text-xs`}>
                {children}
              </code>
            )
          },

          pre: ({ children }) => (
            <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg my-3 overflow-x-auto text-xs">
              {children}
            </pre>
          ),

          ul: ({ children }) => (
            <ul className="list-disc pl-5 my-2 space-y-1 text-gray-700">
              {children}
            </ul>
          ),

          ol: ({ children }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1 text-gray-700">
              {children}
            </ol>
          ),

          strong: ({ children }) => (
            <strong className="font-semibold text-gray-900">
              {children}
            </strong>
          ),

          hr: () => (
            <hr className="my-4 border-gray-200" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
