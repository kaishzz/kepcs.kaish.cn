<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
}>()
</script>

<template>
  <section class="console-section-block">
    <div v-if="title || description || $slots['header-extra']" class="console-section-block__header">
      <div class="console-section-block__copy">
        <div v-if="title" class="console-section-block__title">{{ title }}</div>
        <div v-if="description" class="console-section-block__desc">{{ description }}</div>
      </div>

      <div v-if="$slots['header-extra']" class="console-section-block__extra">
        <slot name="header-extra" />
      </div>
    </div>

    <div class="console-section-block__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.console-section-block {
  display: grid;
  gap: var(--app-console-section-gap, 18px);
  min-width: 0;
}

.console-section-block + .console-section-block {
  padding-top: var(--app-console-subsection-gap);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.console-section-block__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  padding-top: 2px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
}

.console-section-block__copy,
.console-section-block__body {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.console-section-block__title {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: 0.01em;
}

.console-section-block__desc {
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.7;
}

.console-section-block__extra {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .console-section-block {
    gap: var(--app-console-section-gap, 16px);
  }

  .console-section-block__header {
    align-items: stretch;
    flex-direction: column;
    padding-top: 1px;
    padding-bottom: 12px;
  }

  .console-section-block__extra {
    justify-content: flex-start;
  }
}
</style>
