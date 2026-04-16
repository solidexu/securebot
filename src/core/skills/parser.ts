/**
 * Skills Markdown 解析器
 * 
 * 解析 SKILL.md 文件，支持：
 * - YAML front matter 元数据
 * - Markdown 章节解析
 * - 工作流、最佳实践、示例提取
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseSkillConditions } from "./skill-conditions.js";
import * as yaml from "js-yaml";
import type {
  MarkdownSkill,
  WorkflowStep,
  SkillExample,
  ResourceReference,
} from './types.js';


// ============ YAML 解析缓存 ============

/** YAML 解析缓存 */
const yamlCache = new Map<string, Record<string, unknown>>();

/** 缓存最大容量 */
const MAX_YAML_CACHE_SIZE = 50;
/**
 * 解析 SKILL.md 文件
 * @param skillFile 技能文件路径
 * @param skillDirName 可选的技能目录名，用于在没有 id 时作为后备
 */
export function parseSkillFile(skillFile: string, skillDirName?: string): MarkdownSkill | null {
  if (!existsSync(skillFile)) {
    return null;
  }

  try {
    const content = readFileSync(skillFile, 'utf-8');

    // 1. 解析 YAML front matter
    const frontMatterMatch = content.match(/^---\s*\n(.*?)\n---\s*\n/s);
    if (!frontMatterMatch) {
      console.warn(`Skill file missing front matter: ${skillFile}`);
      return null;
    }

    const frontMatter = parseYamlFrontMatter(frontMatterMatch[1]);

    // 验证必需字段：name 是必需的，id 如果没有则使用目录名
    if (!frontMatter.name) {
      console.warn(`Skill file missing required fields: ${skillFile}`);
      return null;
    }

    const id = frontMatter.id || skillDirName || dirname(skillFile).split('/').pop() || '';

    // 2. 解析 Markdown body
    const body = content.slice(frontMatterMatch[0].length);
    const sections = parseMarkdownSections(body);

    // 3. 构建 MarkdownSkill 对象
    const skill: MarkdownSkill = {
      id,
      name: frontMatter.name,
      version: frontMatter.version,
      author: frontMatter.author,
      keywords: frontMatter.keywords || [],
      tools: frontMatter.tools,
      trigger: frontMatter.trigger,
      conditions: parseSkillConditions(frontMatter),

      overview: sections.get('Overview') || sections.get('概述'),
      whenToUse: parseWhenToUse(
        sections.get('When to Use') || sections.get('使用场景')
      ),
      workflow: parseWorkflow(
        sections.get('Workflow') || sections.get('工作流')
      ),
      bestPractices: parseBestPractices(
        sections.get('Best Practices') || sections.get('最佳实践')
      ),
      examples: parseExamples(
        sections.get('Examples') || sections.get('示例')
      ),
      resources: parseResources(
        sections.get('Resources') || sections.get('资源')
      ),

      skillDir: dirname(skillFile),
      skillFile,
      category: 'public', // 由调用者设置
    };

    return skill;
  } catch (error) {
    console.error(`Failed to parse skill file ${skillFile}:`, error);
    return null;
  }
}

/**
 * 解析 YAML front matter
 * 
 * 支持基本 YAML 语法：
 * - key: value
 * - key: [array]
 * - 嵌套对象
 */
function parseYamlFrontMatter(yamlContent: string): Record<string, any> {
  // 检查缓存
  const cached = yamlCache.get(yamlContent);
  if (cached) {
    return cached;
  }
  
  // 解析 YAML
  try {
    const result = yaml.load(yamlContent) as Record<string, any>;
    
    // 添加到缓存（LRU 淘汰）
    if (yamlCache.size >= MAX_YAML_CACHE_SIZE) {
      // 删除最旧的条目（第一个）
      const firstKey = yamlCache.keys().next().value;
      if (firstKey) yamlCache.delete(firstKey);
    }
    yamlCache.set(yamlContent, result);
    
    return result;
  } catch (e) {
    console.warn("Failed to parse YAML:", e);
    return {};
  }
}
/**
 * 解析 Markdown 章节
 * 
 * 按 ## 标题分割
 */
function parseMarkdownSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();

  // 按 ## 分割
  const parts = body.split(/^## (.+)$/m);

  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i]?.trim() || '';
    const content = parts[i + 1]?.trim() || '';
    if (title) {
      sections.set(title, content);
    }
  }

  return sections;
}

/**
 * 解析 When to Use 章节
 * 
 * 格式：
 * - 用户说 "xxx"
 * - 用户请求 yyy
 */
function parseWhenToUse(content?: string): string[] {
  if (!content) return [];

  const items: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const match = line.match(/^-\s+(.+)$/);
    if (match) {
      items.push(match[1]);
    }
  }

  return items;
}

/**
 * 解析 Workflow 章节
 * 
 * 格式：
 * ### Step 1: Read Code
 * 描述...
 * 
 * ### Step 2: Analyze
 * 描述...
 */
function parseWorkflow(content?: string): WorkflowStep[] {
  if (!content) return [];

  const steps: WorkflowStep[] = [];
  const lines = content.split('\n');

  let currentStep: WorkflowStep | null = null;

  for (const line of lines) {
    // Step 标题
    const stepMatch = line.match(/^###\s+Step\s+(\d+):\s+(.+)$/);
    if (stepMatch) {
      if (currentStep) {
        steps.push(currentStep);
      }
      currentStep = {
        name: `Step ${stepMatch[1]}`,
        description: stepMatch[2],
        details: '',
      };
      continue;
    }

    // 其他标题格式
    const altStepMatch = line.match(/^###\s+(.+)$/);
    if (altStepMatch && !line.includes('Step')) {
      // 可能是子章节，跳过
      continue;
    }

    // Step 内容
    if (currentStep && line.trim()) {
      currentStep.details = (currentStep.details || '') + line + '\n';
    }
  }

  if (currentStep) {
    steps.push(currentStep);
  }

  return steps;
}

/**
 * 解析 Best Practices 章节
 * 
 * 格式：
 * 1. 优先级排序
 * 2. 具体建议
 */
function parseBestPractices(content?: string): string[] {
  if (!content) return [];

  const practices: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // 编号列表（支持中文冒号）
    const numberMatch = line.match(/^\d+\.\s+\*\*(.+?)\*\*[:：]\s*(.+)$/);
    if (numberMatch) {
      practices.push(`${numberMatch[1]}：${numberMatch[2]}`);
      continue;
    }
    
    // 简单编号列表
    const simpleNumberMatch = line.match(/^\d+\.\s+(.+)$/);
    if (simpleNumberMatch) {
      practices.push(simpleNumberMatch[1]);
      continue;
    }

    // 无序列表
    const bulletMatch = line.match(/^-\s+(.+)$/);
    if (bulletMatch) {
      practices.push(bulletMatch[1]);
    }
  }

  return practices;
}

/**
 * 解析 Examples 章节
 * 
 * 格式：
 * ### Example 1: Simple Review
 * 
 * **User**: ...
 * **Assistant**: ...
 */
function parseExamples(content?: string): SkillExample[] {
  if (!content) return [];

  const examples: SkillExample[] = [];
  const lines = content.split('\n');

  let currentExample: Partial<SkillExample> | null = null;
  let inAssistant = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Example 标题
    const titleMatch = line.match(/^###\s+Example\s+\d+:\s+(.+)$/);
    if (titleMatch) {
      // 保存前一个示例
      if (currentExample?.title && currentExample?.user && currentExample?.assistant !== undefined) {
        examples.push(currentExample as SkillExample);
      }
      currentExample = {
        title: titleMatch[1],
      };
      inAssistant = false;
      continue;
    }

    if (!currentExample) continue;

    // User 消息
    if (line.includes('**User**:') || line.includes('**用户**:')) {
      const userMatch = line.match(/\*\*User\*\*:\s*(.+)$|\*\*用户\*\*:\s*(.+)$/);
      if (userMatch) {
        currentExample.user = (userMatch[1] || userMatch[2] || '').trim();
        inAssistant = false;
      }
      continue;
    }

    // Assistant 消息开始
    if (line.includes('**Assistant**:') || line.includes('**助手**:')) {
      // 提取 Assistant 后的内容（可能为空）
      const assistantMatch = line.match(/\*\*Assistant\*\*:\s*(.*)$|\*\*助手\*\*:\s*(.*)$/);
      if (assistantMatch) {
        // 如果有内容，添加到 assistant
        const firstLine = (assistantMatch[1] || assistantMatch[2] || '').trim();
        currentExample.assistant = firstLine;
        inAssistant = true;
      }
      continue;
    }

    // 多行 Assistant 消息
    if (inAssistant && currentExample?.assistant !== undefined && line.trim()) {
      // 遇到新的 Example 标题，停止当前示例
      if (line.match(/^###\s+Example\s+\d+:/)) {
        // 保存当前示例
        if (currentExample?.title && currentExample?.user && currentExample?.assistant !== undefined) {
          examples.push(currentExample as SkillExample);
        }
        // 开始新示例
        const titleMatch = line.match(/^###\s+Example\s+\d+:\s+(.+)$/);
        if (titleMatch) {
          currentExample = {
            title: titleMatch[1],
          };
          inAssistant = false;
        }
        continue;
      }
      
      currentExample.assistant += '\n' + line;
    }
  }

  // 添加最后一个示例
  if (currentExample?.title && currentExample?.user && currentExample?.assistant !== undefined) {
    examples.push(currentExample as SkillExample);
  }

  return examples;
}

/**
 * 解析 Resources 章节
 * 
 * 格式：
 * - [检查清单](./templates/checklist.md)
 * - [分析脚本](./scripts/analyze.py)
 */
function parseResources(content?: string): ResourceReference[] {
  if (!content) return [];

  const resources: ResourceReference[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const match = line.match(/^-\s+\[([^\]]+)\]\(([^)]+)\)$/);
    if (match) {
      const [, description, path] = match;
      resources.push({
        type: getResourceType(path),
        path,
        description,
      });
    }
  }

  return resources;
}

/**
 * 根据文件扩展名判断资源类型
 */
function getResourceType(path: string): ResourceReference['type'] {
  if (path.endsWith('.py') || path.endsWith('.sh') || path.endsWith('.js')) {
    return 'script';
  }
  if (path.endsWith('.md') || path.endsWith('.txt')) {
    return 'template';
  }
  return 'document';
}

/**
 * 提取概述（第一段）
 */
export function extractOverview(body: string): string | undefined {
  // 匹配第一个 ## 标题之前的内容（去掉第一个 # 标题）
  // 优先匹配第一个 ## 标题之前的内容
  const match1 = body.match(/^#\s+.+\n\n(.+?)(?=\n\n##)/s);
  if (match1) {
    return match1[1].trim();
  }
  
  // 如果没有 ## 标题，匹配到字符串结尾
  const match2 = body.match(/^#\s+.+\n\n(.+)$/s);
  return match2 ? match2[1].trim() : undefined;
}
// ============ 缓存管理 ============

/**
 * 清除 YAML 解析缓存
 */
export function clearYamlCache(): void {
  yamlCache.clear();
}

/**
 * 获取缓存统计信息
 */
export function getYamlCacheStats(): {
  size: number;
  maxSize: number;
} {
  return {
    size: yamlCache.size,
    maxSize: MAX_YAML_CACHE_SIZE,
  };
}
