import type { AppNavItem } from '../types'
import { CONSOLE_PAGE_PATH } from './console'

const navConfig = [
  { label: '服务器列表', to: '/', icon: 'server' },
  { label: '购买商品', to: '/pay', icon: 'pay' },
  { label: '查询订单', to: '/query', icon: 'query' },
  { label: '数据统计', to: '/stats', icon: 'stats' },
  { label: '查询玩家', to: '/player', icon: 'player', requiresAuth: true },
  { label: '魔怔排行榜', to: '/challenge', icon: 'challenge' },
  { label: '服务状态', to: 'https://status.kaish.cn', icon: 'status' },
  { label: '后台管理', to: CONSOLE_PAGE_PATH, icon: 'admin', requiresAuth: true },
] satisfies AppNavItem[]

export function buildNavItems(currentPath: string): AppNavItem[] {
  return navConfig.map((item) => ({
    ...item,
    current: item.to === currentPath,
  }))
}
