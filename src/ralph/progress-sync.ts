/**
 * Ralph 进度同步模块
 * 
 * 将 progress.txt 的内容同步到 Securebot 的 memory 系统，
 * 实现跨迭代的知识积累
 */

import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MemoryEntry } from '../core/memory.js';

// ============ 类型定义 ============

/**
 * 解析后的进度记录
 */
export interface ParsedProgressEntry {
  /** 时间戳 */
  timestamp: string;
  /** 故事 ID */
  storyId: string;
  /** 故事标题 */
  storyTitle: string;
  /** 完成内容 */
  completed: string;
  /** 变更文件 */
  filesChanged: string[];
  /** 学到的模式 */
  patterns: string[];
  /** 遇到的问题 */
  issues: string[];
}

/**
 * 进度同步配置
 */
export interface ProgressSyncConfig {
  /** 是否同步到 memory */
  enableSync: boolean;
  /** 重要性阈值（低于此值不同步） */
  importanceThreshold: number;
  /** 最大同步条目数 */
  maxEntries: number;
}

// ============ 默认配置 ============

const DEFAULT_SYNC_CONFIG: ProgressSyncConfig = {
  enableSync: true,
  importanceThreshold: 3,
  maxEntries: 100,
};

// ============ 进度文件解析 ============

/**
 * 解析 progress.txt 文件
 * 
 * 格式示例：
 * ```
 * ## 2024-01-15T10:30:00Z - US-001
 * - **任务**: 实现登录功能
 * - **完成**: 添加了登录表单和 API
 * - **文件**: src/auth/login.ts, src/api/auth.ts
 * - **模式**:
 *   - 使用 zod 进行表单验证
 *   - JWT token 存储在 httpOnly cookie
 * - **问题**:
 *   - CORS 配置需要调整
 * ---
 * ```
 */
export function parseProgressFile(content: string): ParsedProgressEntry[] {
  const entries: ParsedProgressEntry[] = [];
  
  // 分割每个条目（以 --- 分隔）
  const sections = content.split(/---\s*\n/);
  
  for (const section of sections) {
    if (!section.trim()) continue;
    
    const entry = parseProgressSection(section);
    if (entry) {
      entries.push(entry);
    }
  }
  
  return entries;
}

/**
 * 解析单个进度区块
 */
function parseProgressSection(section: string): ParsedProgressEntry | null {
  // 提取标题行：## timestamp - storyId
  const titleMatch = section.match(/##\s+(\S+)\s+-\s+(\S+)/);
  if (!titleMatch || !titleMatch[1] || !titleMatch[2]) return null;
  
  const timestamp = titleMatch[1];
  const storyId = titleMatch[2];
  
  // 提取任务
  const taskMatch = section.match(/\*\*任务\*\*:\s*(.+)/);
  const storyTitle = taskMatch && taskMatch[1] ? taskMatch[1].trim() : '';
  
  // 提取完成内容
  const completedMatch = section.match(/\*\*完成\*\*:\s*(.+)/);
  const completed = completedMatch && completedMatch[1] ? completedMatch[1].trim() : '';
  
  // 提取文件
  const filesMatch = section.match(/\*\*文件\*\*:\s*(.+)/);
  const filesChanged = filesMatch && filesMatch[1]
    ? filesMatch[1].split(',').map(f => f.trim()).filter(Boolean)
    : [];
  
  // 提取模式
  const patterns: string[] = [];
  const patternsMatch = section.match(/\*\*模式\*\*:\n([\s\S]*?)(?=\n\*\*|\n---|$)/);
  if (patternsMatch && patternsMatch[1]) {
    const patternLines = patternsMatch[1].split('\n');
    for (const line of patternLines) {
      const patternMatch = line.match(/-\s*(.+)/);
      if (patternMatch && patternMatch[1]) {
        patterns.push(patternMatch[1].trim());
      }
    }
  }
  
  // 提取问题
  const issues: string[] = [];
  const issuesMatch = section.match(/\*\*问题\*\*:\n([\s\S]*?)(?=\n\*\*|\n---|$)/);
  if (issuesMatch && issuesMatch[1]) {
    const issueLines = issuesMatch[1].split('\n');
    for (const line of issueLines) {
      const issueMatch = line.match(/-\s*(.+)/);
      if (issueMatch && issueMatch[1]) {
        issues.push(issueMatch[1].trim());
      }
    }
  }
  
  return {
    timestamp,
    storyId,
    storyTitle,
    completed,
    filesChanged,
    patterns,
    issues,
  };
}

// ============ 同步到 Memory ============

/**
 * 将进度条目转换为 MemoryEntry
 */
export function progressToMemoryEntry(
  entry: ParsedProgressEntry, 
  agentId: string
): MemoryEntry {
  // 计算重要性
  let importance = 3; // 默认中等
  
  // 有学到的模式 +1
  if (entry.patterns.length > 0) {
    importance += 1;
  }
  
  // 有问题需要解决 +1（问题值得记住）
  if (entry.issues.length > 0) {
    importance += 1;
  }
  
  // 限制最大 5
  importance = Math.min(importance, 5);
  
  // 构建内容
  const content = buildMemoryContent(entry);
  
  return {
    timestamp: entry.timestamp,
    type: 'task',
    content,
    importance,
    tags: ['ralph', entry.storyId, ...entry.patterns.slice(0, 3)],
    agentId,
  };
}

/**
 * 构建记忆内容
 */
function buildMemoryContent(entry: ParsedProgressEntry): string {
  const parts: string[] = [];
  
  parts.push(`任务 ${entry.storyId}: ${entry.storyTitle}`);
  parts.push(`完成: ${entry.completed}`);
  
  if (entry.patterns.length > 0) {
    parts.push(`学到的模式: ${entry.patterns.join('; ')}`);
  }
  
  if (entry.issues.length > 0) {
    parts.push(`遇到的问题: ${entry.issues.join('; ')}`);
  }
  
  return parts.join('\n');
}

/**
 * 同步 progress.txt 到 memory
 * 
 * @param progressPath progress.txt 路径
 * @param memoryDir memory 目录路径
 * @param agentId Agent ID
 * @param config 同步配置
 */
export async function syncProgressToMemory(
  progressPath: string,
  memoryDir: string,
  agentId: string,
  config: Partial<ProgressSyncConfig> = {}
): Promise<{ synced: number; skipped: number }> {
  const finalConfig = { ...DEFAULT_SYNC_CONFIG, ...config };
  
  if (!finalConfig.enableSync) {
    return { synced: 0, skipped: 0 };
  }
  
  if (!existsSync(progressPath)) {
    return { synced: 0, skipped: 0 };
  }
  
  // 读取并解析 progress.txt
  const content = readFileSync(progressPath, 'utf-8');
  const entries = parseProgressFile(content);
  
  // 过滤并转换
  const memoryEntries: MemoryEntry[] = [];
  
  for (const entry of entries) {
    const memEntry = progressToMemoryEntry(entry, agentId);
    
    // 过滤低重要性
    if (memEntry.importance >= finalConfig.importanceThreshold) {
      memoryEntries.push(memEntry);
    }
  }
  
  // 限制条目数
  const limitedEntries = memoryEntries.slice(-finalConfig.maxEntries);
  
  // 写入到 memory/daily/
  const today = new Date().toISOString().split('T')[0];
  const dailyFile = join(memoryDir, 'daily', `${today}.md`);
  
  for (const entry of limitedEntries) {
    const formattedEntry = formatMemoryEntry(entry);
    appendFileSync(dailyFile, formattedEntry + '\n', 'utf-8');
  }
  
  return {
    synced: limitedEntries.length,
    skipped: entries.length - limitedEntries.length,
  };
}

/**
 * 格式化 MemoryEntry 为 markdown
 */
function formatMemoryEntry(entry: MemoryEntry): string {
  const tags = entry.tags?.map(t => `#${t}`).join(' ') || '';
  return `- [${entry.importance}] ${entry.content} ${tags}`;
}

// ============ 从 Memory 提取模式 ============

/**
 * 从进度条目中提取可复用的模式
 */
export function extractPatterns(entries: ParsedProgressEntry[]): string[] {
  const patterns: string[] = [];
  
  for (const entry of entries) {
    patterns.push(...entry.patterns);
  }
  
  // 去重
  return [...new Set(patterns)];
}

/**
 * 生成模式摘要（用于注入到迭代提示词）
 */
export function generatePatternSummary(entries: ParsedProgressEntry[]): string {
  const patterns = extractPatterns(entries);
  
  if (patterns.length === 0) {
    return '暂无已发现的模式';
  }
  
  return patterns
    .slice(0, 10)  // 最多 10 条
    .map((p, i) => `${i + 1}. ${p}`)
    .join('\n');
}

// ============ 导出 ============

export { DEFAULT_SYNC_CONFIG };