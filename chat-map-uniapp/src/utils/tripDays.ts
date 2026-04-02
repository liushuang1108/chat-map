import type { MapPoi, TravelChatResponse } from '@/types/chat'

/**
 * 从自然语言问题里尽量提取「玩几天」的天数（如「三天」「玩3天」「五一去长沙玩三天」）。
 * 提取不到返回 null。
 */
export function extractTripDaysFromQuestion(q: string): number | null {
  const s = q.replace(/\s+/g, '')
  const mNum = s.match(/(\d{1,2})\s*[天日]/)
  if (mNum) {
    const n = parseInt(mNum[1], 10)
    if (n >= 1 && n <= 31) return n
  }
  const textMap: Array<[string, number]> = [
    ['一天', 1],
    ['一日', 1],
    ['二天', 2],
    ['两天', 2],
    ['两日', 2],
    ['三天', 3],
    ['三日', 3],
    ['四天', 4],
    ['四日', 4],
    ['五天', 5],
    ['五日', 5],
    ['六天', 6],
    ['六日', 6],
    ['七天', 7],
    ['七日', 7],
    ['八天', 8],
    ['八日', 8],
    ['九天', 9],
    ['九日', 9],
    ['十天', 10],
    ['十日', 10],
  ]
  for (const [k, v] of textMap) {
    if (s.includes(k)) return v
  }
  return null
}

function distributeDaysEvenly(attractions: MapPoi[], n: number): MapPoi[] {
  if (n < 1 || attractions.length === 0) return attractions
  const perDay = Math.ceil(attractions.length / n)
  return attractions.map((a, i) => ({
    ...a,
    day: Math.min(Math.floor(i / perDay) + 1, n),
  }))
}

/**
 * 与问题对齐：强制 tripDays；若模型未填 day，则按列表顺序均分到各天。
 */
export function alignTripDaysWithQuestion(
  data: TravelChatResponse,
  question: string,
): TravelChatResponse {
  const inferred = extractTripDaysFromQuestion(question)
  let tripDays: number | null = data.tripDays ?? null
  if (inferred != null) {
    tripDays = inferred
  }
  if (tripDays == null || tripDays < 1) {
    return { ...data, tripDays: null }
  }

  const atts = data.attractions
  if (atts.length === 0) {
    return { ...data, tripDays }
  }

  const hasDay = atts.some(
    (a) => a.day != null && a.day >= 1 && a.day <= tripDays,
  )
  const nextAttractions = hasDay ? atts : distributeDaysEvenly(atts, tripDays)

  return {
    ...data,
    tripDays,
    attractions: nextAttractions,
  }
}
