<script setup lang="ts">
import {
  NButton,
  NCard,
  NCollapseTransition,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NTag,
  NText,
} from 'naive-ui'
import { computed, onMounted, ref } from 'vue'

import AppShell from '../components/AppShell.vue'
import { http } from '../lib/api'
import { buildNavItems } from '../lib/navigation'
import { listStoredOrders, loadStoredOrder, mergeOrderSnapshot, resolveLastOrderNo, storeOrder } from '../lib/orderStorage'
import { pushToast } from '../lib/toast'
import type { OrderItem, ProductItem } from '../types'

const products = ref<ProductItem[]>([])
const loading = ref(false)
const productLoading = ref(false)
const currentOrder = ref<OrderItem | null>(null)
const recentOrders = ref<OrderItem[]>([])
const expandedOrders = ref<string[]>([])
const confirmDialogOpen = ref(false)
const orderStatusOpen = ref(false)

const form = ref({
  productCode: '',
  steamId64: '',
  qq: '',
  email: '',
  remark: '',
  paymentType: 'alipay' as 'alipay' | 'wxpay',
})

const navItems = computed(() => buildNavItems('/pay'))

const refundItems = [
  '用户支付成功并成功进行购买后, 不支持无理由退款.',
  '因自行填写错误信息, 误购, 个人原因不再使用等非平台责任情形, 原则上不予退款.',
]

const activeProduct = computed(() =>
  products.value.find((item) => item.code === form.value.productCode) ?? null,
)

const activeProductTypeLabel = computed(() => {
  if (activeProduct.value?.productType === 'WHITELIST') return '开水服白名单'
  if (activeProduct.value?.productType === 'WHITELIST_CDK') return '开水服白名单 CDK'
  if (activeProduct.value?.productType === 'CDK') return 'CDK 商品'
  return '自定义商品'
})

const needsSteamId = computed(() => {
  const type = activeProduct.value?.productType
  return type === 'WHITELIST' || type === 'WHITELIST_CDK' || type === 'CDK'
})

const needsQq = computed(() => activeProduct.value?.productType === 'WHITELIST')
const needsEmail = computed(() => activeProduct.value?.productType === 'WHITELIST')
const needsRemark = computed(() => activeProduct.value?.productType === 'CUSTOM')

const orderFormHint = computed(() => {
  const normalizedDescription = String(activeProduct.value?.description || '').trim()

  if (normalizedDescription) {
    if (normalizedDescription === '白名单商品需要填写 SteamID64, QQ 和邮箱, 支付成功后会自动处理开通.') {
      return '支付成功后会自动处理开通'
    }

    return normalizedDescription
  }

  if (activeProduct.value?.productType === 'WHITELIST') {
    return '支付成功后会自动处理开通'
  }

  if (activeProduct.value?.productType === 'WHITELIST_CDK') {
    const quantity = Math.max(1, Number(activeProduct.value?.cdkQuantity) || 1)
    return `支付成功后自动发放 ${quantity} 个开水服 CDK`
  }

  if (activeProduct.value?.productType === 'CDK') {
    return '支付成功后自动发放, 默认不可使用.'
  }

  return '支付成功后将人工进行处理'
})

const productOptions = computed(() =>
  products.value.map((item) => ({
    label: `${item.name} · ${item.amountYuan} 元`,
    value: item.code,
  })),
)

function paymentLabel(value: 'alipay' | 'wxpay') {
  return value === 'wxpay' ? '微信支付' : '支付宝'
}

function statusType(status?: string) {
  if (status === 'PAID') return 'success'
  if (status === 'PENDING') return 'warning'
  return 'default'
}

function orderTypeLabel(type?: OrderItem['productType'] | null) {
  if (type === 'WHITELIST') return '开水服白名单'
  if (type === 'WHITELIST_CDK') return '开水服白名单 CDK'
  if (type === 'CDK') return 'CDK 商品'
  return '自定义商品'
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
}

function isExpanded(orderNo: string) {
  return expandedOrders.value.includes(orderNo)
}

function toggleExpanded(orderNo: string) {
  expandedOrders.value = isExpanded(orderNo)
    ? expandedOrders.value.filter((item) => item !== orderNo)
    : [...expandedOrders.value, orderNo]
}

function syncRecentOrders() {
  recentOrders.value = listStoredOrders()
  if (currentOrder.value?.orderNo) {
    const merged = mergeOrderSnapshot(
      recentOrders.value.find((item) => item.orderNo === currentOrder.value?.orderNo) ?? null,
      currentOrder.value,
    )

    if (merged) {
      currentOrder.value = merged
      recentOrders.value = [
        merged,
        ...recentOrders.value.filter((item) => item.orderNo !== merged.orderNo),
      ]
    }
  }
}

function restoreCurrentOrder() {
  const orderNo = resolveLastOrderNo()
  currentOrder.value = loadStoredOrder(orderNo)
  syncRecentOrders()
}

async function loadProducts() {
  productLoading.value = true

  try {
    const { data } = await http.get('/pay/api/products')
    products.value = data.products || []

    if (!form.value.productCode && products.value.length) {
      form.value.productCode = products.value[0].code
    }
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    productLoading.value = false
  }
}

async function createOrder() {
  if (!activeProduct.value) {
    pushToast('当前商品不可用, 请刷新后重试', 'error')
    return
  }

  loading.value = true

  try {
    const { data } = await http.post('/pay/api/orders', {
      productCode: form.value.productCode,
      steamId64: form.value.steamId64.trim(),
      qq: form.value.qq.trim(),
      email: form.value.email.trim(),
      remark: form.value.remark.trim(),
      paymentType: form.value.paymentType,
    })

    currentOrder.value = mergeOrderSnapshot(currentOrder.value, data.order)
    storeOrder(currentOrder.value)
    syncRecentOrders()
    orderStatusOpen.value = true
    pushToast('订单已创建, 当前页面会继续保留支付入口与状态', 'success')
    confirmDialogOpen.value = false
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

function requestCreateOrder() {
  if (!activeProduct.value) {
    pushToast('当前商品不可用, 请刷新后重试', 'error')
    return
  }

  confirmDialogOpen.value = true
}

async function refreshOrderStatus(orderNo?: string) {
  const targetOrderNo = String(orderNo || currentOrder.value?.orderNo || '').trim()

  if (!targetOrderNo) {
    return
  }

  loading.value = true

  try {
    const existingOrder = recentOrders.value.find((item) => item.orderNo === targetOrderNo) ?? currentOrder.value
    const { data } = await http.get(`/pay/api/orders/${encodeURIComponent(targetOrderNo)}`)
    const nextOrder = mergeOrderSnapshot(existingOrder, data.order)

    if (!nextOrder) {
      return
    }

    currentOrder.value = nextOrder
    storeOrder(nextOrder)
    syncRecentOrders()

    pushToast(
      nextOrder.status === 'PAID'
        ? '订单已支付成功'
        : `当前订单状态: ${nextOrder.status}`,
      nextOrder.status === 'PAID' ? 'success' : 'info',
    )
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  restoreCurrentOrder()
  void loadProducts()
})
</script>

<template>
  <AppShell
    title="购买商品"
    subtitle="创建订单后可通过右上角按钮随时查看订单状态."
    badge="购买商品"
    :nav-items="navItems"
  >
    <div class="page-stack page-stack--pay-focused page-stack--relaxed page-stack--centered-form">
      <NCard class="surface-card pay-card pay-card--single">
        <template #header>
          创建订单
        </template>
        <template #header-extra>
          <NButton secondary @click="orderStatusOpen = true">订单状态</NButton>
        </template>

        <div class="pay-card__content">
          <NForm label-placement="top" class="panel-grid">
            <div class="detail-grid">
              <div class="detail-tile">
                <div class="detail-tile__label">当前商品类型</div>
                <div class="detail-tile__value">{{ activeProductTypeLabel }}</div>
              </div>
              <div class="detail-tile">
                <div class="detail-tile__label">填写说明</div>
                <div class="detail-tile__value text-[14px] font-600 leading-[1.7]">{{ orderFormHint }}</div>
              </div>
            </div>

            <div class="stack-form-grid">
              <NFormItem label="商品">
                <NSelect
                  v-model:value="form.productCode"
                  :loading="productLoading"
                  :options="productOptions"
                  placeholder="请选择商品"
                />
              </NFormItem>

              <NFormItem v-if="needsSteamId" label="SteamID64">
                <NInput v-model:value="form.steamId64" placeholder="765611989687xxxxx" />
              </NFormItem>

              <NFormItem v-if="needsQq" label="QQ">
                <NInput v-model:value="form.qq" placeholder="248546xxx" />
              </NFormItem>

              <NFormItem v-if="needsEmail" label="邮箱 (查询订单使用)">
                <NInput v-model:value="form.email" placeholder="xxx@example.com" />
              </NFormItem>

              <NFormItem v-if="needsRemark" label="备注">
                <NInput v-model:value="form.remark" placeholder="可填写备注" />
              </NFormItem>
            </div>

            <NFormItem label="支付方式">
              <div class="payment-method-grid">
                <NButton
                  :type="form.paymentType === 'alipay' ? 'primary' : 'default'"
                  :secondary="form.paymentType !== 'alipay'"
                  class="payment-method-button"
                  @click="form.paymentType = 'alipay'"
                >
                  <span class="payment-method-button__title">支付宝</span>
                </NButton>
                <NButton
                  :type="form.paymentType === 'wxpay' ? 'primary' : 'default'"
                  :secondary="form.paymentType !== 'wxpay'"
                  class="payment-method-button"
                  @click="form.paymentType = 'wxpay'"
                >
                  <span class="payment-method-button__title">微信支付</span>
                </NButton>
              </div>
            </NFormItem>

            <NButton type="primary" block size="large" :loading="loading" :disabled="!activeProduct" @click="requestCreateOrder">
              创建订单
            </NButton>

            <div class="grid gap-2 text-[13px] leading-[1.8] text-[#c7ccd6]">
              <p v-for="item in refundItems" :key="item" class="m-0">{{ item }}</p>
            </div>
          </NForm>
        </div>
      </NCard>
    </div>

    <NModal v-model:show="confirmDialogOpen" preset="card" title="确认创建订单" class="max-w-[460px]">
      <NSpace vertical size="large">
        <div class="grid gap-2">
          <NText depth="3">由于使用三方支付接口, 实际支付金额自动增加手续费</NText>
          <NText depth="2">请确认填写信息无误</NText>
        </div>
        <div class="detail-grid">
          <div class="detail-tile">
            <div class="detail-tile__label">商品</div>
            <div class="detail-tile__value">{{ activeProduct?.name || '-' }}</div>
          </div>
          <div class="detail-tile">
            <div class="detail-tile__label">商品类型</div>
            <div class="detail-tile__value">{{ activeProductTypeLabel }}</div>
          </div>
          <div class="detail-tile">
            <div class="detail-tile__label">价格</div>
            <div class="detail-tile__value">{{ activeProduct?.amountYuan || '-' }}</div>
          </div>
          <div class="detail-tile">
            <div class="detail-tile__label">备注</div>
            <div class="detail-tile__value">{{ form.remark.trim() || '-' }}</div>
          </div>
        </div>
        <NSpace justify="end">
          <NButton @click="confirmDialogOpen = false">取消</NButton>
          <NButton type="primary" :loading="loading" @click="createOrder">确认创建</NButton>
        </NSpace>
      </NSpace>
    </NModal>

    <NModal v-model:show="orderStatusOpen" preset="card" title="订单状态" class="query-result-modal query-result-modal--centered">
      <div v-if="recentOrders.length" class="panel-grid query-result-modal__content">
        <article
          v-for="order in recentOrders"
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
                  <div class="detail-tile__value">{{ orderTypeLabel(order.productType) }}</div>
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
                  <div class="detail-tile__label">支付方式</div>
                  <div class="detail-tile__value">{{ paymentLabel(order.paymentType) }}</div>
                </div>
                <div class="detail-tile">
                  <div class="detail-tile__label">备注</div>
                  <div class="detail-tile__value">{{ order.remark || '-' }}</div>
                </div>
                <div class="detail-tile">
                  <div class="detail-tile__label">状态</div>
                  <div class="detail-tile__value">{{ order.status }}</div>
                </div>
              </div>

              <NSpace v-if="order.status === 'PENDING'" vertical :size="12" class="mt-4">
                <NButton
                  v-if="order.paymentUrl"
                  type="primary"
                  block
                  tag="a"
                  :href="order.paymentUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  继续支付
                </NButton>
                <NButton secondary block :loading="loading" @click="refreshOrderStatus(order.orderNo)">刷新支付结果</NButton>
              </NSpace>
            </div>
          </NCollapseTransition>
        </article>
      </div>

      <div v-else class="hero-note query-result-modal__empty">
        <div class="hero-note__inner">
          <div class="hero-note__title">还没有订单</div>
          <div class="hero-note__desc">创建订单后这里会保留支付入口与状态结果</div>
        </div>
      </div>
    </NModal>
  </AppShell>
</template>
