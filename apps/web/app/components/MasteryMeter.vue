<script setup lang="ts">
const props = defineProps<{ strength: number; compact?: boolean }>()

const labels = ['初识', '熟悉', '掌握', '稳固', '熟练', '精通']
const label = computed(() => labels[Math.max(0, Math.min(5, props.strength))])
</script>

<template>
  <div class="flex items-center gap-2" :title="`记忆强度 ${strength} 级 · ${label}`">
    <div class="flex items-end gap-0.5">
      <span
        v-for="index in 5"
        :key="index"
        class="w-1.5 rounded-full transition-colors"
        :class="index <= strength ? 'bg-forest' : 'bg-ink/10'"
        :style="{ height: `${5 + index * 2}px` }"
      />
    </div>
    <span v-if="!compact" class="text-[10px] font-medium text-muted">{{ label }}</span>
  </div>
</template>
