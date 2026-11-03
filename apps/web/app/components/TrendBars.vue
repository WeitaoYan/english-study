<script setup lang="ts">
interface Point {
  label: string
  answered: number
  accuracy: number
  correct?: number
}

const props = withDefaults(defineProps<{ points: Point[]; height?: number }>(), { height: 160 })

const max = computed(() => Math.max(10, ...props.points.map((point) => point.answered)))
const showLabel = (index: number) => {
  if (props.points.length <= 10) return true
  return index % 5 === 0 || index === props.points.length - 1
}
</script>

<template>
  <div>
    <div class="flex items-end gap-1.5 border-b border-line/80 pb-2" :style="{ height: `${height}px` }">
      <div
        v-for="(point, index) in points"
        :key="point.label + index"
        class="group relative flex h-full flex-1 items-end"
        :title="`${point.label} · ${point.answered} 题 · 正确率 ${point.accuracy}%`"
      >
        <div
          class="relative w-full rounded-t-md bg-forest/20 transition-all duration-500 group-hover:bg-forest/45"
          :style="{ height: `${Math.max(point.answered ? 5 : 2, (point.answered / max) * 100)}%` }"
        >
          <div
            v-if="point.answered"
            class="absolute inset-x-0 bottom-0 rounded-t-md bg-forest/70"
            :style="{ height: `${point.accuracy}%` }"
          />
        </div>
      </div>
    </div>
    <div class="mt-2 flex gap-1.5">
      <div
        v-for="(point, index) in points"
        :key="`label-${point.label}-${index}`"
        class="flex-1 text-center text-[9px] text-muted"
      >
        <span v-if="showLabel(index)">{{ point.label }}</span>
        <span v-else class="invisible">·</span>
      </div>
    </div>
    <div class="mt-3 flex items-center gap-4 text-[10px] text-muted">
      <span class="inline-flex items-center gap-1.5">
        <span class="size-2.5 rounded-sm bg-forest/20" /> 答题量
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="size-2.5 rounded-sm bg-forest/70" /> 正确率
      </span>
    </div>
  </div>
</template>
