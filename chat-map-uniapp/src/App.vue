<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { LLM_MODE, WX_CLOUD_ENV_ID } from '@/config'

onLaunch(() => {
  // #ifdef MP-WEIXIN
  if (LLM_MODE === 'cloud' && WX_CLOUD_ENV_ID) {
    const w = wx as { cloud?: { init: (o: { env: string; traceUser?: boolean }) => void } }
    w.cloud?.init({ env: WX_CLOUD_ENV_ID, traceUser: true })
  }
  // #endif
  console.log('App Launch')
})
onShow(() => {
  console.log('App Show')
})
onHide(() => {
  console.log('App Hide')
})
</script>

<style>
page {
  height: 100%;
  background: #f1f5f9;
}
</style>
