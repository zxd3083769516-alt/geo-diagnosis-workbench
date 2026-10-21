import { everydayQuestionBank } from './everyday-questions';
type Merchant = Record<
  | 'brand'
  | 'city'
  | 'areas'
  | 'industry'
  | 'business'
  | 'services'
  | 'audience'
  | 'budget'
  | 'scenarios'
  | 'advantages'
  | 'specialties'
  | 'competitors'
  | 'faqs'
  | 'keywords'
  | 'exclusions'
  | 'notes',
  string
>;

type QuestionType = '泛推荐' | '场景' | '高意向' | '品牌' | '竞品比较';
type Stage = '了解' | '比较' | '决策';
type Intent = '低' | '中' | '高';

type MixRow = {
  type: QuestionType;
  count: number;
  stage: Stage;
  intent: Intent;
  focus: string;
  max: number;
};

type Question = {
  id: number;
  text: string;
  type: QuestionType;
  stage: Stage;
  intent: Intent;
  platform: string;
  mentioned: string;
  position: string;
  accuracy: string;
  advantage: string;
  evidence: string;
  competitor: string;
  note: string;
};

type ProviderId = 'qwen' | 'deepseek' | 'doubao' | 'zhipu';
type ProviderStatus = Record<ProviderId, { configured: boolean; hint: string }>;

const providerList: Array<{ id: ProviderId; name: string; company: string; color: string }> = [
  { id: 'qwen', name: '通义千问', company: '阿里云百炼', color: 'bg-orange-500' },
  { id: 'deepseek', name: 'DeepSeek', company: '深度求索', color: 'bg-blue-600' },
  { id: 'doubao', name: '豆包', company: '火山方舟', color: 'bg-violet-600' },
  { id: 'zhipu', name: '智谱 GLM', company: 'BigModel', color: 'bg-sky-600' },
];

const emptyProviderStatus = Object.fromEntries(providerList.map(({ id }) => [id, { configured: false, hint: '' }])) as ProviderStatus;

const fields: Array<{
  key: keyof Merchant;
  label: string;
  hint: string;
  required?: boolean;
  short?: boolean;
}> = [
  { key: 'brand', label: '品牌名称', hint: '对外使用的完整品牌名称', required: true, short: true },
  { key: 'city', label: '所在城市', hint: '主要经营城市', required: true, short: true },
  { key: 'areas', label: '主要服务区域', hint: '区、商圈或可上门服务范围', required: true },
  { key: 'industry', label: '所属行业', hint: '例如：全屋定制、口腔、酒店', required: true, short: true },
  { key: 'business', label: '主营业务', hint: '概括主要提供的业务', required: true },
  { key: 'services', label: '核心产品或服务', hint: '用顿号分隔重点产品或服务', required: true },
  { key: 'audience', label: '目标客户', hint: '年龄、家庭阶段、消费能力或企业类型', required: true },
  { key: 'budget', label: '客单价或预算范围', hint: '例如：3万—8万元', short: true },
  { key: 'scenarios', label: '主要消费场景', hint: '例如：新房、婚房、小户型、儿童家庭', required: true },
  { key: 'advantages', label: '核心优势', hint: '只填写有资料支持的优势', required: true },
  { key: 'specialties', label: '重点风格、材料或技术', hint: '需要重点覆盖的专业特征' },
  { key: 'competitors', label: '主要竞品', hint: '用顿号分隔真实竞品；竞品题需要填写' },
  { key: 'faqs', label: '客户常问问题', hint: '销售咨询中经常出现的问题' },
  { key: 'keywords', label: '重点关键词', hint: '产品词、需求词、场景词和区域词' },
  { key: 'exclusions', label: '不希望出现的内容', hint: '禁用表述、敏感内容或错误信息' },
  { key: 'notes', label: '补充信息', hint: '案例、资质、门店、服务流程等资料' },
];

const initialMerchant: Merchant = {
  brand: '', city: '厦门', areas: '', industry: '', business: '', services: '', audience: '',
  budget: '', scenarios: '', advantages: '', specialties: '', competitors: '', faqs: '',
  keywords: '', exclusions: '', notes: '',
};

const deepMix: MixRow[] = [
  { type: '泛推荐', count: 15, stage: '了解', intent: '低', focus: '本地推荐、口碑、价值与候选品牌', max: 15 },
  { type: '场景', count: 25, stage: '比较', intent: '中', focus: '客群、消费场景、风格与服务需求', max: 20 },
  { type: '高意向', count: 30, stage: '决策', intent: '高', focus: '区域、预算、规格与明确选择动作', max: 30 },
  { type: '品牌', count: 15, stage: '比较', intent: '中', focus: '主营、价格、优势与适用客户', max: 20 },
  { type: '竞品比较', count: 15, stage: '决策', intent: '高', focus: '真实竞品差异与适用场景', max: 15 },
];

const screeningMix: MixRow[] = [
  { type: '泛推荐', count: 7, stage: '了解', intent: '低', focus: '本地推荐、口碑、价值与候选品牌', max: 15 },
  { type: '场景', count: 11, stage: '比较', intent: '中', focus: '核心客群、典型场景与主要服务需求', max: 20 },
  { type: '高意向', count: 14, stage: '决策', intent: '高', focus: '区域、预算与明确选择动作', max: 30 },
  { type: '品牌', count: 7, stage: '比较', intent: '中', focus: '主营、价格、优势与适用客户', max: 20 },
  { type: '竞品比较', count: 6, stage: '决策', intent: '高', focus: '核心竞品差异与适用场景', max: 15 },
];

type DiagnosticMode = 'screening' | 'deep';

const angles = [
  '价格实在', '离家近', '不用等太久', '第一次去也省心', '能提前问清价格', '沟通起来方便',
  '适合周末去', '有真实评价可看', '不用一下买太多', '可以先了解再决定',
  '能电话咨询', '位置好找', '方便停车', '选择多一些', '适合带家人去',
  '能提前预约', '不会强推加项', '能说清包含哪些费用', '有问题能找到人', '预算不容易超',
  '能照顾到我的具体需求', '能看实际做过的例子', '说明容易听懂', '时间安排灵活',
  '可以到店了解', '附近的人常去', '收费项目写得清楚', '适合长期选择', '能提前安排时间', '有人耐心解答',
];

function split(value: string, fallback: string) {
  const result = value.split(/[、,，;；/\n]/).map((item) => item.trim()).filter(Boolean);
  return result.length ? result : [fallback];
}

function buildQuestions(merchant: Merchant, mix: MixRow[]): Question[] {
  const areas = split(merchant.areas, merchant.city);
  const services = split(merchant.services, merchant.business);
  const audiences = split(merchant.audience, '本地客户');
  const scenarios = split(merchant.scenarios, '日常消费');
  const competitors = split(merchant.competitors, '待补充竞品');
  const specialties = split(merchant.specialties, services[0]);
  const pick = (items: string[], index: number, offset = 0) => items[(index + offset) % items.length];
  const questionText = (type: QuestionType, index: number) => {
    const bank = everydayQuestionBank(merchant, pick(areas, index), pick(services, index), pick(competitors, index));
    if (bank && index < bank[type].length) return bank[type][index];
    const angle = pick(angles, index);
    if (type === '泛推荐') {
      const templates = [
        `${merchant.city}想找${pick(services, index)}，有没有${angle}的店？`,
        `${merchant.city}有哪家${pick(services, index)}比较好？希望${angle}。`,
        `${merchant.city}第一次了解${pick(services, index)}，想找${angle}的，有推荐吗？`,
      ];
      return templates[index % templates.length];
    }
    if (type === '场景') {
      const templates = [
        `${merchant.city}，${pick(scenarios, index)}想找${pick(services, index)}，有没有${angle}的？`,
        `${pick(areas, index)}附近哪家适合${pick(audiences, index)}？我想找${angle}的。`,
        `${merchant.city}我想了解${pick(specialties, index)}，哪家${angle}？`,
      ];
      return templates[index % templates.length];
    }
    if (type === '高意向') {
      const budget = merchant.budget ? `预算${merchant.budget}，` : '';
      const templates = [
        `${pick(areas, index)}附近想找${pick(services, index)}，${budget}哪家${angle}？`,
        `${merchant.city}最近就需要${pick(services, index)}，想找${angle}的，选哪家？`,
        `${merchant.city}准备定${pick(services, index)}了，${budget}哪家${angle}？`,
      ];
      return templates[index % templates.length];
    }
    if (type === '品牌') {
      const templates = [
        `${merchant.brand}怎么样，${angle}吗？`,
        `${merchant.brand}的${pick(services, index)}适合${pick(audiences, index)}吗？`,
        `${merchant.brand}在哪里能问到${pick(services, index)}的具体价格？希望${angle}。`,
      ];
      return templates[index % templates.length];
    }
    const competitor = pick(competitors, index);
    const templates = [
      `${merchant.brand}和${competitor}，想找${angle}的该选哪家？`,
      `${merchant.brand}和${competitor}我有点拿不定主意，哪家${angle}？`,
      `想了解${pick(services, index)}，${merchant.brand}和${competitor}哪家${angle}？`,
    ];
    return templates[index % templates.length];
  };

  const rows: Question[] = [];
  mix.forEach((group) => {
    for (let index = 0; index < group.count; index += 1) {
      rows.push({
        id: rows.length + 1,
        text: questionText(group.type, index),
        type: group.type,
        stage: group.stage,
        intent: group.intent,
        platform: '', mentioned: '', position: '', accuracy: '', advantage: '', evidence: '',
        competitor: group.type === '竞品比较' ? pick(competitors, index) : '', note: '',
      });
    }
  });
  return rows;
}


export { buildQuestions, fields, initialMerchant, deepMix, screeningMix, providerList };
export type { Merchant, Question, MixRow, ProviderId };
