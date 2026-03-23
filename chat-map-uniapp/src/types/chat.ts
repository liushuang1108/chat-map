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
  route: RouteInfo | null
  attractions: MapPoi[]
  accommodations: MapPoi[]
  demo?: boolean
}
