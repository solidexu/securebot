/**
 * Skills 渐进式加载器
 * 
 * 支持两阶段加载：
 * 1. 轻量级元数据加载（用于匹配）
 * 2. 按需加载完整内容
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SkillMetadata, MarkdownSkill, SkillLoaderConfig } from './types.js';
import { parseSkillFile } from './parser.js';

/**
 * 技能加载器
 */
export class SkillLoader {
  private config: Required<SkillLoaderConfig>;
  
  /** 元数据缓存 */
  private metadataCache: Map<string, SkillMetadata> = new Map();
  
  /** 完整内容缓存（LRU） */
  private contentCache: Map<string, MarkdownSkill> = new Map();
  
  /** LRU 访问顺序 */
  private accessOrder: string[] = [];

  constructor(config?: SkillLoaderConfig) {
    this.config = {
      maxCacheSize: config?.maxCacheSize ?? 20,
      skillsRoot: config?.skillsRoot ?? '',
      enableSemanticMatch: config?.enableSemanticMatch ?? false,
    };
  }

  /**
   * 加载所有技能元数据（轻量级）
   * 
   * 只解析 YAML front matter，不加载完整内容
   */
  async loadAllMetadata(skillsRoot: string): Promise<SkillMetadata[]> {
    const metadataList: SkillMetadata[] = [];

    // 扫描公共技能
    const publicDir = join(skillsRoot, 'skills', 'public');
    if (existsSync(publicDir)) {
      const publicMetadata = await this.scanMetadata(publicDir, 'public');
      metadataList.push(...publicMetadata);
    }

    // 扫描个人技能
    const agentsDir = join(skillsRoot, 'agents');
    if (existsSync(agentsDir)) {
      const agentDirs = this.listAgentDirs(agentsDir);
      for (const agentId of agentDirs) {
        const privateDir = join(agentsDir, agentId, 'skills');
        if (existsSync(privateDir)) {
          const privateMetadata = await this.scanMetadata(privateDir, 'private', agentId);
          metadataList.push(...privateMetadata);
        }
      }
    }

    // 更新缓存
    for (const metadata of metadataList) {
      this.metadataCache.set(metadata.id, metadata);
    }

    return metadataList;
  }

  /**
   * 获取缓存的元数据
   */
  getCachedMetadata(skillId: string): SkillMetadata | undefined {
    return this.metadataCache.get(skillId);
  }

  /**
   * 获取所有缓存的元数据
   */
  getAllCachedMetadata(): SkillMetadata[] {
    return Array.from(this.metadataCache.values());
  }

  /**
   * 扫描目录中的技能元数据
   */
  private async scanMetadata(
    dir: string,
    category: 'public' | 'private',
    agentId?: string
  ): Promise<SkillMetadata[]> {
    const metadataList: SkillMetadata[] = [];

    const skillDirs = readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const skillId of skillDirs) {
      const skillFile = join(dir, skillId, 'SKILL.md');

      if (!existsSync(skillFile)) {
        continue;
      }

      // ✅ 只解析 front matter，不加载完整内容
      const metadata = this.parseMetadata(skillFile, category, agentId);

      if (metadata) {
        metadataList.push(metadata);
      }
    }

    return metadataList;
  }

  /**
   * 只解析元数据（不加载完整内容）
   */
  private parseMetadata(
    skillFile: string,
    category: 'public' | 'private',
    agentId?: string
  ): SkillMetadata | null {
    try {
      const content = readFileSync(skillFile, 'utf-8');

      // 只提取 front matter
      const frontMatterMatch = content.match(/^---\s*\n(.*?)\n---\s*\n/s);
      if (!frontMatterMatch) {
        return null;
      }

      // 解析 YAML front matter
      const frontMatter = this.parseYamlFrontMatterSimple(frontMatterMatch[1]!);

      // 验证必需字段
      if (!frontMatter.id || !frontMatter.name) {
        return null;
      }

      // 提取概述（第一段）
      const body = content.slice(frontMatterMatch[0].length);
      const overviewMatch = body.match(/^#\s+.+\n\n(.+?)(?=\n\n##|$)/s);
      const description = overviewMatch && overviewMatch[1] ? overviewMatch[1].trim() : undefined;

      return {
        id: frontMatter.id,
        name: frontMatter.name,
        keywords: frontMatter.keywords || [],
        description,
        category,
        skillFile,
        agentId,
        trigger: frontMatter.trigger,
      };
    } catch (error) {
      console.error(`Failed to parse metadata from ${skillFile}:`, error);
      return null;
    }
  }

  /**
   * 简化的 YAML front matter 解析（只提取基本字段）
   */
  private parseYamlFrontMatterSimple(yaml: string): Record<string, any> {
    const result: Record<string, any> = {};
    const lines = yaml.split('\n');

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match && match[1]) {
        const key = match[1];
        const value = match[2] || '';
        
        // 数组
        if (value === '' && lines[lines.indexOf(line) + 1]?.match(/^\s*-/)) {
          result[key] = [];
          // 读取数组项
          for (let i = lines.indexOf(line) + 1; i < lines.length; i++) {
            const arrayMatch = lines[i]?.match(/^\s*-\s+(.+)$/);
            if (arrayMatch && arrayMatch[1]) {
              result[key].push(arrayMatch[1].trim());
            } else {
              break;
            }
          }
        } else {
          result[key] = value.trim();
        }
      }
    }

    return result;
  }

  /**
   * 列出所有 Agent 目录
   */
  private listAgentDirs(agentsDir: string): string[] {
    if (!existsSync(agentsDir)) {
      return [];
    }

    return readdirSync(agentsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  }

  /**
   * 按需加载技能完整内容
   */
  async loadSkillContent(skillId: string): Promise<MarkdownSkill | null> {
    // 检查缓存
    if (this.contentCache.has(skillId)) {
      // 更新访问顺序
      this.updateAccessOrder(skillId);
      return this.contentCache.get(skillId)!;
    }

    // 获取元数据
    const metadata = this.metadataCache.get(skillId);
    if (!metadata) {
      return null;
    }

    // 加载完整内容
    const skill = parseSkillFile(metadata.skillFile);
    if (!skill) {
      return null;
    }

    // 设置分类
    skill.category = metadata.category;
    if (metadata.agentId) {
      skill.agentId = metadata.agentId;
    }

    // 更新缓存（LRU）
    this.updateContentCache(skillId, skill);

    return skill;
  }

  /**
   * 批量加载技能内容
   */
  async loadSkillContents(skillIds: string[]): Promise<Map<string, MarkdownSkill>> {
    const results = new Map<string, MarkdownSkill>();

    for (const skillId of skillIds) {
      const skill = await this.loadSkillContent(skillId);
      if (skill) {
        results.set(skillId, skill);
      }
    }

    return results;
  }

  /**
   * 预加载技能（提前加载到缓存）
   */
  async preloadSkills(skillIds: string[]): Promise<void> {
    await this.loadSkillContents(skillIds);
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.metadataCache.clear();
    this.contentCache.clear();
    this.accessOrder = [];
  }

  /**
   * 清除内容缓存
   */
  clearContentCache(): void {
    this.contentCache.clear();
    this.accessOrder = [];
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): {
    metadataCount: number;
    contentCount: number;
    maxSize: number;
  } {
    return {
      metadataCount: this.metadataCache.size,
      contentCount: this.contentCache.size,
      maxSize: this.config.maxCacheSize,
    };
  }

  /**
   * 更新内容缓存（LRU）
   */
  private updateContentCache(skillId: string, skill: MarkdownSkill): void {
    // 如果缓存已满，移除最旧的
    if (this.contentCache.size >= this.config.maxCacheSize) {
      const oldestKey = this.accessOrder.shift();
      if (oldestKey) {
        this.contentCache.delete(oldestKey);
      }
    }

    this.contentCache.set(skillId, skill);
    this.updateAccessOrder(skillId);
  }

  /**
   * 更新访问顺序（LRU）
   */
  private updateAccessOrder(skillId: string): void {
    // 移除旧的访问记录
    const index = this.accessOrder.indexOf(skillId);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }

    // 添加到末尾（最新）
    this.accessOrder.push(skillId);
  }
}

// ============ 全局实例 ============

let globalLoader: SkillLoader | null = null;

/**
 * 获取全局加载器
 */
export function getSkillLoader(config?: SkillLoaderConfig): SkillLoader {
  if (!globalLoader) {
    globalLoader = new SkillLoader(config);
  }
  return globalLoader;
}

/**
 * 重置全局加载器
 */
export function resetSkillLoader(): void {
  globalLoader = null;
}