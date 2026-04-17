/**
 * Progressive Disclosure 检索类型定义
 * 
 * 三层检索模式，节省 ~10x tokens
 * 
 * 流程: search(compact) → timeline(context) → get(full)
 */

import { v4 as uuidv4 } from 'uuid';

// ============ Compact 搜索结果 ============

/**
 * 紧凑搜索结果（~50 tokens/条）
 * 用于第一层检索，快速定位感兴趣的记忆
 */
export interface SearchResultCompact {
  /** 记忆 ID */
  id: string;
  /** 摘要（截断到 50 字） */
  summary: string;
  /** 类型 */
  type: 'conversation' | 'task' | 'knowledge' | 'event' | 'preference' | 'fact';
  /** 时间戳 */
  timestamp: string;
  /** 置信度（可选） */
  confidence?: number;
  /** 重要性（可选） */
  importance?: number;
}

// ============ Timeline 结果 ============

/**
 * 时间线结果（~100 tokens/条）
 * 用于第二层检索，获取时间上下文
 */
export interface TimelineResult {
  /** 中心记忆 */
  center: SearchResultCompact;
  /** 前置记忆（最多 5 条） */
  before: SearchResultCompact[];
  /** 后置记忆（最多 5 条） */
  after: SearchResultCompact[];
}

// ============ 完整记忆详情 ============

/**
 * 完整记忆详情（~500 tokens/条）
 * 用于第三层检索，获取完整内容
 */
export interface MemoryDetail {
  /** 记忆 ID */
  id: string;
  /** 完整内容 */
  content: string;
  /** 类型 */
  type: 'conversation' | 'task' | 'knowledge' | 'event' | 'preference' | 'fact';
  /** 时间戳 */
  timestamp: string;
  /** 置信度 */
  confidence?: number;
  /** 重要性 */
  importance?: number;
  /** 标签 */
  tags?: string[];
  /** 来源 Agent */
  agentId?: string;
  /** 来源信息 */
  source?: string;
}

// ============ 工具函数 ============

/**
 * 生成记忆 ID
 */
export function generateMemoryId(): string {
  return `mem_${uuidv4().slice(0, 8)}`;
}

/**
 * 截断内容为摘要
 */
export function truncateToSummary(content: string, maxLength: number = 50): string {
  if (!content) return '';
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + '...';
}

/**
 * 将 MemoryEntry 转换为 SearchResultCompact
 */
export function toCompact(entry: { id?: string; content: string; type: string; timestamp: string; confidence?: number; importance?: number }): SearchResultCompact {
  return {
    id: entry.id || generateMemoryId(),
    summary: truncateToSummary(entry.content),
    type: entry.type as SearchResultCompact['type'],
    timestamp: entry.timestamp,
    confidence: entry.confidence,
    importance: entry.importance,
  };
}

/**
 * 将 MemoryEntry 转换为 MemoryDetail
 */
export function toDetail(entry: { id?: string; content: string; type: string; timestamp: string; confidence?: number; importance?: number; tags?: string[]; agentId?: string }): MemoryDetail {
  return {
    id: entry.id || generateMemoryId(),
    content: entry.content,
    type: entry.type as MemoryDetail['type'],
    timestamp: entry.timestamp,
    confidence: entry.confidence,
    importance: entry.importance,
    tags: entry.tags,
    agentId: entry.agentId,
  };
}

/**
 * 格式化 Compact 结果为 Citation 格式
 */
export function formatCompactWithCitation(results: SearchResultCompact[]): string {
  return results
    .map((r, i) => `${i + 1}. [${r.id.slice(0, 8)}] [${r.type}] ${r.summary}`)
    .join('\n');
}
