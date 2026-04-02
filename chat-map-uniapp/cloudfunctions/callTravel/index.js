/**
 * 微信云函数：代管 DeepSeek Key（在云开发控制台 → 云函数 → 环境变量 配置 DEEPSEEK_API_KEY）
 * 上传：微信开发者工具 → 云开发 → 云函数 → 上传并部署
 */
const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const SYSTEM_PROMPT =
  '你是中文旅游助手。用户会提出与行程、城市、时间相关的问题。\n' +
  '你必须只输出一个 JSON 对象，不要 Markdown，不要代码块。字段如下：\n' +
  '- reply: string，对用户问题的自然语言总结与建议（简短）。\n' +
  '- weather: array，每项含 city, period（如"行前""行程中""返程"）, condition, temperatureC（整数或 null）。\n' +
  '- clothingAdvice: string，着装建议。\n' +
  '- tripDays: number 或 null。若能从用户问题中明确推断出行天数（如「五一去长沙玩三天」→3、「玩 2 天」→2），填正整数；' +
  '若完全无法推断或问题与天数无关，填 null。\n' +
  '当 tripDays 为正整数 N 时：attractions 中**每一项**都必须含 day 字段，且 day 只能为 1..N；' +
  '须按「第1天 / 第2天 / …」拆分：day=1 的景点只放第一天要去的，day=2 只放第二天，以此类推；每天至少 1～3 个景点为宜。\n' +
  '当 tripDays 为 null 时：不要填 day，只列出该目的地最热门、最典型的少量景点（约 3～5 个）。\n' +
  '- attractions: array，游览景点（与住宿分开）。每项：name（具体地标名）, ' +
  'lng, lat（必须为 **WGS84 大地坐标** / EPSG:4326，与 GPS、OpenStreetMap、维基常用经纬度一致；' +
  '勿使用高德/百度等火星坐标 GCJ-02 的数字）。可到小数点后 4～5 位。note, description（2～4 句）, imageUrl 恒为 "" , ' +
  'day: number（当 tripDays 为 null 时可省略；当 tripDays 为正整数时必填）。\n' +
  '- route: object，仅含 name（行程/路线标题，如「长沙三日游」）。不要输出 coordinates 字段（客户端不在地图画连线）。\n' +
  '- accommodations: array，住宿。每项：name, lng, lat（同上，**WGS84**）, note, description, imageUrl 恒为 ""。\n' +
  '坐标准确性：先定城市与真实地名再填经纬度；粗略时在 reply 说明。attractions 与 accommodations 勿重复同一 POI。'

function postJson(hostname, path, body, headers) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(body, 'utf8')
    const req = https.request(
      {
        hostname,
        path,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': data.length,
        },
      },
      (res) => {
        let chunks = ''
        res.on('data', (c) => (chunks += c))
        res.on('end', () => {
          try {
            const parsed = JSON.parse(chunks)
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed)
            } else {
              reject(new Error(chunks || `HTTP ${res.statusCode}`))
            }
          } catch (e) {
            reject(e)
          }
        })
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

exports.main = async (event) => {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key || !key.trim()) {
    return { errCode: 1, errMsg: '云函数未配置环境变量 DEEPSEEK_API_KEY' }
  }
  const question = (event && event.question) || ''
  if (!question.trim()) {
    return { errCode: 2, errMsg: 'question 为空' }
  }

  const body = JSON.stringify({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: question },
    ],
  })

  try {
    const resp = await postJson(
      'api.deepseek.com',
      '/v1/chat/completions',
      body,
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key.trim()}`,
      }
    )
    const raw = resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content
    if (!raw || typeof raw !== 'string') {
      return { errCode: 3, errMsg: '模型返回格式异常' }
    }
    return { content: raw.trim() }
  } catch (e) {
    return { errCode: 9, errMsg: e.message || String(e) }
  }
}
