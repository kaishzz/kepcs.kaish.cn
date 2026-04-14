<script setup lang="ts">
import NaiveProvider from './components/NaiveProvider.vue'
</script>

<template>
  <NaiveProvider>
    <div class="app-root">
      <router-view v-slot="{ Component, route }">
        <transition name="page" mode="out-in">
          <component :is="Component" :key="route.fullPath" class="route-shell" />
        </transition>
      </router-view>
    </div>
  </NaiveProvider>
</template>
