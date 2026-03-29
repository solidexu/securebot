/**
 * 技能生成器
 * 
 * 从成功模式自动生成技能
 * 
 * 存储结构（通过 SkillManager）：
 * ~/.securebot/
 * └── agents/
 *     └── {agentId}/
 *         └── skills/
 *             ├── skill_xxx.json
 *             └── skill_yyy.json
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import type { 
  GeneratedSkill, 
  SkillGeneratorConfig,
  SuccessPattern,
} from './types.js';
import { getSuccessPatternStore } from './success-pattern-store.js';
import { writeJsonAtomic } from './atomic-write.js';

// ============ 默认配置 ============

const DEFAULT_CONFIG: SkillGeneratorConfig = {
  enabled: true,
  minPatternsToGenerate: 3,
  // storageDir 已废弃，技能通过 SkillManager 存储
  storageDir: '',  
};

// ============ 技能模板 ============

/**
 * 根据任务类型生成技能模板
 */
const SKILL_TEMPLATES: Record<string, {
  namePrefix: string;
  promptTemplate: string;
  defaultTools: string[];
}> = {
  coding: {
    namePrefix: '代码',
    promptTemplate: `你是一个专业的代码开发助手。

## 技能说明
{description}

## 最佳实践
{bestPractices}

## 推荐工具
{tools}

## 注意事项
- 遵循代码规范
- 注意错误处理
- 编写必要的注释`,
    defaultTools: ['fs_read', 'fs_write', 'exec'],
  },
  analysis: {
    namePrefix: '分析',
    promptTemplate: `你是一个专业的分析助手。

## 技能说明
{description}

## 分析方法
{bestPractices}

## 分析工具
{tools}

## 输出要求
- 结构清晰
- 数据支撑
- 结论明确`,
    defaultTools: ['fs_read', 'exec'],
  },
  debugging: {
    namePrefix: '调试',
    promptTemplate: `你是一个专业的调试助手。

## 技能说明
{description}

## 调试方法
{bestPractices}

## 调试工具
{tools}

## 调试流程
1. 复现问题
2. 定位原因
3. 提出方案
4. 验证修复`,
    defaultTools: ['fs_read', 'exec', 'fs_write'],
  },
  planning: {
    namePrefix: '规划',
    promptTemplate: `你是一个专业的规划助手。

## 技能说明
{description}

## 规划方法
{bestPractices}

## 规划工具
{tools}

## 规划原则
- 目标明确
- 步骤清晰
- 资源评估
- 风险控制`,
    defaultTools: ['fs_write'],
  },
  // ★ 新增模板
  testing: {
    namePrefix: '测试',
    promptTemplate: `你是一个专业的测试助手。

## 技能说明
{description}

## 测试方法
{bestPractices}

## 测试工具
{tools}

## 测试原则
- 测试覆盖率优先
- 边界条件必测
- 异常路径覆盖
- 测试命名清晰`,
    defaultTools: ['fs_read', 'fs_write', 'exec'],
  },
  documentation: {
    namePrefix: '文档',
    promptTemplate: `你是一个专业的文档编写助手。

## 技能说明
{description}

## 文档规范
{bestPractices}

## 文档工具
{tools}

## 文档原则
- 结构清晰，层次分明
- 示例丰富，易于理解
- 及时更新，保持同步
- 面向读者，简明扼要`,
    defaultTools: ['fs_read', 'fs_write'],
  },
  refactoring: {
    namePrefix: '重构',
    promptTemplate: `你是一个专业的代码重构助手。

## 技能说明
{description}

## 重构方法
{bestPractices}

## 重构工具
{tools}

## 重构原则
- 小步重构，频繁测试
- 保持功能不变
- 提高代码可读性
- 消除重复代码`,
    defaultTools: ['fs_read', 'fs_write', 'exec'],
  },
  deployment: {
    namePrefix: '部署',
    promptTemplate: `你是一个专业的部署助手。

## 技能说明
{description}

## 部署流程
{bestPractices}

## 部署工具
{tools}

## 部署原则
- 环境一致性
- 回滚机制
- 监控告警
- 安全配置`,
    defaultTools: ['exec', 'fs_read'],
  },
  optimization: {
    namePrefix: '优化',
    promptTemplate: `你是一个专业的性能优化助手。

## 技能说明
{description}

## 优化方法
{bestPractices}

## 优化工具
{tools}

## 优化原则
- 先测量，后优化
- 找到真正的瓶颈
- 权衡时间和空间
- 保持代码可读`,
    defaultTools: ['fs_read', 'exec'],
  },
  integration: {
    namePrefix: '集成',
    promptTemplate: `你是一个专业的系统集成助手。

## 技能说明
{description}

## 集成方法
{bestPractices}

## 集成工具
{tools}

## 集成原则
- 接口清晰
- 错误处理完善
- 文档齐全
- 版本兼容`,
    defaultTools: ['fs_read', 'fs_write', 'exec'],
  },
};

// ============ 技能生成器 ============

/**
 * 技能生成器
 */
export class SkillGenerator {
  private config: SkillGeneratorConfig;
  private skills: Map<string, GeneratedSkill> = new Map();
  private initialized: boolean = false;
  
  constructor(config: Partial<SkillGeneratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    // 技能现在通过 SkillManager 存储，不需要初始化本地目录
    this.initialized = true;
  }
  
  /**
   * 从 SkillManager 加载技能到内存缓存
   */
  private async loadSkillsFromManager(agentId?: string): Promise<void> {
    try {
      const { getSkillManager } = await import('../skills.js');
      const skillManager = getSkillManager();
      await skillManager.initialize();
      
      // 清空当前缓存
      this.skills.clear();
      
      // 从 SkillManager 加载
      const skills = agentId 
        ? await skillManager.listPrivateSkills(agentId)
        : await skillManager.listPrivateSkills();
      
      for (const skill of skills) {
        // 转换为 GeneratedSkill 格式
        const genSkill: GeneratedSkill = {
          id: skill.id,
          agentId: skill.agentId || '',
          name: skill.name,
          description: skill.description,
          source: 'success_pattern',  // 默认来源
          sourceId: '',
          prompt: skill.systemPrompt,
          tools: skill.tools || [],
          examples: skill.examples?.map(e => e.assistant) || [],
          usageCount: 0,
          successRate: 0.8,
          createdAt: skill.createdAt,
        };
        this.skills.set(skill.id, genSkill);
      }
    } catch (error) {
      // 忽略错误，使用空缓存
    }
  }
  
  /**
   * 持久化技能（通过 SkillManager）
   */
  private async persist(skill: GeneratedSkill): Promise<void> {
    // 技能通过 registerToSkillManager 保存，这里不再需要
    // 保留方法以兼容旧代码
  }
  
  /**
   * 从成功模式生成技能
   */
  async generateFromPattern(
    agentId: string,
    pattern: SuccessPattern
  ): Promise<GeneratedSkill | null> {
    if (!this.config.enabled) return null;
    
    await this.initialize();
    
    const template = SKILL_TEMPLATES[pattern.taskType];
    if (!template) {
      // 使用通用模板
      return this.generateGenericSkill(agentId, pattern);
    }
    
    // 构建技能内容
    const description = `擅长${pattern.taskType}类任务: ${pattern.taskDescription.slice(0, 100)}`;
    const bestPractices = pattern.steps.length > 0 
      ? pattern.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
      : pattern.approach;
    const tools = [...new Set([...template.defaultTools, ...pattern.toolsUsed])].slice(0, 5);
    
    const skill: GeneratedSkill = {
      id: `skill_${uuidv4().slice(0, 8)}`,
      agentId,
      name: `${template.namePrefix}_${pattern.taskType}_${Date.now().toString(36)}`,
      description,
      source: 'success_pattern',
      sourceId: pattern.id,
      prompt: template.promptTemplate
        .replace('{description}', description)
        .replace('{bestPractices}', bestPractices)
        .replace('{tools}', tools.join(', ')),
      tools,
      examples: [pattern.approach.slice(0, 200)],
      usageCount: 0,
      successRate: pattern.effectiveness,
      createdAt: new Date().toISOString(),
    };
    
    this.skills.set(skill.id, skill);
    await this.persist(skill);
    
    return skill;
  }
  
  /**
   * 生成通用技能
   */
  private async generateGenericSkill(
    agentId: string,
    pattern: SuccessPattern
  ): Promise<GeneratedSkill> {
    const description = `擅长任务: ${pattern.taskDescription.slice(0, 100)}`;
    
    const skill: GeneratedSkill = {
      id: `skill_${uuidv4().slice(0, 8)}`,
      agentId,
      name: `技能_${Date.now().toString(36)}`,
      description,
      source: 'success_pattern',
      sourceId: pattern.id,
      prompt: `你是一个专业的助手。

## 技能说明
${description}

## 方法
${pattern.approach}

## 步骤
${pattern.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## 工具
${pattern.toolsUsed.join(', ')}`,
      tools: pattern.toolsUsed.slice(0, 5),
      examples: [pattern.approach.slice(0, 200)],
      usageCount: 0,
      successRate: pattern.effectiveness,
      createdAt: new Date().toISOString(),
    };
    
    this.skills.set(skill.id, skill);
    await this.persist(skill);
    
    return skill;
  }
  
  /**
   * 自动检测并生成技能
   */
  async autoGenerateSkills(agentId: string): Promise<GeneratedSkill[]> {
    if (!this.config.enabled) return [];
    
    await this.initialize();
    
    // 从 SkillManager 加载已有技能
    await this.loadSkillsFromManager(agentId);
    
    const store = getSuccessPatternStore();
    const patterns = await store.getBestPractices(agentId);
    
    // 过滤高效果的模式
    const goodPatterns = patterns.filter(p => 
      p.effectiveness >= 0.8 && 
      p.usageCount >= this.config.minPatternsToGenerate
    );
    
    // 检查是否已生成过
    const existingSources = new Set(
      Array.from(this.skills.values())
        .filter(s => s.agentId === agentId)
        .map(s => s.sourceId)
    );
    
    const newPatterns = goodPatterns.filter(p => !existingSources.has(p.id));
    
    // 生成技能
    const generated: GeneratedSkill[] = [];
    for (const pattern of newPatterns.slice(0, 3)) { // 限制每次生成数量
      const skill = await this.generateFromPattern(agentId, pattern);
      if (skill) {
        generated.push(skill);
        
        // ★ 同时注册到 SkillManager
        await this.registerToSkillManager(skill);
      }
    }
    
    return generated;
  }
  
  /**
   * 将生成的技能注册到 SkillManager
   */
  private async registerToSkillManager(skill: GeneratedSkill): Promise<void> {
    try {
      const { getSkillManager } = await import('../skills.js');
      const skillManager = getSkillManager();
      await skillManager.initialize();
      
      // 转换为 Skill 格式
      const skillDef = {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        keywords: this.extractKeywords(skill),
        systemPrompt: skill.prompt,
        tools: skill.tools,
        examples: skill.examples?.map(e => ({
          user: skill.description,
          assistant: e,
        })),
        isPublic: false,
        agentId: skill.agentId,
        createdAt: skill.createdAt,
        updatedAt: skill.createdAt,
      };
      
      await skillManager.saveSkill(skillDef);
      
      // 修复：将技能 ID 添加到 agent 配置中
      await this.addSkillToAgentConfig(skill.agentId, skill.id);
    } catch (error) {
      console.error('注册技能到 SkillManager 失败:', error);
    }
  }
  
  /**
   * 将技能 ID 添加到 agent 配置
   */
  private async addSkillToAgentConfig(agentId: string, skillId: string): Promise<void> {
    try {
      const { getConfig, saveConfig } = await import('../config.js');
      const config = getConfig();
      
      // 查找对应的 agent
      const agentIndex = config.agents?.findIndex(a => a.id === agentId);
      if (agentIndex === undefined || agentIndex < 0) {
        // agent 不在配置中，跳过
        return;
      }
      
      const agent = config.agents![agentIndex]!;
      
      // 初始化 skills 数组（如果不存在）
      if (!agent.skills) {
        agent.skills = [];
      }
      
      // 检查是否已存在
      if (agent.skills.includes(skillId)) {
        return;
      }
      
      // 添加技能 ID
      agent.skills.push(skillId);
      
      // 保存配置
      saveConfig(config);
      
      console.log(`[SkillGenerator] 已将技能 ${skillId} 添加到 agent ${agentId} 的配置中`);
    } catch (error) {
      console.error('添加技能到 agent 配置失败:', error);
    }
  }
  
  /**
   * 从技能描述提取关键词
   */
  private extractKeywords(skill: GeneratedSkill): string[] {
    const keywords: string[] = [];
    
    // 从描述中提取
    const descWords = skill.description
      .replace(/[，。！？、；：""''（）【】]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);
    keywords.push(...descWords.slice(0, 5));
    
    // 从工具中提取
    if (skill.tools) {
      keywords.push(...skill.tools);
    }
    
    return [...new Set(keywords)];
  }
  
  /**
   * 从用户请求生成技能
   */
  async generateFromRequest(
    agentId: string,
    request: string,
    approach: string
  ): Promise<GeneratedSkill> {
    await this.initialize();
    
    const skill: GeneratedSkill = {
      id: `skill_${uuidv4().slice(0, 8)}`,
      agentId,
      name: `自定义技能_${Date.now().toString(36)}`,
      description: request.slice(0, 200),
      source: 'user_request',
      sourceId: uuidv4(),
      prompt: `你是一个专业的助手。

## 任务描述
${request}

## 执行方法
${approach}

## 注意事项
- 按照方法执行
- 注意质量`,
      tools: [],
      examples: [approach.slice(0, 200)],
      usageCount: 0,
      successRate: 0.8,
      createdAt: new Date().toISOString(),
    };
    
    this.skills.set(skill.id, skill);
    await this.persist(skill);
    
    return skill;
  }
  
  /**
   * 获取 Agent 的技能列表
   */
  async getSkillsByAgent(agentId: string): Promise<GeneratedSkill[]> {
    await this.initialize();
    await this.loadSkillsFromManager(agentId);
    
    return Array.from(this.skills.values())
      .filter(s => s.agentId === agentId)
      .sort((a, b) => b.usageCount - a.usageCount);
  }
  
  /**
   * 记录技能使用
   */
  async recordUsage(skillId: string, success: boolean): Promise<void> {
    const skill = this.skills.get(skillId);
    if (!skill) return;
    
    skill.usageCount++;
    skill.lastUsedAt = new Date().toISOString();
    
    // 更新成功率（简单移动平均）
    const alpha = 0.1;
    skill.successRate = skill.successRate * (1 - alpha) + (success ? 1 : 0) * alpha;
    
    // 通过 SkillManager 更新
    await this.updateSkillInManager(skill);
  }
  
  /**
   * 删除技能
   */
  async deleteSkill(skillId: string): Promise<boolean> {
    const skill = this.skills.get(skillId);
    if (!skill) return false;
    
    this.skills.delete(skillId);
    
    // 从 SkillManager 删除
    await this.removeFromSkillManager(skill);
    
    return true;
  }
  
  /**
   * 更新 SkillManager 中的技能
   */
  private async updateSkillInManager(skill: GeneratedSkill): Promise<void> {
    try {
      const { getSkillManager } = await import('../skills.js');
      const skillManager = getSkillManager();
      
      const skillDef = {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        keywords: this.extractKeywords(skill),
        systemPrompt: skill.prompt,
        tools: skill.tools,
        examples: skill.examples?.map(e => ({
          user: skill.description,
          assistant: e,
        })),
        isPublic: false,
        agentId: skill.agentId,
        createdAt: skill.createdAt,
        updatedAt: new Date().toISOString(),
      };
      
      await skillManager.saveSkill(skillDef);
    } catch (error) {
      // 忽略错误
    }
  }
  
  // ============ 新增：技能优化功能 ============
  
  /**
   * 自动触发技能生成检查
   * 
   * 建议在以下时机调用：
   * 1. 任务成功完成后
   * 2. Agent 启动时
   * 3. 定期检查
   */
  async checkAndGenerateSkills(agentId: string): Promise<{
    generated: GeneratedSkill[];
    merged: Array<{ from: string[]; to: string }>;
    retired: string[];
  }> {
    await this.initialize();
    
    const result = {
      generated: [] as GeneratedSkill[],
      merged: [] as Array<{ from: string[]; to: string }>,
      retired: [] as string[],
    };
    
    // 1. 生成新技能
    const newSkills = await this.autoGenerateSkills(agentId);
    result.generated = newSkills;
    
    // 2. 合并相似技能
    const merged = await this.mergeSimilarSkills(agentId);
    result.merged = merged;
    
    // 3. 淘汰低效技能
    const retired = await this.retireLowPerformingSkills(agentId);
    result.retired = retired;
    
    return result;
  }
  
  /**
   * 技能质量评估
   * 
   * 返回每个技能的质量分数和建议
   */
  async evaluateSkillQuality(agentId: string): Promise<Array<{
    skill: GeneratedSkill;
    score: number;
    issues: string[];
    suggestions: string[];
  }>> {
    await this.initialize();
    
    const skills = await this.getSkillsByAgent(agentId);
    const evaluations: Array<{
      skill: GeneratedSkill;
      score: number;
      issues: string[];
      suggestions: string[];
    }> = [];
    
    for (const skill of skills) {
      const issues: string[] = [];
      const suggestions: string[] = [];
      let score = 0;
      
      // 1. 使用频率评分 (0-25分)
      const usageScore = Math.min(25, skill.usageCount * 5);
      score += usageScore;
      if (skill.usageCount < 2) {
        issues.push('使用次数过少');
        suggestions.push('考虑在相关任务中主动使用此技能');
      }
      
      // 2. 成功率评分 (0-40分)
      const successScore = skill.successRate * 40;
      score += successScore;
      if (skill.successRate < 0.5) {
        issues.push(`成功率较低 (${(skill.successRate * 100).toFixed(0)}%)`);
        suggestions.push('检查技能内容是否准确，考虑优化或淘汰');
      }
      
      // 3. 内容质量评分 (0-20分)
      let contentScore = 0;
      if (skill.prompt.length > 100) contentScore += 10;
      if (skill.tools && skill.tools.length > 0) contentScore += 5;
      if (skill.examples && skill.examples.length > 0) contentScore += 5;
      score += contentScore;
      
      if (skill.prompt.length < 100) {
        issues.push('技能描述过于简短');
        suggestions.push('添加更详细的执行步骤和注意事项');
      }
      
      // 4. 时效性评分 (0-15分)
      const daysSinceCreation = skill.createdAt 
        ? (Date.now() - new Date(skill.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        : 30;
      const freshnessScore = Math.max(0, 15 - daysSinceCreation * 0.5);
      score += freshnessScore;
      
      if (daysSinceCreation > 60) {
        issues.push('技能较旧，可能需要更新');
        suggestions.push('检查是否与当前最佳实践一致');
      }
      
      evaluations.push({
        skill,
        score,
        issues,
        suggestions,
      });
    }
    
    // 按分数排序
    evaluations.sort((a, b) => b.score - a.score);
    
    return evaluations;
  }
  
  /**
   * 合并相似技能
   * 
   * 检测描述相似、工具重叠的技能，合并为一个更强的技能
   */
  async mergeSimilarSkills(agentId: string): Promise<Array<{
    from: string[];
    to: string;
  }>> {
    await this.initialize();
    
    const skills = await this.getSkillsByAgent(agentId);
    const merged: Array<{ from: string[]; to: string }> = [];
    const processed = new Set<string>();
    
    for (let i = 0; i < skills.length; i++) {
      const skillA = skills[i];
      if (processed.has(skillA.id)) continue;
      
      const similarSkills: GeneratedSkill[] = [skillA];
      
      for (let j = i + 1; j < skills.length; j++) {
        const skillB = skills[j];
        if (processed.has(skillB.id)) continue;
        
        // 检查相似度
        const similarity = this.calculateSimilarity(skillA, skillB);
        if (similarity >= 0.7) {
          similarSkills.push(skillB);
        }
      }
      
      // 如果找到相似技能，合并
      if (similarSkills.length > 1) {
        const mergedSkill = await this.mergeSkills(similarSkills);
        if (mergedSkill) {
          merged.push({
            from: similarSkills.map(s => s.id),
            to: mergedSkill.id,
          });
          
          // 标记为已处理
          similarSkills.forEach(s => processed.add(s.id));
        }
      }
    }
    
    return merged;
  }
  
  /**
   * 计算两个技能的相似度
   */
  private calculateSimilarity(skillA: GeneratedSkill, skillB: GeneratedSkill): number {
    // 1. 描述相似度（词重叠）
    const wordsA = this.tokenize(skillA.description);
    const wordsB = this.tokenize(skillB.description);
    const descSimilarity = this.jaccardSimilarity(wordsA, wordsB);
    
    // 2. 工具重叠度
    const toolsA = new Set(skillA.tools || []);
    const toolsB = new Set(skillB.tools || []);
    const toolsOverlap = toolsA.size > 0 || toolsB.size > 0
      ? this.jaccardSimilarity([...toolsA], [...toolsB])
      : 0;
    
    // 3. 加权平均
    return descSimilarity * 0.7 + toolsOverlap * 0.3;
  }
  
  /**
   * 合并多个技能
   */
  private async mergeSkills(skills: GeneratedSkill[]): Promise<GeneratedSkill | null> {
    if (skills.length < 2) return null;
    
    // 选择最佳技能作为基础
    const best = skills.reduce((a, b) => 
      a.successRate * a.usageCount > b.successRate * b.usageCount ? a : b
    );
    
    // 合并工具
    const mergedTools = [...new Set(skills.flatMap(s => s.tools || []))];
    
    // 合并示例
    const mergedExamples = [...new Set(skills.flatMap(s => s.examples || []))].slice(0, 5);
    
    // 创建合并后的技能
    const mergedSkill: GeneratedSkill = {
      id: `skill_merged_${uuidv4().slice(0, 8)}`,
      agentId: best.agentId,
      name: `合并技能_${Date.now().toString(36)}`,
      description: best.description,
      source: 'merged',
      sourceId: skills.map(s => s.id).join(','),
      prompt: best.prompt + '\n\n## 补充经验\n' + 
        skills.filter(s => s.id !== best.id)
          .map(s => s.prompt)
          .filter(p => p !== best.prompt)
          .slice(0, 2)
          .join('\n\n'),
      tools: mergedTools,
      examples: mergedExamples,
      usageCount: skills.reduce((sum, s) => sum + s.usageCount, 0),
      successRate: skills.reduce((sum, s) => sum + s.successRate * s.usageCount, 0) /
                    skills.reduce((sum, s) => sum + s.usageCount, 0),
      createdAt: new Date().toISOString(),
    };
    
    // 保存合并后的技能
    this.skills.set(mergedSkill.id, mergedSkill);
    await this.persist(mergedSkill);
    
    // 注册到 SkillManager
    await this.registerToSkillManager(mergedSkill);
    
    // 删除被合并的技能
    for (const skill of skills) {
      if (skill.id !== best.id) {
        await this.deleteSkill(skill.id);
      }
    }
    
    return mergedSkill;
  }
  
  /**
   * 淘汰低效技能
   */
  async retireLowPerformingSkills(agentId: string): Promise<string[]> {
    await this.initialize();
    
    const skills = await this.getSkillsByAgent(agentId);
    const retired: string[] = [];
    
    for (const skill of skills) {
      // 淘汰条件
      const shouldRetire = 
        // 成功率过低且使用次数足够（说明确实不好）
        (skill.successRate < 0.3 && skill.usageCount >= 5) ||
        // 长期未使用且成功率一般
        (skill.usageCount === 0 && this.daysSinceCreation(skill) > 30) ||
        // 使用次数足够但成功率持续下降
        (skill.usageCount >= 10 && skill.successRate < 0.4);
      
      if (shouldRetire) {
        await this.deleteSkill(skill.id);
        retired.push(skill.id);
      }
    }
    
    return retired;
  }
  
  /**
   * 计算创建至今的天数
   */
  private daysSinceCreation(skill: GeneratedSkill): number {
    if (!skill.createdAt) return 0;
    return (Date.now() - new Date(skill.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  }
  
  /**
   * 分词
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);
  }
  
  /**
   * Jaccard 相似度
   */
  private jaccardSimilarity(a: string[], b: string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }
  
  /**
   * 从 SkillManager 删除技能
   */
  private async removeFromSkillManager(skill: GeneratedSkill): Promise<void> {
    try {
      const { getSkillManager } = await import('../skills.js');
      const skillManager = getSkillManager();
      await skillManager.deleteSkill(skill.id, false);
    } catch {
      // 忽略错误
    }
  }
  
  /**
   * 清除 Agent 的所有技能
   */
  async clearAgentSkills(agentId: string): Promise<number> {
    const skills = await this.getSkillsByAgent(agentId);
    let count = 0;
    
    for (const skill of skills) {
      if (await this.deleteSkill(skill.id)) {
        count++;
      }
    }
    
    return count;
  }
  
  /**
   * 获取技能统计
   */
  async getStats(agentId: string): Promise<{
    totalSkills: number;
    bySource: Record<string, number>;
    averageSuccessRate: number;
    totalUsage: number;
    topSkills: GeneratedSkill[];
  }> {
    const skills = await this.getSkillsByAgent(agentId);
    
    const bySource: Record<string, number> = {
      success_pattern: 0,
      user_request: 0,
      reflection: 0,
    };
    
    let totalSuccessRate = 0;
    let totalUsage = 0;
    
    for (const s of skills) {
      bySource[s.source] = (bySource[s.source] ?? 0) + 1;
      totalSuccessRate += s.successRate;
      totalUsage += s.usageCount;
    }
    
    return {
      totalSkills: skills.length,
      bySource,
      averageSuccessRate: skills.length > 0 
        ? Math.round(totalSuccessRate / skills.length * 100) / 100 
        : 0,
      totalUsage,
      topSkills: skills.slice(0, 5),
    };
  }
}

// ============ 全局实例 ============

let globalGenerator: SkillGenerator | null = null;

/**
 * 获取全局技能生成器
 */
export function getSkillGenerator(config?: Partial<SkillGeneratorConfig>): SkillGenerator {
  if (!globalGenerator) {
    globalGenerator = new SkillGenerator(config);
  }
  return globalGenerator;
}

/**
 * 重置全局实例
 */
export function resetSkillGenerator(): void {
  globalGenerator = null;
}