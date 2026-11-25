export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuth()

  if (!auth.ready.value) {
    await auth.fetchMe()
  }

  if (to.path === '/login' || to.path === '/register') {
    if (auth.user.value) {
      return navigateTo(auth.home.value)
    }
    return
  }

  if (!auth.user.value) {
    // 首页是公开落地页：未登录也能看介绍。
    if (to.path === '/') return
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }

  // 首页登录与否都能自由访问，不再强制跳工作台；想进工作台点首页的按钮。
  if (to.path === '/') return

  const role = auth.user.value.role
  const restricted: Record<string, string> = {
    '/student': 'student',
    '/parent': 'parent',
    '/admin': 'admin',
  }
  for (const [prefix, expected] of Object.entries(restricted)) {
    if (to.path === prefix || to.path.startsWith(`${prefix}/`)) {
      if (role !== expected) return navigateTo(auth.roleHome(role))
    }
  }
})
