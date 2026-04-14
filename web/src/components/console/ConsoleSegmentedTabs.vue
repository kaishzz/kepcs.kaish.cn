<script setup lang="ts">
import { NButton } from 'naive-ui'

type SegmentedOptionValue = string | number

defineProps<{
  modelValue: SegmentedOptionValue
  options: Array<{
    label: string
    value: SegmentedOptionValue
    disabled?: boolean
  }>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: SegmentedOptionValue]
}>()

function handleSelect(value: SegmentedOptionValue, disabled = false) {
  if (disabled) {
    return
  }

  emit('update:modelValue', value)
}
</script>

<template>
  <div class="console-segmented">
    <NButton
      v-for="option in options"
      :key="String(option.value)"
      secondary
      :disabled="option.disabled"
      class="console-segmented__button"
      :class="{ 'is-active': modelValue === option.value }"
      @click="handleSelect(option.value, option.disabled)"
    >
      {{ option.label }}
    </NButton>
  </div>
</template>

<style scoped>
.console-segmented {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  align-self: start;
  width: max-content;
  max-width: 100%;
}

.console-segmented__button.n-button {
  min-height: 36px !important;
  padding: 0 14px !important;
  border-radius: var(--app-radius-sm) !important;
  border: 1px solid rgba(255, 255, 255, 0.06) !important;
  background: rgba(255, 255, 255, 0.014) !important;
  color: var(--app-text-muted) !important;
  box-shadow: none !important;
}

.console-segmented__button.n-button:not(.n-button--disabled):hover {
  border-color: rgba(255, 255, 255, 0.12) !important;
  background: rgba(255, 255, 255, 0.024) !important;
  color: var(--app-text) !important;
}

.console-segmented__button.is-active.n-button {
  border-color: rgba(255, 255, 255, 0.08) !important;
  background: rgba(255, 255, 255, 0.018) !important;
  color: var(--app-brand) !important;
  box-shadow: inset 0 -1px 0 rgba(99, 226, 182, 0.88) !important;
}

.console-segmented__button.is-active.n-button:not(.n-button--disabled):hover {
  border-color: rgba(255, 255, 255, 0.12) !important;
  color: var(--app-brand-hover) !important;
}

.console-segmented__button :deep(.n-button__content) {
  justify-content: center;
  white-space: nowrap;
  font-size: 13px;
}

@media (max-width: 768px) {
  .console-segmented {
    width: 100%;
    gap: 6px;
  }

  .console-segmented__button.n-button {
    flex: 1 1 calc(50% - 5px);
    min-width: 0;
    min-height: 34px !important;
    padding: 0 12px !important;
  }
}

@media (max-width: 560px) {
  .console-segmented__button.n-button {
    flex-basis: 100%;
  }
}
</style>
