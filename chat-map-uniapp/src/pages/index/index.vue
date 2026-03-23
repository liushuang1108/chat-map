<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { callDeepSeekTravel } from '@/utils/llm'
import { wgs84ToGcj02 } from '@/utils/coord'
import { LLM_MODE } from '@/config'
import type { MapPoi, TravelChatResponse } from '@/types/chat'

const STORAGE_KEY = 'chatmap_deepseek_key'

const statusBarHeight = ref(44)
const panelExpanded = ref(false)
/** 真机 scroll-y 必须用明确 px 高度，否则无法上拉滚动 */
const sheetScrollPx = ref(360)

const apiKey = ref('')
const question = ref('')
const loading = ref(false)
const answer = ref<TravelChatResponse | null>(null)
const errorMsg = ref('')

const mapLat = ref(35.5)
const mapLng = ref(104.2)
const mapScale = ref(5)

const markerPoiById = ref<Record<number, MapPoi>>({})

type MarkerItem = {
  id: number
  latitude: number
  longitude: number
  title: string
  width: number
  height: number
  label?: {
    content: string
    color: string
    fontSize: number
    bgColor: string
    padding: number
    borderRadius: number
    anchorX: number
    anchorY: number
  }
  callout?: { content: string; display: string }
}

const markers = ref<MarkerItem[]>([])
const polyline = ref<
  Array<{ points: Array<{ latitude: number; longitude: number }>; color: string; width: number }>
>([])

const selectedPoi = ref<MapPoi | null>(null)

const includePoints = computed(() => {
  if (markers.value.length === 0) return undefined
  return markers.value.map((m) => ({
    latitude: m.latitude,
    longitude: m.longitude,
  }))
})

const navStyle = computed(() => ({
  paddingTop: `${statusBarHeight.value}px`,
}))

/** 已有 AI 回复或错误信息时，展开大块内容区；仅输入问题时保持紧凑高度 */
const hasAiOutput = computed(
  () => answer.value != null || (errorMsg.value != null && errorMsg.value !== ''),
)

function loadKey() {
  try {
    const k = uni.getStorageSync(STORAGE_KEY)
    if (typeof k === 'string' && k) apiKey.value = k
  } catch {
    /* ignore */
  }
}

function saveKey() {
  uni.setStorageSync(STORAGE_KEY, apiKey.value.trim())
  uni.showToast({ title: '已保存', icon: 'success' })
}

function rpxToPx(rpx: number, windowWidth: number) {
  return (rpx * windowWidth) / 750
}

function refreshSheetScrollHeight() {
  if (!answer.value && !errorMsg.value) {
    sheetScrollPx.value = 0
    return
  }
  try {
    const sys = uni.getSystemInfoSync()
    const winH = sys.windowHeight
    const winW = sys.windowWidth
    const safeBottom = sys.safeAreaInsets?.bottom ?? 0
    // 与样式 .sheet--rich max-height 比例一致（约 56% 屏高为面板上限）
    const panelMax = winH * 0.56
    const head = rpxToPx(108, winW)
    const composer = rpxToPx(248, winW)
    const keyStrip = LLM_MODE === 'direct' ? rpxToPx(136, winW) : 0
    const pad = rpxToPx(16, winW)
    const h = Math.floor(panelMax - head - composer - keyStrip - pad - safeBottom)
    sheetScrollPx.value = Math.max(200, h)
  } catch {
    sheetScrollPx.value = 320
  }
}

function togglePanel() {
  panelExpanded.value = !panelExpanded.value
}

function attLabel() {
  return {
    content: '景点',
    color: '#ffffff',
    fontSize: 11,
    bgColor: '#059669',
    padding: 4,
    borderRadius: 6,
    anchorX: 0,
    anchorY: 0,
  }
}

function hotelLabel() {
  return {
    content: '住宿',
    color: '#ffffff',
    fontSize: 11,
    bgColor: '#d97706',
    padding: 4,
    borderRadius: 6,
    anchorX: 0,
    anchorY: 0,
  }
}

function buildMapFromResponse(data: TravelChatResponse) {
  const ms: MarkerItem[] = []
  const idMap: Record<number, MapPoi> = {}
  let nid = 1

  for (const p of data.attractions) {
    if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue
    const [glng, glat] = wgs84ToGcj02(p.lng, p.lat)
    idMap[nid] = p
    ms.push({
      id: nid,
      latitude: glat,
      longitude: glng,
      title: `【景点】${p.name}`,
      width: 34,
      height: 34,
      label: attLabel(),
      callout: { content: p.name, display: 'BYCLICK' },
    })
    nid++
  }

  for (const p of data.accommodations) {
    if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue
    const [glng, glat] = wgs84ToGcj02(p.lng, p.lat)
    idMap[nid] = p
    ms.push({
      id: nid,
      latitude: glat,
      longitude: glng,
      title: `【住宿】${p.name}`,
      width: 34,
      height: 34,
      label: hotelLabel(),
      callout: { content: p.name, display: 'BYCLICK' },
    })
    nid++
  }

  markers.value = ms
  markerPoiById.value = idMap

  const coords = data.route?.coordinates
  let line: Array<{ latitude: number; longitude: number }> = []
  if (coords && coords.length >= 2) {
    line = coords.map(([lng, lat]) => {
      const [gln, gla] = wgs84ToGcj02(lng, lat)
      return { latitude: gla, longitude: gln }
    })
  } else if (data.attractions.length >= 2) {
    line = data.attractions.map((a) => {
      const [gln, gla] = wgs84ToGcj02(a.lng, a.lat)
      return { latitude: gla, longitude: gln }
    })
  }
  polyline.value =
    line.length >= 2 ? [{ points: line, color: '#0284c7', width: 4 }] : []

  if (ms.length > 0) {
    const lats = ms.map((m) => m.latitude)
    const lngs = ms.map((m) => m.longitude)
    mapLat.value = (Math.min(...lats) + Math.max(...lats)) / 2
    mapLng.value = (Math.min(...lngs) + Math.max(...lngs)) / 2
    mapScale.value = ms.length === 1 ? 14 : 12
  }
}

function onMarkerTap(e: { detail: { markerId: number } }) {
  const id = e.detail.markerId
  const poi = markerPoiById.value[id]
  if (poi) {
    selectedPoi.value = poi
  }
}

function openPoi(poi: MapPoi) {
  selectedPoi.value = poi
  if (Number.isFinite(poi.lng) && Number.isFinite(poi.lat)) {
    const [glng, glat] = wgs84ToGcj02(poi.lng, poi.lat)
    mapLat.value = glat
    mapLng.value = glng
    mapScale.value = 15
  }
}

function closePoi() {
  selectedPoi.value = null
}

async function submit() {
  const q = question.value.trim()
  if (!q) return
  if (LLM_MODE === 'direct' && !apiKey.value.trim()) {
    uni.showToast({ title: '请先填写并保存 API Key', icon: 'none' })
    panelExpanded.value = true
    return
  }
  loading.value = true
  errorMsg.value = ''
  answer.value = null
  selectedPoi.value = null
  try {
    const data = await callDeepSeekTravel(apiKey.value, q)
    answer.value = data
    buildMapFromResponse(data)
    panelExpanded.value = true
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : String(e)
    uni.showToast({ title: errorMsg.value.slice(0, 24), icon: 'none' })
    panelExpanded.value = true
  } finally {
    loading.value = false
  }
}

function openPanelFromHint() {
  panelExpanded.value = true
}

onMounted(() => {
  try {
    const sys = uni.getSystemInfoSync()
    statusBarHeight.value = sys.statusBarHeight || 44
  } catch {
    statusBarHeight.value = 44
  }
  loadKey()
  refreshSheetScrollHeight()
})

watch(panelExpanded, (open) => {
  if (open) {
    nextTick(() => refreshSheetScrollHeight())
  }
})

watch([answer, errorMsg], () => {
  nextTick(() => refreshSheetScrollHeight())
})
</script>

<template>
  <view class="page-root">
    <!-- 全屏地图 -->
    <view class="map-layer">
      <map
        class="map-full"
        :latitude="mapLat"
        :longitude="mapLng"
        :scale="mapScale"
        :markers="markers"
        :polyline="polyline"
        :include-points="includePoints"
        @markertap="onMarkerTap"
      />
    </view>

    <!-- 顶栏品牌：玻璃卡片，pointer-events:none 不挡地图 -->
    <view class="nav-float" :style="navStyle">
      <view class="nav-card">
        <view class="nav-brand-row">
          <text class="nav-brand__c">Chat</text>
          <text class="nav-brand__m">Map</text>
        </view>
        <view class="nav-accent" />
        <text class="nav-tagline">AI旅游助手</text>
      </view>
    </view>

    <!-- 有回答且收起时：提示条 -->
    <view
      v-if="answer && !panelExpanded"
      class="hint-chip"
      @click="openPanelFromHint"
    >
      <text class="hint-chip__dot" />
      <text class="hint-chip__txt">查看 AI 回答与行程</text>
      <text class="hint-chip__go">›</text>
    </view>

    <!-- 底部半透明面板 -->
    <view
      class="sheet"
      :class="{
        'sheet--collapsed': !panelExpanded,
        'sheet--compact': panelExpanded && !hasAiOutput,
        'sheet--rich': panelExpanded && hasAiOutput,
      }"
    >
      <view class="sheet-head" @click="togglePanel">
        <view class="sheet-grabber" />
        <view class="sheet-head-row">
          <text class="sheet-hint">{{ panelExpanded ? '点击收起 · 全屏看地图' : '点击展开 · 对话与行程' }}</text>
          <text class="sheet-chevron">{{ panelExpanded ? '▼' : '▲' }}</text>
        </view>
      </view>

      <view
        v-show="panelExpanded"
        class="sheet-body"
        :class="{ 'sheet-body--compact': !hasAiOutput }"
      >
        <view v-if="LLM_MODE === 'direct'" class="key-strip">
          <text class="key-strip__label">API Key（仅本地调试，勿发正式版）</text>
          <input
            v-model="apiKey"
            class="key-strip__input"
            type="text"
            password
            placeholder="sk-…"
          />
          <button class="key-strip__btn" size="mini" @click.stop="saveKey">保存</button>
        </view>

        <scroll-view
          v-if="hasAiOutput"
          scroll-y
          class="sheet-scroll"
          :show-scrollbar="false"
          :style="{ height: sheetScrollPx + 'px' }"
        >
          <view v-if="errorMsg" class="card card--glass card--err">
            <text>{{ errorMsg }}</text>
          </view>

          <view v-if="answer" class="card card--glass">
            <text class="reply">{{ answer.reply }}</text>
          </view>
          <view v-if="answer && answer.clothingAdvice" class="card card--glass card--muted">
            <text>{{ answer.clothingAdvice }}</text>
          </view>
          <view
            v-for="(w, i) in answer?.weather || []"
            :key="'w' + i"
            class="card card--glass weather"
          >
            <text class="w-city">{{ w.city }} · {{ w.period }}</text>
            <text class="w-txt">{{ w.condition }} {{ w.temperatureC != null ? w.temperatureC + '°C' : '' }}</text>
          </view>

          <view v-if="answer && answer.attractions.length" class="block">
            <text class="block-title">推荐景点</text>
            <view
              v-for="(p, i) in answer.attractions"
              :key="'a' + i"
              class="poi-card poi-card--att"
              @click="openPoi(p)"
            >
              <view class="poi-card__head">
                <text class="poi-badge poi-badge--att">景点</text>
                <text class="poi-name">{{ p.name }}</text>
              </view>
              <text class="poi-note">{{ p.note }}</text>
              <text class="poi-preview">{{ p.description }}</text>
            </view>
          </view>

          <view v-if="answer && answer.accommodations.length" class="block">
            <text class="block-title">推荐住宿</text>
            <view
              v-for="(p, i) in answer.accommodations"
              :key="'h' + i"
              class="poi-card poi-card--hotel"
              @click="openPoi(p)"
            >
              <view class="poi-card__head">
                <text class="poi-badge poi-badge--hotel">住宿</text>
                <text class="poi-name">{{ p.name }}</text>
              </view>
              <text class="poi-note">{{ p.note }}</text>
              <text class="poi-preview">{{ p.description }}</text>
            </view>
          </view>

          <view class="sheet-scroll-pad" />
        </scroll-view>

        <view
          class="composer"
          :class="{ 'composer--compact-top': !hasAiOutput && LLM_MODE === 'cloud' }"
        >
          <textarea
            v-model="question"
            class="composer__input"
            :disabled="loading"
            placeholder="输入行程问题，例如：五一去北京玩三天？"
            auto-height
          />
          <button class="composer__send" type="primary" :loading="loading" @click="submit">
            发送
          </button>
        </view>
      </view>
    </view>

    <!-- POI 详情 -->
    <view v-if="selectedPoi" class="poi-mask" @click="closePoi">
      <view class="poi-pop" @click.stop>
        <view class="poi-pop__head">
          <text
            class="poi-pop__tag"
            :class="selectedPoi.kind === 'attraction' ? 'poi-pop__tag--att' : 'poi-pop__tag--hotel'"
          >
            {{ selectedPoi.kind === 'attraction' ? '景点' : '住宿' }}
          </text>
          <text class="poi-pop__title">{{ selectedPoi.name }}</text>
        </view>
        <text class="poi-pop__note">{{ selectedPoi.note }}</text>
        <scroll-view scroll-y class="poi-pop__scroll">
          <text class="poi-pop__desc">{{ selectedPoi.description }}</text>
        </scroll-view>
        <image
          v-if="selectedPoi.imageUrl"
          class="poi-pop__img"
          :src="selectedPoi.imageUrl"
          mode="aspectFill"
        />
        <button class="poi-pop__close" @click="closePoi">关闭</button>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.page-root {
  width: 100%;
  height: 100vh;
  position: relative;
  overflow: hidden;
  background: #0f172a;
}

.map-layer {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
}

.map-full {
  width: 100%;
  height: 100%;
}

.nav-float {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  z-index: 20;
  padding-left: 28rpx;
  padding-right: 28rpx;
  padding-bottom: 8rpx;
  pointer-events: none;
}

.nav-card {
  display: inline-block;
  max-width: 100%;
  padding: 22rpx 28rpx 20rpx;
  border-radius: 28rpx;
  /* 更透明，靠 blur + 文字描边保证可读 */
  background: linear-gradient(
    145deg,
    rgba(255, 255, 255, 0.34) 0%,
    rgba(248, 250, 252, 0.28) 50%,
    rgba(255, 255, 255, 0.22) 100%
  );
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1rpx solid rgba(255, 255, 255, 0.42);
  box-shadow:
    0 8rpx 32rpx rgba(15, 23, 42, 0.07),
    inset 0 1rpx 0 rgba(255, 255, 255, 0.35);
}

.nav-brand-row {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  flex-wrap: nowrap;
}

.nav-brand__c {
  font-size: 44rpx;
  font-weight: 800;
  letter-spacing: 1rpx;
  color: #0f172a;
  text-shadow:
    0 0 14rpx rgba(255, 255, 255, 0.95),
    0 2rpx 10rpx rgba(15, 23, 42, 0.45),
    0 1rpx 0 rgba(255, 255, 255, 0.6);
}

.nav-brand__m {
  font-size: 44rpx;
  font-weight: 800;
  letter-spacing: 1rpx;
  color: #0369a1;
  margin-left: 2rpx;
  text-shadow:
    0 0 14rpx rgba(255, 255, 255, 0.95),
    0 2rpx 10rpx rgba(15, 23, 42, 0.35),
    0 1rpx 0 rgba(255, 255, 255, 0.5);
}

.nav-accent {
  width: 56rpx;
  height: 6rpx;
  border-radius: 6rpx;
  margin-top: 14rpx;
  margin-bottom: 12rpx;
  background: linear-gradient(90deg, #0ea5e9 0%, #6366f1 50%, #a855f7 100%);
  opacity: 0.88;
  box-shadow: 0 0 12rpx rgba(255, 255, 255, 0.5);
}

.nav-tagline {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #334155;
  letter-spacing: 6rpx;
  text-shadow:
    0 0 12rpx rgba(255, 255, 255, 0.9),
    0 2rpx 8rpx rgba(15, 23, 42, 0.35);
}

.hint-chip {
  position: absolute;
  left: 50%;
  bottom: 200rpx;
  transform: translateX(-50%);
  z-index: 25;
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx 28rpx;
  border-radius: 999rpx;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.2);
}

.hint-chip__dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 12rpx #34d399;
}

.hint-chip__txt {
  font-size: 26rpx;
  color: #fff;
}

.hint-chip__go {
  font-size: 32rpx;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 600;
}

.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  border-radius: 28rpx 28rpx 0 0;
  background: rgba(248, 250, 252, 0.82);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 -12rpx 48rpx rgba(15, 23, 42, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-bottom: none;
  transition: max-height 0.28s ease;
}

/* 仅有输入区：高度随内容，不占半屏空白 */
.sheet--compact {
  max-height: none;
}

/* 有回答/错误：与原先一致，约 56% 屏高 */
.sheet--rich {
  max-height: 56vh;
}

.sheet--collapsed {
  max-height: 120rpx;
}

.sheet-head {
  flex-shrink: 0;
  padding: 12rpx 24rpx 16rpx;
}

.sheet-grabber {
  width: 64rpx;
  height: 8rpx;
  border-radius: 4rpx;
  background: rgba(100, 116, 139, 0.45);
  margin: 0 auto 12rpx;
}

.sheet-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sheet-hint {
  font-size: 26rpx;
  color: #475569;
}

.sheet-chevron {
  font-size: 28rpx;
  color: #64748b;
  padding: 4rpx 8rpx;
}

.sheet-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0 20rpx;
  padding-bottom: env(safe-area-inset-bottom);
}

.sheet-body--compact {
  flex: 0 0 auto;
  min-height: auto;
}

.key-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
  padding: 12rpx 16rpx;
  background: rgba(255, 255, 255, 0.55);
  border-radius: 12rpx;
  border: 1px solid rgba(255, 255, 255, 0.6);
}

.key-strip__label {
  font-size: 22rpx;
  color: #64748b;
  width: 100%;
}

.key-strip__input {
  flex: 1;
  min-width: 200rpx;
  border: 1px solid #cbd5e1;
  border-radius: 8rpx;
  padding: 10rpx 14rpx;
  font-size: 22rpx;
  background: rgba(255, 255, 255, 0.9);
}

.key-strip__btn {
  margin: 0;
}

.sheet-scroll {
  width: 100%;
  box-sizing: border-box;
  /* 高度由 :style 绑定 sheetScrollPx（px），勿用 flex/vh 代替，否则真机 scroll-view 不滚动 */
}

.sheet-scroll-pad {
  height: 24rpx;
}

.card {
  border-radius: 16rpx;
  padding: 20rpx;
  margin-bottom: 14rpx;
  font-size: 28rpx;
  line-height: 1.55;
}

.card--glass {
  background: rgba(255, 255, 255, 0.58);
  border: 1px solid rgba(255, 255, 255, 0.65);
  box-shadow: 0 4rpx 20rpx rgba(15, 23, 42, 0.06);
}

.card--err {
  background: rgba(254, 226, 226, 0.75);
  border-color: rgba(248, 113, 113, 0.45);
  color: #991b1b;
  font-size: 24rpx;
}

.card--muted {
  color: #475569;
  font-size: 26rpx;
}

.reply {
  color: #0f172a;
}

.weather {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.w-city {
  font-weight: 600;
  color: #0f172a;
}

.w-txt {
  color: #64748b;
  font-size: 26rpx;
}

.block {
  margin-bottom: 16rpx;
}

.block-title {
  font-size: 26rpx;
  font-weight: 600;
  color: #334155;
  display: block;
  margin-bottom: 10rpx;
}

.poi-card {
  background: rgba(255, 255, 255, 0.62);
  border-radius: 14rpx;
  padding: 18rpx;
  margin-bottom: 10rpx;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-left-width: 6rpx;
  border-left-color: #94a3b8;
}

.poi-card--att {
  border-left-color: #059669;
}

.poi-card--hotel {
  border-left-color: #d97706;
}

.poi-card__head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 8rpx;
}

.poi-badge {
  font-size: 20rpx;
  padding: 4rpx 10rpx;
  border-radius: 6rpx;
  color: #fff;
}

.poi-badge--att {
  background: #059669;
}

.poi-badge--hotel {
  background: #d97706;
}

.poi-name {
  font-size: 30rpx;
  font-weight: 600;
  color: #0f172a;
  flex: 1;
}

.poi-note {
  font-size: 24rpx;
  color: #64748b;
  display: block;
  margin-bottom: 8rpx;
}

.poi-preview {
  font-size: 26rpx;
  color: #475569;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.composer {
  flex-shrink: 0;
  padding: 12rpx 0 8rpx;
  border-top: 1px solid rgba(148, 163, 184, 0.35);
}

/* 无上方滚动区时，输入区顶部分隔线可去掉，避免大块留白感 */
.composer--compact-top {
  border-top: none;
  padding-top: 4rpx;
}

.composer__input {
  width: 100%;
  min-height: 88rpx;
  max-height: 200rpx;
  border: 1px solid rgba(203, 213, 225, 0.9);
  border-radius: 16rpx;
  padding: 16rpx;
  font-size: 28rpx;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.85);
}

.composer__send {
  width: 100%;
  margin-top: 12rpx;
}

.poi-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.poi-pop {
  width: 100%;
  max-height: 72vh;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  border-radius: 24rpx 24rpx 0 0;
  padding: 28rpx 28rpx calc(28rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.poi-pop__head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
}

.poi-pop__tag {
  font-size: 22rpx;
  padding: 6rpx 14rpx;
  border-radius: 8rpx;
  color: #fff;
}

.poi-pop__tag--att {
  background: #059669;
}

.poi-pop__tag--hotel {
  background: #d97706;
}

.poi-pop__title {
  font-size: 34rpx;
  font-weight: 700;
  color: #0f172a;
  flex: 1;
}

.poi-pop__note {
  font-size: 26rpx;
  color: #64748b;
  display: block;
  margin-bottom: 12rpx;
}

.poi-pop__scroll {
  max-height: 240rpx;
  margin-bottom: 16rpx;
}

.poi-pop__desc {
  font-size: 28rpx;
  color: #334155;
  line-height: 1.55;
}

.poi-pop__img {
  width: 100%;
  height: 280rpx;
  border-radius: 12rpx;
  margin-bottom: 20rpx;
  background: #f1f5f9;
}

.poi-pop__close {
  width: 100%;
}
</style>
