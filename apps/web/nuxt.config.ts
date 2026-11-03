import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-30',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  modules: [],
  vite: {
    plugins: [tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
        },
      },
    },
  },
  runtimeConfig: {
    public: {
      appName: '单词簿',
      // 部署时可用环境变量 NUXT_PUBLIC_API_BASE 覆盖。
      apiBase: '/api',
    },
  },
  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },
  app: {
    head: {
      title: '单词簿 · 课本同步单词学习',
      htmlAttrs: { lang: 'zh-CN' },
      meta: [
        { name: 'description', content: '面向小学、初中学生的课本同步单词学习工具，家长可控的激励记账。' },
        { name: 'theme-color', content: '#f7f4ed' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
    pageTransition: { name: 'page', mode: 'out-in' },
  },
  typescript: {
    strict: true,
    typeCheck: false,
  },
  components: [
    { path: '~/components', pathPrefix: false },
  ],
})
