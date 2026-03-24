/**
 * Ralph 模式固化系统
 * 
 * 复利工程的核心：上下文工程改善的是当前会话，复利工程改善的是此后的每一次会话
 * 
 * 固化循环：
 * 1. 计划 (Plan) - 为任务提供上下文
 * 2. 委托 (Delegate) - 委托智能体执行
 * 3. 评估 (Assess) - 评估输出
 * 4. 固化 (Codify) - 固化所学到的东西
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import type { ReplState } from '../core/types.js';
import type { RalphStory, RalphIteration } from './types.js';

/**
 * 成功模式
 */
export interface SuccessPattern {
  /** 模式 ID */
  id: string;
  /** 任务类型 */
  taskType: string;
  /** 任务描述 */
  taskDescription: string;
  /** 成功的步骤 */
  steps: string[];
  /** 使用的技术 */
  technologies: string[];
  /** 遇到的问题及解决方案 */
  problemsSolved: Array<{ problem: string; solution: string }>;
  /** 关键代码片段 */
  codeSnippets: Array<{ description: string; code: string }>;
  /** 创建时间 */
  createdAt: string;
  /** 使用次数 */
  usageCount: number;
}

/**
 * 固化结果
 */
export interface CodifyResult {
  /** 是否固化成功 */
  success: boolean;
  /** 固化到的文件 */
  files: string[];
  /** 模式 ID */
  patternId?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 固化系统配置
 */
export interface CodifyConfig {
  /** 是否启用自动固化 */
  enabled: boolean;
  /** 固化目录 */
  codifyDir: string;
  /** AGENTS.md 路径 */
  agentsMdPath: string;
  /** 最小固化阈值（任务重要性） */
  minImportance: number;
  /** 是否创建技能 */
  createSkill: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CODIFY_CONFIG: CodifyConfig = {
  enabled: true,
  codifyDir: join(homedir(), '.securebot', 'patterns'),
  agentsMdPath: join(homedir(), '.securebot', 'AGENTS.md'),
  minImportance: 3,
  createSkill: true,
};

/**
 * 模式固化器
 */
export class PatternCodifier {
  private config: CodifyConfig;
  private state: ReplState;
  
  constructor(state: ReplState, config: Partial<CodifyConfig> = {}) {
    this.state = state;
    this.config = { ...DEFAULT_CODIFY_CONFIG, ...config };
  }
  
  /**
   * 从成功的迭代中提取并固化模式
   */
  async codifySuccess(
    task: RalphStory,
    iteration: RalphIteration,
    workspace: string
  ): Promise<CodifyResult> {
    if (!this.config.enabled) {
      return { success: false, files: [], error: '固化功能已禁用' };
    }
    
    console.log(chalk.cyan('\n📚 固化成功模式...'));
    
    try {
      // 1. 提取模式
      const pattern = await this.extractPattern(task, iteration, workspace);
      
      if (!pattern) {
        return { success: false, files: [], error: '无法提取模式' };
      }
      
      // 2. 评估是否值得固化
      if (!this.shouldCodify(pattern)) {
        console.log(chalk.gray('  模式重要性不足，跳过固化'));
        return { success: false, files: [], error: '模式重要性不足' };
      }
      
      const files: string[] = [];
      
      // 3. 固化到模式库
      const patternFile = await this.savePattern(pattern);
      if (patternFile) {
        files.push(patternFile);
        console.log(chalk.gray(`  模式已保存: ${patternFile}`));
      }
      
      // 4. 更新 AGENTS.md（如果重要性足够高）
      if (pattern.usageCount >= 4 || this.isHighValuePattern(pattern)) {
        const agentsMdUpdated = await this.updateAgentsMd(pattern);
        if (agentsMdUpdated) {
          files.push(this.config.agentsMdPath);
          console.log(chalk.gray('  AGENTS.md 已更新'));
        }
      }
      
      // 5. 创建技能（如果适用）
      if (this.config.createSkill && this.isSkillWorthy(pattern)) {
        const skillFile = await this.createSkill(pattern);
        if (skillFile) {
          files.push(skillFile);
          console.log(chalk.gray(`  技能已创建: ${skillFile}`));
        }
      }
      
      console.log(chalk.green('✓ 模式固化完成'));
      
      return {
        success: true,
        files,
        patternId: pattern.id,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`固化失败: ${errorMsg}`));
      return { success: false, files: [], error: errorMsg };
    }
  }
  
  /**
   * 从迭代中提取模式
   */
  private async extractPattern(
    task: RalphStory,
    iteration: RalphIteration,
    workspace: string
  ): Promise<SuccessPattern | null> {
    const output = iteration.output || '';
    
    // 提取任务类型
    const taskType = this.classifyTask(task.title);
    
    // 提取技术栈
    const technologies = this.extractTechnologies(output, workspace);
    
    // 提取步骤（从输出中解析）
    const steps = this.extractSteps(output);
    
    // 提取问题及解决方案
    const problemsSolved = this.extractProblemsSolved(output);
    
    // 提取代码片段
    const codeSnippets = this.extractCodeSnippets(output);
    
    // 生成模式 ID
    const id = this.generatePatternId(taskType, technologies);
    
    return {
      id,
      taskType,
      taskDescription: task.title,
      steps,
      technologies,
      problemsSolved,
      codeSnippets,
      createdAt: new Date().toISOString(),
      usageCount: 1,
    };
  }
  
  /**
   * 分类任务类型
   */
  private classifyTask(title: string): string {
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('api') || titleLower.includes('接口')) {
      return 'api-development';
    }
    if (titleLower.includes('test') || titleLower.includes('测试')) {
      return 'testing';
    }
    if (titleLower.includes('ui') || titleLower.includes('界面')) {
      return 'ui-development';
    }
    if (titleLower.includes('database') || titleLower.includes('数据库')) {
      return 'database';
    }
    if (titleLower.includes('auth') || titleLower.includes('登录')) {
      return 'authentication';
    }
    if (titleLower.includes('config') || titleLower.includes('配置')) {
      return 'configuration';
    }
    if (titleLower.includes('refactor') || titleLower.includes('重构')) {
      return 'refactoring';
    }
    
    return 'general';
  }
  
  /**
   * 提取技术栈
   */
  private extractTechnologies(output: string, workspace: string): string[] {
    const technologies: Set<string> = new Set();
    
    // 从输出中提取
    const techPatterns = [
      { pattern: /\b(python|python3)\b/gi, name: 'python' },
      { pattern: /\b(typescript|ts)\b/gi, name: 'typescript' },
      { pattern: /\b(javascript|js)\b/gi, name: 'javascript' },
      { pattern: /\b(react)\b/gi, name: 'react' },
      { pattern: /\b(vue)\b/gi, name: 'vue' },
      { pattern: /\b(node)\b/gi, name: 'nodejs' },
      { pattern: /\b(fastapi)\b/gi, name: 'fastapi' },
      { pattern: /\b(django)\b/gi, name: 'django' },
      { pattern: /\b(flask)\b/gi, name: 'flask' },
      { pattern: /\b(postgres|postgresql)\b/gi, name: 'postgresql' },
      { pattern: /\b(mongodb|mongo)\b/gi, name: 'mongodb' },
      { pattern: /\b(redis)\b/gi, name: 'redis' },
      { pattern: /\b(docker)\b/gi, name: 'docker' },
      { pattern: /\b(kubernetes|k8s)\b/gi, name: 'kubernetes' },
      { pattern: /\b(git)\b/gi, name: 'git' },
      { pattern: /\b(pytest)\b/gi, name: 'pytest' },
      { pattern: /\b(jest)\b/gi, name: 'jest' },
    ];
    
    for (const { pattern, name } of techPatterns) {
      if (pattern.test(output)) {
        technologies.add(name);
      }
    }
    
    // 从 workspace 检测
    if (existsSync(join(workspace, 'package.json'))) {
      technologies.add('nodejs');
      try {
        const pkg = JSON.parse(readFileSync(join(workspace, 'package.json'), 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.react) technologies.add('react');
        if (deps.vue) technologies.add('vue');
        if (deps.typescript) technologies.add('typescript');
        if (deps.jest) technologies.add('jest');
      } catch {
        // 忽略
      }
    }
    
    if (existsSync(join(workspace, 'requirements.txt')) || 
        existsSync(join(workspace, 'pyproject.toml'))) {
      technologies.add('python');
    }
    
    return Array.from(technologies);
  }
  
  /**
   * 从输出中提取步骤
   */
  private extractSteps(output: string): string[] {
    const steps: string[] = [];
    
    // 匹配编号列表
    const numberedPattern = /^\s*(\d+)[.)\]]\s+(.+)$/gm;
    let match = numberedPattern.exec(output);
    while (match !== null) {
      if (match[2]) {
        steps.push(match[2].trim());
      }
      match = numberedPattern.exec(output);
    }
    
    // 匹配 bullet 列表
    if (steps.length === 0) {
      const bulletPattern = /^\s*[-*]\s+(.+)$/gm;
      match = bulletPattern.exec(output);
      while (match !== null) {
        if (match[1]) {
          steps.push(match[1].trim());
        }
        match = bulletPattern.exec(output);
      }
    }
    
    return steps.slice(0, 10); // 最多 10 个步骤
  }
  
  /**
   * 提取问题及解决方案
   */
  private extractProblemsSolved(output: string): Array<{ problem: string; solution: string }> {
    const problemsSolved: Array<{ problem: string; solution: string }> = [];
    
    // 匹配 "问题...解决..." 模式
    const problemPattern = /问题[：:]\s*(.+?)[\n\r]+(?:解决|修复|fix)[：:]\s*(.+?)(?=[\n\r]{2}|$)/gi;
    let match = problemPattern.exec(output);
    while (match !== null) {
      if (match[1] && match[2]) {
        problemsSolved.push({
          problem: match[1].trim(),
          solution: match[2].trim(),
        });
      }
      match = problemPattern.exec(output);
    }
    
    // 匹配 "error...fixed..." 模式
    const errorPattern = /error[：:]\s*(.+?)[\n\r]+fix(?:ed)?[：:]\s*(.+?)(?=[\n\r]{2}|$)/gi;
    match = errorPattern.exec(output);
    while (match !== null) {
      if (match[1] && match[2]) {
        problemsSolved.push({
          problem: match[1].trim(),
          solution: match[2].trim(),
        });
      }
      match = errorPattern.exec(output);
    }
    
    return problemsSolved.slice(0, 5);
  }
  
  /**
   * 提取代码片段
   */
  private extractCodeSnippets(output: string): Array<{ description: string; code: string }> {
    const snippets: Array<{ description: string; code: string }> = [];
    
    // 匹配代码块
    const codeBlockPattern = /```(\w*)\n([\s\S]*?)```/g;
    let match = codeBlockPattern.exec(output);
    while (match !== null) {
      if (match[2]) {
        const code = match[2].trim();
        if (code.length > 20 && code.length < 1000) {
          // 尝试找到描述
          const beforeCode = output.slice(Math.max(0, match.index - 100), match.index);
          const descMatch = beforeCode.match(/[^\n]*$/);
          const description = descMatch?.[0]?.trim() ?? '代码片段';
          
          snippets.push({ description, code });
        }
      }
      match = codeBlockPattern.exec(output);
    }
    
    return snippets.slice(0, 3);
  }
  
  /**
   * 生成模式 ID
   */
  private generatePatternId(taskType: string, technologies: string[]): string {
    const techStr = technologies.slice(0, 3).join('-');
    const timestamp = Date.now().toString(36);
    return `${taskType}-${techStr}-${timestamp}`;
  }
  
  /**
   * 判断是否应该固化
   */
  private shouldCodify(pattern: SuccessPattern): boolean {
    // 至少要有步骤或问题解决方案
    if (pattern.steps.length === 0 && pattern.problemsSolved.length === 0) {
      return false;
    }
    
    // 至少要有一个技术
    if (pattern.technologies.length === 0) {
      return false;
    }
    
    return true;
  }
  
  /**
   * 判断是否是高价值模式
   */
  private isHighValuePattern(pattern: SuccessPattern): boolean {
    // 有问题解决方案
    if (pattern.problemsSolved.length > 0) {
      return true;
    }
    
    // 有代码片段
    if (pattern.codeSnippets.length > 0) {
      return true;
    }
    
    // 步骤数量多
    if (pattern.steps.length >= 5) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 判断是否值得创建技能
   */
  private isSkillWorthy(pattern: SuccessPattern): boolean {
    // 必须是高价值模式
    if (!this.isHighValuePattern(pattern)) {
      return false;
    }
    
    // 必须有明确的任务类型
    if (pattern.taskType === 'general') {
      return false;
    }
    
    // 必须有代码片段
    if (pattern.codeSnippets.length === 0) {
      return false;
    }
    
    return true;
  }
  
  /**
   * 保存模式到模式库
   */
  private async savePattern(pattern: SuccessPattern): Promise<string | null> {
    try {
      // 确保目录存在
      if (!existsSync(this.config.codifyDir)) {
        mkdirSync(this.config.codifyDir, { recursive: true });
      }
      
      const filePath = join(this.config.codifyDir, `${pattern.id}.json`);
      writeFileSync(filePath, JSON.stringify(pattern, null, 2), 'utf-8');
      
      return filePath;
    } catch (error) {
      console.log(chalk.yellow(`保存模式失败: ${error}`));
      return null;
    }
  }
  
  /**
   * 更新 AGENTS.md
   */
  private async updateAgentsMd(pattern: SuccessPattern): Promise<boolean> {
    try {
      const agentsMdPath = this.config.agentsMdPath;
      
      // 读取现有内容
      let content = '';
      if (existsSync(agentsMdPath)) {
        content = readFileSync(agentsMdPath, 'utf-8');
      }
      
      // 检查是否已有相同模式
      if (content.includes(pattern.taskType)) {
        // 更新现有部分
        return this.updateExistingSection(content, pattern, agentsMdPath);
      }
      
      // 添加新模式部分
      const newSection = this.generateAgentsMdSection(pattern);
      
      // 找到合适的位置插入（在 "最佳实践" 或 "工作原则" 部分之前）
      const insertBefore = content.match(/##\s+(最佳实践|工作原则|Best Practices)/);
      
      if (insertBefore) {
        const insertPos = content.indexOf(insertBefore[0]);
        content = content.slice(0, insertPos) + newSection + '\n' + content.slice(insertPos);
      } else {
        // 追加到末尾
        content += '\n' + newSection;
      }
      
      writeFileSync(agentsMdPath, content, 'utf-8');
      return true;
    } catch (error) {
      console.log(chalk.yellow(`更新 AGENTS.md 失败: ${error}`));
      return false;
    }
  }
  
  /**
   * 更新现有部分
   */
  private updateExistingSection(
    _content: string,
    pattern: SuccessPattern,
    filePath: string
  ): boolean {
    // 简单实现：追加到文件末尾
    const addition = `
### ${pattern.taskDescription}
技术栈: ${pattern.technologies.join(', ')}

步骤:
${pattern.steps.map(s => `- ${s}`).join('\n')}

${pattern.problemsSolved.length > 0 ? `
常见问题:
${pattern.problemsSolved.map(p => `- 问题: ${p.problem}\n  解决: ${p.solution}`).join('\n')}
` : ''}
`;
    
    appendFileSync(filePath, addition, 'utf-8');
    return true;
  }
  
  /**
   * 生成 AGENTS.md 部分
   */
  private generateAgentsMdSection(pattern: SuccessPattern): string {
    const lines: string[] = [];
    
    lines.push(`## ${this.getTaskTypeLabel(pattern.taskType)}`);
    lines.push('');
    lines.push(`**示例任务**: ${pattern.taskDescription}`);
    lines.push('');
    
    if (pattern.technologies.length > 0) {
      lines.push(`**技术栈**: ${pattern.technologies.join(', ')}`);
      lines.push('');
    }
    
    if (pattern.steps.length > 0) {
      lines.push('**标准步骤**:');
      for (const step of pattern.steps) {
        lines.push(`1. ${step}`);
      }
      lines.push('');
    }
    
    if (pattern.problemsSolved.length > 0) {
      lines.push('**常见问题及解决方案**:');
      for (const { problem, solution } of pattern.problemsSolved) {
        lines.push(`- 问题: ${problem}`);
        lines.push(`  解决: ${solution}`);
      }
      lines.push('');
    }
    
    return lines.join('\n');
  }
  
  /**
   * 获取任务类型标签
   */
  private getTaskTypeLabel(taskType: string): string {
    const labels: Record<string, string> = {
      'api-development': 'API 开发',
      'testing': '测试',
      'ui-development': 'UI 开发',
      'database': '数据库操作',
      'authentication': '认证授权',
      'configuration': '配置管理',
      'refactoring': '代码重构',
      'general': '通用任务',
    };
    
    return labels[taskType] || taskType;
  }
  
  /**
   * 创建技能
   */
  private async createSkill(pattern: SuccessPattern): Promise<string | null> {
    try {
      const agent = this.state.agents.get(this.state.currentAgentId);
      if (!agent) {
        return null;
      }
      
      const skillsDir = join(homedir(), '.securebot', 'agents', agent.id, 'skills');
      
      if (!existsSync(skillsDir)) {
        mkdirSync(skillsDir, { recursive: true });
      }
      
      const skillId = `${pattern.taskType}-helper`;
      const skillPath = join(skillsDir, `${skillId}.json`);
      
      const skill = {
        id: skillId,
        name: this.getTaskTypeLabel(pattern.taskType),
        description: `帮助完成${this.getTaskTypeLabel(pattern.taskType)}相关任务`,
        keywords: [pattern.taskType, ...pattern.technologies],
        systemPrompt: this.generateSkillPrompt(pattern),
        tools: ['read', 'write', 'edit', 'exec'],
        isPublic: false,
        agentId: agent.id,
        createdAt: new Date().toISOString(),
        patternId: pattern.id,
      };
      
      writeFileSync(skillPath, JSON.stringify(skill, null, 2), 'utf-8');
      
      return skillPath;
    } catch (error) {
      console.log(chalk.yellow(`创建技能失败: ${error}`));
      return null;
    }
  }
  
  /**
   * 生成技能提示词
   */
  private generateSkillPrompt(pattern: SuccessPattern): string {
    const lines: string[] = [];
    
    lines.push(`你是${this.getTaskTypeLabel(pattern.taskType)}专家。`);
    lines.push('');
    lines.push('## 标准流程');
    lines.push('');
    
    for (const step of pattern.steps) {
      lines.push(`- ${step}`);
    }
    
    if (pattern.problemsSolved.length > 0) {
      lines.push('');
      lines.push('## 常见问题');
      lines.push('');
      
      for (const { problem, solution } of pattern.problemsSolved) {
        lines.push(`**问题**: ${problem}`);
        lines.push(`**解决**: ${solution}`);
        lines.push('');
      }
    }
    
    return lines.join('\n');
  }
}