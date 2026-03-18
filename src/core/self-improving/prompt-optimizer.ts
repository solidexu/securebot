/**
 * 动态 Prompt 优化器
 * 
 * 根据学习到的经验动态优化 Agent 的 System Prompt
 */

import type { 
  PromptOptimizerConfig,
  PromptPersonalization,
} from './types.js';
import { getSuccessPatternStore } from './success-pattern-store.js';
import { getErrorPatternStore } from './error-pattern-store.js';
import { getImprovementLogManager } from './improvement-log.js';
import { getMemoryManager } from '../memory.js';

// ============ 默认配置 ============

const DEFAULT_CONFIG: PromptOptimizerConfig = {
  enabled: true,
  maxInjectionLength: 1000,
  updateInterval: 60 * 60 * 1000, // 1 小时
};

// ============ Prompt 优化器 ============

/**
 * 动态 Prompt 优化器
 */
export class PromptOptimizer {
  private config: PromptOptimizerConfig;
  private lastUpdateTime: Map<string, number> = new Map();
  private cachedInjections: Map<string, string> = new Map();
  
  constructor(config: Partial<PromptOptimizerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * 优化 Prompt
   */
  async optimizePrompt(
    agentId: string,
    basePrompt: string,
    personalization?: PromptPersonalization
  ): Promise<string> {
    if (!this.config.enabled) {
      return basePrompt;
    }
    
    // 检查是否需要更新缓存
    const now = Date.now();
    const lastUpdate = this.lastUpdateTime.get(agentId) ?? 0;
    
    if (now - lastUpdate > this.config.updateInterval || !this.cachedInjections.has(agentId)) {
      await this.updateInjections(agentId);
      this.lastUpdateTime.set(agentId, now);
    }
    
    // 获取注入内容
    const injection = this.cachedInjections.get(agentId) ?? '';
    
    // 构建优化后的 Prompt
    const parts: string[] = [basePrompt];
    
    if (injection) {
      parts.push('\n\n---\n## 学习到的经验\n' + injection);
    }
    
    // 应用个性化
    if (personalization) {
      const personalizationSection = this.buildPersonalizationSection(personalization);
      if (personalizationSection) {
        parts.push('\n\n---\n## 个性化设置\n' + personalizationSection);
      }
    }
    
    return parts.join('');
  }
  
  /**
   * 更新注入内容缓存
   */
  private async updateInjections(agentId: string): Promise<void> {
    const sections: string[] = [];
    
    // 1. 学习到的偏好
    const preferencesSection = await this.buildPreferencesSection(agentId);
    if (preferencesSection) sections.push(preferencesSection);
    
    // 2. 成功案例
    const successSection = await this.buildSuccessSection(agentId);
    if (successSection) sections.push(successSection);
    
    // 3. 避免事项
    const avoidSection = await this.buildAvoidSection(agentId);
    if (avoidSection) sections.push(avoidSection);
    
    // 4. 最近教训
    const lessonsSection = await this.buildLessonsSection(agentId);
    if (lessonsSection) sections.push(lessonsSection);
    
    // 合并并限制长度
    let injection = sections.join('\n\n');
    if (injection.length > this.config.maxInjectionLength) {
      injection = injection.slice(0, this.config.maxInjectionLength) + '\n...';
    }
    
    this.cachedInjections.set(agentId, injection);
  }
  
  /**
   * 构建偏好部分
   */
  private async buildPreferencesSection(agentId: string): Promise<string> {
    try {
      const memoryManager = getMemoryManager();
      const profile = await memoryManager.getAgentProfile(agentId, '');
      
      if (!profile?.learnedPreferences || Object.keys(profile.learnedPreferences).length === 0) {
        return '';
      }
      
      const lines: string[] = ['### 用户偏好'];
      
      for (const [key, value] of Object.entries(profile.learnedPreferences)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          lines.push(`- ${key}: ${value}`);
        }
      }
      
      return lines.length > 1 ? lines.join('\n') : '';
    } catch {
      return '';
    }
  }
  
  /**
   * 构建成功案例部分
   */
  private async buildSuccessSection(agentId: string): Promise<string> {
    try {
      const store = getSuccessPatternStore();
      const patterns = await store.getBestPractices(agentId);
      
      if (patterns.length === 0) {
        return '';
      }
      
      const lines: string[] = ['### 成功经验'];
      
      for (const p of patterns.slice(0, 3)) {
        const approach = p.approach.slice(0, 100);
        const effectiveness = Math.round(p.effectiveness * 100);
        lines.push(`- [${p.taskType}] ${approach} (效果: ${effectiveness}%)`);
        
        if (p.toolsUsed.length > 0) {
          lines.push(`  工具: ${p.toolsUsed.slice(0, 3).join(', ')}`);
        }
      }
      
      return lines.join('\n');
    } catch {
      return '';
    }
  }
  
  /**
   * 构建避免事项部分
   */
  private async buildAvoidSection(agentId: string): Promise<string> {
    try {
      const store = getErrorPatternStore();
      const patterns = await store.getUnresolvedErrors(agentId);
      
      if (patterns.length === 0) {
        return '';
      }
      
      const lines: string[] = ['### 需要避免'];
      
      // 按发生次数排序
      const sorted = patterns.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
      
      for (const p of sorted.slice(0, 3)) {
        lines.push(`- 避免: ${p.failedApproach.slice(0, 50)}`);
        if (p.solution) {
          lines.push(`  建议: ${p.solution.slice(0, 60)}`);
        }
      }
      
      return lines.join('\n');
    } catch {
      return '';
    }
  }
  
  /**
   * 构建最近教训部分
   */
  private async buildLessonsSection(agentId: string): Promise<string> {
    try {
      const logManager = getImprovementLogManager();
      const entries = await logManager.getRecentImprovements(agentId, 7);
      
      if (entries.length === 0) {
        return '';
      }
      
      const lines: string[] = ['### 最近学到的教训'];
      
      for (const entry of entries.slice(0, 5)) {
        if (entry.reason && entry.trigger !== 'user_feedback') {
          lines.push(`- ${entry.reason.slice(0, 80)}`);
        }
      }
      
      return lines.length > 1 ? lines.join('\n') : '';
    } catch {
      return '';
    }
  }
  
  /**
   * 构建个性化部分
   */
  private buildPersonalizationSection(p: PromptPersonalization): string {
    const lines: string[] = [];
    
    if (p.communicationStyle) {
      const styleGuide = {
        formal: '使用正式、专业的语言',
        casual: '使用轻松、友好的语言',
        technical: '使用技术性、精确的语言',
      };
      lines.push(`沟通风格: ${styleGuide[p.communicationStyle]}`);
    }
    
    if (p.detailLevel) {
      const levelGuide = {
        brief: '回答简洁，直击要点',
        normal: '回答适度详细，包含必要解释',
        detailed: '回答详细，包含背景和示例',
      };
      lines.push(`详细程度: ${levelGuide[p.detailLevel]}`);
    }
    
    if (p.proactivityLevel !== undefined) {
      if (p.proactivityLevel > 0.7) {
        lines.push('主动性: 高，主动提供建议和相关信息');
      } else if (p.proactivityLevel > 0.3) {
        lines.push('主动性: 中等，根据用户需求提供信息');
      } else {
        lines.push('主动性: 低，严格回答用户问题');
      }
    }
    
    if (p.languagePreference && p.languagePreference !== 'auto') {
      lines.push(`语言偏好: ${p.languagePreference === 'zh' ? '中文' : 'English'}`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * 清除缓存
   */
  clearCache(agentId?: string): void {
    if (agentId) {
      this.cachedInjections.delete(agentId);
      this.lastUpdateTime.delete(agentId);
    } else {
      this.cachedInjections.clear();
      this.lastUpdateTime.clear();
    }
  }
  
  /**
   * 获取缓存的注入内容
   */
  getCachedInjection(agentId: string): string | undefined {
    return this.cachedInjections.get(agentId);
  }
  
  /**
   * 强制更新
   */
  async forceUpdate(agentId: string): Promise<void> {
    await this.updateInjections(agentId);
    this.lastUpdateTime.set(agentId, Date.now());
  }
}

// ============ 全局实例 ============

let globalOptimizer: PromptOptimizer | null = null;

/**
 * 获取全局 Prompt 优化器
 */
export function getPromptOptimizer(config?: Partial<PromptOptimizerConfig>): PromptOptimizer {
  if (!globalOptimizer) {
    globalOptimizer = new PromptOptimizer(config);
  }
  return globalOptimizer;
}

/**
 * 重置全局实例
 */
export function resetPromptOptimizer(): void {
  globalOptimizer = null;
}