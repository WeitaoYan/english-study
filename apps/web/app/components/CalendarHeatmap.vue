<script setup lang="ts">
import type { CalendarDay } from '@english-study/shared'

const props = defineProps<{ days: CalendarDay[] }>()

function level(day: CalendarDay) {
  if (!day.answered) return 'bg-ink/7'
  if (day.answered < 6) return 'bg-forest/20'
  if (day.answered < 15) return 'bg-forest/45'
  if (day.answered < 30) return 'bg-forest/70'
  return 'bg-forest'
}

function tooltip(day: CalendarDay) {
  return `${day.date} · ${day.answered} 题 · 正确 ${day.correct} 题${day.minutes ? ` · ${day.minutes} 分钟` : ''}`
}

const total = computed(() => props.days.reduce((sum, day) => sum + day.answered, 0))
const activeDays = computed(() => props.days.filter((day) => day.answered > 0).length)
</script>

<template>
  <div>
    <div class="mb-3 flex items-center justify-between text-[11px] text-muted">
      <span>最近 {{ days.length }} 天 · 学习 {{ activeDays }} 天</span>
      <span>共 {{ total }} 题</span>
    </div>
    <div class="grid grid-cols-10 gap-1.5 sm:gap-2">
      <div
        v-for="day in days"
        :key="day.date"
        class="aspect-square rounded-md transition hover:ring-2 hover:ring-forest/30"
        :class="level(day)"
        :title="tooltip(day)"
      />
    </div>
    <div class="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted">
      <span>少</span>
      <span class="size-2.5 rounded-sm bg-ink/7" />
      <span class="size-2.5 rounded-sm bg-forest/20" />
      <span class="size-2.5 rounded-sm bg-forest/45" />
      <span class="size-2.5 rounded-sm bg-forest/70" />
      <span class="size-2.5 rounded-sm bg-forest" />
      <span>多</span>
    </div>
  </div>
</template>
