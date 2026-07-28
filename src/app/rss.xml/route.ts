import { contentRepository } from '@/lib/content'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tangyingbao.com'

export function GET() {
  const posts = contentRepository.getPosts().slice(0, 50)
  const items = posts
    .map(
      (post) => `<item>
  <title>${escapeXml(post.title)}</title>
  <link>${siteUrl}/${post.locale}/blog/${post.slug}</link>
  <guid>${siteUrl}/${post.locale}/blog/${post.slug}</guid>
  <pubDate>${new Date(`${post.date}T00:00:00.000Z`).toUTCString()}</pubDate>
  <description>${escapeXml(post.summary)}</description>
</item>`,
    )
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>施行的个人日记</title>
  <link>${siteUrl}</link>
  <description>围绕 AI、编程、算法、架构、项目管理和思考持续记录。</description>
  <language>zh-CN</language>
  ${items}
</channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;',
    }
    return entities[character]
  })
}
