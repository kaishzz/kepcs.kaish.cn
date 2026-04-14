import type { OrderItem } from '../types'

const LAST_ORDER_KEY = 'kepcs-pay-last-order-no'
const ORDER_INDEX_KEY = 'kepcs-pay-order-index'
const MAX_STORED_ORDERS = 20

function getOrderStorageKey(orderNo: string) {
  return `kepcs-pay-order:${orderNo}`
}

function loadOrderIndex() {
  try {
    const raw = window.localStorage.getItem(ORDER_INDEX_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : []
  } catch {
    return []
  }
}

function loadStoredOrder(orderNo?: string | null) {
  if (!orderNo) {
    return null
  }

  try {
    const raw = window.localStorage.getItem(getOrderStorageKey(orderNo))
    return raw ? (JSON.parse(raw) as OrderItem) : null
  } catch {
    return null
  }
}

function storeOrder(order?: OrderItem | null) {
  if (!order?.orderNo) {
    return
  }

  try {
    window.localStorage.setItem(getOrderStorageKey(order.orderNo), JSON.stringify(order))
    window.localStorage.setItem(LAST_ORDER_KEY, order.orderNo)
    const nextIndex = [order.orderNo, ...loadOrderIndex().filter((item) => item !== order.orderNo)].slice(0, MAX_STORED_ORDERS)
    window.localStorage.setItem(ORDER_INDEX_KEY, JSON.stringify(nextIndex))
  } catch {
    // ignore
  }
}

function mergeOrderSnapshot(current?: OrderItem | null, next?: OrderItem | null) {
  if (!next?.orderNo) {
    return next ?? null
  }

  const stored = loadStoredOrder(next.orderNo)

  return {
    ...stored,
    ...current,
    ...next,
    paymentUrl: next.paymentUrl || current?.paymentUrl || stored?.paymentUrl || null,
    qrCode: next.qrCode || current?.qrCode || stored?.qrCode || null,
    payType: next.payType || current?.payType || stored?.payType || null,
    payInfo: next.payInfo || current?.payInfo || stored?.payInfo || null,
  } as OrderItem
}

function resolveLastOrderNo() {
  return window.localStorage.getItem(LAST_ORDER_KEY) || ''
}

function listStoredOrders() {
  const indexedOrders = loadOrderIndex()
    .map((orderNo) => loadStoredOrder(orderNo))
    .filter((order): order is OrderItem => Boolean(order?.orderNo))

  if (indexedOrders.length) {
    return indexedOrders
  }

  const fallbackOrder = loadStoredOrder(resolveLastOrderNo())
  return fallbackOrder ? [fallbackOrder] : []
}

export {
  listStoredOrders,
  loadStoredOrder,
  mergeOrderSnapshot,
  resolveLastOrderNo,
  storeOrder,
}
