---
title: "快速开始"
summary: "这个项目不是从零自研，而是沿着 easyvibe 的落地路线，重建出一个适合“施行的个人日记”的站点基础设施。"
date: "2026-04-23"
locale: "zh-cn"
pagePath: "getting-started"
originalPath: "/zh-cn/getting-started"
---

这个项目不是从零自研，而是沿着 `easy-vibe` 的落地路线，重建出一个适合“施行的个人日记”的站点基础设施。

## 本地启动

```bash
npm install
npm run dev
```

## 关键目录

```text
docs/
  .vitepress/
    config.ts
    theme/
  zh-cn/
    index.md
    guides/
    deployment/
    project/
  en/
```

## 当前品牌参数

- 站点名称：施行的个人日记
- 一句话介绍：相信我，我的内容值得你停留
- 目标用户：一起进步，共同学习
- 核心栏目：AI、编程、算法、架构、项目管理

## 你最先会继续改的文件

- `docs/.vitepress/config.ts`
- `docs/.vitepress/theme/custom.css`
- `docs/zh-cn/index.md`
- `docs/zh-cn/guides/*.md`
