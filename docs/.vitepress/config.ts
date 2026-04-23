import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '施行的个人日记',
  description: '相信我，我的内容值得你停留',
  lang: 'zh-CN',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,
  head: [
    ['link', { rel: 'icon', href: '/logo-mark.svg' }],
    ['meta', { name: 'theme-color', content: '#0f172a' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: '施行的个人日记' }],
    ['meta', { property: 'og:description', content: '围绕 AI、编程、算法、架构和项目管理持续记录。' }]
  ],
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh-cn/',
      themeConfig: {
        nav: [
          { text: '首页', link: '/zh-cn/' },
          { text: '关于', link: '/zh-cn/about' },
          { text: 'AI', link: '/zh-cn/topics/ai/' },
          { text: '编程', link: '/zh-cn/topics/programming/' },
          { text: '算法', link: '/zh-cn/topics/algorithms/' },
          { text: '架构', link: '/zh-cn/topics/architecture/' },
          { text: '项目管理', link: '/zh-cn/topics/project-management/' },
          { text: '用户故事', link: '/zh-cn/stories/' },
          { text: '附录', link: '/zh-cn/appendix/' }
        ],
        sidebar: {
          '/zh-cn/': [
            {
              text: '开始',
              items: [
                { text: '关于我', link: '/zh-cn/about' },
                { text: '快速开始', link: '/zh-cn/getting-started' },
                { text: '分阶段成果', link: '/zh-cn/project/phases' }
              ]
            },
            {
              text: '学习路径',
              items: [
                { text: '零基础入门', link: '/zh-cn/tracks/foundation' },
                { text: '初中级开发', link: '/zh-cn/tracks/intermediate' },
                { text: '高级开发', link: '/zh-cn/tracks/advanced' }
              ]
            },
            {
              text: '实施指南',
              items: [
                { text: '阶段一：起站与品牌骨架', link: '/zh-cn/guides/stage-1' },
                { text: '阶段二：内容替换与课程结构', link: '/zh-cn/guides/stage-2' },
                { text: '阶段三：上线、运维与增长', link: '/zh-cn/guides/stage-3' }
              ]
            },
            {
              text: '主题专栏',
              items: [
                { text: 'AI', link: '/zh-cn/topics/ai/' },
                { text: '编程', link: '/zh-cn/topics/programming/' },
                { text: '算法', link: '/zh-cn/topics/algorithms/' },
                { text: '架构', link: '/zh-cn/topics/architecture/' },
                { text: '项目管理', link: '/zh-cn/topics/project-management/' },
                { text: '用户故事', link: '/zh-cn/stories/' },
                { text: '附录', link: '/zh-cn/appendix/' }
              ]
            },
            {
              text: '部署',
              items: [
                { text: '腾讯云 Ubuntu 22.04', link: '/zh-cn/deployment/tencent-cloud' },
                { text: '常见问题', link: '/zh-cn/faq' }
              ]
            }
          ]
        },
        footer: {
          message: '相信我，我的内容值得你停留。',
          copyright: 'Copyright © 2026 施行'
        },
        socialLinks: [{ icon: 'github', link: 'https://github.com/' }]
      }
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/en/' },
          { text: 'Chinese site', link: '/zh-cn/' }
        ]
      }
    }
  },
  themeConfig: {
    logo: '/logo-mark.svg',
    search: {
      provider: 'local'
    },
    outline: {
      level: [2, 3],
      label: '本页导航'
    },
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式'
  }
})
