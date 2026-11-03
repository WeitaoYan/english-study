<script setup lang="ts">
interface Props {
  title: string
  description?: string
  compact?: boolean
}
withDefaults(defineProps<Props>(), { compact: false })
</script>

<template>
  <div
    class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong/80 bg-cream/40 text-center"
    :class="compact ? 'px-6 py-8' : 'px-6 py-14'"
  >
    <div class="grid size-11 place-items-center rounded-2xl bg-forest-soft text-forest">
      <slot name="icon" />
    </div>
    <p class="mt-4 text-sm font-medium text-ink">{{ title }}</p>
    <p v-if="description" class="mt-1.5 max-w-sm text-xs leading-relaxed text-muted">{{ description }}</p>
    <div v-if="$slots.action" class="mt-5">
      <slot name="action" />
    </div>
  </div>
</template>
