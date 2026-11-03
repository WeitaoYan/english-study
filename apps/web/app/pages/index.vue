<script setup lang="ts">
const auth = useAuth()

await navigateTo(auth.home.value, { replace: true })
</script>

<template>
  <div />
</template>
