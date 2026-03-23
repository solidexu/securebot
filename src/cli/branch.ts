/**
 * 会话分支模块
 * 
 * 支持多分支对话，允许尝试不同方案后选择最佳结果
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import type { Session, Message } from '../core/types.js';

// ============ 目录配置 ============

const SECUREBOT_DIR = join(homedir(), '.securebot');
const BRANCHES_DIR = join(SECUREBOT_DIR, 'branches');

// 确保目录存在
function ensureDir(): void {
  if (!existsSync(BRANCHES_DIR)) {
    mkdirSync(BRANCHES_DIR, { recursive: true });
  }
}

// ============ 类型定义 ============

/**
 * 分支状态
 */
export type BranchStatus = 'active' | 'merged' | 'abandoned';

/**
 * 会话分支
 */
export interface SessionBranch {
  /** 分支 ID */
  id: string;
  /** 分支名称 */
  name: string;
  /** 父分支 ID（main 表示主线） */
  parentId: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 状态 */
  status: BranchStatus;
  /** 分支描述 */
  description?: string;
  /** 分支点消息索引（从主线分支时的位置） */
  branchPoint: number;
  /** 消息历史 */
  messages: Message[];
  /** 标签 */
  tags?: string[];
}

/**
 * 分支树节点
 */
export interface BranchTreeNode {
  branch: SessionBranch;
  children: BranchTreeNode[];
}

/**
 * 分支差异
 */
export interface BranchDiff {
  /** 分支 A 的消息数 */
  messagesA: number;
  /** 分支 B 的消息数 */
  messagesB: number;
  /** 分支 A 特有的消息 */
  uniqueA: Message[];
  /** 分支 B 特有的消息 */
  uniqueB: Message[];
  /** 相似度 */
  similarity: number;
}

// ============ 分支管理 ============

/**
 * 创建新分支
 */
export function createBranch(
  name: string,
  parentId: string = 'main',
  branchPoint: number = 0,
  description?: string
): SessionBranch {
  ensureDir();
  
  const id = `branch-${Date.now()}`;
  
  const branch: SessionBranch = {
    id,
    name,
    parentId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'active',
    description,
    branchPoint,
    messages: [],
  };
  
  saveBranch(branch);
  
  return branch;
}

/**
 * 保存分支
 */
export function saveBranch(branch: SessionBranch): void {
  ensureDir();
  branch.updatedAt = Date.now();
  const branchFile = join(BRANCHES_DIR, `${branch.id}.json`);
  writeFileSync(branchFile, JSON.stringify(branch, null, 2), 'utf-8');
}

/**
 * 加载分支
 */
export function loadBranch(branchId: string): SessionBranch | null {
  const branchFile = join(BRANCHES_DIR, `${branchId}.json`);
  
  if (!existsSync(branchFile)) {
    return null;
  }
  
  try {
    return JSON.parse(readFileSync(branchFile, 'utf-8')) as SessionBranch;
  } catch {
    return null;
  }
}

/**
 * 列出所有分支
 */
export function listBranches(status?: BranchStatus): SessionBranch[] {
  ensureDir();
  
  const files = readdirSync(BRANCHES_DIR)
    .filter(f => f.startsWith('branch-') && f.endsWith('.json'));
  
  const branches = files.map(f => {
    try {
      return JSON.parse(readFileSync(join(BRANCHES_DIR, f), 'utf-8')) as SessionBranch;
    } catch {
      return null;
    }
  }).filter((b): b is SessionBranch => b !== null);
  
  if (status) {
    return branches.filter(b => b.status === status);
  }
  
  return branches.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * 获取活动分支
 */
export function getActiveBranches(): SessionBranch[] {
  return listBranches('active');
}

/**
 * 删除分支
 */
export function deleteBranch(branchId: string): boolean {
  const branch = loadBranch(branchId);
  if (!branch) return false;
  
  const branchFile = join(BRANCHES_DIR, `${branchId}.json`);
  
  try {
    unlinkSync(branchFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * 合并分支
 */
export function mergeBranch(
  branchId: string,
  targetSession: Session,
  options: { 
    keepOriginal?: boolean;
    appendMessages?: boolean;
  } = {}
): { success: boolean; messages: Message[] } {
  const branch = loadBranch(branchId);
  if (!branch) {
    return { success: false, messages: [] };
  }
  
  const messages = branch.messages;
  
  if (options.appendMessages !== false) {
    targetSession.history.push(...messages);
  }
  
  // 更新分支状态
  branch.status = 'merged';
  saveBranch(branch);
  
  return { success: true, messages };
}

/**
 * 废弃分支
 */
export function abandonBranch(branchId: string): boolean {
  const branch = loadBranch(branchId);
  if (!branch) return false;
  
  branch.status = 'abandoned';
  saveBranch(branch);
  
  return true;
}

/**
 * 恢复分支
 */
export function restoreBranch(branchId: string): boolean {
  const branch = loadBranch(branchId);
  if (!branch) return false;
  
  branch.status = 'active';
  saveBranch(branch);
  
  return true;
}

// ============ 分支消息管理 ============

/**
 * 添加消息到分支
 */
export function addMessageToBranch(branchId: string, message: Message): void {
  const branch = loadBranch(branchId);
  if (!branch) return;
  
  branch.messages.push(message);
  saveBranch(branch);
}

/**
 * 获取分支消息历史
 */
export function getBranchHistory(branchId: string): Message[] {
  const branch = loadBranch(branchId);
  return branch?.messages || [];
}

/**
 * 清空分支消息
 */
export function clearBranchHistory(branchId: string): void {
  const branch = loadBranch(branchId);
  if (!branch) return;
  
  branch.messages = [];
  saveBranch(branch);
}

// ============ 分支比较 ============

/**
 * 比较两个分支
 */
export function compareBranches(branchIdA: string, branchIdB: string): BranchDiff | null {
  const branchA = loadBranch(branchIdA);
  const branchB = loadBranch(branchIdB);
  
  if (!branchA || !branchB) {
    return null;
  }
  
  const messagesA = branchA.messages;
  const messagesB = branchB.messages;
  
  // 计算相似度（简化版：基于消息内容哈希）
  const hashesA = new Set(messagesA.map(m => hashMessage(m)));
  const hashesB = new Set(messagesB.map(m => hashMessage(m)));
  
  const intersection = new Set([...hashesA].filter(h => hashesB.has(h)));
  const union = new Set([...hashesA, ...hashesB]);
  
  const similarity = union.size > 0 ? intersection.size / union.size : 0;
  
  // 找出各自独有的消息
  const uniqueA = messagesA.filter(m => !hashesB.has(hashMessage(m)));
  const uniqueB = messagesB.filter(m => !hashesA.has(hashMessage(m)));
  
  return {
    messagesA: messagesA.length,
    messagesB: messagesB.length,
    uniqueA,
    uniqueB,
    similarity,
  };
}

/**
 * 简单消息哈希
 */
function hashMessage(message: Message): string {
  const content = message.content || '';
  const role = message.role || '';
  return `${role}:${content.slice(0, 100)}`;
}

// ============ 分支树 ============

/**
 * 构建分支树
 */
export function buildBranchTree(): BranchTreeNode[] {
  const branches = listBranches();
  const branchMap = new Map<string, SessionBranch>();
  
  // 建立索引
  for (const branch of branches) {
    branchMap.set(branch.id, branch);
  }
  
  // 构建树
  const rootBranches = branches.filter(b => b.parentId === 'main');
  
  function buildNode(branch: SessionBranch): BranchTreeNode {
    const children = branches.filter(b => b.parentId === branch.id);
    return {
      branch,
      children: children.map(c => buildNode(c)),
    };
  }
  
  return rootBranches.map(b => buildNode(b));
}

/**
 * 渲染分支树
 */
export function renderBranchTree(includeAbandoned: boolean = false): string {
  const tree = buildBranchTree();
  const lines: string[] = [];
  
  lines.push(chalk.cyan.bold('📋 分支树'));
  lines.push(chalk.gray('─'.repeat(40)));
  lines.push(`${chalk.green('●')} main (主线)`);
  
  function renderNode(node: BranchTreeNode, prefix: string = '  ') {
    const branch = node.branch;
    
    // 跳过已废弃的分支
    if (!includeAbandoned && branch.status === 'abandoned') {
      return;
    }
    
    const statusIcon = {
      active: chalk.green('●'),
      merged: chalk.blue('●'),
      abandoned: chalk.gray('○'),
    }[branch.status];
    
    const statusText = {
      active: '',
      merged: chalk.blue(' (已合并)'),
      abandoned: chalk.gray(' (已废弃)'),
    }[branch.status];
    
    const line = `${prefix}${statusIcon} ${branch.name}${statusText}`;
    lines.push(line);
    
    // 递归渲染子分支
    for (const childNode of node.children) {
      renderNode(childNode, prefix + '  ');
    }
  }
  
  for (const node of tree) {
    renderNode(node);
  }
  
  return lines.join('\n');
}

// ============ 格式化输出 ============

/**
 * 格式化分支列表
 */
export function formatBranchList(branches: SessionBranch[]): string {
  if (branches.length === 0) {
    return chalk.gray('没有分支');
  }
  
  const lines: string[] = [];
  
  for (const branch of branches) {
    const statusIcon = {
      active: chalk.green('●'),
      merged: chalk.blue('●'),
      abandoned: chalk.gray('○'),
    }[branch.status];
    
    const statusText = {
      active: '活动',
      merged: '已合并',
      abandoned: '已废弃',
    }[branch.status];
    
    const time = new Date(branch.updatedAt).toLocaleString();
    const messages = branch.messages.length;
    
    lines.push(`${statusIcon} ${chalk.white(branch.name)} ${chalk.gray(`(${statusText}, ${messages} 消息, ${time})`)}`);
  }
  
  return lines.join('\n');
}

/**
 * 格式化分支详情
 */
export function formatBranchDetail(branch: SessionBranch): string {
  const lines: string[] = [];
  
  lines.push(chalk.cyan.bold(`分支: ${branch.name}`));
  lines.push(chalk.gray('─'.repeat(40)));
  lines.push(`ID: ${branch.id}`);
  lines.push(`状态: ${branch.status}`);
  lines.push(`父分支: ${branch.parentId}`);
  lines.push(`创建时间: ${new Date(branch.createdAt).toLocaleString()}`);
  lines.push(`更新时间: ${new Date(branch.updatedAt).toLocaleString()}`);
  lines.push(`消息数: ${branch.messages.length}`);
  
  if (branch.description) {
    lines.push(`描述: ${branch.description}`);
  }
  
  if (branch.tags && branch.tags.length > 0) {
    lines.push(`标签: ${branch.tags.join(', ')}`);
  }
  
  return lines.join('\n');
}