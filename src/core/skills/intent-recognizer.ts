/**
 * 技能意图识别器
 * 
 * 通过意图识别提高技能触发准确性
 */

// ============ 类型定义 ============

/**
 * 用户意图类型
 */
export type UserIntent = 
  | 'research'      // 研究调查
  | 'analysis'      // 数据分析
  | 'code_review'   // 代码审查
  | 'testing'       // 测试相关
  | 'documentation' // 文档编写
  | 'debugging'     // 调试修复
  | 'git'           // Git 操作
  | 'api_design'    // API 设计
  | 'security'      // 安全相关
  | 'deployment'    // 部署相关
  | 'refactoring'   // 重构代码
  | 'learning'      // 学习教程
  | 'general';      // 通用任务

/**
 * 意图识别结果
 */
export interface IntentResult {
  intent: UserIntent;
  confidence: number;
  keywords: string[];
  entities: Record<string, string>;
}

/**
 * 意图规则
 */
interface IntentRule {
  intent: UserIntent;
  patterns: RegExp[];
  keywords: Array<{ word: string; weight: number }>;
  priority: number;
}

// ============ 意图规则定义 ============

const INTENT_RULES: IntentRule[] = [
  {
    intent: 'research',
    patterns: [
      /什么是|研究|调查|比较.*和|分析.*区别|了解|学习|解释|说明/,
      /what is|research|investigate|compare|explain|analyze|study/,
      /深度研究|全面分析|系统调研/,
    ],
    keywords: [
      { word: '研究', weight: 0.9 },
      { word: '调查', weight: 0.85 },
      { word: '比较', weight: 0.8 },
      { word: '什么是', weight: 0.9 },
      { word: '分析', weight: 0.7 },
      { word: '研究', weight: 0.9 },
      { word: 'research', weight: 0.9 },
      { word: 'compare', weight: 0.8 },
      { word: 'investigate', weight: 0.85 },
    ],
    priority: 1,
  },
  {
    intent: 'analysis',
    patterns: [
      /分析.*数据|数据.*分析|统计|报表|Excel|CSV/,
      /analyze.*data|data.*analysis|statistics|report/,
      /数据透视|汇总|聚合/,
    ],
    keywords: [
      { word: '数据分析', weight: 0.95 },
      { word: 'Excel', weight: 0.9 },
      { word: 'CSV', weight: 0.9 },
      { word: '统计', weight: 0.8 },
      { word: '报表', weight: 0.85 },
      { word: '数据透视', weight: 0.9 },
      { word: 'data analysis', weight: 0.95 },
      { word: 'spreadsheet', weight: 0.85 },
    ],
    priority: 1,
  },
  {
    intent: 'code_review',
    patterns: [
      /审查.*代码|代码.*审查|review|检查.*代码|代码.*检查/,
      /code review|review.*code|check.*code/,
      /代码质量|优化.*代码/,
    ],
    keywords: [
      { word: '代码审查', weight: 0.95 },
      { word: 'review', weight: 0.9 },
      { word: '代码检查', weight: 0.9 },
      { word: '代码质量', weight: 0.85 },
      { word: 'code review', weight: 0.95 },
      { word: 'PR审查', weight: 0.9 },
    ],
    priority: 1,
  },
  {
    intent: 'testing',
    patterns: [
      /写.*测试|测试.*用例|单元测试|集成测试|E2E/,
      /write.*test|test.*case|unit test|integration/,
      /测试覆盖率|pytest|jest|测试框架/,
    ],
    keywords: [
      { word: '测试', weight: 0.8 },
      { word: '单元测试', weight: 0.95 },
      { word: '集成测试', weight: 0.95 },
      { word: 'E2E测试', weight: 0.95 },
      { word: '测试用例', weight: 0.9 },
      { word: 'pytest', weight: 0.9 },
      { word: 'jest', weight: 0.9 },
      { word: 'unit test', weight: 0.95 },
    ],
    priority: 1,
  },
  {
    intent: 'documentation',
    patterns: [
      /写.*文档|文档.*生成|README|API文档|使用说明/,
      /write.*doc|generate.*doc|README|documentation/,
      /更新.*文档|文档.*更新/,
    ],
    keywords: [
      { word: '文档', weight: 0.8 },
      { word: 'README', weight: 0.95 },
      { word: 'API文档', weight: 0.95 },
      { word: '使用说明', weight: 0.85 },
      { word: 'CHANGELOG', weight: 0.9 },
      { word: 'documentation', weight: 0.9 },
    ],
    priority: 1,
  },
  {
    intent: 'debugging',
    patterns: [
      /调试|debug|修复.*bug|bug.*修复|排查.*问题/,
      /debug|fix.*bug|troubleshoot|resolve.*error/,
      /报错|错误|异常|崩溃/,
    ],
    keywords: [
      { word: '调试', weight: 0.9 },
      { word: 'debug', weight: 0.95 },
      { word: 'bug', weight: 0.85 },
      { word: '修复', weight: 0.8 },
      { word: '报错', weight: 0.85 },
      { word: '异常', weight: 0.8 },
      { word: 'troubleshoot', weight: 0.9 },
    ],
    priority: 1,
  },
  {
    intent: 'git',
    patterns: [
      /git|提交|推送|拉取|分支|合并|变基|rebase|merge/,
      /commit|push|pull|branch|merge|rebase/,
      /解决.*冲突|回滚|撤销/,
    ],
    keywords: [
      { word: 'git', weight: 0.95 },
      { word: 'commit', weight: 0.9 },
      { word: 'branch', weight: 0.9 },
      { word: 'merge', weight: 0.9 },
      { word: 'rebase', weight: 0.9 },
      { word: '分支', weight: 0.85 },
      { word: '合并', weight: 0.85 },
      { word: '提交', weight: 0.8 },
    ],
    priority: 1,
  },
  {
    intent: 'api_design',
    patterns: [
      /设计.*API|API.*设计|REST.*API|GraphQL/,
      /design.*api|api.*design|REST|GraphQL/,
      /接口.*定义|端点|endpoint/,
    ],
    keywords: [
      { word: 'API', weight: 0.85 },
      { word: 'REST', weight: 0.9 },
      { word: 'GraphQL', weight: 0.95 },
      { word: '接口', weight: 0.8 },
      { word: '端点', weight: 0.85 },
      { word: 'endpoint', weight: 0.9 },
    ],
    priority: 1,
  },
  {
    intent: 'security',
    patterns: [
      /安全.*审计|审计.*安全|漏洞.*扫描|安全.*检查/,
      /security.*audit|vulnerability|security check/,
      /SQL注入|XSS|CSRF|认证|授权/,
    ],
    keywords: [
      { word: '安全', weight: 0.8 },
      { word: '漏洞', weight: 0.9 },
      { word: '审计', weight: 0.85 },
      { word: 'SQL注入', weight: 0.95 },
      { word: 'XSS', weight: 0.95 },
      { word: 'CSRF', weight: 0.95 },
      { word: 'security', weight: 0.9 },
      { word: 'vulnerability', weight: 0.95 },
    ],
    priority: 1,
  },
  {
    intent: 'deployment',
    patterns: [
      /部署|deploy|Docker|Kubernetes|K8s/,
      /容器|镜像|CI\/CD|持续集成/,
      /发布|上线|环境/,
    ],
    keywords: [
      { word: '部署', weight: 0.9 },
      { word: 'deploy', weight: 0.95 },
      { word: 'Docker', weight: 0.95 },
      { word: 'Kubernetes', weight: 0.95 },
      { word: 'K8s', weight: 0.95 },
      { word: '容器', weight: 0.85 },
      { word: 'CI/CD', weight: 0.9 },
    ],
    priority: 1,
  },
  {
    intent: 'refactoring',
    patterns: [
      /重构.*代码|代码.*重构|优化.*结构/,
      /refactor|restructure|optimize.*code/,
      /清理.*代码|改进.*代码/,
    ],
    keywords: [
      { word: '重构', weight: 0.95 },
      { word: 'refactor', weight: 0.95 },
      { word: '优化', weight: 0.7 },
      { word: '改进', weight: 0.7 },
      { word: '清理代码', weight: 0.85 },
    ],
    priority: 1,
  },
  {
    intent: 'learning',
    patterns: [
      /学习|教程|入门|指南|如何/,
      /learn|tutorial|guide|how to|getting started/,
      /教学|培训|课程/,
    ],
    keywords: [
      { word: '学习', weight: 0.85 },
      { word: '教程', weight: 0.9 },
      { word: '入门', weight: 0.85 },
      { word: '指南', weight: 0.8 },
      { word: '如何', weight: 0.7 },
      { word: 'tutorial', weight: 0.95 },
      { word: 'guide', weight: 0.85 },
      { word: 'learn', weight: 0.9 },
    ],
    priority: 2,
  },
];

// ============ 意图识别器 ============

/**
 * 意图识别器
 */
export class IntentRecognizer {
  private rules: IntentRule[];

  constructor(rules: IntentRule[] = INTENT_RULES) {
    this.rules = [...rules].sort((a, b) => a.priority - b.priority);
  }

  /**
   * 识别用户意图
   */
  recognize(message: string): IntentResult {
    const lowerMessage = message.toLowerCase();
    const scores: Map<UserIntent, { score: number; matchedKeywords: string[] }> = new Map();

    for (const rule of this.rules) {
      let score = 0;
      const matchedKeywords: string[] = [];

      // 模式匹配
      for (const pattern of rule.patterns) {
        if (pattern.test(message)) {
          score += 0.5;
          break;
        }
      }

      // 关键词匹配（加权）
      for (const { word, weight } of rule.keywords) {
        if (lowerMessage.includes(word.toLowerCase())) {
          score += weight;
          matchedKeywords.push(word);
        }
      }

      if (score > 0) {
        const existing = scores.get(rule.intent);
        if (existing) {
          scores.set(rule.intent, {
            score: existing.score + score,
            matchedKeywords: [...existing.matchedKeywords, ...matchedKeywords],
          });
        } else {
          scores.set(rule.intent, { score, matchedKeywords });
        }
      }
    }

    // 找出最高分的意图
    let bestIntent: UserIntent = 'general';
    let bestScore = 0;
    let bestKeywords: string[] = [];

    for (const [intent, data] of scores) {
      // 归一化分数
      const normalizedScore = Math.min(1, data.score / 2);
      if (normalizedScore > bestScore) {
        bestScore = normalizedScore;
        bestIntent = intent;
        bestKeywords = data.matchedKeywords;
      }
    }

    // 提取实体
    const entities = this.extractEntities(message);

    return {
      intent: bestIntent,
      confidence: bestScore,
      keywords: [...new Set(bestKeywords)],
      entities,
    };
  }

  /**
   * 提取实体
   */
  private extractEntities(message: string): Record<string, string> {
    const entities: Record<string, string> = {};

    // 提取文件路径
    const filePathMatch = message.match(/(?:^|\s)([/.][\w/.-]+\.\w+)/);
    if (filePathMatch) {
      entities.filePath = filePathMatch[1]!;
    }

    // 提取语言
    const langPatterns: [RegExp, string][] = [
      [/python|py\b/i, 'python'],
      [/javascript|js\b|typescript|ts\b/i, 'javascript'],
      [/java\b/i, 'java'],
      [/go\b|golang/i, 'go'],
      [/rust\b/i, 'rust'],
      [/c\+\+|cpp\b/i, 'cpp'],
    ];

    for (const [pattern, lang] of langPatterns) {
      if (pattern.test(message)) {
        entities.language = lang;
        break;
      }
    }

    // 提取框架
    const frameworkPatterns: [RegExp, string][] = [
      [/react\b/i, 'react'],
      [/vue\b/i, 'vue'],
      [/angular\b/i, 'angular'],
      [/next\.?js/i, 'nextjs'],
      [/django\b/i, 'django'],
      [/flask\b/i, 'flask'],
      [/fastapi\b/i, 'fastapi'],
      [/express\b/i, 'express'],
    ];

    for (const [pattern, framework] of frameworkPatterns) {
      if (pattern.test(message)) {
        entities.framework = framework;
        break;
      }
    }

    return entities;
  }

  /**
   * 意图到技能的映射
   */
  intentToSkillId(intent: UserIntent): string[] {
    const mapping: Record<UserIntent, string[]> = {
      research: ['deep-research'],
      analysis: ['data-analysis'],
      code_review: ['code-review', 'security-audit'],
      testing: ['testing-helper'],
      documentation: ['doc-generator', 'doc-writer'],
      debugging: ['debugger', 'code-review'],
      git: ['git-workflow'],
      api_design: ['api-design', 'api-designer'],
      security: ['security-audit', 'code-review'],
      deployment: ['git-workflow'],
      refactoring: ['code-review'],
      learning: ['deep-research', 'doc-writer'],
      general: [],
    };

    return mapping[intent] || [];
  }
}

// ============ 全局实例 ============

let globalRecognizer: IntentRecognizer | null = null;

/**
 * 获取意图识别器
 */
export function getIntentRecognizer(): IntentRecognizer {
  if (!globalRecognizer) {
    globalRecognizer = new IntentRecognizer();
  }
  return globalRecognizer;
}

/**
 * 重置意图识别器
 */
export function resetIntentRecognizer(): void {
  globalRecognizer = null;
}