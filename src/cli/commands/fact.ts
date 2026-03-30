/**
 * 事实管理命令
 * 
 * 直接管理用户事实，不通过 LLM 工具调用
 * 每个 Agent 拥有独立的事实存储
 */

import chalk from 'chalk';
import type { MemoryFact } from '../../core/memory.js';
import { loadConfig, getRootDir } from '../../core/config.js';
import { OllamaAdapter } from '../../model/ollama.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CATEGORY_NAMES: Record<string, string> = {
  preference: '偏好',
  knowledge: '知识',
  context: '背景',
  behavior: '行为',
  goal: '目标',
};

let currentAgentId: string = 'default';

export function setCurrentAgentId(agentId: string): void {
  currentAgentId = agentId;
}

export function getCurrentAgentId(): string {
  return currentAgentId;
}

interface AgentFacts {
  [agentId: string]: MemoryFact[];
}

interface FactsData {
  version: string;
  agentFacts: AgentFacts;
  updatedAt: string;
}

function getFactsFilePath(rootDir: string): string {
  return join(rootDir, 'profiles', 'facts.json');
}

async function loadFactsData(rootDir: string): Promise<FactsData> {
  const filePath = getFactsFilePath(rootDir);
  
  if (!existsSync(filePath)) {
    return {
      version: '1.0',
      agentFacts: {},
      updatedAt: new Date().toISOString(),
    };
  }
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as FactsData;
  } catch {
    return {
      version: '1.0',
      agentFacts: {},
      updatedAt: new Date().toISOString(),
    };
  }
}

async function saveFactsData(rootDir: string, data: FactsData): Promise<void> {
  const filePath = getFactsFilePath(rootDir);
  const dir = join(rootDir, 'profiles');
  
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  data.updatedAt = new Date().toISOString();
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function getAgentFacts(data: FactsData, agentId: string): MemoryFact[] {
  if (!data.agentFacts[agentId]) {
    data.agentFacts[agentId] = [];
  }
  return data.agentFacts[agentId]!;
}

function generateFactId(): string {
  return `fact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatFact(fact: MemoryFact, index?: number): string {
  const idx = index !== undefined ? `${index + 1}. ` : '';
  const cat = CATEGORY_NAMES[fact.category] || fact.category;
  const conf = `${(fact.confidence * 100).toFixed(0)}%`;
  return `${idx}[${cat} | ${conf}] ${fact.content}`;
}

function inferCategory(content: string): MemoryFact['category'] {
  if (/喜欢|偏好|习惯|不喜欢/.test(content)) return 'preference';
  if (/精通|熟悉|擅长|会|懂|经验|技能/.test(content)) return 'knowledge';
  if (/在.*工作|目前|正在|项目|公司|团队/.test(content)) return 'context';
  if (/习惯|模式|方式|风格/.test(content)) return 'behavior';
  if (/计划|想|目标|希望|准备/.test(content)) return 'goal';
  return 'knowledge';
}

function inferConfidence(content: string): number {
  if (/我是|我的|我在|我工作/.test(content)) return 0.9;
  if (/我喜欢|我偏好|我习惯/.test(content)) return 0.85;
  if (/我计划|我想|我准备/.test(content)) return 0.8;
  return 0.7;
}

export async function listFacts(category?: string): Promise<void> {
  const config = loadConfig();
  const rootDir = getRootDir(config);
  const data = await loadFactsData(rootDir);
  const agentId = getCurrentAgentId();
  
  let facts = getAgentFacts(data, agentId);
  
  if (category) {
    facts = facts.filter(f => f.category === category);
  }
  
  facts.sort((a, b) => b.confidence - a.confidence);

  console.log();
  
  if (facts.length === 0) {
    console.log(chalk.gray('暂无事实记录'));
    console.log(chalk.gray(`当前 Agent: ${agentId}`));
    console.log();
    console.log(chalk.cyan('添加事实: /fact add <内容>'));
    return;
  }

  console.log(chalk.cyan.bold(`📋 事实列表 (${facts.length} 条)\n`));
  console.log(chalk.gray(`当前 Agent: ${agentId}`));
  
  if (category) {
    console.log(chalk.gray(`筛选分类: ${CATEGORY_NAMES[category] || category}`));
  }
  console.log();

  for (let i = 0; i < facts.length; i++) {
    const fact = facts[i];
    if (fact) {
      console.log(chalk.white(formatFact(fact, i)));
    }
  }

  console.log();
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.gray(`操作: /fact add|search|edit|delete|export|import|help`));
}

export async function addFact(
  content: string, 
  category?: string, 
  confidence?: number
): Promise<void> {
  if (!content || content.trim().length < 3) {
    console.log(chalk.red('错误: 内容太短，至少需要 3 个字符'));
    return;
  }

  const config = loadConfig();
  const rootDir = getRootDir(config);
  const data = await loadFactsData(rootDir);
  const agentId = getCurrentAgentId();
  
  const facts = getAgentFacts(data, agentId);
  
  const finalCategory = category || inferCategory(content);
  const finalConfidence = confidence ?? inferConfidence(content);

  const normalized = content.trim().toLowerCase().replace(/\s+/g, '');
  const existing = facts.find(f => {
    const existingNorm = f.content.trim().toLowerCase().replace(/\s+/g, '');
    return normalized === existingNorm;
  });

  if (existing) {
    if (finalConfidence > existing.confidence) {
      existing.confidence = finalConfidence;
      existing.category = finalCategory as MemoryFact['category'];
    }
    console.log();
    console.log(chalk.yellow('该事实已存在，已更新'));
    console.log(chalk.white(formatFact(existing)));
    console.log();
    await saveFactsData(rootDir, data);
    return;
  }

  const now = new Date().toISOString();
  const newFact: MemoryFact = {
    id: generateFactId(),
    content: content.trim(),
    category: finalCategory as MemoryFact['category'],
    confidence: finalConfidence,
    createdAt: now,
    source: 'manual',
  };

  facts.push(newFact);
  await saveFactsData(rootDir, data);

  console.log();
  console.log(chalk.green('✓ 已添加事实'));
  console.log(chalk.white(formatFact(newFact)));
  console.log(chalk.gray(`Agent: ${agentId}`));
  console.log();
}

export async function deleteFact(factId: string): Promise<void> {
  if (!factId) {
    console.log(chalk.red('错误: 请指定事实 ID'));
    console.log(chalk.cyan('用法: /fact delete <ID或序号>'));
    return;
  }

  const config = loadConfig();
  const rootDir = getRootDir(config);
  const data = await loadFactsData(rootDir);
  const agentId = getCurrentAgentId();
  
  const facts = getAgentFacts(data, agentId);

  let targetIndex = -1;
  
  if (/^\d+$/.test(factId)) {
    targetIndex = parseInt(factId, 10) - 1;
    if (targetIndex < 0 || targetIndex >= facts.length) {
      console.log(chalk.red(`错误: 序号 ${factId} 超出范围 (1-${facts.length})`));
      return;
    }
  } else {
    targetIndex = facts.findIndex(f => f.id === factId || f.id.startsWith(factId));
  }

  if (targetIndex < 0) {
    console.log(chalk.red('错误: 未找到该事实'));
    return;
  }

  const deleted = facts.splice(targetIndex, 1)[0];
  await saveFactsData(rootDir, data);

  console.log();
  console.log(chalk.green('✓ 已删除事实'));
  if (deleted) {
    console.log(chalk.gray(`  ${deleted.content}`));
  }
  console.log();
}

export async function searchFacts(keyword: string): Promise<void> {
  if (!keyword || keyword.trim().length < 1) {
    console.log(chalk.red('错误: 请提供搜索关键词'));
    console.log(chalk.cyan('用法: /fact search <关键词>'));
    return;
  }

  const config = loadConfig();
  const rootDir = getRootDir(config);
  const data = await loadFactsData(rootDir);
  const agentId = getCurrentAgentId();
  
  const facts = getAgentFacts(data, agentId);

  const keywordLower = keyword.toLowerCase();
  const results = facts.filter(f => 
    f.content.toLowerCase().includes(keywordLower) ||
    f.category.toLowerCase().includes(keywordLower)
  );

  console.log();

  if (results.length === 0) {
    console.log(chalk.gray(`未找到包含 "${keyword}" 的事实`));
    return;
  }

  console.log(chalk.cyan.bold(`🔍 搜索结果 (${results.length} 条)\n`));
  console.log(chalk.gray(`关键词: "${keyword}"`));
  console.log(chalk.gray(`Agent: ${agentId}\n`));

  for (let i = 0; i < results.length; i++) {
    const fact = results[i];
    if (!fact) continue;
    
    console.log(chalk.white(`${i + 1}. ${formatFact(fact)}`));
  }

  console.log();
}

export async function editFact(factId: string, newContent: string): Promise<void> {
  if (!factId) {
    console.log(chalk.red('错误: 请指定事实 ID'));
    console.log(chalk.cyan('用法: /fact edit <ID或序号> <新内容>'));
    return;
  }

  if (!newContent || newContent.trim().length < 3) {
    console.log(chalk.red('错误: 新内容太短'));
    console.log(chalk.cyan('用法: /fact edit <ID或序号> <新内容>'));
    return;
  }

  const config = loadConfig();
  const rootDir = getRootDir(config);
  const data = await loadFactsData(rootDir);
  const agentId = getCurrentAgentId();
  
  const facts = getAgentFacts(data, agentId);

  let targetIndex = -1;
  
  if (/^\d+$/.test(factId)) {
    targetIndex = parseInt(factId, 10) - 1;
  } else {
    targetIndex = facts.findIndex(f => f.id === factId || f.id.startsWith(factId));
  }

  if (targetIndex < 0 || targetIndex >= facts.length) {
    console.log(chalk.red('错误: 未找到该事实'));
    return;
  }

  const targetFact = facts[targetIndex];
  if (!targetFact) {
    console.log(chalk.red('错误: 未找到该事实'));
    return;
  }

  const oldContent = targetFact.content;
  targetFact.content = newContent.trim();
  targetFact.category = inferCategory(newContent);
  
  await saveFactsData(rootDir, data);

  console.log();
  console.log(chalk.green('✓ 已更新事实'));
  console.log(chalk.gray(`  旧: ${oldContent}`));
  console.log(chalk.white(`  新: ${targetFact.content}`));
  console.log();
}

export async function exportFacts(filePath?: string): Promise<void> {
  const config = loadConfig();
  const rootDir = getRootDir(config);
  const data = await loadFactsData(rootDir);
  const agentId = getCurrentAgentId();
  
  const facts = getAgentFacts(data, agentId);

  if (facts.length === 0) {
    console.log(chalk.yellow('当前 Agent 没有事实可导出'));
    return;
  }

  const exportData = {
    version: '1.0',
    agentId,
    exportedAt: new Date().toISOString(),
    facts,
  };

  const outputPath = filePath || join(process.cwd(), `facts_${agentId}_${Date.now()}.json`);
  writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');

  console.log();
  console.log(chalk.green('✓ 导出成功'));
  console.log(chalk.white(`  文件: ${outputPath}`));
  console.log(chalk.white(`  条数: ${facts.length}`));
  console.log(chalk.gray(`  Agent: ${agentId}`));
  console.log();
}

export async function importFacts(filePath: string): Promise<void> {
  if (!filePath) {
    console.log(chalk.red('错误: 请指定导入文件路径'));
    console.log(chalk.cyan('用法: /fact import <文件路径>'));
    return;
  }

  if (!existsSync(filePath)) {
    console.log(chalk.red(`错误: 文件不存在: ${filePath}`));
    return;
  }

  let importData: { facts?: MemoryFact[] };
  try {
    const content = readFileSync(filePath, 'utf-8');
    importData = JSON.parse(content);
  } catch {
    console.log(chalk.red('错误: 文件格式不正确'));
    return;
  }

  if (!importData.facts || !Array.isArray(importData.facts)) {
    console.log(chalk.red('错误: 文件中没有有效的 facts 数据'));
    return;
  }

  const config = loadConfig();
  const rootDir = getRootDir(config);
  const data = await loadFactsData(rootDir);
  const agentId = getCurrentAgentId();
  
  const existingFacts = getAgentFacts(data, agentId);
  
  let imported = 0;
  let skipped = 0;

  for (const fact of importData.facts) {
    if (!fact.content) continue;
    
    const normalized = fact.content.trim().toLowerCase().replace(/\s+/g, '');
    const exists = existingFacts.some(f => 
      f.content.trim().toLowerCase().replace(/\s+/g, '') === normalized
    );

    if (exists) {
      skipped++;
      continue;
    }

    existingFacts.push({
      ...fact,
      id: generateFactId(),
      source: 'import',
    });
    imported++;
  }

  await saveFactsData(rootDir, data);

  console.log();
  console.log(chalk.green('✓ 导入完成'));
  console.log(chalk.white(`  导入: ${imported} 条`));
  console.log(chalk.white(`  跳过: ${skipped} 条（已存在）`));
  console.log(chalk.white(`  当前: ${existingFacts.length} 条`));
  console.log();
}

export async function cleanFacts(minConfidence: number = 0.7): Promise<void> {
  const config = loadConfig();
  const rootDir = getRootDir(config);
  const data = await loadFactsData(rootDir);
  const agentId = getCurrentAgentId();
  
  const facts = getAgentFacts(data, agentId);

  if (facts.length === 0) {
    console.log(chalk.gray('暂无事实需要清理'));
    return;
  }

  console.log();
  console.log(chalk.cyan(`🔍 扫描 ${facts.length} 条事实...`));
  console.log(chalk.gray(`Agent: ${agentId}\n`));

  // 按关键词分组
  const groups: MemoryFact[][] = [];
  const used = new Set<string>();

  for (const fact of facts) {
    if (used.has(fact.id)) continue;
    
    const group = [fact];
    used.add(fact.id);
    
    const keywords1 = extractKeywords(fact.content);
    
    for (const other of facts) {
      if (used.has(other.id)) continue;
      
      const keywords2 = extractKeywords(other.content);
      const common = keywords1.filter(k => keywords2.includes(k));
      
      if (common.length >= 1) {
        group.push(other);
        used.add(other.id);
      }
    }
    
    if (group.length > 1) {
      groups.push(group);
    }
  }

  // 删除低置信度
  let deleted = 0;
  for (let i = facts.length - 1; i >= 0; i--) {
    const fact = facts[i];
    if (fact && fact.confidence < minConfidence && !used.has(fact.id)) {
      facts.splice(i, 1);
      deleted++;
    }
  }

  if (groups.length === 0) {
    if (deleted > 0) {
      await saveFactsData(rootDir, data);
      console.log(chalk.green(`✓ 已删除 ${deleted} 条低置信度事实`));
    } else {
      console.log(chalk.gray('未发现需要合并的相似事实'));
    }
    return;
  }

  console.log(chalk.cyan(`发现 ${groups.length} 组相似事实，开始精炼...\n`));

  // LLM 精炼
  const model = config.model.model || 'qwen2.5:14b';
  const llm = new OllamaAdapter({
    baseUrl: config.model.baseUrl,
    defaultModel: model,
  });

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (!group || group.length < 2) continue;
    
    console.log(chalk.gray(`[${i + 1}/${groups.length}] 精炼 ${group.length} 条事实...`));
    
    const contents = group.map(f => `- ${f.content}`).join('\n');
    const prompt = `合并以下相似信息为一句话：

${contents}

直接输出合并结果（不超过50字）:`;

    try {
      const result = await llm.chat({
        model: model,
        messages: [{ role: 'user', content: prompt }],
      });
      
      const merged = result.content?.trim() || '';
      
      if (merged.length >= 3) {
        for (const f of group) {
          const idx = facts.indexOf(f);
          if (idx >= 0) facts.splice(idx, 1);
          deleted++;
        }
        
        const maxConf = Math.max(...group.map(f => f.confidence));
        facts.push({
          id: generateFactId(),
          content: merged,
          category: group[0]?.category || 'knowledge',
          confidence: maxConf,
          createdAt: new Date().toISOString(),
          source: 'clean_merge',
        });
        
        console.log(chalk.white(`  合并: ${merged}`));
        console.log();
      }
    } catch {
      console.log(chalk.yellow('  跳过（LLM 不可用）'));
    }
  }

  await saveFactsData(rootDir, data);
  console.log(chalk.green(`✓ 清理完成，共删除 ${deleted} 条冗余记录`));
}

function extractKeywords(text: string): string[] {
  const keywords: string[] = [];
  
  const techMatch = text.match(/python|c\+\+|java|javascript|go|rust|typescript|node|react|vue|angular/gi);
  if (techMatch) keywords.push(...techMatch.map(k => k.toLowerCase()));
  
  const roleMatch = text.match(/开发者|工程师|程序员|expert|专家/gi);
  if (roleMatch) keywords.push(...roleMatch.map(k => k.toLowerCase()));
  
  const actionMatch = text.match(/精通|熟悉|擅长|会|懂|使用|喜欢/gi);
  if (actionMatch) keywords.push(...actionMatch.map(k => k.toLowerCase()));
  
  return [...new Set(keywords)];
}

export function showFactHelp(): void {
  console.log();
  console.log(chalk.cyan.bold('📋 事实管理命令\n'));
  console.log(chalk.white('用法: /fact <命令> [参数]\n'));
  
  console.log(chalk.cyan('命令:'));
  console.log(chalk.white('  list [分类]        列出所有事实'));
  console.log(chalk.white('  add <内容>         添加事实'));
  console.log(chalk.white('  search <关键词>    搜索事实'));
  console.log(chalk.white('  edit <ID> <内容>   编辑事实'));
  console.log(chalk.white('  delete <ID>        删除事实'));
  console.log(chalk.white('  export [文件]      导出事实'));
  console.log(chalk.white('  import <文件>      导入事实'));
  console.log(chalk.white('  clean [阈值]       清理重复事实'));
  console.log(chalk.white('  help               显示帮助\n'));

  console.log(chalk.cyan('分类:'));
  console.log(chalk.white('  preference  偏好'));
  console.log(chalk.white('  knowledge   知识'));
  console.log(chalk.white('  context     背景'));
  console.log(chalk.white('  behavior    行为'));
  console.log(chalk.white('  goal        目标\n'));

  console.log(chalk.cyan('示例:'));
  console.log(chalk.gray('  /fact list'));
  console.log(chalk.gray('  /fact add 我精通Python'));
  console.log(chalk.gray('  /fact search Python'));
  console.log(chalk.gray('  /fact edit 1 新内容'));
  console.log(chalk.gray('  /fact export facts.json'));
  console.log(chalk.gray('  /fact import facts.json'));
  console.log();
}

export async function handleFactCommand(args: string): Promise<void> {
  const parts = args.trim().split(/\s+/);
  const command = parts[0]?.toLowerCase() || '';
  const rest = parts.slice(1).join(' ');

  switch (command) {
    case '':
    case 'list':
    case 'ls':
      await listFacts(parts[1]);
      break;

    case 'add':
    case 'new':
      if (!rest) {
        console.log(chalk.red('错误: 请提供事实内容'));
        console.log(chalk.cyan('用法: /fact add <内容>'));
        return;
      }
      await addFact(rest);
      break;

    case 'search':
    case 'find':
    case 's':
      await searchFacts(parts.slice(1).join(' '));
      break;

    case 'edit':
    case 'update':
      await editFact(parts[1] || '', parts.slice(2).join(' '));
      break;

    case 'delete':
    case 'del':
    case 'rm':
      await deleteFact(parts[1] || '');
      break;

    case 'export':
      await exportFacts(parts[1]);
      break;

    case 'import':
      await importFacts(parts[1] || '');
      break;

    case 'clean':
    case 'cleanup':
      const threshold = parts[1] ? parseFloat(parts[1]) : 0.7;
      await cleanFacts(isNaN(threshold) ? 0.7 : threshold);
      break;

    case 'help':
    case '?':
      showFactHelp();
      break;

    default:
      console.log(chalk.red(`未知命令: ${command}`));
      showFactHelp();
  }
}