import type { MapPoi, TravelChatResponse, WeatherItem } from '@/types/chat'

function stripFence(s: string): string {
  let t = s.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  }
  return t.trim()
}

export function parseTravelJson(raw: string): TravelChatResponse {
  const text = stripFence(raw)
  const node = JSON.parse(text) as Record<string, unknown>

  const reply = String(node.reply ?? '')
  const clothingAdvice = String(node.clothingAdvice ?? '')

  const weather: WeatherItem[] = Array.isArray(node.weather)
    ? (node.weather as Record<string, unknown>[]).map((w) => ({
        city: String(w.city ?? ''),
        period: String(w.period ?? ''),
        condition: String(w.condition ?? ''),
        temperatureC:
          w.temperatureC === null || w.temperatureC === undefined
            ? null
            : Number(w.temperatureC),
      }))
    : []

  const toPoi = (o: Record<string, unknown>, kind: MapPoi['kind']): MapPoi => ({
    kind,
    name: String(o.name ?? ''),
    lng: Number(o.lng),
    lat: Number(o.lat),
    note: String(o.note ?? ''),
    description: String(o.description ?? ''),
    imageUrl: String(o.imageUrl ?? ''),
  })

  const attractions: MapPoi[] = Array.isArray(node.attractions)
    ? (node.attractions as Record<string, unknown>[]).map((a) => toPoi(a, 'attraction'))
    : []

  const accommodations: MapPoi[] = Array.isArray(node.accommodations)
    ? (node.accommodations as Record<string, unknown>[]).map((a) => toPoi(a, 'hotel'))
    : []

  let route: TravelChatResponse['route'] = null
  const r = node.route as Record<string, unknown> | null | undefined
  if (r && typeof r === 'object') {
    const coords = r.coordinates
    route = {
      name: String(r.name ?? ''),
      coordinates: Array.isArray(coords) ? (coords as number[][]) : undefined,
    }
  }

  return {
    reply,
    weather,
    clothingAdvice,
    route,
    attractions,
    accommodations,
    demo: false,
  }
}
