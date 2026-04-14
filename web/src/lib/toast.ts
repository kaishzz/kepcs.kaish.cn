export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  message: string
  type: ToastType
  duration: number
}

const listeners = new Set<(toast: ToastItem) => void>()

export function pushToast(message: string, type: ToastType = 'info', duration = 2800) {
  if (window.$message) {
    if (type === 'success') {
      window.$message.success(message, { duration })
      return
    }

    if (type === 'error') {
      window.$message.error(message, { duration })
      return
    }

    window.$message.info(message, { duration })
    return
  }

  const toast: ToastItem = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    message,
    type,
    duration,
  }

  listeners.forEach((listener) => listener(toast))
}

export function subscribeToast(listener: (toast: ToastItem) => void) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
