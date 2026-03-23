<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import axios from 'axios'
import Map from 'ol/Map.js'
import View from 'ol/View.js'
import TileLayer from 'ol/layer/Tile.js'
import VectorLayer from 'ol/layer/Vector.js'
import XYZ from 'ol/source/XYZ.js'
import VectorSource from 'ol/source/Vector.js'
import Feature from 'ol/Feature.js'
import LineString from 'ol/geom/LineString.js'
import Point from 'ol/geom/Point.js'
import { fromLonLat } from 'ol/proj.js'
import { Style, Stroke, Fill, Circle as CircleStyle, Text } from 'ol/style.js'
import { boundingExtent } from 'ol/extent.js'
import type { Coordinate } from 'ol/coordinate.js'
import { easeOut, inAndOut } from 'ol/easing.js'
import Overlay from 'ol/Overlay.js'
interface WeatherItem {
  city: string
  period: string
  condition: string
  temperatureC: number | null
}

interface RouteInfo {
  name: string
  coordinates: number[][]
}

interface MapPoi {
  kind: 'attraction' | 'hotel'
  name: string
  lng: number
  lat: number
  note: string
  description: string
  imageUrl: string
}

interface TravelChatResponse {
  reply: string
  weather: WeatherItem[]
  clothingAdvice: string
  route: RouteInfo | null
  attractions: Array<{
    name: string
    lng: number
    lat: number
    note: string
    description: string
    imageUrl: string
  }>
  accommodations: Array<{
    name: string
    lng: number
    lat: number
    note: string
    description: string
    imageUrl: string
  }>
  demo: boolean
}

const question = ref('')
const loading = ref(false)
const errorMsg = ref('')
const answer = ref<TravelChatResponse | null>(null)
const selectedPoi = ref<MapPoi | null>(null)
const imgBroken = ref(false)

const mapEl = ref<HTMLElement | null>(null)
const popupEl = ref<HTMLElement | null>(null)
const mapInstance = shallowRef<Map | null>(null)
const popupOverlay = shallowRef<Overlay | null>(null)
const routeSource = shallowRef<VectorSource | null>(null)
const attractionSource = shallowRef<VectorSource | null>(null)
const hotelSource = shallowRef<VectorSource | null>(null)

/** 叠高德 XYZ：经纬度按 GCJ/与底图一致使用，不做 WGS84→GCJ 转换 */
function toMapCoord(lng: number, lat: number): Coordinate {
  return fromLonLat([lng, lat])
}

/** 中国全境近似包络（西南—东北角点，经 toMapCoord 后 fit） */
function getChinaExtent(): number[] {
  const sw = toMapCoord(73.4, 18.1)
  const ne = toMapCoord(134.85, 53.65)
  return boundingExtent([sw, ne])
}

/** duration=0 为无动画（首屏）；>0 为飞行动效 */
function fitChinaView(view: View, durationMs: number) {
  const ext = getChinaExtent()
  view.fit(ext, {
    padding: [20, 20, 20, 20],
    maxZoom: 5.2,
    duration: durationMs,
    easing: durationMs > 0 ? inAndOut : undefined,
  })
}

function pointStyle(color: string, label: string) {
  return new Style({
    image: new CircleStyle({
      radius: 9,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#fff', width: 2 }),
    }),
    text: new Text({
      text: label,
      offsetY: -16,
      font: '12px sans-serif',
      fill: new Fill({ color: '#0f172a' }),
      stroke: new Stroke({ color: '#fff', width: 3 }),
    }),
  })
}

function buildPoi(kind: 'attraction' | 'hotel', raw: {
  name: string
  lng: number
  lat: number
  note: string
  description?: string
  imageUrl?: string
}): MapPoi {
  return {
    kind,
    name: raw.name,
    lng: raw.lng,
    lat: raw.lat,
    note: raw.note ?? '',
    description: raw.description ?? raw.note ?? '',
    imageUrl: raw.imageUrl ?? '',
  }
}

function applyMapData(data: TravelChatResponse) {
  const rs = routeSource.value
  const as = attractionSource.value
  const hs = hotelSource.value
  const map = mapInstance.value
  if (!rs || !as || !hs || !map) return

  rs.clear()
  as.clear()
  hs.clear()
  selectedPoi.value = null
  popupOverlay.value?.setPosition(undefined)

  const projected: Coordinate[] = []

  const route = data.route
  if (route?.coordinates?.length) {
    const pts = route.coordinates
      .filter((p) => p.length >= 2)
      .map(([lng, lat]) => toMapCoord(lng, lat))
    if (pts.length >= 2) {
      const line = new Feature({ geometry: new LineString(pts) })
      line.setStyle(
        new Style({
          stroke: new Stroke({ color: '#2563eb', width: 4 }),
        }),
      )
      rs.addFeature(line)
      projected.push(...pts)
    }
  }

  for (const a of data.attractions ?? []) {
    const c = toMapCoord(a.lng, a.lat)
    projected.push(c)
    const poi = buildPoi('attraction', a)
    const f = new Feature({ geometry: new Point(c) })
    f.setStyle(pointStyle('#059669', a.name))
    f.set('poi', poi)
    as.addFeature(f)
  }

  for (const h of data.accommodations ?? []) {
    const c = toMapCoord(h.lng, h.lat)
    projected.push(c)
    const poi = buildPoi('hotel', h)
    const f = new Feature({ geometry: new Point(c) })
    f.setStyle(pointStyle('#ea580c', h.name))
    f.set('poi', poi)
    hs.addFeature(f)
  }

  const view = map.getView()
  if (projected.length === 0) {
    fitChinaView(view, 700)
    return
  }

  const extent = boundingExtent(projected)
  view.fit(extent, {
    padding: [88, 88, 88, 88],
    maxZoom: 14,
    duration: 1400,
    easing: inAndOut,
  })
}

function flyToPoi(poi: MapPoi) {
  const map = mapInstance.value
  const view = map?.getView()
  const overlay = popupOverlay.value
  if (!map || !view || !overlay) return

  const coord = toMapCoord(poi.lng, poi.lat)
  imgBroken.value = false
  selectedPoi.value = poi

  view.animate({
    center: coord,
    zoom: Math.max(view.getZoom() ?? 14, 15),
    duration: 800,
    easing: easeOut,
  })

  overlay.setPosition(coord)
}

function closePopup() {
  selectedPoi.value = null
  popupOverlay.value?.setPosition(undefined)
}

async function submit() {
  const q = question.value.trim()
  if (!q || loading.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    const { data } = await axios.post<TravelChatResponse>('/api/travel/chat', { question: q })
    answer.value = data
    applyMapData(data)
  } catch (e) {
    errorMsg.value = '请求失败，请确认后端已启动（http://localhost:8080）'
    console.error(e)
  } finally {
    loading.value = false
  }
}

function createBasemapLayer() {
  const qs =
    'lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
  return new TileLayer({
    source: new XYZ({
      urls: [
        `https://webrd01.is.autonavi.com/appmaptile?${qs}`,
        `https://webrd02.is.autonavi.com/appmaptile?${qs}`,
        `https://webrd03.is.autonavi.com/appmaptile?${qs}`,
        `https://webrd04.is.autonavi.com/appmaptile?${qs}`,
      ],
      attributions: '© 高德地图',
      crossOrigin: 'anonymous',
      maxZoom: 18,
    }),
  })
}

function handleResize() {
  mapInstance.value?.updateSize()
}

onMounted(async () => {
  await nextTick()
  if (!mapEl.value || !popupEl.value) return

  const rs = new VectorSource()
  const asrc = new VectorSource()
  const hsrc = new VectorSource()
  routeSource.value = rs
  attractionSource.value = asrc
  hotelSource.value = hsrc

  const overlay = new Overlay({
    element: popupEl.value,
    positioning: 'bottom-center',
    offset: [0, -12],
    autoPan: { animation: { duration: 300 } },
  })

  const map = new Map({
    target: mapEl.value,
    layers: [
      createBasemapLayer(),
      new VectorLayer({ source: rs, zIndex: 1 }),
      new VectorLayer({ source: asrc, zIndex: 2 }),
      new VectorLayer({ source: hsrc, zIndex: 3 }),
    ],
    view: new View({
      center: toMapCoord(104.2, 35.5),
      zoom: 4,
      minZoom: 2,
      maxZoom: 18,
    }),
    overlays: [overlay],
  })
  mapInstance.value = map
  popupOverlay.value = overlay

  map.on('singleclick', (evt) => {
    const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f)
    if (hit) {
      const poi = hit.get('poi') as MapPoi | undefined
      if (poi) {
        imgBroken.value = false
        selectedPoi.value = poi
        overlay.setPosition(evt.coordinate)
        map.getView().animate({
          center: evt.coordinate,
          zoom: Math.max(map.getView().getZoom() ?? 14, 15),
          duration: 800,
          easing: easeOut,
        })
        return
      }
    }
    closePopup()
  })

  requestAnimationFrame(() => {
    map.updateSize()
    fitChinaView(map.getView(), 0)
  })
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  mapInstance.value?.setTarget(undefined)
  mapInstance.value = null
})
</script>

<template>
  <div class="layout">
    <aside class="panel">
      <header class="panel__head">
        <div class="brand" aria-label="ChatMap">
          <div class="brand__glow" aria-hidden="true" />
          <h1 class="brand__title">
            <span class="brand__text">ChatMap</span>
          </h1>
          <p class="brand__tagline">AI 旅游助手 · 路线与地图一体</p>
        </div>
        <p class="muted">
          输入行程问题；地图：<span class="leg leg--att">■</span> 景点
          <span class="leg leg--hotel">■</span> 住宿；点击标记查看介绍与图片。
        </p>
      </header>

      <div class="chat">
        <textarea
          v-model="question"
          rows="4"
          placeholder="例如：五一假期去北京玩三天，怎么安排？需要带什么衣服？"
          @keydown.enter.exact.prevent="submit"
        />
        <button type="button" class="btn" :disabled="loading" @click="submit">
          {{ loading ? '思考中…' : '发送' }}
        </button>
        <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
      </div>

      <section v-if="answer" class="result">
        <p v-if="answer.demo" class="badge">演示数据</p>
        <h2>回答</h2>
        <p class="reply">{{ answer.reply }}</p>

        <h3>天气</h3>
        <ul class="weather">
          <li v-for="(w, i) in answer.weather" :key="i">
            <strong>{{ w.city }}</strong> · {{ w.period }} — {{ w.condition }}
            <span v-if="w.temperatureC != null">，约 {{ w.temperatureC }}℃</span>
          </li>
        </ul>

        <h3>着装建议</h3>
        <p>{{ answer.clothingAdvice }}</p>

        <h3>路线</h3>
        <p>{{ answer.route?.name ?? '—' }}</p>

        <div v-if="answer.attractions?.length" class="poi-list">
          <h3>景点（点击跳转地图）</h3>
          <button
            v-for="(a, i) in answer.attractions"
            :key="'a-' + i"
            type="button"
            class="poi-btn poi-btn--att"
            @click="flyToPoi(buildPoi('attraction', a))"
          >
            {{ a.name }}
          </button>
        </div>

        <div v-if="answer.accommodations?.length" class="poi-list">
          <h3>住宿</h3>
          <button
            v-for="(h, i) in answer.accommodations"
            :key="'h-' + i"
            type="button"
            class="poi-btn poi-btn--hotel"
            @click="flyToPoi(buildPoi('hotel', h))"
          >
            {{ h.name }}
          </button>
        </div>
      </section>
    </aside>

    <div class="map-wrap">
      <div ref="mapEl" class="map" role="presentation" />
      <div ref="popupEl" class="ol-popup" @click.stop>
        <button type="button" class="ol-popup__close" aria-label="关闭" @click="closePopup">
          ×
        </button>
        <template v-if="selectedPoi">
          <p class="ol-popup__tag" :class="selectedPoi.kind === 'hotel' ? 'is-hotel' : 'is-att'">
            {{ selectedPoi.kind === 'hotel' ? '住宿' : '景点' }}
          </p>
          <h4 class="ol-popup__title">{{ selectedPoi.name }}</h4>
          <p v-if="selectedPoi.note" class="ol-popup__note">{{ selectedPoi.note }}</p>
          <div v-if="selectedPoi.imageUrl && !imgBroken" class="ol-popup__img-wrap">
            <img
              :src="selectedPoi.imageUrl"
              alt=""
              class="ol-popup__img"
              @error="imgBroken = true"
            >
          </div>
          <p class="ol-popup__desc">{{ selectedPoi.description || '暂无详细介绍。' }}</p>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  align-items: stretch;
  min-height: 100vh;
  height: 100vh;
}

.panel {
  width: min(420px, 100vw);
  padding: 1.25rem 1.25rem 2rem;
  background: #fff;
  border-right: 1px solid #e2e8f0;
  overflow-y: auto;
}

.brand {
  position: relative;
  margin: 0 0 0.75rem;
  padding: 0.35rem 0 0.5rem;
}

.brand__glow {
  position: absolute;
  left: 50%;
  top: 40%;
  transform: translate(-50%, -50%);
  width: 140%;
  height: 120%;
  max-width: 320px;
  background: radial-gradient(
    ellipse at center,
    rgba(99, 102, 241, 0.22) 0%,
    rgba(14, 165, 233, 0.08) 45%,
    transparent 70%
  );
  pointer-events: none;
  z-index: 0;
}

.brand__title {
  position: relative;
  z-index: 1;
  margin: 0;
  line-height: 1.05;
}

.brand__text {
  display: inline-block;
  font-family: 'Outfit', 'Noto Sans SC', system-ui, sans-serif;
  font-weight: 800;
  font-size: clamp(1.85rem, 5vw, 2.35rem);
  letter-spacing: -0.04em;
  background: linear-gradient(
    110deg,
    #0ea5e9 0%,
    #6366f1 22%,
    #8b5cf6 48%,
    #d946ef 78%,
    #f43f5e 100%
  );
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: brand-gradient 10s ease-in-out infinite;
  filter: drop-shadow(0 2px 12px rgba(99, 102, 241, 0.35));
}

@keyframes brand-gradient {
  0%,
  100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

.brand__tagline {
  position: relative;
  z-index: 1;
  margin: 0.45rem 0 0;
  font-family: 'Noto Sans SC', system-ui, sans-serif;
  font-size: 0.82rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: #64748b;
  opacity: 0.95;
}

.muted {
  margin: 0;
  color: #64748b;
  font-size: 0.85rem;
}

.leg {
  font-size: 0.9rem;
  margin: 0 0.1rem;
}

.leg--att {
  color: #059669;
}

.leg--hotel {
  color: #ea580c;
}

.chat textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font: inherit;
  resize: vertical;
}

.btn {
  margin-top: 0.75rem;
  padding: 0.55rem 1.25rem;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  color: #b91c1c;
  font-size: 0.9rem;
}

.result {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
}

.result h2 {
  font-size: 1.05rem;
  margin: 0 0 0.5rem;
}

.result h3 {
  font-size: 0.95rem;
  margin: 1rem 0 0.35rem;
  color: #334155;
}

.reply {
  margin: 0;
  white-space: pre-wrap;
}

.weather {
  margin: 0;
  padding-left: 1.1rem;
}

.badge {
  display: inline-block;
  margin: 0 0 0.5rem;
  padding: 0.15rem 0.5rem;
  background: #fef3c7;
  color: #92400e;
  border-radius: 4px;
  font-size: 0.8rem;
}

.poi-list {
  margin-top: 0.75rem;
}

.poi-btn {
  display: block;
  width: 100%;
  margin-bottom: 0.35rem;
  padding: 0.4rem 0.6rem;
  text-align: left;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f8fafc;
  cursor: pointer;
  font-size: 0.9rem;
}

.poi-btn--att {
  border-color: #a7f3d0;
}

.poi-btn--hotel {
  border-color: #fed7aa;
}

.poi-btn:hover {
  filter: brightness(0.97);
}

.map-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.map {
  width: 100%;
  height: 100%;
  background: #e2e8f0;
}

.ol-popup {
  min-width: 240px;
  max-width: min(320px, 90vw);
  padding: 0.75rem 0.85rem;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
  border: 1px solid #e2e8f0;
}

.ol-popup__close {
  position: absolute;
  top: 4px;
  right: 6px;
  border: none;
  background: transparent;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
}

.ol-popup__tag {
  margin: 0 0 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.is-att {
  color: #059669;
}

.is-hotel {
  color: #ea580c;
}

.ol-popup__title {
  margin: 0 1.25rem 0.35rem 0;
  font-size: 1rem;
}

.ol-popup__note {
  margin: 0 0 0.5rem;
  font-size: 0.82rem;
  color: #64748b;
}

.ol-popup__img-wrap {
  margin: 0 0 0.5rem;
  border-radius: 8px;
  overflow: hidden;
  background: #f1f5f9;
  max-height: 160px;
}

.ol-popup__img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 160px;
  object-fit: cover;
}

.ol-popup__desc {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.45;
  color: #334155;
}

@media (max-width: 768px) {
  .layout {
    flex-direction: column;
  }
  .panel {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid #e2e8f0;
  }
  .map-wrap {
    min-height: 50vh;
  }
}
</style>
