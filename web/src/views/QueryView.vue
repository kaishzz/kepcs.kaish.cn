<script setup lang="ts">
import dayjs from 'dayjs'
import {
  NButton,
  NCard,
  NCollapseTransition,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSpace,
  NTag,
} from 'naive-ui'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppShell from '../components/AppShell.vue'
import { http } from '../lib/api'
import { buildNavItems } from '../lib/navigation'
import { pushToast } from '../lib/toast'
import type { OrderItem } from '../types'

const loading = ref(false)
const orders = ref<OrderItem[]>([])
const expandedOrders = ref<string[]>([])
const resultModalOpen = ref(false)
const route = useRoute()
const router = useRouter()

const form = ref({
  email: '',
  orderNo: '',
})

const navItems = buildNavItems('/query')

async function queryOrders() {
  loading.value = true

  try {
    const { data } = await http.get('/pay/api/orders', {
      params: {
        email: form.value.email.trim(),
        orderNo: form.value.orderNo.trim() || undefined,
      },
    })

    orders.value = data.orders || []
    expandedOrders.value = []
    resultModalOpen.value = true
    pushToast(`查询完成, 共找到 ${orders.value.length} 条订单`, 'success')
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

async function submitQuery() {
  await router.replace({
    path: '/query',
    query: {
      email: form.value.email.trim() || undefined,
      orderNo: form.value.orderNo.trim() || undefined,
    },
  })

  await queryOrders()
}

function formatDate(value?: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'
}

function isExpanded(orderNo: string) {
  return expandedOrders.value.includes(orderNo)
}

function toggleExpanded(orderNo: string) {
  expandedOrders.value = isExpanded(orderNo)
    ? expandedOrders.value.filter((item) => item !== orderNo)
    : [...expandedOrders.value, orderNo]
}

function statusType(status?: string) {
  if (status === 'PAID') return 'success'
  if (status === 'PENDING') return 'warning'
  return 'default'
}

onMounted(() => {
  form.value.email = String(route.query.email || '').trim()
  form.value.orderNo = String(route.query.orderNo || '').trim()

  if (form.value.email || form.value.orderNo) {
    void queryOrders()
  }
})
</script>

<template>
  <AppShell
    title="查询订单"
    subtitle="输入邮箱或订单号查看支付记录"
    badge="查询订单"
    :nav-items="navItems"
  >
    <div class="page-stack page-stack--narrow page-stack--relaxed page-stack--centered-form">
      <NCard class="surface-card query-panel-card">
        <div class="query-panel-header">
          <div>
            <p class="query-panel-header__eyebrow">Order Center</p>
            <h2 class="query-panel-header__title">查询订单</h2>
            <p class="query-panel-header__desc">支持通过邮箱查询历史订单, 也可以直接使用订单号精确定位单笔订单.</p>
          </div>
        </div>

        <NForm label-placement="top" class="query-panel-form">
          <div class="query-panel-form__grid">
            <NFormItem label="邮箱">
                    <NInput v-model:value="form.email" placeholder="xxx@example.com" />
            </NFormItem>
            <NFormItem label="订单号">
              <NInput v-model:value="form.orderNo" placeholder="填写后可精确查询 (可选)" />
            </NFormItem>
          </div>
          <NButton type="primary" size="large" class="query-panel-form__submit" :loading="loading" @click="submitQuery">查询订单</NButton>
        </NForm>
      </NCard>
    </div>

    <NModal v-model:show="resultModalOpen" preset="card" title="查询结果" class="query-result-modal">
      <div v-if="!orders.length" class="hero-note query-result-modal__empty">
        <div class="hero-note__inner">
          <div class="hero-note__title">暂时没有结果</div>
          <div class="hero-note__desc">当前条件下没有查询到订单记录, 可以检查邮箱或订单号后重试.</div>
        </div>
      </div>

      <div v-else class="panel-grid query-result-modal__content">
        <article
          v-for="order in orders"
          :key="order.orderNo"
          class="fold-card fold-card--query-result"
          :class="{ 'fold-card--expanded': isExpanded(order.orderNo) }"
        >
          <button class="fold-card__trigger" type="button" @click="toggleExpanded(order.orderNo)">
            <div class="fold-card__title">
              <strong>{{ order.orderNo }}</strong>
              <span>{{ formatDate(order.createdAt) }}</span>
            </div>

            <div class="fold-card__meta">
              <NTag :round="false" :type="statusType(order.status)">{{ order.status }}</NTag>
              <span class="fold-card__arrow" :class="{ 'is-open': isExpanded(order.orderNo) }">⌄</span>
            </div>
          </button>

          <NCollapseTransition :show="isExpanded(order.orderNo)">
            <div class="fold-card__body">
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
                  <div class="detail-tile__value">{{ order.status }}</div>
                </div>
                <div class="detail-tile">
                  <div class="detail-tile__label">创建时间</div>
                  <div class="detail-tile__value">{{ formatDate(order.createdAt) }}</div>
                </div>
              </div>

              <NSpace v-if="order.status === 'PENDING' && order.paymentUrl" class="mt-4" vertical :size="12">
                <NButton
                  type="primary"
                  block
                  tag="a"
                  :href="order.paymentUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  继续支付
                </NButton>
                <RouterLink :to="`/pay/result?orderNo=${encodeURIComponent(order.orderNo)}`">
                  <NButton block secondary>查看结果页</NButton>
                </RouterLink>
              </NSpace>
            </div>
          </NCollapseTransition>
        </article>
      </div>
    </NModal>
  </AppShell>
</template>
