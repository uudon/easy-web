export type MarkdownStats = {
  wordCount: number
  characterCount: number
  readingTimeMinutes: number
}

export function getMarkdownStats(markdown: string): MarkdownStats {
  const prose = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^[\s>*#+=-]+/gm, '')
    .replace(/[*_~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!prose) return { wordCount: 0, characterCount: 0, readingTimeMinutes: 0 }

  const chineseCharacters = prose.match(/[\p{Script=Han}]/gu)?.length ?? 0
  const nonChineseWords =
    prose
      .replace(/[\p{Script=Han}]/gu, ' ')
      .match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0
  const wordCount = chineseCharacters + nonChineseWords
  const characterCount = prose.replace(/\s/g, '').length
  return {
    wordCount,
    characterCount,
    readingTimeMinutes: wordCount === 0 ? 0 : Math.ceil(wordCount / 250),
  }
}
