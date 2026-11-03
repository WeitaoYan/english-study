<script setup lang="ts">
import { X } from 'lucide-vue-next'

interface Props {
  open: boolean
  title: string
  description?: string
  wide?: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) emit('close')
}

watch(() => props.open, (open) => {
  if (!import.meta.client) return
  document.body.style.overflow = open ? 'hidden' : ''
  if (open) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center sm:p-6">
        <div class="absolute inset-0 bg-ink/30 backdrop-blur-sm" @click="emit('close')" />
        <Transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="translate-y-4 opacity-0 sm:translate-y-0 sm:scale-95"
          leave-active-class="transition duration-150 ease-in"
          leave-to-class="translate-y-3 opacity-0 sm:translate-y-0 sm:scale-95"
          appear
        >
          <div
            class="relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl border border-line bg-paper shadow-2xl"
            :class="wide ? 'max-w-3xl' : 'max-w-lg'"
            role="dialog"
            aria-modal="true"
          >
            <div class="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
              <div>
                <h2 class="font-display text-xl tracking-tight text-ink">{{ title }}</h2>
                <p v-if="description" class="mt-1 text-xs leading-relaxed text-muted">{{ description }}</p>
              </div>
              <button class="btn-ghost size-9 shrink-0 !p-0" @click="emit('close')">
                <X :size="17" />
              </button>
            </div>
            <div class="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <slot />
            </div>
            <div v-if="$slots.footer" class="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-cream/60 px-5 py-3.5 sm:px-6">
              <slot name="footer" />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
