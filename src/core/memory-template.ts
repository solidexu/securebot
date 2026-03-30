/**
 * 记忆模板定义
 * 
 * 定义什么应该被记录、如何记录、以及如何注入到对话上下文中
 * 参考 DeerFlow 的记忆系统设计
 */

// ============ 记忆分类定义 ============

/**
 * 事实分类及其说明
 */
export const FACT_CATEGORIES = {
  preference: {
    name: '偏好',
    description: '用户的偏好设置、喜欢/不喜欢的事物',
    examples: [
      '喜欢使用 VSCode 作为编辑器',
      '偏好深色主题',
      '习惯用中文交流',
    ],
    confidenceGuide: '用户明确表达偏好时用0.9+，从行为推断用0.7-0.8',
  },
  knowledge: {
    name: '知识',
    description: '用户的专业知识、技能、经验',
    examples: [
      '精通 Python 和 C++',
      '熟悉 React 和 Vue 框架',
      '有5年后端开发经验',
    ],
    confidenceGuide: '明确陈述的技能用0.9+，从对话推断用0.7-0.8',
  },
  context: {
    name: '背景',
    description: '用户的背景信息、当前状态',
    examples: [
      '目前在字节跳动工作',
      '正在开发一个电商项目',
      '使用 MacBook 作为开发环境',
    ],
    confidenceGuide: '明确陈述的事实用0.9+',
  },
  behavior: {
    name: '行为',
    description: '用户的工作模式、沟通习惯',
    examples: [
      '喜欢详细的代码注释',
      '习惯先写测试再写实现',
      '偏好小步提交',
    ],
    confidenceGuide: '观察到的行为模式用0.7-0.8',
  },
  goal: {
    name: '目标',
    description: '用户的目标、计划、愿望',
    examples: [
      '计划学习 Rust 语言',
      '想成为一个全栈开发者',
      '正在准备技术面试',
    ],
    confidenceGuide: '明确表达的目标用0.9+',
  },
} as const;

// ============ 记忆注入模板 ============

/**
 * 格式化记忆用于注入到系统提示词
 */
export function formatMemoryForInjection(memoryData: {
  user?: {
    workContext?: { summary: string };
    personalContext?: { summary: string };
    topOfMind?: { summary: string };
  };
  history?: {
    recentMonths?: { summary: string };
    earlierContext?: { summary: string };
    longTermBackground?: { summary: string };
  };
  facts?: Array<{
    content: string;
    category: string;
    confidence: number;
    source?: string;
  }>;
}, maxTokens: number = 2000): string {
  if (!memoryData) return '';

  const sections: string[] = [];

  // 1. 用户上下文（最高优先级）
  const userData = memoryData.user;
  if (userData) {
    const userLines: string[] = [];

    if (userData.workContext?.summary) {
      userLines.push(`工作: ${userData.workContext.summary}`);
    }
    if (userData.personalContext?.summary) {
      userLines.push(`个人: ${userData.personalContext.summary}`);
    }
    if (userData.topOfMind?.summary) {
      userLines.push(`当前关注: ${userData.topOfMind.summary}`);
    }

    if (userLines.length > 0) {
      sections.push('用户上下文:\n' + userLines.map(l => `- ${l}`).join('\n'));
    }
  }

  // 2. 历史记录
  const historyData = memoryData.history;
  if (historyData) {
    const historyLines: string[] = [];

    if (historyData.recentMonths?.summary) {
      historyLines.push(`近期: ${historyData.recentMonths.summary}`);
    }
    if (historyData.earlierContext?.summary) {
      historyLines.push(`更早: ${historyData.earlierContext.summary}`);
    }

    if (historyLines.length > 0) {
      sections.push('历史记录:\n' + historyLines.map(l => `- ${l}`).join('\n'));
    }
  }

  // 3. 事实（按置信度排序，token预算内尽可能多）
  const facts = memoryData.facts;
  if (facts && facts.length > 0) {
    const sortedFacts = [...facts].sort((a, b) => b.confidence - a.confidence);
    const factLines: string[] = [];
    
    // 简单估算token（4字符≈1token）
    let usedTokens = sections.join('\n\n').length / 4;
    const headerTokens = 10; // "事实:\n"
    usedTokens += headerTokens;

    for (const fact of sortedFacts) {
      const line = `- [${fact.category} | ${(fact.confidence * 100).toFixed(0)}%] ${fact.content}`;
      const lineTokens = line.length / 4;

      if (usedTokens + lineTokens <= maxTokens) {
        factLines.push(line);
        usedTokens += lineTokens;
      } else {
        break;
      }
    }

    if (factLines.length > 0) {
      sections.push('事实:\n' + factLines.join('\n'));
    }
  }

  return sections.length > 0 ? sections.join('\n\n') : '';
}

// ============ 记忆记录规则 ============

/**
 * 判断内容是否值得记录
 */
export function shouldRecordContent(content: string): { should: boolean; reason?: string } {
  if (!content || content.trim().length < 5) {
    return { should: false, reason: '内容太短' };
  }

  // 不应记录的内容模式
  const NO_RECORD_PATTERNS = [
    /上传了?文件/,
    /下载了?文件/,
    /临时/, /暂时/,
    /测试一下/, /试试/,
  ];

  for (const pattern of NO_RECORD_PATTERNS) {
    if (pattern.test(content)) {
      return { should: false, reason: '匹配排除模式' };
    }
  }

  // 应该记录的内容模式
  const SHOULD_RECORD_PATTERNS = [
    /我是.*开发者|工程师|程序员/,
    /我喜欢|我偏好|我习惯/,
    /我在.*工作/,
    /我正在|我计划|我想/,
    /记住|记得/,
    /我的.*是/,
    /我精通|我熟悉|我擅长/,
    /我会|我能|我懂/,
    /我精通.*语言|技术|框架/,
  ];

  for (const pattern of SHOULD_RECORD_PATTERNS) {
    if (pattern.test(content)) {
      return { should: true };
    }
  }

  // 如果包含技术关键词，也记录
  const techKeywords = /Python|JavaScript|TypeScript|Go|Java|C\+\+|Rust|React|Vue|Node|Docker|Kubernetes/i;
  if (techKeywords.test(content) && /我|精通|熟悉|会|懂|喜欢/.test(content)) {
    return { should: true };
  }

  // 默认不记录，避免噪音
  return { should: false, reason: '未匹配记录模式' };
}

/**
 * 从内容推断分类
 */
export function inferCategory(content: string): keyof typeof FACT_CATEGORIES {
  if (/喜欢|偏好|习惯|不喜欢/.test(content)) return 'preference';
  if (/精通|熟悉|擅长|会|懂|经验|技能/.test(content)) return 'knowledge';
  if (/在.*工作|目前|正在|项目|公司|团队/.test(content)) return 'context';
  if (/习惯|模式|方式|风格/.test(content)) return 'behavior';
  if (/计划|想|目标|希望|准备/.test(content)) return 'goal';
  return 'context';
}

/**
 * 从内容推断置信度
 */
export function inferConfidence(content: string): number {
  // 明确陈述
  if (/我是|我的|我在|我工作/.test(content)) return 0.9;
  // 表达偏好
  if (/我喜欢|我偏好|我习惯/.test(content)) return 0.85;
  // 计划或目标
  if (/我计划|我想|我准备/.test(content)) return 0.8;
  // 推断
  return 0.7;
}

// ============ 记忆更新提示词模板 ============

export const MEMORY_UPDATE_PROMPT = `你是一个记忆管理系统。分析对话并更新用户记忆。

当前记忆状态:
<current_memory>
{current_memory}
</current_memory>

新对话内容:
<conversation>
{conversation}
</conversation>

指令:
1. 分析对话中关于用户的重要信息
2. 提取相关事实、偏好和上下文
3. 按以下规则更新记忆

记忆分类:
- preference: 偏好（工具、风格、语言偏好）
- knowledge: 知识（技能、专业领域、经验）
- context: 背景（工作、项目、环境）
- behavior: 行为（工作模式、沟通习惯）
- goal: 目标（学习计划、职业目标）

置信度指南:
- 0.9-1.0: 明确陈述的事实
- 0.7-0.8: 从行为/对话推断
- 0.5-0.6: 模糊推断（谨慎使用）

输出格式 (JSON):
{
  "user": {
    "workContext": { "summary": "...", "shouldUpdate": true/false },
    "personalContext": { "summary": "...", "shouldUpdate": true/false },
    "topOfMind": { "summary": "...", "shouldUpdate": true/false }
  },
  "history": {
    "recentMonths": { "summary": "...", "shouldUpdate": true/false },
    "earlierContext": { "summary": "...", "shouldUpdate": true/false }
  },
  "newFacts": [
    { "content": "...", "category": "preference|knowledge|context|behavior|goal", "confidence": 0.0-1.0 }
  ],
  "factsToRemove": ["fact_id_1"]
}

规则:
- 只在有有意义的新信息时设置 shouldUpdate=true
- 工作上下文保持简洁（1-3句话）
- 历史记录可以更详细（段落）
- 只添加置信度>=0.7的事实
- 移除与新信息矛盾的事实
- 不要记录文件上传等临时事件

只返回有效JSON，不要解释。`;