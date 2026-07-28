import type { Locale } from './content'

const categoryLabels: Record<string, { 'zh-cn': string; en: string }> = {
  ai: { 'zh-cn': '人工智能', en: 'AI' },
  algorithms: { 'zh-cn': '算法', en: 'Algorithms' },
  architecture: { 'zh-cn': '架构', en: 'Architecture' },
  programming: { 'zh-cn': '编程', en: 'Programming' },
  'project-management': { 'zh-cn': '项目管理', en: 'Project management' },
  thinking: { 'zh-cn': '思考', en: 'Thinking' },
}

export function categoryLabel(category: string, locale: Locale) {
  return categoryLabels[category]?.[locale] ?? category
}

export function formatDate(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'zh-cn' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`))
}
