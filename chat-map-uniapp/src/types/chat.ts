export interface WeatherItem {
  city: string
  period: string
  condition: string
  temperatureC: number | null
}

export interface RouteInfo {
  name: string
  coordinates?: number[][]
}

export interface MapPoi {
  kind: 'attraction' | 'hotel'
  /** 当 tripDays 有值时，表示建议在第几天游览（1 起） */
  day?: number | null
  name: string
  lng: number
  lat: number
  note: string
  description: string
  imageUrl: string
}

export interface TravelChatResponse {
  reply: string
  weather: WeatherItem[]
  clothingAdvice: string
  /** 从用户问题推断的出行天数；无法推断时为 null */
  tripDays: number | null
  route: RouteInfo | null
  attractions: MapPoi[]
  accommodations: MapPoi[]
  demo?: boolean
}
