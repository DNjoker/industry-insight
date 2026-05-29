import MarkdownRenderer from './MarkdownRenderer'

interface Source {
  title: string
  url: string
  path: string
}

interface Props {
  reportContent: string
  sources: Source[]
}

export default function ReportView({ reportContent, sources }: Props) {
  return (
    <div className="p-6 bg-white border border-gray-200 rounded-lg">
      <MarkdownRenderer content={reportContent} />

      {sources.length > 0 && (
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold mb-3">参考来源</h3>
          <div className="space-y-2">
            {sources.map((s, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded hover:bg-gray-50">
                <span className="text-gray-400 text-sm mt-0.5">{i + 1}.</span>
                <div>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-sm font-medium"
                  >
                    {s.title}
                  </a>
                  <span className="text-gray-400 text-xs ml-2">
                    已保存至 Obsidian
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
