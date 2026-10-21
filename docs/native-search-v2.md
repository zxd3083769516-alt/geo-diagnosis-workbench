# 原生联网测试适配（2026-09-13）

本次只修改 AI 测试采集、执行展示与记录保护，不修改题库生成、客户资料、评分公式、报告或数据库结构。

## 平台与官方依据

|平台|保留的模型|接口与原生工具|依据|
|---|---|---|---|
|ChatGPT|gpt-5.4|OpenAI Responses / web_search|https://developers.openai.com/api/docs/guides/tools-web-search|
|豆包|doubao-seed-2-0-lite-260215|方舟 Responses / web_search|https://www.volcengine.com/docs/82379/1958524|
|DeepSeek|deepseek-v4-flash|DeepSeek Responses / web_search|https://api-docs.deepseek.com/api/create-response/|
|Kimi|kimi-k2.6|Moonshot Chat / builtin_function $web_search|https://platform.kimi.com/docs/guide/use-web-search|
|千问|qwen-plus|DashScope 原生 Generation / enable_search + enable_source|https://help.aliyun.com/zh/model-studio/web-search|
|智谱|glm-4.5-air|Chat / web_search + search_result|https://docs.bigmodel.cn/cn/guide/tools/web-search|

豆包文档正文抓取受阻，以火山引擎官方 SDK 的 Responses 类型补核 web_search_call/status/action/来源结构：https://pkg.go.dev/github.com/volcengine/volcengine-go-sdk/service/arkruntime/model/responses 。具体账号的模型和工具权限仍必须实测。

## 语义与数据流

每题每平台独立构造请求。初始输入只有原始问题，无 system、客户资料、标签、权重、竞品、历史会话、JSON 输出约束。服务端拒绝额外上下文字段。Kimi 仅回传当前问题生成的官方工具参数，无第三方搜索和跨题历史。

搜索开启与搜索执行分别存储。只有原生搜索完成事件、search_info、原生搜索结果或 Kimi 官方搜索回传成功完成，才能判为已执行。普通回答 URL、token 数或工具开关不能证明联网。证据缺失标为未知；失败或流中断标为失败，保存已收到片段，不进入成功评分。每次重试建立新 Run，用 retryOf 关联。

原始回答 → collectRun 持久化 → 独立分析 API（允许客户事实）→ 结构化判定。人工已改内容再次分析进入候选稿；原始回答、原生引用和人工审核不被覆盖。

复测以原始问题快照、请求模型、返回模型、联网配置、独立会话及适配版本匹配；不静默切换模型。新版适配与旧版结果不可直接当作同条件基线。

## 验证范围

42 项自动检查通过，覆盖六平台请求隔离、Kimi 工具往返、原生来源解析、搜索状态、流失败、人工保护、SQLite 持久化、评分和导出。模拟结果不代表真实外部平台结果。

真实问题：厦门有哪些比较靠谱的装修公司？
OpenAI 已发起实测，首次在网络连接阶段失败，无原始回答、无搜索证据。详见 verification/chatgpt-live.json。
其他五家密钥在用户浏览器加密 Cookie 内；本轮浏览器会话连接连续超时，无法使用，标记未实测，不代表用户未配置密钥。

## 所需配置

在现有“平台与连接”中保存各平台 API Key，不要在聊天粘贴密钥。OpenAI、Moonshot、DeepSeek 需对应 API 账户余额；方舟需模型和工具权限；百炼需 qwen-plus 权限；智谱需模型及 search_pro 服务可用。消费端会员不等同于 API 权限。任何权限/余额错误会直接显示，不自动替换平台。

API 与消费端产品的搜索编排及模型版本可能不同，不承诺回答一致。
