<script setup lang="ts">
withDefaults(defineProps<{ lines?: number; label?: string }>(), { lines: 4 })
</script>

<template>
  <div class="card space-y-4 p-6">
    <div v-if="label" class="flex items-center gap-2 text-xs text-muted">
      <span class="size-3.5 animate-spin rounded-full border-2 border-forest/25 border-t-forest" />
      {{ label }}
    </div>
    <div v-for="index in lines" :key="index" class="skeleton h-4" :style="{ width: `${100 - (index % 3) * 14}%` }" />
  </div>
</template>
