# Draft Workflow

Put pending Chinese articles under:

- `drafts/zh-cn/ai/`
- `drafts/zh-cn/programming/`
- `drafts/zh-cn/algorithms/`
- `drafts/zh-cn/architecture/`
- `drafts/zh-cn/project-management/`
- `drafts/zh-cn/thinking/`

Rules:

1. One draft per Markdown file.
2. The folder name is the topic.
3. The file name becomes the article slug unless you provide `slug:` in frontmatter.
4. Each draft must include either:
   - a level-1 heading like `# 文章标题`
   - or frontmatter `title: 文章标题`

Example:

```md
---
title: 什么是范围管理
slug: scope-management
---

# 什么是范围管理

正文内容...
```

Publish commands:

```bash
npm run drafts:publish -- --all
npm run drafts:publish -- --file drafts/zh-cn/ai/my-new-article.md
```

After publishing:

- the article is copied to `docs/zh-cn/topics/<topic>/`
- the draft is moved to `drafts/archive/`
- the Chinese topic list and homepage featured cards are refreshed automatically
