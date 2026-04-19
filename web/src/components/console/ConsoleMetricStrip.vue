<script setup lang="ts">
import { computed } from 'vue'

interface MetricItem {
  label: string
  value: string | number
  hint?: string
}

const props = withDefaults(defineProps<{
  items: MetricItem[]
  columns?: number
}>(), {
  columns: 0,
})

const stripStyle = computed(() => ({
  '--console-metric-columns': String(
    Math.max(1, props.columns || props.items.length || 1),
  ),
}))
</script>

<template>
  <div class="console-metric-strip" :style="stripStyle">
    <article
      v-for="item in items"
      :key="item.label"
      class="console-metric-strip__item"
    >
      <div class="console-metric-strip__label">{{ item.label }}</div>
      <div class="console-metric-strip__value">{{ item.value }}</div>
      <div v-if="item.hint" class="console-metric-strip__hint">{{ item.hint }}</div>
    </article>
  </div>
</template>

<style scoped>
.console-metric-strip {
  display: grid;
  grid-template-columns: repeat(var(--console-metric-columns), minmax(0, 1fr));
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--app-border-soft);
  border-radius: var(--app-radius-md);
  background: rgba(255, 255, 255, 0.012);
}

.console-metric-strip__item {
  min-width: 0;
  min-height: 88px;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 6px;
  padding: 14px 16px;
  text-align: center;
  background: transparent;
}

.console-metric-strip__item + .console-metric-strip__item {
  border-left: 1px solid var(--app-border-soft);
}

.console-metric-strip__label,
.console-metric-strip__hint {
  color: var(--app-text-muted);
  line-height: 1.65;
}

.console-metric-strip__label {
  font-size: 13px;
}

.console-metric-strip__value {
  color: var(--app-text);
  font-family: var(--app-font-number);
  font-size: 24px;
  font-weight: 800;
  line-height: 1;
  overflow-wrap: anywhere;
}

.console-metric-strip__hint {
  font-size: 12px;
}

@media (max-width: 768px) {
  .console-metric-strip {
    grid-template-columns: minmax(0, 1fr);
  }

  .console-metric-strip__item {
    min-height: 72px;
    padding: 12px 14px;
  }

  .console-metric-strip__item + .console-metric-strip__item {
    border-top: 1px solid var(--app-border-soft);
    border-left: 0;
  }
}
</style>
