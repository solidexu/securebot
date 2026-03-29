/**
 * RAG 知识自动保存模块
 * 
 * 提供两种自动触发机制：
 * 1. 关键词触发 - 用户说"记住"、"保存知识"等
 * 2. 任务完成自动总结 - 任务完成后生成总结文档
 */

import chalk from 'chalk';
import type { Agent, Session } from '../core/types.js';
import type { TaskPlan } from '../core/smart-task.js';

// ============ 关键词配置 ============

/**
 * 触发知识保存的关键词
 */
const SAVE_KNOWLEDGE_KEYWORDS = [
  // 明确要求保存
  '记住这个', '记住这些', '记下来', '保存知识', '存到知识库',
  '记住以后', '以后记住', '别忘了', '不要忘记',
  '记录下来', '记录这个', '记录一下',
  '学习到了', '学到了', '学会了',
  '这是一个重要的', '重要的知识点', '重要经验',
  // 总结性语句
  '总结一下', '做个总结', '总结如下',
  '最佳实践是', '经验是', '教训是',
  '关键点是', '重点是', '核心是',
];

/**
 * 检测是否需要保存知识
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

// ============ 任务完成总结 ============

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
 * 从对话历史中提取关键点
 */
function extractKeyPoints(
  history: Array<{ role: string; content: string }>
): string {
  const points: string[] = [];
  
  // 提取代码块
  const codeBlocks: string[] = [];
  for (const msg of history) {
    const matches = msg.content.match(/```[\s\S]*?```/g) || [];
    codeBlocks.push(...matches.slice(0, 2)); // 最多取 2 个代码块
  }
  
  if (codeBlocks.length > 0) {
    points.push('### 关键代码\n\n' + codeBlocks.slice(0, 2).join('\n\n'));
  }
  
  // 提取重要语句（包含"重要"、"注意"、"关键"等）
  const importantSentences: string[] = [];
  for (const msg of history) {
    const sentences = msg.content.split(/[。！？\n]/);
    for (const sentence of sentences) {
      if (/重要|注意|关键|必须|不要|避免/.test(sentence) && sentence.length > 10 && sentence.length < 200) {
        importantSentences.push(sentence.trim());
      }
    }
  }
  
  if (importantSentences.length > 0) {
    points.push('### 注意事项\n\n' + importantSentences.slice(0, 5).map(s => `- ${s}`).join('\n'));
  }
  
  return points.length > 0 ? points.join('\n\n') : '（无特别提取的关键点）';
}

// ============ 自动保存入口 ============

/**
 * 检查并保存知识（关键词触发）
 */
export async function checkAndSaveKnowledge(
  userMessage: string,
  assistantResponse: string,
  agent: Agent,
  session: Session
): Promise<boolean> {
  const { should, keyword } = shouldSaveKnowledge(userMessage);
  
  if (!should) {
    return false;
  }
  
  const knowledge = extractKnowledgeFromConversation(userMessage, assistantResponse);
  
  if (!knowledge) {
    return false;
  }
  
  try {
    const { ragGenerateDocumentTool } = await import('./tools.js');
    const { join } = await import('node:path');
    
    // 调用保存工具
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
      console.log(chalk.gray(`📚 已自动保存知识（触发词: "${keyword}"）`));
      return true;
    }
  } catch (error) {
    // 忽略错误，不影响主流程
  }
  
  return false;
}

/**
 * 任务完成后自动生成总结
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
      console.log(chalk.gray(`📚 已自动生成任务总结文档`));
      return true;
    }
  } catch (error) {
    // 忽略错误
  }
  
  return false;
}