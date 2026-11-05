// 令牌自动刷新：页面打开、切回可见、每 30 分钟检查一次，快到期就换新。
// 请求前 useApi 也会检查，这里覆盖长时间开着页面、一直没发请求的场景。
export default defineNuxtPlugin(() => {
  const api = useApi()
  const check = () => {
    void api.refreshTokenIfNeeded()
  }
  check()
  window.setInterval(check, 30 * 60 * 1000)
  const onVisible = () => {
    if (!document.hidden) check()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
})
