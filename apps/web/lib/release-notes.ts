// Release Notes - Version update content organized by role
// Each version contains role-specific update items with title, usage, and value

export type RoleCode = 'manager' | 'administrator' | 'head_chef';

export interface ReleaseNoteItem {
  title: string;      // What changed (one sentence)
  howToUse: string;   // How to use it (1-2 sentences, include path hints)
  value: string;      // Value to user (one sentence, user perspective)
}

export interface ReleaseNote {
  version: string;          // "2.0.2"
  date: string;             // "2026-02-28"
  roles: RoleCode[];        // Which roles see this
  title: string;            // Version title
  items: ReleaseNoteItem[];
}

// All release notes, newest first
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '2.0.2',
    date: '2026-02-28',
    roles: ['manager', 'administrator', 'head_chef'],
    title: '版本更新指南',
    items: [
      {
        title: '新增「使用指南」入口',
        howToUse: '点击右上角头像，在下拉菜单中选择「使用指南」，即可查看所有历史版本更新。',
        value: '随时了解新功能，不错过任何提升效率的更新。',
      },
      {
        title: '版本更新自动提醒',
        howToUse: '每次版本更新后首次打开，系统会自动弹窗展示本次更新内容。头像上的红点提醒你查看使用指南。',
        value: '第一时间知道新功能上线，不用再问"系统又更新了什么"。',
      },
    ],
  },
  {
    version: '2.0.1',
    date: '2026-02-28',
    roles: ['administrator'],
    title: '顾客洞察重设计',
    items: [
      {
        title: '顾客洞察按门店折叠展示',
        howToUse: '进入「洞察」页，每家门店一张卡片，显示建议数/差评数/好评数，点击展开查看详情。',
        value: '一眼看清每家门店的反馈全貌，不用来回切换。',
      },
      {
        title: '建议与反馈合并展示',
        howToUse: '展开门店卡片后，建议（含溯源原话+录音）→ 不满意反馈 → 满意反馈，一页看完。',
        value: '信息更集中，决策更快。',
      },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-02-28',
    roles: ['manager'],
    title: '复盘闭环 + 厨房联动',
    items: [
      {
        title: '复盘完成率追踪',
        howToUse: '看板顶部新增「执行数据」卡，显示桌访数、复盘率、连续复盘天数。每天录完复盘会议即自动统计。',
        value: '养成每日复盘习惯，连续天数越长，门店改善越明显。',
      },
      {
        title: '厨房响应区块',
        howToUse: '看板底部新增「厨房响应」，显示菜品问题的处理进度和厨师长的处理说明。',
        value: '不用再追着厨师长问"那个问题解决了吗"，系统自动同步。',
      },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-02-28',
    roles: ['administrator'],
    title: '简报重设计 + 复盘追踪',
    items: [
      {
        title: '总览页折叠式门店列表',
        howToUse: '进入「总览」页，门店按问题严重度排序，展开查看问题卡片+最近复盘记录。',
        value: '问题门店优先显示，你的注意力永远放在最需要关注的地方。',
      },
      {
        title: '复盘完成率纳入简报',
        howToUse: '总览顶部第三个指标从"覆盖率"改为"复盘完成率"，每家门店展开可看连续复盘天数。',
        value: '一眼看出哪些店长在坚持复盘，哪些需要提醒。',
      },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-02-28',
    roles: ['head_chef'],
    title: '语音录入处理说明',
    items: [
      {
        title: '语音记录处理情况',
        howToUse: '待办卡片内按麦克风按钮录音，说明处理情况后自动转文字填入输入框。',
        value: '不用打字，说一句就能记录处理结果，厨房里更方便。',
      },
      {
        title: '处理说明必填',
        howToUse: '点击"搞定了"或"忽略"时，需要填写处理说明（可用语音录入），说明你做了什么。',
        value: '让店长和管理层看到你的处理过程，你的努力被看见。',
      },
    ],
  },
  {
    version: '1.9.1',
    date: '2026-02-27',
    roles: ['manager'],
    title: '录音中断恢复',
    items: [
      {
        title: '录音中断自动保存',
        howToUse: '录音过程中如果来电话、切换应用或系统中断，已录制部分会自动保存，不再丢失。',
        value: '再也不用担心录到一半被电话打断，重新录一遍了。',
      },
    ],
  },
  {
    version: '1.9.0',
    date: '2026-02-27',
    roles: ['manager', 'administrator', 'head_chef'],
    title: '满意度评分升级',
    items: [
      {
        title: '满意度从情绪分升级为结构化评分',
        howToUse: '看板上的"情绪分"已更名为"满意度"，分值范围 0-100，基于每条反馈独立打分后加权计算。',
        value: '评分更客观、更稳定，不会因为一句话波动过大。',
      },
      {
        title: '术语统一为"满意/不满意"',
        howToUse: '全系统"好评/差评"改为"满意/不满意"，"需要关注"改为"需要改进"。',
        value: '措辞更中性专业，适合给团队展示。',
      },
    ],
  },
  {
    version: '1.8.2',
    date: '2026-02-27',
    roles: ['manager', 'head_chef'],
    title: '录音修复 + 菜品数据修复',
    items: [
      {
        title: '录音按钮响应优化',
        howToUse: '录音和取消按钮的反应更灵敏，PWA 模式下也能正常使用。',
        value: '操作更流畅，不会再出现点了没反应的情况。',
      },
      {
        title: '菜品数据来源修复',
        howToUse: '厨师长菜品页、AI 汇报中的菜品数据已修复，数据来源更准确。',
        value: '看到的菜品反馈数据更完整、更准确。',
      },
    ],
  },
  {
    version: '1.8.0',
    date: '2026-02-27',
    roles: ['manager', 'administrator', 'head_chef'],
    title: 'AI 智库 + 每日智能汇报',
    items: [
      {
        title: 'AI 智库升级为首页',
        howToUse: '登录后直接进入 AI 聊天页，输入任何问题即可获取数据分析。',
        value: '最常用的功能放在最前面，打开就能问。',
      },
      {
        title: '每日智能汇报',
        howToUse: '每天首次打开 AI 智库，系统自动生成当日运营汇报，按你的角色定制内容。',
        value: '不用手动查数据，每天一份定制汇报，关键信息一目了然。',
      },
    ],
  },
  {
    version: '1.7.1',
    date: '2026-02-27',
    roles: ['manager', 'administrator', 'head_chef'],
    title: '日期范围选择器',
    items: [
      {
        title: '支持按日期范围查看数据',
        howToUse: '点击日期选择器，可选择"近7天""近30天"或自定义起止日期。',
        value: '想看一周趋势还是当天数据，自由切换。',
      },
    ],
  },
  {
    version: '1.7.0',
    date: '2026-02-26',
    roles: ['administrator'],
    title: '门店区域分组',
    items: [
      {
        title: '门店按区域分组管理',
        howToUse: '头像菜单 →「区域管理」，可创建区域、分配门店和管理员。新增门店自动归入区域。',
        value: '按区域管辖门店，新店开业后自动纳入管理范围。',
      },
    ],
  },
  {
    version: '1.6.0',
    date: '2026-02-26',
    roles: ['administrator'],
    title: '区域管理层支持',
    items: [
      {
        title: '区域管理层数据隔离',
        howToUse: '系统自动根据你的管辖范围过滤数据，总览/洞察/会议/智库只显示你负责的门店。',
        value: '只看自己管的店，信息更聚焦。',
      },
      {
        title: '基准对比面板',
        howToUse: '总览页底部显示"我的区域 vs 全公司"对比，含满意度、覆盖率、复盘完成率。',
        value: '一眼看出自己区域在公司中的位置。',
      },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-02-26',
    roles: ['manager', 'administrator', 'head_chef'],
    title: '员工产品反馈',
    items: [
      {
        title: '提交产品反馈',
        howToUse: '头像菜单 →「提交反馈」，支持文字或语音两种方式，AI 自动分类和标签。',
        value: '用起来觉得哪里不好用、想要什么功能，随时反馈，我们会处理。',
      },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-02-26',
    roles: ['administrator'],
    title: '管理层会议录制',
    items: [
      {
        title: '经营会 & 店长沟通录制',
        howToUse: '底部导航「会议」→ 右上角录制按钮，选择会议类型（经营会/店长沟通）和门店后开始录音。',
        value: '会议录音自动生成纪要，决策和待办不再遗漏。',
      },
    ],
  },
];

/** Get all notes visible to a specific role, newest first */
export function getNotesForRole(role: string): ReleaseNote[] {
  return RELEASE_NOTES.filter(n => n.roles.includes(role as RoleCode));
}

/** Get the note for a specific version and role (for modal display) */
export function getLatestNoteForRole(version: string, role: string): ReleaseNote | undefined {
  return RELEASE_NOTES.find(n => n.version === version && n.roles.includes(role as RoleCode));
}
