<script setup lang="ts">
interface Props {
  value: number
  tone?: 'forest' | 'clay' | 'ocean' | 'gold'
  size?: 'sm' | 'md'
}
const props = withDefaults(defineProps<Props>(), { tone: 'forest', size: 'md' })

const barTone = {
  forest: 'bg-forest',
  clay: 'bg-clay',
  ocean: 'bg-ocean',
  gold: 'bg-gold',
}
const width = computed(() => `${Math.max(0, Math.min(100, props.value))}%`)
</script>

<template>
  <div
    class="w-full overflow-hidden rounded-full bg-ink/8"
    :class="size === 'sm' ? 'h-1.5' : 'h-2'"
    role="progressbar"
    :aria-valuenow="value"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div
      class="h-full rounded-full transition-[width] duration-500"
      :class="barTone[tone]"
      :style="{ width }"
    />
  </div>
</template>
