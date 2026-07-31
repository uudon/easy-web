import { z } from 'zod'

const routeSegment = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const safeText = /^[^<>]*$/

export const contentWriteSchema = z.object({
  locale: z.enum(['zh-cn', 'en']),
  slug: z.string().min(1).max(100).regex(routeSegment),
  title: z.string().trim().min(1).max(160).regex(safeText),
  summary: z.string().trim().max(360).regex(safeText),
  category: z.string().min(1).max(60).regex(routeSegment),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`)
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    }),
  body: z.string().min(1).max(500_000),
  translationKey: z.string().min(1).max(100).regex(routeSegment).optional(),
})

export type ContentWriteInput = z.infer<typeof contentWriteSchema>

export function toContentFile(input: ContentWriteInput) {
  const content = [
    '---',
    `title: ${JSON.stringify(input.title)}`,
    `summary: ${JSON.stringify(input.summary)}`,
    `date: ${JSON.stringify(input.date)}`,
    `locale: ${JSON.stringify(input.locale)}`,
    `category: ${JSON.stringify(input.category)}`,
    `slug: ${JSON.stringify(input.slug)}`,
    `originalPath: ${JSON.stringify(`/${input.locale}/blog/${input.slug}`)}`,
    ...(input.translationKey
      ? [`translationKey: ${JSON.stringify(input.translationKey)}`]
      : []),
    '---',
    '',
    input.body.trim(),
    '',
  ].join('\n')

  return {
    path: `content/posts/${input.locale}/${input.slug}.md`,
    content,
  }
}
