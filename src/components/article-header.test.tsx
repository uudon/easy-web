import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ArticleHeader } from './article-header'

afterEach(cleanup)

describe('ArticleHeader', () => {
  it('shows a page avatar with accessible alternative text', () => {
    render(
      <ArticleHeader
        avatar="/images/about/shixing.jpg"
        avatarAlt="施行的个人头像"
        eyebrow="PAGE / ZH-CN"
        summary="大家好，我是施行。"
        title="关于我"
      />,
    )

    expect(screen.getByRole('heading', { name: '关于我' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '施行的个人头像' })).toHaveAttribute(
      'src',
      expect.stringContaining('shixing.jpg'),
    )
  })

  it('does not reserve an empty avatar area for regular pages', () => {
    const { container } = render(
      <ArticleHeader eyebrow="PAGE / EN" summary="Reference material" title="Appendix" />,
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('.article-header--profile')).toBeNull()
  })
})
