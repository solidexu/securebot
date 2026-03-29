/**
 * RAG 知识自动保存模块
 * 
 * 提供两种自动触发机制：
 * 1. 智能触发 - 语义分析判断是否保存
 * 2. 任务完成自动总结 - 任务完成后生成总结文档
 */

import chalk from 'chalk';
import type { Agent, Session } from '../core/types.js';
import type { TaskPlan } from '../core/smart-task.js';
import { getSmartSaveTrigger, type SaveDecision } from './smart-save-trigger.js';

// ============ 噪音过滤模式（第一阶段） ============

/**
 * 噪音内容模式 - 这些内容不应出现在总结文档中
 */
const NOISE_PATTERNS = [
  /这是第\s*\d+\s*次失败/,
  /你还有\s*\d+\s*次自动重试/,
  /请立即分析错误/,
  /请不要问用户/,
  /error:\s*macro/,
  /warning:\s*/,
  /In file included from/,
  /^\s*\d+\s*\|/,
  /note:\s*/,
  /^\s*\^/,
];

/**
 * 判断内容是否为噪音
 */
function isNoise(content: string): boolean {
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(content)) return true;
  }
  return false;
}

/**
 * 判断代码块是否为错误日志
 */
function isErrorLog(codeBlock: string): boolean {
  return (
    codeBlock.includes('error:') ||
    codeBlock.includes('warning:') ||
    codeBlock.includes('In file included from') ||
    codeBlock.includes('note:') ||
    codeBlock.match(/^\s*\d+\s*\|/) !== null ||
    codeBlock.includes('macro "assert"')
  );
}

// ============ 向后兼容的关键词检测 ============

/**
 * 触发知识保存的关键词（向后兼容）
 */
const SAVE_KNOWLEDGE_KEYWORDS = [
  '记住这个', '记住这些', '记下来', '保存知识', '存到知识库',
  '记住以后', '以后记住', '别忘了', '不要忘记',
  '记录下来', '记录这个', '记录一下',
  '学习到了', '学到了', '学会了',
  '这是一个重要的', '重要的知识点', '重要经验',
  '总结一下', '做个总结', '总结如下',
  '最佳实践是', '经验是', '教训是',
  '关键点是', '重点是', '核心是',
];

/**
 * 检测是否需要保存知识（向后兼容）
 * @deprecated 请使用 SmartSaveTrigger.analyze() 代替
 */
export function shouldSaveKnowledge(message: string): { should: boolean; keyword?: string } {
  const lowerMessage = message.toLowerCase();
  
  for (const keyword of SAVE_KNOWLEDGE_KEYWORDS) {
    if (lowerMessage.includes(keyword)) {
      return { should: true, keyword };
    }
  }
  
  return { should: false };
}

// ============ 自动保存入口 ============

/**
 * 检查并保存知识（智能触发）
 */
export async function checkAndSaveKnowledge(
  userMessage: string,
  assistantResponse: string,
  agent: Agent,
  session: Session
): Promise<boolean> {
  const trigger = getSmartSaveTrigger();
  
  const decision = await trigger.analyze(userMessage, assistantResponse);
  
  if (!decision.shouldSave) {
    return false;
  }
  
  const knowledge = extractKnowledgeFromConversation(userMessage, assistantResponse);
  
  if (!knowledge) {
    return false;
  }
  
  if (decision.suggestedTags.length > 0) {
    knowledge.tags = [...new Set([...knowledge.tags, ...decision.suggestedTags])];
  }
  
  try {
    const { ragGenerateDocumentTool } = await import('./tools.js');
    
    const result = await ragGenerateDocumentTool.execute!(
      {
        topic: knowledge.topic,
        content: knowledge.content,
        type: 'guide',
        tags: knowledge.tags.join(', '),
      },
      {
        agent,
        session,
        workspace: agent.workspace,
        logger: console,
      }
    );
    
    if (result.success) {
      console.log(chalk.gray(`📚 已自动保存知识 (${(decision.confidence * 100).toFixed(0)}% 置信度)`));
      return true;
    }
  } catch (error) {
    // 忽略错误，不影响主流程
  }
  
  return false;
}

/**
 * 评估总结文档质量（第一阶段）
 * 
 * 返回值范围：0.0-1.0
 * - < 0.3: 低质量，建议拦截
 * - 0.3-0.5: 中等质量，可考虑保存
 * - > 0.5: 高质量，建议保存
 */
function assessSummaryQuality(summary: { topic: string; content: string }): number {
  let score = 0;
  
  // 检查是否有真正的代码（不含error）
  const codeBlocks = summary.content.match(/```[\s\S]*?```/g) || [];
  const cleanBlocks = codeBlocks.filter(b => !isErrorLog(b));
  if (cleanBlocks.length > 0) score += 0.3;
  
  // 检查是否有技术关键词
  const techKeywords = /算法|原理|复杂度|时间|空间|旋转|平衡|实现|结构|设计|架构/;
  if (techKeywords.test(summary.content)) score += 0.2;
  
  // 检查注意事项是否有效（不含噪音）
  const notesSection = summary.content.match(/### 注意事项[\s\S]*?(?=##|$)/);
  if (notesSection && notesSection[0]) {
    const noteLines = notesSection[0].split('\n').filter(line => line.startsWith('-'));
    const cleanNotes = noteLines.filter(line => !isNoise(line));
    if (cleanNotes.length > 0) score += 0.2;
  }
  
  // 检查是否有关键技术点（不含错误）
  const keyPointsSection = summary.content.match(/## 关键技术点[\s\S]*?(?=##|$)/);
  if (keyPointsSection && keyPointsSection[0]) {
    if (!keyPointsSection[0].includes('error:') && !keyPointsSection[0].includes('warning:')) {
      score += 0.1;
    }
  }
  
  // 检查是否只是流水账（内容过短）
  if (summary.content.length < 200) score -= 0.1;
  
  // 检查是否全是错误日志（内容充斥error/warning）
  const errorCount = (summary.content.match(/error:/g) || []).length;
  const warningCount = (summary.content.match(/warning:/g) || []).length;
  if (errorCount + warningCount > 5) score -= 0.2;
  
  return Math.max(0, Math.min(1, score));
}

/**
 * 任务完成后自动生成总结（第一阶段优化）
 */
export async function autoGenerateTaskSummary(
  plan: TaskPlan,
  userRequest: string,
  history: Array<{ role: string; content: string }>,
  agent: Agent,
  session: Session
): Promise<boolean> {
  const summary = generateTaskSummary(plan, userRequest, history);
  
  if (!summary) {
    return false;
  }
  
  // 第一阶段新增：质量评估
  const qualityScore = assessSummaryQuality(summary);
  
  if (qualityScore < 0.3) {
    console.log(chalk.gray(`📚 跳过低质量总结文档（评分：${qualityScore.toFixed(2)}）`));
    return false;
  }
  
  const trigger = getSmartSaveTrigger();
  const completedSteps = plan.steps.filter(s => s.status === 'completed').length;
  
  const decision = await trigger.analyzeTaskSummary(
    userRequest,
    summary.content,
    completedSteps
  );
  
  if (!decision.shouldSave) {
    console.log(chalk.gray(`📚 跳过任务总结保存: ${decision.reason}`));
    return false;
  }
  
  if (decision.suggestedTags.length > 0) {
    summary.tags = [...new Set([...summary.tags, ...decision.suggestedTags])];
  }
  
  try {
    const { ragGenerateDocumentTool } = await import('./tools.js');
    
    const result = await ragGenerateDocumentTool.execute!(
      {
        topic: summary.topic,
        content: summary.content,
        type: summary.type,
        tags: summary.tags.join(', '),
      },
      {
        agent,
        session,
        workspace: agent.workspace,
        logger: console,
      }
    );
    
    if (result.success) {
      const scoreDisplay = qualityScore >= 0.5 
        ? chalk.green(`（评分：${qualityScore.toFixed(2)}）`)
        : chalk.gray(`（评分：${qualityScore.toFixed(2)}）`);
      console.log(`📚 已自动生成任务总结文档 ${scoreDisplay}`);
      return true;
    }
  } catch (error) {
    // 忽略错误
  }
  
  return false;
}

// ============ 辅助函数 ============

/**
 * 从对话中提取知识内容
 */
export function extractKnowledgeFromConversation(
  userMessage: string,
  assistantResponse: string
): { topic: string; content: string; tags: string[] } | null {
  // 如果用户消息太短，不保存
  if (userMessage.length < 20) {
    return null;
  }
  
  // 提取主题（从用户消息的前 50 个字符）
  let topic = userMessage.slice(0, 50).replace(/[？?！!。.，,]/g, '').trim();
  if (topic.length > 40) {
    topic = topic.slice(0, 40) + '...';
  }
  
  // 提取内容（合并用户消息和助手回复的关键部分）
  const content = `## 用户问题\n\n${userMessage}\n\n## 解答\n\n${assistantResponse}`;
  
  // 提取标签
  const tags: string[] = [];
  
  // 检测常见主题
  if (/python|Python/.test(content)) tags.push('python');
  if (/javascript|JavaScript|js|JS/.test(content)) tags.push('javascript');
  if (/docker|Docker/.test(content)) tags.push('docker');
  if (/git|Git/.test(content)) tags.push('git');
  if (/测试|test/.test(content)) tags.push('testing');
  if (/算法|algorithm/.test(content)) tags.push('algorithm');
  if (/错误|error|bug/.test(content)) tags.push('debugging');
  if (/配置|config/.test(content)) tags.push('configuration');
  if (/最佳实践|best.?practice/.test(content)) tags.push('best-practice');
  
  return { topic, content, tags };
}

/**
 * 从任务计划生成总结文档
 */
export function generateTaskSummary(
  plan: TaskPlan,
  userRequest: string,
  conversationHistory: Array<{ role: string; content: string }>
): { topic: string; content: string; type: string; tags: string[] } | null {
  // 统计完成情况
  const completedSteps = plan.steps.filter(s => s.status === 'completed').length;
  const totalSteps = plan.steps.length;
  
  if (completedSteps < 2) {
    // 至少完成 2 个步骤才生成总结
    return null;
  }
  
  // 生成主题
  const topic = plan.title || userRequest.slice(0, 40);
  
  // 生成内容
  const stepSummary = plan.steps
    .filter(s => s.status === 'completed')
    .map((s, i) => `${i + 1}. ${s.description}`)
    .join('\n');
  
  // 从对话历史中提取关键技术点
  const keyPoints = extractKeyPoints(conversationHistory);
  
  const content = `## 任务描述

${userRequest}

## 执行步骤

${stepSummary}

## 完成情况

- 完成步骤: ${completedSteps}/${totalSteps}
- 完成时间: ${new Date().toLocaleDateString('zh-CN')}

## 关键技术点

${keyPoints}

## 注意事项

*本文档由 SecureBot 自动生成，记录任务执行过程和关键知识点。*
`;

  // 生成标签
  const tags: string[] = ['task-summary'];
  
  // 检测任务类型
  if (/实现|开发|创建|编写/.test(userRequest)) tags.push('development');
  if (/测试|test/.test(userRequest)) tags.push('testing');
  if (/优化|optimize/.test(userRequest)) tags.push('optimization');
  if (/调试|debug|修复/.test(userRequest)) tags.push('debugging');
  if (/python|Python/.test(userRequest)) tags.push('python');
  if (/javascript|JavaScript/.test(userRequest)) tags.push('javascript');
  
  return { topic, content, type: 'solution', tags };
}

/**
 * 从对话历史中提取关键点（第一阶段优化）
 */
function extractKeyPoints(
  history: Array<{ role: string; content: string }>
): string {
  const points: string[] = [];
  
  // 提取代码块（过滤错误日志）
  const cleanCodeBlocks: string[] = [];
  for (const msg of history) {
    const matches = msg.content.match(/```[\s\S]*?```/g) || [];
    
    // 过滤：只保留非错误日志的代码块
    for (const block of matches) {
      if (!isErrorLog(block) && block.length > 50) {
        cleanCodeBlocks.push(block);
      }
    }
  }
  
  // 最多保留2个高质量代码块
  if (cleanCodeBlocks.length > 0) {
    points.push('### 关键代码\n\n' + cleanCodeBlocks.slice(0, 2).join('\n\n'));
  }
  
  // 提取重要语句（过滤噪音）
  const importantSentences: string[] = [];
  for (const msg of history) {
    const sentences = msg.content.split(/[。！？\n]/);
    for (const sentence of sentences) {
      if (
        /重要|注意|关键|必须|不要|避免/.test(sentence) &&
        !isNoise(sentence) &&  // 过滤噪音
        sentence.length > 10 &&
        sentence.length < 200
      ) {
        importantSentences.push(sentence.trim());
      }
    }
  }
  
  if (importantSentences.length > 0) {
    points.push('### 注意事项\n\n' + importantSentences.slice(0, 5).map(s => `- ${s}`).join('\n'));
  }
  
  return points.length > 0 ? points.join('\n\n') : '（无特别提取的关键点）';
}