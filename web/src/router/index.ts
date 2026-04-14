import { createRouter, createWebHistory } from 'vue-router'
import { CONSOLE_PAGE_PATH } from '../lib/console'

const routeViewLoaders = {
  '/': () => import('../views/HomeView.vue'),
  '/pay': () => import('../views/PayView.vue'),
  '/pay/result': () => import('../views/PayResultView.vue'),
  '/query': () => import('../views/QueryView.vue'),
  '/player': () => import('../views/PlayerLookupView.vue'),
  '/challenge': () => import('../views/MapChallengeView.vue'),
  '/stats': () => import('../views/StatsView.vue'),
  [CONSOLE_PAGE_PATH]: () => import('../views/CdkView.vue'),
} as const

const routeViewTasks = new Map<string, Promise<unknown>>()

export function preloadRouteView(path: string) {
  const normalizedPath = String(path || '').split('#')[0].split('?')[0] || '/'
  const loader = routeViewLoaders[normalizedPath as keyof typeof routeViewLoaders]

  if (!loader) {
    return Promise.resolve()
  }

  if (!routeViewTasks.has(normalizedPath)) {
    routeViewTasks.set(
      normalizedPath,
      loader().catch((error) => {
        routeViewTasks.delete(normalizedPath)
        throw error
      }),
    )
  }

  return routeViewTasks.get(normalizedPath)!.then(() => undefined)
}

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }

    if (to.hash) {
      return {
        el: to.hash,
        top: 24,
        behavior: 'smooth',
      }
    }

    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      component: routeViewLoaders['/'],
    },
    {
      path: '/pay',
      component: routeViewLoaders['/pay'],
    },
    {
      path: '/pay/result',
      component: routeViewLoaders['/pay/result'],
    },
    {
      path: '/query',
      component: routeViewLoaders['/query'],
    },
    {
      path: '/player',
      component: routeViewLoaders['/player'],
    },
    {
      path: '/challenge',
      component: routeViewLoaders['/challenge'],
    },
    {
      path: '/stats',
      component: routeViewLoaders['/stats'],
    },
    {
      path: CONSOLE_PAGE_PATH,
      component: routeViewLoaders[CONSOLE_PAGE_PATH],
    },
  ],
})

export default router
