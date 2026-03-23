import { LLM_MODE } from '@/config'
import { SYSTEM_PROMPT } from './prompt'
import { parseTravelJson } from './parse'
import type { TravelChatResponse } from '@/types/chat'

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'
const MODEL = 'deepseek-chat'

type CloudFnResult = {
  errCode?: number
  errMsg?: string
  content?: string
}

export async function callDeepSeekTravel(apiKey: string, question: string): Promise<TravelChatResponse> {
  if (LLM_MODE === 'cloud') {
    return callTravelCloud(question)
  }

  const key = apiKey.trim()
  if (!key) {
    throw new Error('请先填写 DeepSeek API Key')
  }

  const res = await new Promise<UniApp.RequestSuccessCallbackResult>((resolve, reject) => {
    uni.request({
      url: DEEPSEEK_URL,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      data: {
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: question },
        ],
      },
      success: resolve,
      fail: (e) => reject(e),
    })
  })

  if (res.statusCode !== 200 || !res.data) {
    const msg =
      typeof res.data === 'object' && res.data !== null && 'error' in res.data
        ? JSON.stringify((res.data as { error?: unknown }).error)
        : `HTTP ${res.statusCode}`
    throw new Error(msg || '请求失败')
  }

  const data = res.data as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const raw = data.choices?.[0]?.message?.content
  if (!raw || typeof raw !== 'string') {
    throw new Error('模型返回格式异常')
  }

  return parseTravelJson(raw.trim())
}

function callTravelCloud(question: string): Promise<TravelChatResponse> {
  // #ifdef MP-WEIXIN
  const wxMp = wx as unknown as {
    cloud: {
      callFunction: (opt: {
        name: string
        data?: Record<string, unknown>
        success?: (res: { result?: CloudFnResult }) => void
        fail?: (e: unknown) => void
      }) => void
    }
  }
  return new Promise((resolve, reject) => {
    wxMp.cloud.callFunction({
      name: 'callTravel',
      data: { question },
      success: (res) => {
        const r = res.result as CloudFnResult | undefined
        if (!r) {
          reject(new Error('云函数无返回'))
          return
        }
        if (r.errCode) {
          reject(new Error(r.errMsg || '云函数错误'))
          return
        }
        const raw = r.content
        if (!raw || typeof raw !== 'string') {
          reject(new Error('云函数未返回模型内容'))
          return
        }
        try {
          resolve(parseTravelJson(raw.trim()))
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      },
      fail: (e) => reject(e instanceof Error ? e : new Error(String(e))),
    })
  })
  // #endif
  // #ifndef MP-WEIXIN
  return Promise.reject(new Error('cloud 模式仅支持微信小程序'))
  // #endif
}
