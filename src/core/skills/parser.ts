/**
 * Skills Markdown 解析器
 * 
 * 解析 SKILL.md 文件，支持：
 * - YAML front matter 元数据
 * - Markdown 章节解析
 * - 工作流、最佳实践、示例提取
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type {
  MarkdownSkill,
  WorkflowStep,
  SkillExample,
  ResourceReference,
  SkillTrigger,
} from './types.js';

/**
 * 解析 SKILL.md 文件
 */
export function parseSkillFile(skillFile: string): MarkdownSkill | null {
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

    // 验证必需字段
    if (!frontMatter.id || !frontMatter.name) {
      console.warn(`Skill file missing required fields: ${skillFile}`);
      return null;
    }

    // 2. 解析 Markdown body
    const body = content.slice(frontMatterMatch[0].length);
    const sections = parseMarkdownSections(body);

    // 3. 构建 MarkdownSkill 对象
    const skill: MarkdownSkill = {
      id: frontMatter.id,
      name: frontMatter.name,
      version: frontMatter.version,
      author: frontMatter.author,
      keywords: frontMatter.keywords || [],
      tools: frontMatter.tools,
      trigger: frontMatter.trigger,

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
function parseYamlFrontMatter(yaml: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yaml.split('\n');

  let currentKey: string | null = null;
  let currentArray: any[] | null = null;
  let currentObject: Record<string, any> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // 数组项
    const arrayMatch = line.match(/^(\s*)-\s+(.+)$/);
    if (arrayMatch) {
      const indent = arrayMatch[1].length;
      const value = parseValue(arrayMatch[2]);

      if (currentArray !== null) {
        currentArray.push(value);
      } else if (currentObject !== null && currentKey) {
        // 嵌套对象中的数组
        if (!currentObject[currentKey]) {
          currentObject[currentKey] = [];
        }
        currentObject[currentKey].push(value);
        currentArray = currentObject[currentKey];
      }
      continue;
    }

    // 键值对
    const keyValueMatch = line.match(/^(\w+):\s*(.*)$/);
    if (keyValueMatch) {
      const [, key, value] = keyValueMatch;

      // 检查下一行是否是嵌套对象或数组
      const nextLine = lines[i + 1];
      if (value === '' && nextLine) {
        // 可能是嵌套对象或数组
        if (nextLine.match(/^\s+-/)) {
          // 数组
          currentKey = key;
          result[key] = [];
          currentArray = result[key];
          currentObject = null;
        } else if (nextLine.match(/^\s+\w+:/)) {
          // 嵌套对象
          currentKey = key;
          result[key] = {};
          currentObject = result[key];
          currentArray = null;
        } else {
          // 空值
          result[key] = '';
          currentKey = null;
          currentArray = null;
          currentObject = null;
        }
      } else {
        // 普通值
        result[key] = parseValue(value);
        currentKey = key;
        currentArray = null;
        currentObject = null;
      }
      continue;
    }

    // 嵌套对象的键值对
    const nestedMatch = line.match(/^\s+(\w+):\s*(.*)$/);
    if (nestedMatch && currentObject !== null) {
      const [, key, value] = nestedMatch;
      if (value === '') {
        // 可能是嵌套数组
        currentKey = key;
        currentObject[key] = [];
        currentArray = currentObject[key];
      } else {
        currentObject[key] = parseValue(value);
        currentKey = key;
        currentArray = null;
      }
    }
  }

  return result;
}

/**
 * 解析值（字符串、数字、布尔）
 */
function parseValue(value: string): any {
  // 去除引号
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // 数字
  if (!isNaN(Number(value))) {
    return Number(value);
  }

  // 布尔
  if (value === 'true') return true;
  if (value === 'false') return false;

  // 字符串
  return value;
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