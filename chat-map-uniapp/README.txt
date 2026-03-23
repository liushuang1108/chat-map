ChatMap 小程序 · 你需要做的事（详细版）
========================================

一、你要达成什么
----------------
  上线后：用户在小程序里提问 → 调用「微信云函数」→ 云函数用你的 DeepSeek 密钥请求模型
  → 不在小程序里填写、也不把密钥打进前端代码。

  工程默认：src/config.ts 里 LLM_MODE = 'cloud'，页面没有 API Key 输入框。


二、前置条件（一次性准备）
--------------------------
  1) 微信小程序账号
     - 在 https://mp.weixin.qq.com 注册「小程序」，完成主体信息（个人或企业按平台要求）。
     - 记下 AppID（在「开发」→「开发管理」→「开发设置」里可见）。

  2) 微信开发者工具
     - 安装最新版：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
     - 用管理员/开发者微信扫码登录。

  3) DeepSeek API Key
     - 在 DeepSeek 开放平台申请，用于云函数环境变量（不要写在小程序源码里）。


三、把工程接到你的小程序上
--------------------------
  1) 打开 chat-map-uniapp/src/manifest.json
     - 在 mp-weixin 段填写你的小程序 appid（字符串，引号内）。

  2) 用微信开发者工具「导入项目」
     - 若用 uni-app 编译：先在本机执行 npm run dev:mp-weixin（或 build:mp-weixin），
       再选择「编译输出目录」导入（常见为 dist/dev/mp-weixin 或 dist/build/mp-weixin，以你本机实际为准）。
     - AppID 选你注册的小程序；不要用测试号长期上线。

  3) 确认能正常编译、模拟器能打开首页（地图 + 底部浮层）。


四、开通微信云开发（上线必做）
------------------------------
  1) 在微信开发者工具顶部或菜单找到「云开发」。
  2) 按提示开通（需同意协议；个人/企业额度与规则以微信为准）。
  3) 创建「云环境」若提示你创建；创建后会得到一个「环境 ID」（EnvId），形如 xxx-xxxxx，
     复制保存——后面要填进 config.ts。

  4) 计费：云开发有免费额度，超出后按官方计费；上线前可在云开发控制台查看用量与告警。


五、部署云函数 callTravel（核心）
--------------------------------
  本仓库已提供：cloudfunctions/callTravel/（含 index.js、package.json）。

  1) 确认项目根目录（与 src 同级）下存在文件夹 cloudfunctions/callTravel。
  2) manifest.json 里 mp-weixin 已配置 cloudfunctionRoot 为 cloudfunctions/（本仓库已写）。
  3) 在微信开发者工具左侧「云开发」→「云函数」中：
     - 若支持从目录上传：选择 callTravel 目录，上传并安装依赖（或右键该云函数「上传并部署：云端安装依赖」）。
     - 若工具要求先在云端创建函数：新建云函数名称必须为 callTravel（与前端 wx.cloud.callFunction 的 name 一致），
       再把本仓库 index.js、package.json 内容覆盖到云端函数目录后重新部署。

  4) 部署成功后，在云函数列表里应能看到 callTravel，状态为「已部署」或正常。

  5) 云函数内请求的是 api.deepseek.com，出网由云函数环境完成；与小程序「request 合法域名」不是同一套规则，
     一般不必把 api.deepseek.com 配进小程序 request 域名（若真机报错再按控制台提示排查）。


六、在云函数里配置密钥（必做）
------------------------------
  1) 打开微信开发者工具 → 云开发控制台（或网页版云开发控制台）。
  2) 进入「云函数」→ 选中 callTravel →「版本与配置」或「环境变量」类入口（界面随微信更新可能略有不同）。
  3) 新增环境变量：
     名称：DEEPSEEK_API_KEY
     值：你的 sk-... 密钥（仅保存在云端，不要写进 index.js）。
  4) 保存后，对云函数执行一次「上传并部署」或「更新配置」，使新环境变量生效（以控制台实际按钮为准）。

  说明：云函数代码里使用 process.env.DEEPSEEK_API_KEY 读取；名称必须一致。


七、填写前端云环境 ID
---------------------
  1) 打开 src/config.ts。
  2) 保持：export const LLM_MODE = 'cloud'（默认已是）。
  3) 填写：
     export const WX_CLOUD_ENV_ID = '你在第四步复制的环境 ID'
  4) 保存后重新编译小程序。

  5) src/App.vue 会在启动时对 wx.cloud.init 使用该环境 ID；若留空，云端调用可能失败。


八、自测流程（上线前）
--------------------
  1) npm run dev:mp-weixin（或 build:mp-weixin）重新出包。
  2) 微信开发者工具里真机预览或模拟器：展开底部面板 → 输入问题 → 发送。
  3) 若失败：
     - 看开发者工具「调试器」Console / Network 是否有云函数报错；
     - 在云开发控制台查看 callTravel 的日志与调用次数；
     - 确认环境变量是否拼写正确、云函数是否最新部署。

  4) 地图、弹窗、收起浮层等交互自行点一遍。


九、提交审核与发布
------------------
  1) 使用「上传」把代码传到微信公众平台（选体验版或提交审核的版本号按你团队规范）。
  2) 登录 mp.weixin.qq.com →「版本管理」→ 提交审核（按页面要求填写类目、隐私协议等）。
  3) 审核通过后「发布」；用户通过搜索或扫码使用正式版。

  注意：类目若选「工具」或「旅游」等，需与小程序实际功能一致，以平台规则为准。


十、仅本地调试（不想用云函数时，可选）
--------------------------------------
  1) src/config.ts 改为：export const LLM_MODE = 'direct'
  2) 重新编译，页面会出现 Key 输入框；填 DeepSeek Key 后仅存在本机 Storage。
  3) 微信公众平台 → 开发设置 → 服务器域名 → request 合法域名 添加：https://api.deepseek.com
  4) 发正式包前必须改回 cloud，并去掉本机对正式用户的依赖。

  切勿把带 Key 的 direct 配置提交到公开仓库或用于正式发布。


十一、图片与域名（按需）
-----------------------
  若回答里含外链图片（如维基图片），真机可能要求配置「downloadFile 合法域名」为图片所在域名；
  在微信公众平台「开发设置」里添加对应域名（需 https）。


十二、清单速查
--------------
  [ ] manifest.json 已填小程序 appid
  [ ] 已开通云开发并取得环境 ID
  [ ] callTravel 云函数已部署且名称一致
  [ ] 云函数环境变量 DEEPSEEK_API_KEY 已配置
  [ ] config.ts 中 WX_CLOUD_ENV_ID 已填写
  [ ] LLM_MODE 为 cloud（上线）
  [ ] 自测对话与地图正常后再提审
