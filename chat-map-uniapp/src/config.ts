/**
 * 上线请使用 cloud：不走小程序内填 Key，密钥只在云函数环境变量。
 * 仅本地调试时改为 direct，并在页面会出现 Key 输入（切勿用于正式发布）。
 */
export const LLM_MODE: 'direct' | 'cloud' = 'cloud'

/** cloud 模式必填：微信云开发环境 ID（控制台复制） */
export const WX_CLOUD_ENV_ID = 'cloudbase-7gva254t0cc8d9d5'