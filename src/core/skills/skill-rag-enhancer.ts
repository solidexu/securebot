/**
 * 技能与 RAG 联动
 * 
 * 在技能执行时自动检索相关知识，增强技能能力
 */

import type { Agent, Session } from '../core/types.js';
import type { MatchedSkill, MarkdownSkill } from '../core/skills/types.js';

// ============ 类型定义 ============

/**
 * 技能增强上下文
 */
export interface SkillEnhancedContext {
  skill: MatchedSkill;
  agent: Agent;
  session: Session;
  /** 自动检索的相关知识 */
  relevantKnowledge: KnowledgeItem[];
  /** 技能专属知识 */
  skillKnowledge: KnowledgeItem[];
  /** 用户消息 */
  userMessage: string;
}

/**
 * 知识条目
 */
export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  source: string;
  relevance: number;
  tags: string[];
}

/**
 * 技能知识库配置
 */
export interface SkillKnowledgeConfig {
  /** 技能专属知识目录 */
  skillKnowledgeDirs: Map<string, string>;
  /** 自动检索启用 */
  autoRetrieve: boolean;
  /** 最大检索数量 */
  maxKnowledgeItems: number;
  /** 相关性阈值 */
  relevanceThreshold: number;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: SkillKnowledgeConfig = {
  skillKnowledgeDirs: new Map([
    ['deep-research', 'knowledge/research'],
    ['data-analysis', 'knowledge/analysis'],
    ['code-review', 'knowledge/coding'],
    ['testing-helper', 'knowledge/testing'],
    ['git-workflow', 'knowledge/git'],
    ['api-design', 'knowledge/api'],
    ['security-audit', 'knowledge/security'],
  ]),
  autoRetrieve: true,
  maxKnowledgeItems: 5,
  relevanceThreshold: 0.5,
};

// ============ 技能 RAG 增强器 ============

/**
 * 技能 RAG 增强器
 */
export class SkillRAGEnhancer {
  private config: SkillKnowledgeConfig;

  constructor(config?: Partial<SkillKnowledgeConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 增强技能上下文
   * 
   * 在技能执行前调用，自动检索相关知识
   */
  async enhance(
    skillMatch: MatchedSkill,
    agent: Agent,
    session: Session,
    userMessage: string
  ): Promise<SkillEnhancedContext> {
    const skillId = skillMatch.metadata.id;

    // 1. 检索通用知识
    const relevantKnowledge = await this.retrieveRelevantKnowledge(
      userMessage,
      agent
    );

    // 2. 检索技能专属知识
    const skillKnowledge = await this.retrieveSkillKnowledge(
      skillId,
      userMessage,
      agent
    );

    return {
      skill: skillMatch,
      agent,
      session,
      relevantKnowledge,
      skillKnowledge,
      userMessage,
    };
  }

  /**
   * 检索相关通用知识
   */
  private async retrieveRelevantKnowledge(
    query: string,
    agent: Agent
  ): Promise<KnowledgeItem[]> {
    if (!this.config.autoRetrieve) {
      return [];
    }

    try {
      // 使用 RAG 管理器检索
      const { ragManager } = await import('../../rag/tools.js');
      const store = await ragManager.getStore(agent);

      if (!store) {
        return [];
      }

      const results = await store.search(query, this.config.maxKnowledgeItems);

      return results
        .filter(r => r.score >= this.config.relevanceThreshold)
        .map(r => ({
          id: r.chunk.metadata.id || r.chunk.metadata.source,
          title: r.chunk.metadata.title || r.chunk.metadata.source,
          content: r.chunk.content,
          source: r.chunk.metadata.source,
          relevance: r.score,
          tags: r.chunk.metadata.tags || [],
        }));
    } catch (error) {
      console.error('Failed to retrieve relevant knowledge:', error);
      return [];
    }
  }

  /**
   * 检索技能专属知识
   */
  private async retrieveSkillKnowledge(
    skillId: string,
    query: string,
    agent: Agent
  ): Promise<KnowledgeItem[]> {
    const knowledgeDir = this.config.skillKnowledgeDirs.get(skillId);
    
    if (!knowledgeDir) {
      return [];
    }

    try {
      const { join } = await import('node:path');
      const { existsSync, readdirSync, readFileSync } = await import('node:fs');
      
      // 构建技能知识目录路径
      const { getRootDir, loadConfig } = await import('../config.js');
      const config = loadConfig();
      const rootDir = getRootDir(config);
      const skillKnowledgePath = join(rootDir, knowledgeDir, agent.id);

      if (!existsSync(skillKnowledgePath)) {
        return [];
      }

      // 读取知识文件
      const files = readdirSync(skillKnowledgePath)
        .filter(f => f.endsWith('.md') || f.endsWith('.txt'));

      const knowledgeItems: KnowledgeItem[] = [];

      for (const file of files) {
        const filePath = join(skillKnowledgePath, file);
        const content = readFileSync(filePath, 'utf-8');
        
        // 简单的关键词匹配评分
        const relevance = this.calculateRelevance(query, content);
        
        if (relevance >= this.config.relevanceThreshold) {
          knowledgeItems.push({
            id: file,
            title: file.replace(/\.(md|txt)$/, ''),
            content: content.slice(0, 1000),
            source: filePath,
            relevance,
            tags: [skillId],
          });
        }
      }

      // 按相关性排序，限制数量
      return knowledgeItems
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, this.config.maxKnowledgeItems);
    } catch (error) {
      console.error('Failed to retrieve skill knowledge:', error);
      return [];
    }
  }

  /**
   * 计算相关性（关键词匹配）
   */
  private calculateRelevance(query: string, content: string): number {
    const queryWords = query.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();

    let matchCount = 0;
    for (const word of queryWords) {
      if (word.length > 2 && contentLower.includes(word)) {
        matchCount++;
      }
    }

    return queryWords.length > 0 ? matchCount / queryWords.length : 0;
  }

  /**
   * 生成增强的技能提示
   */
  generateEnhancedPrompt(context: SkillEnhancedContext): string {
    const { skill, relevantKnowledge, skillKnowledge, userMessage } = context;

    let prompt = '';

    // 添加技能基本信息
    if (skill.skill) {
      const skillContent = this.extractSkillContent(skill.skill);
      prompt += skillContent;
    }

    // 添加相关知识
    if (relevantKnowledge.length > 0 || skillKnowledge.length > 0) {
      prompt += '\n\n## 相关知识\n\n';
      prompt += '> 以下知识来自知识库，可作为参考\n\n';

      if (relevantKnowledge.length > 0) {
        prompt += '### 通用知识\n\n';
        for (const item of relevantKnowledge) {
          prompt += `**${item.title}** (相关度: ${(item.relevance * 100).toFixed(0)}%)\n`;
          prompt += `${item.content.slice(0, 300)}...\n\n`;
        }
      }

      if (skillKnowledge.length > 0) {
        prompt += '### 技能专属知识\n\n';
        for (const item of skillKnowledge) {
          prompt += `**${item.title}** (相关度: ${(item.relevance * 100).toFixed(0)}%)\n`;
          prompt += `${item.content.slice(0, 300)}...\n\n`;
        }
      }
    }

    return prompt;
  }

  /**
   * 提取技能内容
   */
  private extractSkillContent(skill: MarkdownSkill): string {
    let content = '';

    if (skill.overview) {
      content += `## 概述\n\n${skill.overview}\n\n`;
    }

    if (skill.whenToUse && skill.whenToUse.length > 0) {
      content += `## 何时使用\n\n`;
      for (const item of skill.whenToUse) {
        content += `- ${item}\n`;
      }
      content += '\n';
    }

    if (skill.workflow && skill.workflow.length > 0) {
      content += `## 工作流程\n\n`;
      for (const step of skill.workflow) {
        content += `### ${step.name}\n\n`;
        if (step.description) {
          content += `${step.description}\n\n`;
        }
        if (step.details) {
          content += `${step.details}\n\n`;
        }
      }
    }

    if (skill.bestPractices && skill.bestPractices.length > 0) {
      content += `## 最佳实践\n\n`;
      for (const practice of skill.bestPractices) {
        content += `- ${practice}\n`;
      }
      content += '\n';
    }

    return content;
  }

  /**
   * 保存技能执行经验到知识库
   */
  async saveSkillExperience(
    skillId: string,
    agent: Agent,
    session: Session,
    experience: {
      userRequest: string;
      approach: string;
      result: string;
      success: boolean;
    }
  ): Promise<boolean> {
    try {
      const { ragGenerateDocumentTool } = await import('../../rag/tools.js');
      
      const content = `# 技能执行经验：${skillId}

## 用户请求

${experience.userRequest}

## 执行方法

${experience.approach}

## 执行结果

${experience.result}

## 状态

${experience.success ? '✅ 成功' : '❌ 失败'}

## 技能 ID

${skillId}
`;

      const result = await ragGenerateDocumentTool.execute!(
        {
          topic: `${skillId} 执行经验`,
          content,
          type: 'solution',
          tags: `skill,${skillId},${experience.success ? 'success' : 'failure'}`,
        },
        {
          agent,
          session,
          workspace: agent.workspace,
          logger: console,
        }
      );

      return result.success;
    } catch (error) {
      console.error('Failed to save skill experience:', error);
      return false;
    }
  }
}

// ============ 全局实例 ============

let globalEnhancer: SkillRAGEnhancer | null = null;

/**
 * 获取技能 RAG 增强器
 */
export function getSkillRAGEnhancer(config?: Partial<SkillKnowledgeConfig>): SkillRAGEnhancer {
  if (!globalEnhancer) {
    globalEnhancer = new SkillRAGEnhancer(config);
  }
  return globalEnhancer;
}

/**
 * 重置增强器
 */
export function resetSkillRAGEnhancer(): void {
  globalEnhancer = null;
}