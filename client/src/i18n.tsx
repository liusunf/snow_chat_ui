/** 轻量 i18n：中文 / English 切换（无第三方依赖） */

import { createContext, useContext, useState, type ReactNode } from 'react';

export type Lang = 'zh' | 'en';

const LANG_KEY = 'chatui_lang';

/* ---------------- 字典 ---------------- */

const zh: Record<string, string> = {
  // 通用
  'common.newChat': '新对话',
  'common.settings': '设置',
  'common.config': '配置',
  'common.chats': '会话',
  'common.chat': '聊天',
  'common.noConversations': '暂无会话，点击「新对话」开始',
  'common.newConversation': '新建对话',
  'common.deleteConv': '删除会话',
  'common.online': '服务在线',
  'common.offline': '服务未连接',
  'common.notConfigured': '未配置',
  'common.connecting': '连接中…',
  'common.connectingServer': '正在连接服务端（{0}）…',
  'common.runDev': '请先运行 npm run dev 启动前后端',
  'common.noTitle': '新对话',
  'common.noConvsTitle': '暂无会话',
  'common.langBtn': 'EN',
  'common.langTitle': '切换到 English',
  'common.workbench': '对话工作台',
  'common.skillCount': '{0} 技能',

  // 对话页
  'chat.conversations': '会话列表',
  'chat.stop': '停止生成',
  'chat.running': '运行中…',
  'chat.ok': '✓ 完成',
  'chat.fail': '✗ 失败',
  'chat.errPrefix': '错误：',
  'chat.done': '（完成）',
  'chat.placeholder': '输入消息，Enter 发送，Shift+Enter 换行…',
  'chat.welcomeSub': '支持统一配置任意 LLM Provider（OpenAI 兼容 / Claude / Gemini / Ollama），并通过 MCP 与 Skill 调用工具。在「设置中心」完成配置后即可开始对话。',
  'chat.suggest1a': '现在几点？',
  'chat.suggest1b': '计算 (123*456+789)/3',
  'chat.suggest1c': '北京现在天气如何？',
  'chat.suggest2a': '解释什么是 MCP 协议，并各举一个例子',
  'chat.suggest2b': '用 Python 画一个简单的饼图',
  'chat.suggest2c': '把这段 JSON 转成表格',
  'chat.suggest3a': '写一份本周工作周报的提纲',
  'chat.suggest3b': '把这句翻译成英文：今天天气不错',
  'chat.suggest3c': '帮我总结一下这篇文章的要点',

  // 设置中心
  'settings.title': '设置中心',
  'settings.apiDocs': '📖 接口文档',
  'settings.apiDocsTitle': '后端接口对接文档',
  'settings.export': '导出',
  'settings.import': '导入',
  'settings.save': '保存配置',
  'settings.saving': '保存中…',
  'settings.back': '返回聊天',
  'settings.tabProviders': '模型服务',
  'settings.tabMcp': '工具连接',
  'settings.tabSkills': '技能',
  'settings.tabAdvanced': '高级与数据',
  'settings.enabled': '{0} 启用',
  'settings.defaultProviderTitle': '当前默认 Provider',
  'settings.setDefaultTitle': '设为默认 Provider',
  'settings.defaultTag': '默认',
  'settings.fetchModels': '拉模型',
  'settings.fetching': '拉取中…',
  'settings.test': '测试',
  'settings.testing': '测试中…',
  'settings.delete': '删除',
  'settings.type': '类型',
  'settings.name': '名称',
  'settings.apiKey': 'API Key',
  'settings.apiKeySaved': '已保存（留空保持不变）',
  'settings.baseUrl': 'Base URL',
  'settings.baseUrlAnthropic': 'API 地址（可留空用官方）',
  'settings.baseUrlHint': 'OpenAI 兼容地址指向 …/v1；支持 DeepSeek / Moonshot / 通义 / vLLM 等',
  'settings.model': '模型',
  'settings.whitelistLabel': '模型白名单（勾选后仅显示这些模型；不勾选 = 全部）',
  'settings.showFirst60': '仅展示前 60 个',
  'settings.advancedParams': '高级参数（Temperature / Max Tokens）',
  'settings.enable': '启用',
  'settings.addProvider': '＋ 添加 Provider',
  'settings.pickerTitle': '选择供应商',
  'settings.close': '关闭',
  'settings.searchProvider': '搜索供应商…（OpenAI / DeepSeek / Kimi / Claude…）',
  'settings.custom': '空白自定义',
  'settings.customHint': '手动配置任意 OpenAI 兼容端点',
  'settings.toastAdded': '已添加「{0}」，填入 API Key 后保存',
  'settings.toastFetched': '获取到 {0} 个模型，勾选即白名单',
  'settings.toastFetchFail': '在线拉取失败（{0}），已提供常见模型候选',
  'settings.toastNoModels': '未获取到模型',
  'settings.mcpDesc': 'Model Context Protocol：接入外部工具服务（stdio 进程 / SSE / HTTP）。',
  'settings.mcpTransport': '传输方式',
  'settings.mcpStdio': 'stdio（本地进程）',
  'settings.mcpSse': 'SSE（服务端）',
  'settings.mcpHttp': 'HTTP/Streamable（服务端）',
  'settings.mcpCommand': '命令',
  'settings.mcpArgs': '参数（逗号分隔）',
  'settings.mcpArgsPlaceholder': '例如: -y, @modelcontextprotocol/server-everything',
  'settings.mcpUrl': '服务地址',
  'settings.mcpEnabledDesc': '启用后工具作为 Skill 注入对话',
  'settings.mcpExpose': '暴露为技能',
  'settings.addMcp': '＋ 添加 MCP Server',
  'settings.connecting': '连接中…',
  'settings.mcpInjectedHint': 'MCP 工具通过「工具连接」页的「暴露为技能」开关注入，此处统一显示启用状态。',
  'settings.systemPrompt': '系统提示词',
  'settings.systemPromptSub': '定义 AI 助手的角色与行为基线',
  'settings.systemPromptHint': '注入到每次对话的系统消息中，技能列表会自动追加。',
  'settings.toolLoop': '工具循环',
  'settings.toolLoopSub': '控制 Agent 调用工具的执行深度',
  'settings.maxToolRounds': '最大工具循环轮数',
  'settings.toolLoopHint': '单次对话中 Agent 连续调用工具的最大轮数，防止循环过深或失控。',
  'settings.backendService': '后端服务',
  'settings.backendSub': '前端独立部署时指定后端 API 地址',
  'settings.backendApi': '后端 API 地址',
  'settings.backendPlaceholder': '留空 = 同源部署（当前站点 /api）',
  'settings.backendHint': '前端独立部署时填写后端完整地址（如 http://192.168.1.10:8787），全部 API 请求将指向该服务；留空则请求当前站点 /api/*。修改后立即生效，并保存于本机。',
  'settings.dataMgmt': '数据管理',
  'settings.dataSub': '配置备份、迁移与接口对接文档',
  'settings.exportJson': '⬇ 导出配置 JSON',
  'settings.importJson': '⬆ 导入配置 JSON',
  'settings.docsBtn': '📖 接口对接文档',
  'settings.dataHint': '导出包含 API Key，请妥善保管；导入后需点击「保存配置」生效。',
  'settings.toastExported': '配置已导出（含 API Key，请妥善保管）',
  'settings.toastImported': '已载入导入配置，请点击「保存配置」生效',
  'settings.toastImportFail': '导入失败：{0}',
  'settings.toastSaved': '配置已保存 ✓',
  'settings.mcpSkillDesc': '调用 {0} 的全部 MCP 工具',
  'settings.missingProviders': '缺少 providers 数组',
  'settings.typeOpenai': 'OpenAI 兼容',
  'settings.customProviderName': '自定义 Provider',
  'settings.newMcpName': '新 MCP Server',

  // 技能定义
  'skill.time.name': '获取当前时间',
  'skill.time.desc': '获取当前日期、时间与时区',
  'skill.calc.name': '计算器',
  'skill.calc.desc': '精确四则运算，如 "123*456"',
  'skill.weather.name': '天气查询',
  'skill.weather.desc': '按经纬度查询实时天气',
  'skill.fetch.name': '网页抓取',
  'skill.fetch.desc': '抓取 http/https 网页正文',

  // 模型下拉
  'modelSelect.empty': '无匹配模型',

  // 供应商预设提示
  'preset.openai': '官方 OpenAI',
  'preset.deepseek': '高性价比中文模型',
  'preset.kimi': '月之暗面 Kimi',
  'preset.glm': '智谱 AI',
  'preset.qwen': '阿里云百炼',
  'preset.groq': '超快推理',
  'preset.openrouter': '聚合多厂商',
  'preset.vllm': '本地推理服务',
  'preset.claude': '官方 Claude',
  'preset.gemini': '官方 Gemini',
  'preset.ollama': '本地模型',
};

const en: Record<string, string> = {
  'common.newChat': 'New Chat',
  'common.settings': 'Settings',
  'common.config': 'Settings',
  'common.chats': 'Chats',
  'common.chat': 'Chat',
  'common.noConversations': 'No conversations yet. Click "New Chat" to start.',
  'common.newConversation': 'New conversation',
  'common.deleteConv': 'Delete conversation',
  'common.online': 'Online',
  'common.offline': 'Offline',
  'common.notConfigured': 'Not configured',
  'common.connecting': 'Connecting…',
  'common.connectingServer': 'Connecting to server ({0})…',
  'common.runDev': 'Run "npm run dev" to start frontend & backend',
  'common.noTitle': 'New chat',
  'common.noConvsTitle': 'No conversations',
  'common.langBtn': '中',
  'common.langTitle': 'Switch to 中文',
  'common.workbench': 'Chat Workbench',
  'common.skillCount': '{0} skills',

  'chat.conversations': 'Conversations',
  'chat.stop': 'Stop',
  'chat.running': 'Running…',
  'chat.ok': '✓ Done',
  'chat.fail': '✗ Failed',
  'chat.errPrefix': 'Error: ',
  'chat.done': '(Done)',
  'chat.placeholder': 'Type a message — Enter to send, Shift+Enter for a newline…',
  'chat.welcomeSub': 'Unified LLM Provider config (OpenAI-compatible / Claude / Gemini / Ollama) with MCP & Skill tool calling. Configure in "Settings" and start chatting.',
  'chat.suggest1a': 'What time is it?',
  'chat.suggest1b': 'Calculate (123*456+789)/3',
  'chat.suggest1c': "What's the weather in Beijing now?",
  'chat.suggest2a': 'Explain the MCP protocol with examples',
  'chat.suggest2b': 'Draw a simple pie chart with Python',
  'chat.suggest2c': 'Convert this JSON into a table',
  'chat.suggest3a': 'Draft a weekly work report outline',
  'chat.suggest3b': 'Translate to English: 今天天气不错',
  'chat.suggest3c': 'Summarize the key points of this article',

  'settings.title': 'Settings',
  'settings.apiDocs': '📖 API Docs',
  'settings.apiDocsTitle': 'Backend API docs',
  'settings.export': 'Export',
  'settings.import': 'Import',
  'settings.save': 'Save config',
  'settings.saving': 'Saving…',
  'settings.back': 'Back to chat',
  'settings.tabProviders': 'Models',
  'settings.tabMcp': 'Tools',
  'settings.tabSkills': 'Skills',
  'settings.tabAdvanced': 'Advanced',
  'settings.enabled': '{0} enabled',
  'settings.defaultProviderTitle': 'Current default provider',
  'settings.setDefaultTitle': 'Set as default provider',
  'settings.defaultTag': 'Default',
  'settings.fetchModels': 'Fetch models',
  'settings.fetching': 'Fetching…',
  'settings.test': 'Test',
  'settings.testing': 'Testing…',
  'settings.delete': 'Delete',
  'settings.type': 'Type',
  'settings.name': 'Name',
  'settings.apiKey': 'API Key',
  'settings.apiKeySaved': 'Saved (leave blank to keep)',
  'settings.baseUrl': 'Base URL',
  'settings.baseUrlAnthropic': 'API URL (blank = official)',
  'settings.baseUrlHint': 'OpenAI-compatible URL ends with …/v1; supports DeepSeek / Moonshot / Qwen / vLLM…',
  'settings.model': 'Model',
  'settings.whitelistLabel': 'Model whitelist (only checked models show; unchecked = all)',
  'settings.showFirst60': 'Showing first 60',
  'settings.advancedParams': 'Advanced (Temperature / Max Tokens)',
  'settings.enable': 'Enabled',
  'settings.addProvider': '＋ Add Provider',
  'settings.pickerTitle': 'Choose a provider',
  'settings.close': 'Close',
  'settings.searchProvider': 'Search providers… (OpenAI / DeepSeek / Kimi / Claude…)',
  'settings.custom': 'Blank custom',
  'settings.customHint': 'Manually configure any OpenAI-compatible endpoint',
  'settings.toastAdded': 'Added "{0}". Fill in the API Key and save.',
  'settings.toastFetched': 'Fetched {0} models — check to whitelist',
  'settings.toastFetchFail': 'Fetch failed ({0}); common models provided',
  'settings.toastNoModels': 'No models fetched',
  'settings.mcpDesc': 'Model Context Protocol: connect external tools (stdio process / SSE / HTTP).',
  'settings.mcpTransport': 'Transport',
  'settings.mcpStdio': 'stdio (local process)',
  'settings.mcpSse': 'SSE (server)',
  'settings.mcpHttp': 'HTTP/Streamable (server)',
  'settings.mcpCommand': 'Command',
  'settings.mcpArgs': 'Args (comma-separated)',
  'settings.mcpArgsPlaceholder': 'e.g. -y, @modelcontextprotocol/server-everything',
  'settings.mcpUrl': 'Server URL',
  'settings.mcpEnabledDesc': 'Tools are injected as Skills when enabled',
  'settings.mcpExpose': 'Expose as Skill',
  'settings.addMcp': '＋ Add MCP Server',
  'settings.connecting': 'Connecting…',
  'settings.mcpInjectedHint': 'MCP tools are injected via "Expose as Skill" on the Tools tab; their enabled state shows here.',
  'settings.systemPrompt': 'System prompt',
  'settings.systemPromptSub': 'Sets the AI assistant role and behavior baseline',
  'settings.systemPromptHint': 'Injected into every chat system message; the skill list is appended automatically.',
  'settings.toolLoop': 'Tool loop',
  'settings.toolLoopSub': 'Controls how deep the agent may run tools',
  'settings.maxToolRounds': 'Max tool-loop rounds',
  'settings.toolLoopHint': 'Max consecutive tool-call rounds per agent run; prevents runaway or overly deep loops.',
  'settings.backendService': 'Backend service',
  'settings.backendSub': 'Set the backend API URL when deploying the frontend standalone',
  'settings.backendApi': 'Backend API URL',
  'settings.backendPlaceholder': 'Blank = same-origin (current site /api)',
  'settings.backendHint': 'For standalone frontend, enter the backend full URL (e.g. http://192.168.1.10:8787); all API calls will point there. Leave blank to use current site /api/*. Applies immediately and is saved locally.',
  'settings.dataMgmt': 'Data',
  'settings.dataSub': 'Config backup, migration and the backend API docs',
  'settings.exportJson': '⬇ Export JSON',
  'settings.importJson': '⬆ Import JSON',
  'settings.docsBtn': '📖 API Docs',
  'settings.dataHint': 'Export includes API Keys — keep them safe. Import takes effect after "Save config".',
  'settings.toastExported': 'Config exported (includes API Keys — keep safe)',
  'settings.toastImported': 'Imported. Click "Save config" to apply.',
  'settings.toastImportFail': 'Import failed: {0}',
  'settings.toastSaved': 'Config saved ✓',
  'settings.mcpSkillDesc': 'Call all MCP tools of {0}',
  'settings.missingProviders': 'Missing providers array',
  'settings.typeOpenai': 'OpenAI-compatible',
  'settings.customProviderName': 'Custom provider',
  'settings.newMcpName': 'New MCP Server',

  'skill.time.name': 'Current time',
  'skill.time.desc': 'Get current date, time & timezone',
  'skill.calc.name': 'Calculator',
  'skill.calc.desc': 'Precise arithmetic, e.g. "123*456"',
  'skill.weather.name': 'Weather',
  'skill.weather.desc': 'Query live weather by latitude/longitude',
  'skill.fetch.name': 'Fetch URL',
  'skill.fetch.desc': 'Fetch http/https page content',

  'modelSelect.empty': 'No matching model',

  'preset.openai': 'Official OpenAI',
  'preset.deepseek': 'Cost-effective Chinese LLM',
  'preset.kimi': 'Moonshot Kimi',
  'preset.glm': 'Zhipu AI',
  'preset.qwen': 'Alibaba Cloud Bailian',
  'preset.groq': 'Ultra-fast inference',
  'preset.openrouter': 'Multi-vendor aggregator',
  'preset.vllm': 'Local inference',
  'preset.claude': 'Official Claude',
  'preset.gemini': 'Official Gemini',
  'preset.ollama': 'Local models',
};

/* ---------------- 上下文 ---------------- */

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** 取当前语言文案；支持 {0}/{1} 占位 */
  t: (key: string, args?: Array<string | number>) => string;
}

const I18nContext = createContext<I18nValue>({ lang: 'zh', setLang: () => {}, t: (k) => k });

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch {
    /* ignore */
  }
  try {
    return (navigator.language || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
    try {
      document.documentElement.lang = l === 'en' ? 'en' : 'zh-CN';
    } catch {
      /* ignore */
    }
  };

  const t = (key: string, args?: Array<string | number>): string => {
    const dict = lang === 'en' ? en : zh;
    let text = dict[key] ?? (lang === 'en' ? zh[key] : '') ?? key;
    if (args && args.length) {
      args.forEach((a, i) => {
        text = text.replace(`{${i}}`, String(a));
      });
    }
    return text;
  };

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
