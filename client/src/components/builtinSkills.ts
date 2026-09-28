/** 内置技能定义（前端展示用，与后端 skills/registry.ts 对应） */

export const BUILTIN_SKILL_DEFS = [
  {
    id: 'get_current_time',
    name: '获取当前时间',
    description: '获取当前日期、时间与时区',
  },
  {
    id: 'calculator',
    name: '计算器',
    description: '精确四则运算，如 "123*456"',
  },
  {
    id: 'get_weather',
    name: '天气查询',
    description: '按经纬度查询实时天气',
  },
  {
    id: 'fetch_url',
    name: '网页抓取',
    description: '抓取 http/https 网页正文',
  },
] as const;
