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
  '- attractions: array，游览景点（与住宿分开），数组顺序=建议游览先后顺序（第一个=第一站）。每项：name（具体地标名）, ' +
  'lng, lat（必须为 **WGS84 大地坐标** / EPSG:4326，与 GPS、OpenStreetMap、维基常用经纬度一致；' +
  '勿使用高德/百度等火星坐标 GCJ-02 的数字）。可到小数点后 4～5 位。note, description（2～4 句）, imageUrl（https 或 ""）。\n' +
  '- route: object，含 name（路线标题）, coordinates（可选，[lng,lat] 数组）。' +
  '若填写 coordinates，须与 attractions 严格一致：第 1 个点必须等于 attractions[0] 的 lng/lat，' +
  '且折线按 attractions 顺序依次经过每一处（可在相邻景点间增加中间拐点表示沿路走向）。\n' +
  '- accommodations: array，住宿。每项：name, lng, lat（同上，**WGS84**）, note, description, imageUrl（无则 ""）。\n' +
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
