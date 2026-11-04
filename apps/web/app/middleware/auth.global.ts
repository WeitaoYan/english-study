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
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }

  const role = auth.user.value.role
  if (to.path === '/') {
    return navigateTo(auth.roleHome(role))
  }

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
