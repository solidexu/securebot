/**
 * Agent 技能管理
 * 
 * 支持公共技能和个人技能
 * - 公共技能: 所有 Agent 可用，存储在 ~/.securebot/skills/public/
 * - 个人技能: 仅特定 Agent 可用，存储在 ~/.securebot/agents/{agentId}/skills/
 * 
 * 智能唤醒：
 * - 关键词匹配：快速匹配
 * - 语义匹配：使用向量相似度匹配
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { getRootDir } from './config.js';

// ============ 类型定义 ============

/**
 * 技能定义
 */
export interface Skill {
  /** 技能 ID */
  id: string;
  /** 技能名称 */
  name: string;
  /** 描述（用于语义匹配） */
  description: string;
  /** 关键词（用于快速匹配） */
  keywords?: string[];
  /** 系统提示词模板 */
  systemPrompt: string;
  /** 需要的工具列表 */
  tools?: string[];
  /** 示例对话 */
  examples?: Array<{
    user: string;
    assistant: string;
  }>;
  /** 是否公共技能 */
  isPublic: boolean;
  /** 所属 Agent（个人技能） */
  agentId?: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

/**
 * 技能匹配结果
 */
export interface SkillMatchResult {
  /** 匹配到的技能 */
  skill: Skill;
  /** 匹配分数 (0-1) */
  score: number;
  /** 匹配方式 */
  method: 'keyword' | 'semantic';
}

/**
 * 技能配置
 */
export interface SkillConfig {
  /** 公共技能目录 */
  publicDir: string;
  /** 个人技能根目录（agents 目录） */
  agentsDir: string;
}

// ============ 默认公共技能 ============

/**
 * 内置公共技能
 */
export const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'code-review',
    name: '代码审查',
    description: '专业的代码审查技能，帮助发现代码问题和改进建议',
    keywords: ['审查', 'review', '检查代码', '代码质量', '优化代码', '代码问题', 'review一下', '帮我review', '看看代码', '检查一下'],
    systemPrompt: `你是一位专业的代码审查专家。在审查代码时，请关注：

1. **代码质量**
   - 代码可读性和命名规范
   - 函数/方法长度和复杂度
   - 注释是否清晰

2. **潜在问题**
   - 边界条件处理
   - 错误处理是否完善
   - 潜在的性能问题

3. **最佳实践**
   - 是否遵循设计模式
   - 是否有更好的实现方式
   - 安全性考虑

请用结构化的方式给出审查结果，包括：
- 发现的问题（按严重程度分类）
- 改进建议
- 优秀的代码片段（如果有）`,
    tools: ['read', 'edit'],
    isPublic: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'translator',
    name: '翻译助手',
    description: '多语言翻译技能，支持中英日韩等主流语言',
    keywords: ['翻译', 'translate', '中译', '英译', '日语', '韩语'],
    systemPrompt: `你是一位专业的翻译专家。翻译时请遵循：

1. **准确性**：确保翻译准确，不遗漏信息
2. **流畅性**：译文要符合目标语言的表达习惯
3. **专业性**：专业术语要准确翻译
4. **文化适应性**：考虑文化差异，适当本地化

翻译格式：
- 原文: [原文内容]
- 译文: [翻译结果]
- 注释: [如有必要，添加注释]`,
    isPublic: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'api-designer',
    name: 'API 设计师',
    description: 'RESTful API 设计技能，帮助设计规范的 API 接口',
    keywords: ['API', '接口设计', 'RESTful', 'REST', 'endpoint', '接口'],
    systemPrompt: `你是一位 API 设计专家。设计 API 时请遵循 RESTful 规范：

1. **URL 设计**
   - 使用名词表示资源
   - 使用连字符分隔单词
   - 避免动词，用 HTTP 方法表达操作

2. **HTTP 方法**
   - GET: 查询资源
   - POST: 创建资源
   - PUT: 完整更新资源
   - PATCH: 部分更新资源
   - DELETE: 删除资源

3. **响应格式**
   - 统一的 JSON 格式
   - 包含状态码、数据、消息
   - 分页、排序、过滤支持

4. **错误处理**
   - 使用标准 HTTP 状态码
   - 提供详细的错误信息
   - 包含错误代码便于定位`,
    tools: ['read', 'write', 'edit'],
    isPublic: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'debugger',
    name: '调试专家',
    description: '帮助分析和定位代码问题',
    keywords: ['调试', 'debug', '报错', '错误', 'bug', '异常', '崩溃'],
    systemPrompt: `你是一位调试专家。在帮助用户调试问题时，请：

1. **问题定位**
   - 询问具体的错误信息
   - 了解问题发生的场景
   - 确认最近的代码变更

2. **分析步骤**
   - 检查输入数据是否正确
   - 检查边界条件处理
   - 检查依赖和环境配置
   - 检查日志和错误堆栈

3. **解决方案**
   - 给出具体的修复代码
   - 解释问题原因
   - 提供预防措施

调试工具推荐：
- 使用 console.log 或调试器
- 检查日志文件
- 使用断点调试`,
    tools: ['read', 'exec'],
    isPublic: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'doc-writer',
    name: '文档撰写',
    description: '帮助编写清晰的技术文档',
    keywords: ['文档', 'doc', 'readme', '注释', '说明', '文档编写'],
    systemPrompt: `你是一位技术文档专家。编写文档时请遵循：

1. **文档结构**
   - 清晰的标题层次
   - 简洁的摘要
   - 详细的说明
   - 完整的示例

2. **写作原则**
   - 使用简单清晰的语言
   - 避免歧义
   - 提供具体的示例
   - 保持一致性

3. **常用文档类型**
   - README.md
   - API 文档
   - 使用指南
   - 变更日志

4. **Markdown 规范**
   - 合理使用标题层级
   - 代码块指定语言
   - 链接和图片使用正确的格式`,
    tools: ['read', 'write', 'edit'],
    isPublic: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// ============ 技能管理器 ============

/**
 * 技能管理器
 * 
 * 存储结构：
 * ~/.securebot/
 * ├── skills/
 * │   └── public/              # 公共技能
 * │       └── skill_xxx.json
 * └── agents/
 *     └── {agentId}/           # 每个 agent 有自己的文件夹
 *         └── skills/          # 该 agent 的技能
 *             ├── skill_xxx.json
 *             └── skill_yyy.json
 */
export class SkillManager {
  private config: SkillConfig;

  constructor(config?: Partial<SkillConfig>) {
    const rootDir = getRootDir();
    this.config = {
      publicDir: join(rootDir, 'skills', 'public'),
      agentsDir: join(rootDir, 'agents'),
      ...config,
    };
  }

  /**
   * 获取 agent 的技能目录
   */
  private getAgentSkillsDir(agentId: string): string {
    return join(this.config.agentsDir, agentId, 'skills');
  }

  /**
   * 初始化技能目录
   */
  async initialize(): Promise<void> {
    // 创建公共技能目录
    if (!existsSync(this.config.publicDir)) {
      mkdirSync(this.config.publicDir, { recursive: true });
    }

    // 初始化内置公共技能
    for (const skill of BUILTIN_SKILLS) {
      const filePath = this.getSkillPath(skill.id, true);
      if (!existsSync(filePath)) {
        await this.saveSkill(skill);
      }
    }
  }

  /**
   * 获取技能文件路径
   */
  private getSkillPath(skillId: string, isPublic: boolean, agentId?: string): string {
    if (isPublic) {
      return join(this.config.publicDir, `${skillId}.json`);
    } else if (agentId) {
      return join(this.getAgentSkillsDir(agentId), `${skillId}.json`);
    } else {
      // 兼容旧逻辑：尝试在所有 agent 目录中查找
      return join(this.config.agentsDir, '_unknown', 'skills', `${skillId}.json`);
    }
  }

  /**
   * 保存技能
   */
  async saveSkill(skill: Skill): Promise<void> {
    if (skill.isPublic) {
      // 公共技能
      const filePath = this.getSkillPath(skill.id, true);
      writeFileSync(filePath, JSON.stringify(skill, null, 2), 'utf-8');
    } else if (skill.agentId) {
      // 个人技能：保存到 agent 的 skills 目录
      const agentSkillsDir = this.getAgentSkillsDir(skill.agentId);
      if (!existsSync(agentSkillsDir)) {
        mkdirSync(agentSkillsDir, { recursive: true });
      }
      const filePath = join(agentSkillsDir, `${skill.id}.json`);
      writeFileSync(filePath, JSON.stringify(skill, null, 2), 'utf-8');
      
      // ★ 同步更新 Agent 档案中的技能列表
      await this.syncSkillToAgentProfile(skill.agentId, skill.name, 'add');
    } else {
      throw new Error('个人技能必须指定 agentId');
    }
  }
  
  /**
   * 同步技能到 Agent 档案
   */
  private async syncSkillToAgentProfile(
    agentId: string, 
    skillName: string, 
    action: 'add' | 'remove'
  ): Promise<void> {
    try {
      const { getMemoryManager } = await import('./memory.js');
      const memoryManager = getMemoryManager();
      
      const profile = await memoryManager.getAgentProfile(agentId);
      
      if (action === 'add') {
        if (!profile.skills.includes(skillName)) {
          profile.skills.push(skillName);
        }
      } else {
        profile.skills = profile.skills.filter(s => s !== skillName);
      }
      
      await memoryManager.saveAgentProfile(profile);
    } catch {
      // 同步失败不影响主流程
    }
  }

  /**
   * 加载技能
   */
  async loadSkill(skillId: string, isPublic: boolean, agentId?: string): Promise<Skill | null> {
    const filePath = this.getSkillPath(skillId, isPublic, agentId);
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as Skill;
    } catch {
      return null;
    }
  }

  /**
   * 删除技能
   */
  async deleteSkill(skillId: string, isPublic: boolean, agentId?: string): Promise<boolean> {
    const filePath = this.getSkillPath(skillId, isPublic, agentId);
    if (existsSync(filePath)) {
      // ★ 删除前先读取技能信息，用于同步档案
      let skillName: string | null = null;
      try {
        const content = readFileSync(filePath, 'utf-8');
        const skill = JSON.parse(content) as Skill;
        skillName = skill.name;
      } catch {
        // 忽略读取错误
      }
      
      unlinkSync(filePath);
      
      // ★ 同步更新 Agent 档案
      if (!isPublic && agentId && skillName) {
        await this.syncSkillToAgentProfile(agentId, skillName, 'remove');
      }
      
      return true;
    }
    return false;
  }

  /**
   * 列出所有公共技能
   */
  async listPublicSkills(): Promise<Skill[]> {
    return this.listSkillsInDir(this.config.publicDir);
  }

  /**
   * 列出个人技能
   */
  async listPrivateSkills(agentId?: string): Promise<Skill[]> {
    if (agentId) {
      // 列出指定 agent 的技能
      const agentSkillsDir = this.getAgentSkillsDir(agentId);
      return this.listSkillsInDir(agentSkillsDir);
    }
    
    // 列出所有 agent 的技能
    const allSkills: Skill[] = [];
    if (!existsSync(this.config.agentsDir)) {
      return allSkills;
    }
    
    const agentDirs = readdirSync(this.config.agentsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    
    for (const agentDir of agentDirs) {
      const skillsDir = join(this.config.agentsDir, agentDir, 'skills');
      const skills = this.listSkillsInDir(skillsDir);
      allSkills.push(...skills);
    }
    
    return allSkills;
  }

  /**
   * 列出目录中的技能
   */
  private listSkillsInDir(dir: string): Skill[] {
    if (!existsSync(dir)) {
      return [];
    }

    const skills: Skill[] = [];
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const content = readFileSync(join(dir, file), 'utf-8');
        skills.push(JSON.parse(content) as Skill);
      } catch {
        // 忽略无效文件
      }
    }

    return skills;
  }

  /**
   * 获取 Agent 可用的所有技能
   */
  async getAgentSkills(agentId: string): Promise<Skill[]> {
    const publicSkills = await this.listPublicSkills();
    const privateSkills = await this.listPrivateSkills(agentId);
    return [...publicSkills, ...privateSkills];
  }

  /**
   * 构建技能系统提示词
   */
  async buildSkillsPrompt(agentId: string, skillIds?: string[]): Promise<string> {
    const allSkills = await this.getAgentSkills(agentId);
    
    let skills: Skill[];
    if (skillIds && skillIds.length > 0) {
      skills = allSkills.filter(s => skillIds.includes(s.id));
    } else {
      skills = allSkills;
    }

    if (skills.length === 0) {
      return '';
    }

    const parts: string[] = ['## 技能模块\n'];

    for (const skill of skills) {
      parts.push(`### ${skill.name}\n`);
      parts.push(`${skill.description}\n\n`);
      parts.push(skill.systemPrompt);
      
      if (skill.examples && skill.examples.length > 0) {
        parts.push('\n\n**示例对话:**\n');
        for (const example of skill.examples) {
          parts.push(`- 用户: ${example.user}`);
          parts.push(`  助手: ${example.assistant}`);
        }
      }
      
      parts.push('\n\n---\n\n');
    }

    return parts.join('');
  }

  /**
   * 创建个人技能
   */
  async createPrivateSkill(
    agentId: string,
    skill: Omit<Skill, 'isPublic' | 'agentId' | 'createdAt' | 'updatedAt'>
  ): Promise<Skill> {
    const newSkill: Skill = {
      ...skill,
      isPublic: false,
      agentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.saveSkill(newSkill);
    return newSkill;
  }

  /**
   * 创建公共技能
   */
  async createPublicSkill(
    skill: Omit<Skill, 'isPublic' | 'createdAt' | 'updatedAt'>
  ): Promise<Skill> {
    const newSkill: Skill = {
      ...skill,
      isPublic: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.saveSkill(newSkill);
    return newSkill;
  }

  /**
   * 更新技能
   */
  async updateSkill(
    skillId: string,
    updates: Partial<Omit<Skill, 'id' | 'createdAt'>>
  ): Promise<Skill | null> {
    // 先查找公共技能
    let skill = await this.loadSkill(skillId, true);

    if (!skill) {
      // 查找个人技能 - 尝试从 updates.agentId 或遍历所有 agent
      if (updates.agentId) {
        skill = await this.loadSkill(skillId, false, updates.agentId);
      } else {
        // 尝试在所有 agent 目录中查找
        const allSkills = await this.listPrivateSkills();
        skill = allSkills.find(s => s.id === skillId) || null;
      }
    }

    if (!skill) {
      return null;
    }

    const updated: Skill = {
      ...skill,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.saveSkill(updated);
    return updated;
  }
}

// ============ 全局实例 ============

let globalSkillManager: SkillManager | null = null;

/**
 * 获取技能管理器
 */
export function getSkillManager(): SkillManager {
  if (!globalSkillManager) {
    globalSkillManager = new SkillManager();
  }
  return globalSkillManager;
}

/**
 * 重置技能管理器
 */
export function resetSkillManager(): void {
  globalSkillManager = null;
}

// ============ 技能检测器 ============

/**
 * 缓存的嵌入数据
 */
interface CachedEmbedding {
  embedding: number[];
  timestamp: number;
}

/**
 * 技能检测器
 * 
 * 支持：
 * 1. 意图识别（优先）
 * 2. 关键词匹配
 * 3. 语义匹配
 */
export class SkillDetector {
  private skillManager: SkillManager;
  private semanticThreshold: number;
  private intentThreshold: number;
  /** 技能使用统计缓存 */
  private usageStats: Map<string, { usageCount: number; successRate: number; lastUsedAt?: string }>;
  /** 嵌入缓存（带时间戳） */
  private embeddingCache: Map<string, CachedEmbedding>;
  /** 嵌入缓存最大数量 */
  private maxEmbeddingCacheSize: number = 100;
  /** 嵌入缓存过期时间（毫秒） */
  private embeddingCacheTTL: number = 24 * 60 * 60 * 1000; // 24小时
  /** 意图到技能的映射 */
  private intentToSkillMap: Map<string, string[]> = new Map([
    ['research', ['deep-research']],
    ['analysis', ['data-analysis']],
    ['code_review', ['code-review', 'security-audit']],
    ['testing', ['testing-helper']],
    ['documentation', ['doc-generator', 'doc-writer']],
    ['debugging', ['debugger', 'code-review']],
    ['git', ['git-workflow']],
    ['api_design', ['api-design', 'api-designer']],
    ['security', ['security-audit', 'code-review']],
    ['deployment', ['git-workflow']],
    ['refactoring', ['code-review']],
    ['learning', ['deep-research', 'doc-writer']],
  ]);

  constructor(skillManager: SkillManager, options?: { semanticThreshold?: number; intentThreshold?: number }) {
    this.skillManager = skillManager;
    this.semanticThreshold = options?.semanticThreshold ?? 0.6;
    this.intentThreshold = options?.intentThreshold ?? 0.4;
    this.usageStats = new Map();
    this.embeddingCache = new Map();
  }

  /**
   * 清理过期的嵌入缓存
   */
  private cleanupEmbeddingCache(): void {
    const now = Date.now();
    for (const [key, value] of this.embeddingCache) {
      if (now - value.timestamp > this.embeddingCacheTTL) {
        this.embeddingCache.delete(key);
      }
    }
  }

  /**
   * 设置嵌入缓存
   */
  private setEmbeddingCache(key: string, embedding: number[]): void {
    // 清理过期缓存
    if (this.embeddingCache.size >= this.maxEmbeddingCacheSize) {
      this.cleanupEmbeddingCache();
    }
    
    // 如果还是超过限制，删除最旧的
    if (this.embeddingCache.size >= this.maxEmbeddingCacheSize) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of this.embeddingCache) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        this.embeddingCache.delete(oldestKey);
      }
    }
    
    this.embeddingCache.set(key, { embedding, timestamp: Date.now() });
  }

  /**
   * 检测匹配的技能
   * 
   * @param message 用户消息
   * @param agentId Agent ID（用于获取可用技能）
   * @returns 匹配结果，按分数排序
   */
  async detect(message: string, agentId: string): Promise<SkillMatchResult[]> {
    const skills = await this.skillManager.getAgentSkills(agentId);
    const results: SkillMatchResult[] = [];

    // ★ 步骤1：意图识别
    const intentResult = this.recognizeIntent(message);
    
    // 如果意图识别置信度高，优先匹配对应技能
    if (intentResult.confidence >= this.intentThreshold) {
      const skillIds = this.intentToSkillMap.get(intentResult.intent) || [];
      
      for (const skill of skills) {
        if (skillIds.includes(skill.id)) {
          results.push({
            skill,
            score: 0.85 + intentResult.confidence * 0.15, // 0.85-1.0
            method: 'keyword',
          });
        }
      }
      
      // 如果找到意图匹配的技能，直接返回
      if (results.length > 0) {
        results.sort((a, b) => b.score - a.score);
        return results;
      }
    }

    // ★ 步骤2：关键词匹配
    for (const skill of skills) {
      // 跳过已匹配的
      if (results.some(r => r.skill.id === skill.id)) continue;
      
      const keywordScore = this.matchByKeywords(message, skill);
      if (keywordScore > 0) {
        // ★ P1优化：结合使用频率调整分数
        const adjustedScore = this.adjustScoreByUsage(skill.id, keywordScore);
        results.push({
          skill,
          score: adjustedScore,
          method: 'keyword',
        });
      }
    }

    // ★ 步骤3：语义匹配（如果关键词匹配不足）
    if (results.length < 2) {
      for (const skill of skills) {
        // 跳过已匹配的
        if (results.some(r => r.skill.id === skill.id)) continue;
        
        const semanticScore = await this.matchBySemantic(message, skill, agentId);
        if (semanticScore >= this.semanticThreshold) {
          // ★ P1优化：结合使用频率调整分数
          const adjustedScore = this.adjustScoreByUsage(skill.id, semanticScore);
          results.push({
            skill,
            score: adjustedScore,
            method: 'semantic',
          });
        }
      }
    }

    // 按分数排序
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * 识别用户意图
   */
  private recognizeIntent(message: string): { intent: string; confidence: number; keywords: string[] } {
    const lowerMessage = message.toLowerCase();
    
    // 意图规则
    const intentRules: Array<{
      intent: string;
      patterns: RegExp[];
      keywords: Array<{ word: string; weight: number }>;
    }> = [
      {
        intent: 'research',
        patterns: [/研究|调查|什么是|解释|了解|学习|深度研究/i],
        keywords: [
          { word: '研究', weight: 0.9 },
          { word: '调查', weight: 0.85 },
          { word: '什么是', weight: 0.9 },
          { word: '研究', weight: 0.9 },
          { word: 'research', weight: 0.9 },
        ],
      },
      {
        intent: 'analysis',
        patterns: [/分析.*数据|数据.*分析|统计|Excel|CSV|数据透视/i],
        keywords: [
          { word: '数据分析', weight: 0.95 },
          { word: 'Excel', weight: 0.9 },
          { word: 'CSV', weight: 0.9 },
          { word: '统计', weight: 0.8 },
          { word: '分析', weight: 0.7 },
        ],
      },
      {
        intent: 'code_review',
        patterns: [/审查.*代码|代码.*审查|review|检查.*代码|代码质量/i],
        keywords: [
          { word: '代码审查', weight: 0.95 },
          { word: 'review', weight: 0.9 },
          { word: '代码检查', weight: 0.9 },
          { word: '审查', weight: 0.85 },
        ],
      },
      {
        intent: 'testing',
        patterns: [/写.*测试|测试.*用例|单元测试|集成测试|测试/i],
        keywords: [
          { word: '测试', weight: 0.8 },
          { word: '单元测试', weight: 0.95 },
          { word: '测试用例', weight: 0.9 },
          { word: 'test', weight: 0.85 },
        ],
      },
      {
        intent: 'documentation',
        patterns: [/写.*文档|文档|README|API文档|使用说明/i],
        keywords: [
          { word: '文档', weight: 0.8 },
          { word: 'README', weight: 0.95 },
          { word: 'API文档', weight: 0.95 },
          { word: 'documentation', weight: 0.9 },
        ],
      },
      {
        intent: 'debugging',
        patterns: [/调试|debug|修复.*bug|排查.*问题|报错|错误/i],
        keywords: [
          { word: '调试', weight: 0.9 },
          { word: 'debug', weight: 0.95 },
          { word: 'bug', weight: 0.85 },
          { word: '修复', weight: 0.8 },
          { word: '报错', weight: 0.85 },
        ],
      },
      {
        intent: 'git',
        patterns: [/git|提交|推送|拉取|分支|合并|rebase|冲突/i],
        keywords: [
          { word: 'git', weight: 0.95 },
          { word: 'commit', weight: 0.9 },
          { word: 'branch', weight: 0.9 },
          { word: 'merge', weight: 0.9 },
          { word: '分支', weight: 0.85 },
        ],
      },
      {
        intent: 'api_design',
        patterns: [/设计.*API|API.*设计|REST.*API|接口.*设计/i],
        keywords: [
          { word: 'API', weight: 0.85 },
          { word: 'REST', weight: 0.9 },
          { word: '接口', weight: 0.8 },
          { word: 'endpoint', weight: 0.9 },
        ],
      },
      {
        intent: 'security',
        patterns: [/安全.*审计|漏洞|SQL注入|XSS|CSRF|安全/i],
        keywords: [
          { word: '安全', weight: 0.8 },
          { word: '漏洞', weight: 0.9 },
          { word: 'SQL注入', weight: 0.95 },
          { word: 'XSS', weight: 0.95 },
          { word: 'security', weight: 0.9 },
        ],
      },
      {
        intent: 'deployment',
        patterns: [/部署|deploy|Docker|Kubernetes|容器|发布/i],
        keywords: [
          { word: '部署', weight: 0.9 },
          { word: 'deploy', weight: 0.95 },
          { word: 'Docker', weight: 0.95 },
          { word: 'Kubernetes', weight: 0.95 },
        ],
      },
    ];

    let bestIntent = 'general';
    let bestScore = 0;
    let bestKeywords: string[] = [];

    for (const rule of intentRules) {
      let score = 0;
      const matchedKeywords: string[] = [];

      // 模式匹配
      for (const pattern of rule.patterns) {
        if (pattern.test(message)) {
          score += 0.5;
          break;
        }
      }

      // 关键词匹配
      for (const { word, weight } of rule.keywords) {
        if (lowerMessage.includes(word.toLowerCase())) {
          score += weight;
          matchedKeywords.push(word);
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestIntent = rule.intent;
        bestKeywords = matchedKeywords;
      }
    }

    // 归一化分数
    const confidence = Math.min(1, bestScore / 2);

    return { intent: bestIntent, confidence, keywords: bestKeywords };
  }

  /**
   * 检测并返回最佳匹配
   */
  async detectBest(message: string, agentId: string): Promise<SkillMatchResult | null> {
    const results = await this.detect(message, agentId);
    return results.length > 0 ? results[0]! : null;
  }

  /**
   * 关键词匹配
   * 
   * @returns 匹配分数 (0-1)
   */
  private matchByKeywords(message: string, skill: Skill): number {
    if (!skill.keywords || skill.keywords.length === 0) {
      // 如果没有关键词，尝试匹配技能名称和描述
      const nameMatch = skill.name.toLowerCase();
      const descMatch = skill.description.toLowerCase();
      const lowerMessage = message.toLowerCase();
      
      if (lowerMessage.includes(nameMatch)) {
        return 0.7;
      }
      if (lowerMessage.includes(descMatch.slice(0, 20))) {
        return 0.5;
      }
      return 0;
    }

    const lowerMessage = message.toLowerCase();
    let matchCount = 0;
    let weightedScore = 0;

    // 加权关键词
    const weightedKeywords: Record<string, number> = {
      'research': 1.0,
      '研究': 1.0,
      'analysis': 1.0,
      '分析': 0.9,
      'review': 1.0,
      '审查': 1.0,
      'test': 0.9,
      '测试': 0.9,
      'debug': 1.0,
      '调试': 1.0,
      'git': 0.95,
      'api': 0.9,
      'security': 1.0,
      '安全': 1.0,
      'deploy': 0.95,
      '部署': 0.95,
      '文档': 0.85,
      'doc': 0.9,
    };

    for (const keyword of skill.keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (lowerMessage.includes(lowerKeyword)) {
        matchCount++;
        weightedScore += weightedKeywords[lowerKeyword] || 0.7;
      }
    }

    if (matchCount === 0) {
      return 0;
    }

    // 分数计算：基础分数 + 加权分数
    const baseScore = Math.min(0.6, matchCount * 0.3);
    const totalScore = baseScore + weightedScore * 0.15;

    return Math.min(1, totalScore);
  }

  /**
   * 语义匹配（P1优化：支持向量嵌入）
   * 
   * 优先使用 RAG embedding，降级到词重叠
   */
  private async matchBySemantic(message: string, skill: Skill, agentId?: string): Promise<number> {
    // ★ P1优化：尝试使用 RAG embedding
    const embeddingScore = await this.matchByEmbedding(message, skill, agentId);
    if (embeddingScore !== null) {
      return embeddingScore;
    }
    
    // 降级：词重叠（Jaccard 相似度）
    const messageWords = this.tokenize(message.toLowerCase());
    const descWords = this.tokenize(skill.description.toLowerCase());

    // 计算词重叠
    const intersection = messageWords.filter(w => descWords.includes(w));
    
    if (intersection.length === 0) {
      return 0;
    }

    // Jaccard 相似度
    const union = new Set([...messageWords, ...descWords]);
    return intersection.length / union.size;
  }
  
  /**
   * ★ P1优化：使用向量嵌入进行语义匹配
   */
  private async matchByEmbedding(message: string, skill: Skill, agentId?: string): Promise<number | null> {
    try {
      // 尝试获取 RAG embedder
      const { ragManager } = await import('../rag/tools.js');
      
      if (!agentId) {
        return null;
      }
      
      const store = await ragManager.getStore({ id: agentId });
      if (!store || !store.getEmbedder) {
        return null;
      }
      
      const embedder = store.getEmbedder();
      if (!embedder) {
        return null;
      }
      
      // 定期清理过期缓存
      this.cleanupEmbeddingCache();
      
      // 获取消息嵌入
      let messageEmbedding = this.embeddingCache.get(`msg:${message}`);
      if (!messageEmbedding) {
        const embedding = await embedder.embed(message);
        this.setEmbeddingCache(`msg:${message}`, embedding);
        messageEmbedding = { embedding, timestamp: Date.now() };
      }
      
      // 获取技能描述嵌入
      const skillText = `${skill.name} ${skill.description} ${(skill.keywords || []).join(' ')}`;
      let skillEmbedding = this.embeddingCache.get(`skill:${skill.id}`);
      if (!skillEmbedding) {
        const embedding = await embedder.embed(skillText);
        this.setEmbeddingCache(`skill:${skill.id}`, embedding);
        skillEmbedding = { embedding, timestamp: Date.now() };
      }
      
      // 计算余弦相似度
      const similarity = this.cosineSimilarity(messageEmbedding.embedding, skillEmbedding.embedding);
      return similarity;
    } catch {
      // RAG 不可用，返回 null 表示降级
      return null;
    }
  }
  
  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * ★ P1优化：根据使用频率调整分数
   */
  private adjustScoreByUsage(skillId: string, baseScore: number): number {
    const stats = this.usageStats.get(skillId);
    if (!stats) {
      return baseScore;
    }
    
    // 使用频率加权（最高 +0.2）
    const usageBonus = Math.min(0.2, stats.usageCount * 0.02);
    
    // 成功率加权（最高 +0.1）
    const successBonus = stats.successRate * 0.1;
    
    return Math.min(1, baseScore + usageBonus + successBonus);
  }
  
  /**
   * ★ P1优化：记录技能使用
   */
  recordUsage(skillId: string, success: boolean): void {
    const stats = this.usageStats.get(skillId) || { usageCount: 0, successRate: 0.8 };
    
    stats.usageCount++;
    stats.lastUsedAt = new Date().toISOString();
    
    // 更新成功率（移动平均）
    const alpha = 0.1;
    stats.successRate = stats.successRate * (1 - alpha) + (success ? 1 : 0) * alpha;
    
    this.usageStats.set(skillId, stats);
  }
  
  /**
   * 获取技能使用统计
   */
  getUsageStats(skillId: string): { usageCount: number; successRate: number; lastUsedAt?: string } | undefined {
    return this.usageStats.get(skillId);
  }

  /**
   * 分词
   */
  private tokenize(text: string): string[] {
    // 简单分词：按空格和标点分割
    return text
      .replace(/[，。！？、；：""''（）【】]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);
  }
}

// ============ 全局技能检测器 ============

let globalSkillDetector: SkillDetector | null = null;

/**
 * 获取技能检测器
 */
export function getSkillDetector(): SkillDetector {
  if (!globalSkillDetector) {
    globalSkillDetector = new SkillDetector(getSkillManager());
  }
  return globalSkillDetector;
}

/**
 * 重置技能检测器
 */
export function resetSkillDetector(): void {
  globalSkillDetector = null;
}