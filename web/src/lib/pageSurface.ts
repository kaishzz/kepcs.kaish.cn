import { nextTick } from 'vue'

export function getPageSurfaceElement(root?: ParentNode | null) {
  if (typeof document === 'undefined') {
    return null
  }

  if (root && 'querySelector' in root) {
    return root.querySelector('.page-surface') as HTMLElement | null
  }

  return document.querySelector('.page-surface') as HTMLElement | null
}

export function capturePageSurfaceScroll(root?: ParentNode | null) {
  return getPageSurfaceElement(root)?.scrollTop ?? 0
}

export async function restorePageSurfaceScroll(scrollTop: number, root?: ParentNode | null) {
  await nextTick()

  const pageSurface = getPageSurfaceElement(root)

  if (!pageSurface) {
    return
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const maxScrollTop = Math.max(0, pageSurface.scrollHeight - pageSurface.clientHeight)
      pageSurface.scrollTop = Math.min(scrollTop, maxScrollTop)
    })
  })
}
