import Image from 'next/image'

type ArticleHeaderProps = {
  eyebrow: string
  title: string
  summary?: string
  avatar?: string
  avatarAlt?: string
}

export function ArticleHeader({
  eyebrow,
  title,
  summary,
  avatar,
  avatarAlt = title,
}: ArticleHeaderProps) {
  if (!avatar) {
    return (
      <header className="article-header">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {summary ? <p>{summary}</p> : null}
      </header>
    )
  }

  return (
    <header className="article-header article-header--profile">
      <div className="article-header__copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {summary ? <p className="article-header__summary">{summary}</p> : null}
      </div>
      <figure className="article-header__avatar-frame">
        <Image
          alt={avatarAlt}
          className="article-header__avatar"
          height={440}
          priority
          sizes="(max-width: 760px) 148px, 220px"
          src={avatar}
          width={440}
        />
      </figure>
    </header>
  )
}
