<script setup lang="ts">
import { CheckCircle2, Info, X, XCircle } from 'lucide-vue-next'

const { toasts, dismiss } = useToast()

const toneMap = {
  success: 'border-forest/20 bg-forest-soft text-forest-deep',
  error: 'border-danger/20 bg-danger-soft text-danger',
  info: 'border-line bg-cream text-ink',
}
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed inset-x-0 bottom-5 z-[80] flex flex-col items-center gap-2 px-4">
      <TransitionGroup
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-2 opacity-0"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="translate-y-1 opacity-0"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur"
          :class="toneMap[toast.type]"
        >
          <CheckCircle2 v-if="toast.type === 'success'" :size="17" class="mt-0.5 shrink-0" />
          <XCircle v-else-if="toast.type === 'error'" :size="17" class="mt-0.5 shrink-0" />
          <Info v-else :size="17" class="mt-0.5 shrink-0" />
          <p class="flex-1 leading-relaxed">{{ toast.message }}</p>
          <button class="shrink-0 opacity-60 transition hover:opacity-100" @click="dismiss(toast.id)">
            <X :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
