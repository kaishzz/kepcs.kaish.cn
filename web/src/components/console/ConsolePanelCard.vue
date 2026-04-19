<script setup lang="ts">
import { NCard } from 'naive-ui'
import { computed, useSlots } from 'vue'

const props = defineProps<{
  title?: string
  description?: string
}>()

const slots = useSlots()

const showHeader = computed(() =>
  Boolean(slots.header || props.title || props.description),
)
</script>

<template>
  <NCard embedded class="console-form-card console-panel-card">
    <template v-if="showHeader" #header>
      <slot name="header">
        <div class="console-panel-card__copy">
          <div v-if="title" class="console-panel-card__title">{{ title }}</div>
          <div v-if="description" class="console-panel-card__desc">{{ description }}</div>
        </div>
      </slot>
    </template>

    <template v-if="$slots['header-extra']" #header-extra>
      <slot name="header-extra" />
    </template>

    <slot />
  </NCard>
</template>

<style scoped>
.console-panel-card__copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.console-panel-card__title {
  color: var(--app-text);
  font-size: 18px;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: 0.01em;
}

.console-panel-card__desc {
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.7;
}

.console-panel-card :deep(.n-card-header) {
  padding-bottom: 14px;
}

@media (max-width: 768px) {
  .console-panel-card__title {
    font-size: 17px;
  }

  .console-panel-card :deep(.n-card-header) {
    padding-bottom: 12px;
  }
}
</style>
