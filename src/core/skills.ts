/**
 * 技能系统
 * 
 * 纯 Markdown 格式技能管理
 * 遵循 Deer-Flow 标准
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRootDir } from './config.js';
import {
  SkillLoader,
  getSkillLoader,
  SkillMatcher,
  getSkillMatcher,
  type MarkdownSkill,
  type SkillMetadata,
  type SkillMatchResult,
} from './skills/index.js';

// 重导出类型
import { isSkillConditionsAllowed } from "./skills/skill-conditions.js";
import { getAvailableToolsets, type ToolsetConfig } from "./toolsets.js";
export type {
  MarkdownSkill,
  SkillMetadata,
  MatchedSkill,
  LegacySkill,
  SkillMatchResult,
} from './skills/index.js';

// 重导出组件
export {
  SkillLoader,
  getSkillLoader,
  SkillMatcher,
  getSkillMatcher,
  IntentRecognizer,
  getIntentRecognizer,
  parseSkillFile,
} from './skills/index.js';

// ============ 全局实例 ============

let globalSkillManager: SkillManager | null = null;
let globalSkillDetector: SkillDetector | null = null;

// ============ SkillManager ============

export interface SkillConfig {
  publicDir: string;
  agentsDir: string;
}

export class SkillManager {
  private config: SkillConfig;
  private loader: SkillLoader;

  constructor(config?: Partial<SkillConfig>) {
    const rootDir = getRootDir();
    this.config = {
      publicDir: join(rootDir, 'skills', 'public'),
      agentsDir: join(rootDir, 'agents'),
      ...config,
    };
    this.loader = getSkillLoader({
      skillsRoot: rootDir,
    });
  }

  async initialize(): Promise<void> {
    if (!existsSync(this.config.publicDir)) {
      mkdirSync(this.config.publicDir, { recursive: true });
    }
    await this.loader.loadAllMetadata(getRootDir());
  }

  async listPublicSkills(): Promise<MarkdownSkill[]> {
    const metadata = this.loader.getAllCachedMetadata().filter(m => m.category === 'public');
    const skills: MarkdownSkill[] = [];
    for (const m of metadata) {
      const skill = await this.loader.loadSkillContent(m.id);
      if (skill) skills.push(skill);
    }
    return skills;
  }

  async listPrivateSkills(agentId?: string): Promise<MarkdownSkill[]> {
    const allMetadata = this.loader.getAllCachedMetadata().filter(m => m.category === 'private');
    const filtered = agentId ? allMetadata.filter(m => m.agentId === agentId) : allMetadata;
    const skills: MarkdownSkill[] = [];
    for (const m of filtered) {
      const skill = await this.loader.loadSkillContent(m.id);
      if (skill) skills.push(skill);
    }
    return skills;
  }

  async getAgentSkills(agentId: string): Promise<MarkdownSkill[]> {
    const publicSkills = await this.listPublicSkills();
    const privateSkills = await this.listPrivateSkills(agentId);
    return [...publicSkills, ...privateSkills];
  }

  async loadSkill(skillId: string): Promise<MarkdownSkill | null> {
    return this.loader.loadSkillContent(skillId);
  }

  async getSkillMetadata(skillId: string): Promise<SkillMetadata | undefined> {
    return this.loader.getCachedMetadata(skillId);
  }

  async buildSkillsPrompt(
    agentId: string,
    skillIds?: string[],
    toolsets?: ToolsetConfig
  ): Promise<string> {
    // 获取可用工具集
    const availableToolsets = new Set(getAvailableToolsets(toolsets || {}));
    
    const allSkills = await this.getAgentSkills(agentId);
    
    // 阶段 1：基于条件过滤技能
    const filteredByConditions = allSkills.filter(skill => 
      isSkillConditionsAllowed(skill, availableToolsets)
    );
    
    // 阶段 2：基于 skillIds 过滤（如果指定）
    const skills = skillIds && skillIds.length > 0
      ? filteredByConditions.filter(s => skillIds.includes(s.id))
      : filteredByConditions;

    if (skills.length === 0) return "";

    const parts: string[] = ["## 技能模块\n"];

    for (const skill of skills) {
      parts.push(`### ${skill.name}\n`);
      if (skill.overview) {
        parts.push(`${skill.overview}\n\n`);
      }
    }

    return parts.join("");
  }
  async createSkill(skill: Partial<MarkdownSkill> & { id: string; name: string }, isPublic: boolean, agentId?: string): Promise<MarkdownSkill> {
    const skillDir = isPublic
      ? join(this.config.publicDir, skill.id)
      : join(this.config.agentsDir, agentId!, 'skills', skill.id);

    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true });
    }

    const skillFile = join(skillDir, 'SKILL.md');
    const content = this.skillToMarkdown(skill);

    writeFileSync(skillFile, content, 'utf-8');

    return {
      ...skill,
      skillDir,
      skillFile,
      category: isPublic ? 'public' : 'private',
      agentId: isPublic ? undefined : agentId,
      isPublic, // 添加isPublic字段
    } as MarkdownSkill;
  }

  /**
   * 创建私有技能
   */
  async createPrivateSkill(agentId: string, skill: Partial<MarkdownSkill> & { id: string; name: string }): Promise<MarkdownSkill> {
    return this.createSkill(skill, false, agentId);
  }

  /**
   * 创建公共技能
   */
  async createPublicSkill(skill: Partial<MarkdownSkill> & { id: string; name: string }): Promise<MarkdownSkill> {
    return this.createSkill(skill, true);
  }

  /**
   * 更新技能
   */
  async updateSkill(skillId: string, updates: Partial<MarkdownSkill>, isPublic: boolean, agentId?: string): Promise<MarkdownSkill | null> {
    const existing = await this.loadSkill(skillId);
    if (!existing) return null;

    // 如果没有提供isPublic和agentId，从existing推断
    const finalIsPublic = isPublic ?? (existing.category === 'public');
    const finalAgentId = agentId ?? existing.agentId;

    const updated = { ...existing, ...updates };
    return this.createSkill(updated, finalIsPublic, finalAgentId);
  }

  async deleteSkill(skillId: string, isPublic: boolean, agentId?: string): Promise<boolean> {
    const skillDir = isPublic
      ? join(this.config.publicDir, skillId)
      : join(this.config.agentsDir, agentId!, 'skills', skillId);

    if (!existsSync(skillDir)) return false;

    try {
      const { rmSync } = await import('node:fs');
      rmSync(skillDir, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  private skillToMarkdown(skill: Partial<MarkdownSkill> & { id: string; name: string }): string {
    const frontmatter: string[] = ['---'];
    frontmatter.push(`id: ${skill.id}`);
    frontmatter.push(`name: ${skill.name}`);
    if (skill.description) {
      frontmatter.push(`description: ${skill.description}`);
    }
    if (skill.keywords?.length) {
      frontmatter.push('keywords:');
      for (const kw of skill.keywords) {
        frontmatter.push(`  - ${kw}`);
      }
    }
    if (skill.tools?.length) {
      frontmatter.push('tools:');
      for (const t of skill.tools) {
        frontmatter.push(`  - ${t}`);
      }
    }
    frontmatter.push('---\n');

    let body = `# ${skill.name}\n\n`;
    if (skill.overview) {
      body += `${skill.overview}\n\n`;
    }
    if (skill.whenToUse?.length) {
      body += '## 何时使用\n';
      for (const w of skill.whenToUse) {
        body += `- ${w}\n`;
      }
      body += '\n';
    }
    if (skill.bestPractices?.length) {
      body += '## 最佳实践\n';
      for (const b of skill.bestPractices) {
        body += `- ${b}\n`;
      }
      body += '\n';
    }

    return frontmatter.join('\n') + body;
  }
}

export function getSkillManager(): SkillManager {
  if (!globalSkillManager) {
    globalSkillManager = new SkillManager();
  }
  return globalSkillManager;
}

export function resetSkillManager(): void {
  globalSkillManager = null;
}

// ============ SkillDetector ============

export class SkillDetector {
  private matcher: SkillMatcher;
  private usageStats: Map<string, { usageCount: number; successRate: number }> = new Map();

  constructor() {
    this.matcher = getSkillMatcher();
  }

  async detect(message: string, agentId: string): Promise<SkillMatchResult[]> {
    const results: SkillMatchResult[] = [];
    const matches = await this.matcher.match(message, agentId);

    for (const m of matches) {
      if (m.skill) {
        results.push({
          skill: m.skill,
          score: m.score,
          method: m.method,
        });
      }
    }

    return results;
  }

  async detectBest(message: string, agentId: string): Promise<SkillMatchResult | null> {
    const results = await this.detect(message, agentId);
    return results.length > 0 ? results[0]! : null;
  }

  recordUsage(skillId: string, success: boolean): void {
    const stats = this.usageStats.get(skillId) || { usageCount: 0, successRate: 0 };
    stats.usageCount++;
    stats.successRate = (stats.successRate * (stats.usageCount - 1) + (success ? 1 : 0)) / stats.usageCount;
    this.usageStats.set(skillId, stats);
  }

  getUsageStats(skillId: string): { usageCount: number; successRate: number } | undefined {
    return this.usageStats.get(skillId);
  }
}

export function getSkillDetector(): SkillDetector {
  if (!globalSkillDetector) {
    globalSkillDetector = new SkillDetector();
  }
  return globalSkillDetector;
}

export function resetSkillDetector(): void {
  globalSkillDetector = null;
}

// ============ 兼容性导出 ============

export type Skill = MarkdownSkill;