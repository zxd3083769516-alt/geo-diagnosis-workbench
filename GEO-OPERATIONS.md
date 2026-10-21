# GEO 运营系统：使用与维护

本次基于原诊断台升级，保留行业题库、已有模型连接和深蓝/青色视觉。统一主页面为 `components/geo-operations.tsx`。

## 本地运行

Node >=22.13，按 pnpm-lock.yaml 安装依赖后执行 `pnpm dev`。开发工作区数据保存在 `.local-data/geo.sqlite`，不是线上数据库。该目录、密钥和验收数据不进入 Git。

`pnpm build` 生成并包装 Worker。`pnpm test` 验证系统逻辑；`node scripts/check-content-edits.mjs` 验证旧编辑兼容；`node scripts/check-everyday-questions.mjs` 检查六行业题库；构建后 `node scripts/check-worker.mjs` 在本地 Worker/D1 中验证实际路由和保存。测试不会调用真实模型。

## 工作流程

1. 新建客户，补充真实品牌与业务资料；录入 Brand Facts 并关联公开证据。
2. 生成或录入 Query，审核业务前提与近义重复，调整逐题权重。品牌定向单独统计。
3. 在测试协议中确认条件及判定规则；选择问题和平台创建独立 Run。六家API均需配置自己的密钥；ChatGPT（OpenAI API，gpt-5.4）与Kimi（Moonshot国内API，kimi-k2.6）默认停用，配置后可启用。已有客户可用平台页的“添加 ChatGPT / Kimi API 平台”创建独立API记录，原网页平台保持不变。
4. 核查提及、推荐、名次、事实数、竞品和来源；无序列表不推断前三，未核实项不当成零分。
5. 从 Run 关联 Gap，从 Gap 创建 Action，再从 Action 创建 Experiment；选择可比较的前后 Run。
6. 记录月度样本和业务结果。业务数据为人工录入/JSON导入，不自动连接分析平台，也不自动归因。

## 人工编辑与保护

各业务记录均有“编辑 / 版本”。AI只生成候选稿，不会直接替换当前内容。采用候选稿、恢复原稿/首份AI稿/历史稿均需明确确认；未保存编辑时不能采用或恢复。旧稿与修订历史保留。

人工改写回答会清除过期判定；原始回答仍在。人工改写正文默认不计原始表现，人工核查判定可以计入。客户、问题正文/权重/品牌定向或协议版本变化后，旧样本退出当前基准，但可以通过实验固定Run查看历史。

服务器确认后才显示保存成功。另一窗口先保存会触发版本冲突；导出当前草稿、重新读取服务端、导入备份后逐条审阅候选稿。JSON保留完整工作区；Excel供分析查阅，超长单元格截断时会提示使用JSON。

## 指标口径

支持八项 KPI 和加权可见度，页面“查看口径”提供分母。Prompt/Platform Coverage 表示至少被提及一次的计划问题/平台覆盖，测试完成度另列。Competitor Share 表示竞品占全部品牌去重提及的份额。加权可见度先对同Query×Platform的重复运行取平均，再使用Run冻结的题目权重。

来源L1–L5为内部来源分类，不能代替真实性、独立性、相关性与时效核验。Source Map显示待核实来源，但Source Coverage只纳入符合要求的已核实来源。前后实验只能作观察性比较，不能单独证明因果。

## 存储与发布

稳定ID覆盖客户、题目、平台、协议、Run、来源、Gap、动作、Experiment、月报和业务记录。D1按owner隔离，geo_records逐条存储，带版本检查的事务批量保存；元数据保留顺序。记录自身带修订历史；workspace_history是审计元数据，不是完整工作区一键回滚界面。

Sites沿用现有项目ID，新增DB绑定及Drizzle迁移。上线前需将迁移随构建打包，并验证生产用户身份转发与DB绑定。此次已验证本地生产Worker，未部署、未声称线上数据库就绪。

## ChatGPT / Kimi 接入依据
- OpenAI: https://developers.openai.com/api/docs/models/gpt-5.4 和 https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create 。采用Chat Completions、max_completion_tokens、reasoning_effort=none；不启用联网工具。
- Kimi: https://platform.kimi.com/docs/guide/kimi-k2-6-quickstart 和 https://platform.kimi.com/docs/api/overview 。采用Moonshot国内端点、max_tokens、thinking.type=disabled；不设置不兼容的temperature。
- 密钥在平台与连接中分别保存、测试、移除。API输出不能代表消费端网页排名或联网效果。GPT批量改写优先使用已保存OpenAI密钥，保留既有服务端密钥作为回退。
