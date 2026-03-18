/**
 * 技能生成器
 * 
 * 从成功模式自动生成技能
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
  storageDir: join(homedir(), '.securebot', 'self-improving', 'generated-skills'),
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
    
    if (!existsSync(this.config.storageDir)) {
      mkdirSync(this.config.storageDir, { recursive: true });
    }
    
    await this.loadSkills();
    this.initialized = true;
  }
  
  /**
   * 加载已有技能
   */
  private async loadSkills(): Promise<void> {
    const files = readdirSync(this.config.storageDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const content = readFileSync(join(this.config.storageDir, file), 'utf-8');
        const skill = JSON.parse(content) as GeneratedSkill;
        this.skills.set(skill.id, skill);
      } catch {
        // 忽略
      }
    }
  }
  
  /**
   * 持久化技能
   */
  private async persist(skill: GeneratedSkill): Promise<void> {
    const filePath = join(this.config.storageDir, `${skill.id}.json`);
    writeJsonAtomic(filePath, skill);
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
      }
    }
    
    return generated;
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
    
    await this.persist(skill);
  }
  
  /**
   * 删除技能
   */
  async deleteSkill(skillId: string): Promise<boolean> {
    const skill = this.skills.get(skillId);
    if (!skill) return false;
    
    this.skills.delete(skillId);
    
    const filePath = join(this.config.storageDir, `${skillId}.json`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
    
    return true;
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