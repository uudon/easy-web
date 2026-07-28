import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href = '', children: linkChildren }) {
            const external = /^https?:\/\//.test(href)
            if (external) {
              return (
                <a href={href} rel="noreferrer" target="_blank">
                  {linkChildren}
                </a>
              )
            }
            return <Link href={href}>{linkChildren}</Link>
          },
          img({ alt = '', src }) {
            if (typeof src !== 'string') return null
            // Markdown images may be local or remote and do not always include dimensions.
            // eslint-disable-next-line @next/next/no-img-element
            return <img alt={alt} loading="lazy" src={src} />
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
