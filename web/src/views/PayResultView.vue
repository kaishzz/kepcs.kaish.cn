<script setup lang="ts">
import dayjs from 'dayjs'
import {
  NButton,
  NCard,
  NGrid,
  NGi,
  NTag,
} from 'naive-ui'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import AppShell from '../components/AppShell.vue'
import { http } from '../lib/api'
import { buildNavItems } from '../lib/navigation'
import { mergeOrderSnapshot, resolveLastOrderNo, storeOrder } from '../lib/orderStorage'
import { pushToast } from '../lib/toast'
import type { OrderItem } from '../types'

const route = useRoute()
const order = ref<OrderItem | null>(null)
const loading = ref(false)
const pollAttempts = ref(0)
let timer: number | null = null

const navItems = buildNavItems('/pay')

const statusTips = [
  '当前页面会自动刷新订单状态.',
  '如未完成支付, 仍可继续打开支付链接.',
  '支付成功后无需手动刷新整个页面.',
]

function currentOrderNo() {
  const routeOrderNo = String(route.query.orderNo || '').trim()
  return routeOrderNo || resolveLastOrderNo()
}

function formatDate(value?: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'
}

function stopPolling() {
  if (timer != null) {
    window.clearTimeout(timer)
    timer = null
  }
}

function statusType(status?: string) {
  if (status === 'PAID') return 'success'
  if (status === 'PENDING') return 'warning'
  return 'default'
}

async function loadOrder() {
  const orderNo = currentOrderNo()

  if (!orderNo) {
    return
  }

  loading.value = true

  try {
    const { data } = await http.get(`/pay/api/orders/${encodeURIComponent(orderNo)}`)
    order.value = mergeOrderSnapshot(order.value, data.order)
    storeOrder(order.value)
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

function schedulePoll() {
  const orderNo = currentOrderNo()

  if (!orderNo || pollAttempts.value >= 20) {
    return
  }

  stopPolling()
  timer = window.setTimeout(async () => {
    await loadOrder()

    if (order.value?.status === 'PAID') {
      pushToast('订单已支付成功, 当前页面已自动刷新到最新状态', 'success')
      stopPolling()
      return
    }

    pollAttempts.value += 1
    schedulePoll()
  }, 3500)
}

onMounted(async () => {
  await loadOrder()

  if (order.value && order.value.status !== 'PAID') {
    pushToast('已开始自动检测订单状态, 支付成功后会自动刷新', 'info')
    schedulePoll()
  }
})

onBeforeUnmount(stopPolling)
</script>

<template>
  <AppShell
    title="支付结果"
    subtitle="当前页面会自动刷新订单状态"
    badge="订单状态"
    :nav-items="navItems"
  >
    <NGrid cols="1 xl:2" x-gap="18" y-gap="18">
      <NGi>
        <NCard title="订单状态" class="surface-card h-full">
          <div v-if="order" class="panel-grid">
            <div class="detail-grid">
              <div class="detail-tile">
                <div class="detail-tile__label">订单号</div>
                <div class="detail-tile__value">{{ order.orderNo }}</div>
              </div>
              <div class="detail-tile">
                <div class="detail-tile__label">商品类型</div>
                <div class="detail-tile__value">{{ order.productType === 'WHITELIST' ? '开水服白名单' : order.productType === 'CDK' ? 'CDK 商品' : '自定义商品' }}</div>
              </div>
              <div class="detail-tile">
                <div class="detail-tile__label">SteamID64</div>
                <div class="detail-tile__value">{{ order.steamId64 || '-' }}</div>
              </div>
              <div class="detail-tile">
                <div class="detail-tile__label">QQ</div>
                <div class="detail-tile__value">{{ order.qq || '-' }}</div>
              </div>
              <div class="detail-tile">
                <div class="detail-tile__label">Email</div>
                <div class="detail-tile__value">{{ order.email || '-' }}</div>
              </div>
              <div class="detail-tile">
                <div class="detail-tile__label">备注</div>
                <div class="detail-tile__value">{{ order.remark || '-' }}</div>
              </div>
              <div class="detail-tile">
                <div class="detail-tile__label">状态</div>
                <div class="flex items-center gap-3">
                  <NTag :round="false" :type="statusType(order.status)">{{ order.status }}</NTag>
                </div>
              </div>
              <div class="detail-tile">
                <div class="detail-tile__label">创建时间</div>
                <div class="detail-tile__value">{{ formatDate(order.createdAt) }}</div>
              </div>
            </div>

            <div class="panel-grid">
              <NButton
                v-if="order.status === 'PENDING' && order.paymentUrl"
                type="primary"
                block
                tag="a"
                :href="order.paymentUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                继续支付
              </NButton>
              <RouterLink to="/query">
                <NButton block secondary>查询订单</NButton>
              </RouterLink>
            </div>
          </div>

          <div v-else class="hero-note">
            <div class="hero-note__inner">
              <div class="hero-note__title">{{ loading ? '正在加载订单状态' : '暂时没有拿到订单信息' }}</div>
              <div class="hero-note__desc">如果你刚完成支付, 可以稍后重新打开本页查看结果.</div>
            </div>
          </div>
        </NCard>
      </NGi>

      <NGi>
        <NCard title="状态说明" class="surface-card h-full">
          <div class="hero-note">
            <div class="hero-note__inner">
              <div class="grid gap-3 text-[14px] leading-[1.9] text-[#c7ccd6]">
                <p v-for="item in statusTips" :key="item" class="m-0">{{ item }}</p>
              </div>
            </div>
          </div>
        </NCard>
      </NGi>
    </NGrid>
  </AppShell>
</template>
