<script setup lang="ts">
import type { Component } from 'vue'

interface Props {
  label: string
  value: string | number
  sub?: string
  icon?: Component
  tone?: 'forest' | 'clay' | 'ocean' | 'gold' | 'plum'
}
withDefaults(defineProps<Props>(), { tone: 'forest' })

const toneMap = {
  forest: 'bg-forest-soft text-forest',
  clay: 'bg-clay-soft text-clay',
  ocean: 'bg-ocean-soft text-ocean',
  gold: 'bg-gold-soft text-gold',
  plum: 'bg-plum-soft text-plum',
}
</script>

<template>
  <div class="card p-5">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-[11px] font-medium tracking-wide text-muted">{{ label }}</p>
        <p class="mt-2 font-display text-3xl leading-none tracking-tight text-ink">{{ value }}</p>
      </div>
      <span v-if="icon" class="grid size-9 place-items-center rounded-xl" :class="toneMap[tone]">
        <component :is="icon" :size="17" :stroke-width="1.8" />
      </span>
    </div>
    <p v-if="sub" class="mt-3 text-[11px] leading-relaxed text-muted">{{ sub }}</p>
  </div>
</template>
