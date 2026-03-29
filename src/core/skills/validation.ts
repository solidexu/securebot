/**
 * 技能验证器
 * 
 * 遵循 Deer-Flow 标准验证 SKILL.md 文件
 * 
 * 验证规则：
 * - name: kebab-case, 1-64 字符
 * - description: 1-1024 字符，不能包含尖括号
 * - 只允许特定属性
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 允许的 frontmatter 属性
 */
export const ALLOWED_FRONTMATTER_PROPERTIES = new Set([
  'id',
  'name',
  'description',
  'license',
  'version',
  'author',
  'tools',
  'keywords',
  'metadata',
  'compatibility',
  'trigger',
]);

/**
 * 名称验证规则
 */
export const NAME_RULES = {
  pattern: /^[a-z0-9-]+$/,
  minLength: 1,
  maxLength: 64,
};

/**
 * 描述验证规则
 */
export const DESCRIPTION_RULES = {
  minLength: 1,
  maxLength: 1024,
};

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  frontmatter?: Record<string, unknown>;
  id?: string;
  name?: string;
}

/**
 * 验证技能目录
 */
export function validateSkillDir(skillDir: string): ValidationResult {
  const skillFile = join(skillDir, 'SKILL.md');
  
  if (!existsSync(skillFile)) {
    return {
      valid: false,
      errors: ['SKILL.md not found'],
      warnings: [],
    };
  }
  
  return validateSkillFile(skillFile);
}

/**
 * 验证 SKILL.md 文件
 */
export function validateSkillFile(skillFile: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!existsSync(skillFile)) {
    return {
      valid: false,
      errors: ['SKILL.md not found'],
      warnings: [],
    };
  }
  
  let content: string;
  try {
    content = readFileSync(skillFile, 'utf-8');
  } catch (e) {
    return {
      valid: false,
      errors: [`Failed to read file: ${e}`],
      warnings: [],
    };
  }
  
  // 检查 frontmatter 格式
  if (!content.startsWith('---')) {
    return {
      valid: false,
      errors: ['No YAML frontmatter found'],
      warnings: [],
    };
  }
  
  // 提取 frontmatter
  const match = content.match(/^---\s*\n(.*?)\n---\s*\n/s);
  if (!match) {
    return {
      valid: false,
      errors: ['Invalid frontmatter format'],
      warnings: [],
    };
  }
  
  const frontmatterText = match[1];
  
  // 解析 YAML
  const frontmatter = parseSimpleYaml(frontmatterText);
  
  // 检查允许的属性
  const unknownProps = Object.keys(frontmatter).filter(
    k => !ALLOWED_FRONTMATTER_PROPERTIES.has(k)
  );
  if (unknownProps.length > 0) {
    errors.push(`Unexpected properties: ${unknownProps.join(', ')}`);
  }
  
  // 验证 id (kebab-case identifier)
  const id = frontmatter.id as string | undefined;
  if (!id) {
    errors.push("Missing required field: 'id'");
  } else {
    const idResult = validateName(id);
    errors.push(...idResult.errors);
    warnings.push(...idResult.warnings);
  }
  
  // 验证 name (display name, can be any language)
  const name = frontmatter.name as string | undefined;
  if (!name) {
    errors.push("Missing required field: 'name'");
  }
  
  // 验证 description (optional but recommended)
  const description = frontmatter.description as string | undefined;
  if (description) {
    const descResult = validateDescription(description);
    errors.push(...descResult.errors);
    warnings.push(...descResult.warnings);
  } else {
    warnings.push("Consider adding 'description' field for better skill triggering");
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    frontmatter,
    id,
    name,
  };
}

/**
 * 验证技能名称
 */
export function validateName(name: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (typeof name !== 'string') {
    errors.push(`Name must be a string, got ${typeof name}`);
    return { valid: false, errors, warnings };
  }
  
  const trimmed = name.trim();
  
  if (trimmed.length === 0) {
    errors.push('Name cannot be empty');
    return { valid: false, errors, warnings };
  }
  
  if (trimmed.length > NAME_RULES.maxLength) {
    errors.push(`Name is too long (${trimmed.length} chars, max ${NAME_RULES.maxLength})`);
  }
  
  if (!NAME_RULES.pattern.test(trimmed)) {
    errors.push(`Name must be kebab-case (lowercase letters, digits, hyphens only)`);
  }
  
  if (trimmed.startsWith('-') || trimmed.endsWith('-')) {
    errors.push('Name cannot start or end with hyphen');
  }
  
  if (trimmed.includes('--')) {
    errors.push('Name cannot contain consecutive hyphens');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 验证技能描述
 */
export function validateDescription(description: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (typeof description !== 'string') {
    errors.push(`Description must be a string, got ${typeof description}`);
    return { valid: false, errors, warnings };
  }
  
  const trimmed = description.trim();
  
  if (trimmed.length === 0) {
    errors.push('Description cannot be empty');
    return { valid: false, errors, warnings };
  }
  
  if (trimmed.length > DESCRIPTION_RULES.maxLength) {
    errors.push(`Description is too long (${trimmed.length} chars, max ${DESCRIPTION_RULES.maxLength})`);
  }
  
  if (/<|>/.test(trimmed)) {
    errors.push('Description cannot contain angle brackets (< or >)');
  }
  
  // 警告：描述太短
  if (trimmed.length < 20) {
    warnings.push('Description is very short, consider adding more detail for better triggering');
  }
  
  // 警告：缺少触发条件
  if (!/when|use|trigger|用户|使用/.test(trimmed.toLowerCase())) {
    warnings.push('Consider adding "when to use" information in description for better triggering');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 验证工具列表
 */
export function validateTools(tools: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (tools === undefined) {
    return { valid: true, errors, warnings };
  }
  
  if (!Array.isArray(tools)) {
    errors.push(`Tools must be an array, got ${typeof tools}`);
    return { valid: false, errors, warnings };
  }
  
  for (const tool of tools) {
    if (typeof tool !== 'string') {
      errors.push(`Tool must be a string, got ${typeof tool}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 验证关键词列表
 */
export function validateKeywords(keywords: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (keywords === undefined) {
    return { valid: true, errors, warnings };
  }
  
  if (!Array.isArray(keywords)) {
    errors.push(`Keywords must be an array, got ${typeof keywords}`);
    return { valid: false, errors, warnings };
  }
  
  if (keywords.length === 0) {
    warnings.push('Keywords array is empty, consider adding keywords for better matching');
  }
  
  if (keywords.length > 20) {
    warnings.push('Too many keywords (> 20), may impact matching performance');
  }
  
  for (const kw of keywords) {
    if (typeof kw !== 'string') {
      errors.push(`Keyword must be a string, got ${typeof kw}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 简单 YAML 解析
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  
  let currentKey: string | null = null;
  let currentArray: unknown[] | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    // 数组项
    const arrayMatch = line.match(/^(\s*)-\s+(.+)$/);
    if (arrayMatch) {
      const value = parseValue(arrayMatch[2]);
      if (currentArray !== null) {
        currentArray.push(value);
      }
      continue;
    }
    
    // 键值对
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      currentKey = key;
      
      // 检查下一行是否是数组
      const nextLine = lines[i + 1];
      if (value === '' && nextLine?.match(/^\s*-/)) {
        result[key] = [];
        currentArray = result[key] as unknown[];
      } else {
        result[key] = parseValue(value);
        currentArray = null;
      }
    }
  }
  
  return result;
}

/**
 * 解析值
 */
function parseValue(value: string): unknown {
  const trimmed = value.trim();
  
  // 去除引号
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  
  // 数字
  const num = Number(trimmed);
  if (!isNaN(num)) {
    return num;
  }
  
  // 布尔
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  
  return trimmed;
}

/**
 * 验证并返回技能 ID
 */
export function validateAndGetSkillId(skillFile: string): string | null {
  const result = validateSkillFile(skillFile);
  return result.valid ? result.id ?? null : null;
}