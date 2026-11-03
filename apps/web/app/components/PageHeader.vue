<script setup lang="ts">
interface Props {
  eyebrow?: string
  title: string
  description?: string
}
defineProps<Props>()
</script>

<template>
  <header class="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div class="max-w-2xl">
      <p v-if="eyebrow" class="eyebrow mb-2">{{ eyebrow }}</p>
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="description" class="mt-2.5 text-sm leading-relaxed text-ink-soft">
        {{ description }}
      </p>
      <slot name="meta" />
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
