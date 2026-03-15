/**
 * CLI 增强模块
 * 
 * 提供 Markdown 渲染、代码高亮、进度条等功能
 */

import chalk from 'chalk';

// ============ 类型定义 ============

/**
 * 进度条配置
 */
export interface ProgressBarConfig {
  /** 总宽度（字符） */
  width: number;
  /** 完成字符 */
  completeChar: string;
  /** 未完成字符 */
  incompleteChar: string;
  /** 是否显示百分比 */
  showPercentage: boolean;
  /** 是否显示计数 */
  showCount: boolean;
  /** 前缀 */
  prefix?: string;
  /** 后缀 */
  suffix?: string;
}

/**
 * 表格列配置
 */
export interface TableColumn {
  /** 列标题 */
  header: string;
  /** 列宽度 */
  width?: number;
  /** 对齐方式 */
  align?: 'left' | 'center' | 'right';
  /** 格式化函数 */
  format?: (value: unknown) => string;
}

/**
 * 代码主题
 */
export type CodeTheme = 'dark' | 'light' | 'mono';

// ============ Markdown 渲染器 ============

/**
 * 简单的 Markdown 渲染器
 */
export class MarkdownRenderer {
  private theme: CodeTheme;

  constructor(theme: CodeTheme = 'dark') {
    this.theme = theme;
  }

  /**
   * 渲染 Markdown
   */
  render(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];

    let inCodeBlock = false;
    let codeLang = '';
    let codeContent: string[] = [];

    for (const line of lines) {
      // 代码块开始/结束
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLang = line.slice(3).trim();
          codeContent = [];
        } else {
          inCodeBlock = false;
          result.push(this.renderCodeBlock(codeContent.join('\n'), codeLang));
          result.push('');
        }
        continue;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }

      // 标题
      if (line.startsWith('### ')) {
        result.push(chalk.cyan.bold(line.slice(4)));
        continue;
      }
      if (line.startsWith('## ')) {
        result.push(chalk.yellow.bold(line.slice(3)));
        continue;
      }
      if (line.startsWith('# ')) {
        result.push(chalk.green.bold(line.slice(2)));
        continue;
      }

      // 列表
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const rendered = this.renderInline(line.slice(2));
        result.push(chalk.gray('• ') + rendered);
        continue;
      }

      // 有序列表
      const orderedMatch = line.match(/^(\d+)\.\s+(.+)/);
      if (orderedMatch) {
        const rendered = this.renderInline(orderedMatch[2] ?? '');
        result.push(chalk.gray(`${orderedMatch[1]}. `) + rendered);
        continue;
      }

      // 引用
      if (line.startsWith('> ')) {
        const rendered = this.renderInline(line.slice(2));
        result.push(chalk.gray('│ ') + chalk.italic(rendered));
        continue;
      }

      // 分隔线
      if (line.match(/^-{3,}$/) || line.match(/^\*{3,}$/)) {
        result.push(chalk.gray('─'.repeat(40)));
        continue;
      }

      // 普通文本
      result.push(this.renderInline(line));
    }

    return result.join('\n');
  }

  /**
   * 渲染行内元素
   */
  private renderInline(text: string): string {
    // 粗体
    text = text.replace(/\*\*(.+?)\*\*/g, (_, p1) => chalk.bold(p1));
    
    // 斜体
    text = text.replace(/\*(.+?)\*/g, (_, p1) => chalk.italic(p1));
    
    // 行内代码
    text = text.replace(/`(.+?)`/g, (_, p1) => {
      return this.theme === 'mono' ? p1 : chalk.cyan(p1);
    });
    
    // 链接
    text = text.replace(/\[(.+?)\]\((.+?)\)/g, (_, text, url) => {
      return `${chalk.blue.underline(text)} ${chalk.gray(`(${url})`)}`;
    });

    return text;
  }

  /**
   * 渲染代码块
   */
  private renderCodeBlock(code: string, lang: string): string {
    const lines = code.split('\n');
    const lineNums = lines.map((_, i) => String(i + 1).padStart(3, ' ')).join('\n');
    
    const header = lang ? chalk.gray(`─ ${lang} `) : chalk.gray('─ ');
    
    return [
      header,
      chalk.gray('│ ') + lines.join('\n' + chalk.gray('│ ')),
      chalk.gray('─'),
    ].join('\n');
  }
}

// ============ 代码高亮器 ============

/**
 * 简单的代码高亮器
 */
export class CodeHighlighter {
  private theme: CodeTheme;

  constructor(theme: CodeTheme = 'dark') {
    this.theme = theme;
  }

  /**
   * 高亮代码
   */
  highlight(code: string, lang?: string): string {
    const lines = code.split('\n');
    return lines.map((line, i) => {
      const lineNum = chalk.gray(String(i + 1).padStart(4, ' ') + ' │ ');
      return lineNum + this.highlightLine(line, lang);
    }).join('\n');
  }

  /**
   * 高亮单行
   */
  private highlightLine(line: string, lang?: string): string {
    if (this.theme === 'mono') {
      return line;
    }

    // 关键字
    const keywords = ['const', 'let', 'var', 'function', 'class', 'interface', 'type',
      'import', 'export', 'from', 'return', 'if', 'else', 'for', 'while', 'switch',
      'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new',
      'async', 'await', 'yield', 'static', 'public', 'private', 'protected',
      'extends', 'implements', 'readonly', 'abstract', 'enum', 'namespace'];
    
    // 字符串
    line = line.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, m => chalk.green(m));
    
    // 数字
    line = line.replace(/\b(\d+\.?\d*)\b/g, m => chalk.yellow(m));
    
    // 注释
    line = line.replace(/(\/\/.*$)/gm, m => chalk.gray(m));
    line = line.replace(/(\/\*[\s\S]*?\*\/)/g, m => chalk.gray(m));
    
    // 关键字
    for (const kw of keywords) {
      const regex = new RegExp(`\\b(${kw})\\b`, 'g');
      line = line.replace(regex, chalk.cyan(kw));
    }
    
    // 函数名
    line = line.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, m => chalk.blue(m));
    
    return line;
  }
}

// ============ 进度条 ============

/**
 * 终端进度条
 */
export class ProgressBar {
  private config: ProgressBarConfig;
  private current: number = 0;
  private total: number;
  private startTime: number = 0;

  constructor(total: number, config: Partial<ProgressBarConfig> = {}) {
    this.total = total;
    this.config = {
      width: 30,
      completeChar: '█',
      incompleteChar: '░',
      showPercentage: true,
      showCount: true,
      ...config,
    };
  }

  /**
   * 开始
   */
  start(): void {
    this.current = 0;
    this.startTime = Date.now();
    this.render();
  }

  /**
   * 更新进度
   */
  update(current: number): void {
    this.current = Math.min(current, this.total);
    this.render();
  }

  /**
   * 增加
   */
  increment(): void {
    this.update(this.current + 1);
  }

  /**
   * 完成
   */
  complete(): void {
    this.current = this.total;
    this.render();
    process.stdout.write('\n');
  }

  /**
   * 渲染
   */
  private render(): void {
    const percent = this.total > 0 ? this.current / this.total : 0;
    const complete = Math.floor(percent * this.config.width);
    const incomplete = this.config.width - complete;

    const bar = chalk.green(this.config.completeChar.repeat(complete)) +
                chalk.gray(this.config.incompleteChar.repeat(incomplete));

    const parts: string[] = [];

    if (this.config.prefix) {
      parts.push(chalk.gray(this.config.prefix));
    }

    parts.push(bar);

    if (this.config.showPercentage) {
      parts.push(chalk.white(` ${Math.round(percent * 100)}%`));
    }

    if (this.config.showCount) {
      parts.push(chalk.gray(` (${this.current}/${this.total})`));
    }

    if (this.config.suffix) {
      parts.push(chalk.gray(` ${this.config.suffix}`));
    }

    // 计算速度
    if (this.startTime > 0 && this.current > 0) {
      const elapsed = (Date.now() - this.startTime) / 1000;
      const speed = this.current / elapsed;
      parts.push(chalk.gray(` ${speed.toFixed(1)}/s`));
    }

    process.stdout.write('\r' + parts.join(''));
  }
}

// ============ 表格渲染器 ============

/**
 * 终端表格
 */
export class TableRenderer {
  /**
   * 渲染表格
   */
  static render(
    data: Record<string, unknown>[],
    columns: TableColumn[]
  ): string {
    if (data.length === 0) {
      return chalk.gray('(空表格)');
    }

    // 计算列宽
    const widths = columns.map(col => {
      const headerWidth = col.header.length;
      const dataWidth = Math.max(
        ...data.map(row => {
          const value = row[col.header];
          const formatted = col.format ? col.format(value) : String(value ?? '');
          return formatted.length;
        })
      );
      return Math.max(headerWidth, dataWidth, col.width ?? 0);
    });

    // 渲染表头
    const header = columns.map((col, i) => {
      const text = col.header.padEnd(widths[i]!);
      return chalk.bold(text);
    }).join(' │ ');

    const separator = widths.map(w => '─'.repeat(w)).join('─┼─');

    // 渲染数据行
    const rows = data.map(row => {
      return columns.map((col, i) => {
        const value = row[col.header];
        const formatted = col.format ? col.format(value) : String(value ?? '');
        const padded = formatted.padEnd(widths[i]!);
        
        // 对齐
        if (col.align === 'right') {
          return formatted.padStart(widths[i]!);
        } else if (col.align === 'center') {
          const left = Math.floor((widths[i]! - formatted.length) / 2);
          return ' '.repeat(left) + formatted + ' '.repeat(widths[i]! - formatted.length - left);
        }
        return padded;
      }).join(' │ ');
    });

    return [
      header,
      chalk.gray(separator),
      ...rows,
    ].join('\n');
  }
}

// ============ Spinner ============

/**
 * 终端 Spinner
 */
export class Spinner {
  private frames: string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private current: number = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private text: string;
  private running: boolean = false;

  constructor(text: string = '') {
    this.text = text;
  }

  /**
   * 开始
   */
  start(text?: string): void {
    if (text) this.text = text;
    this.running = true;
    this.interval = setInterval(() => {
      const frame = chalk.cyan(this.frames[this.current]);
      process.stdout.write(`\r${frame} ${this.text}`);
      this.current = (this.current + 1) % this.frames.length;
    }, 80);
  }

  /**
   * 更新文本
   */
  update(text: string): void {
    this.text = text;
  }

  /**
   * 成功
   */
  succeed(text?: string): void {
    this.stop();
    process.stdout.write(`\r${chalk.green('✓')} ${text ?? this.text}\n`);
  }

  /**
   * 失败
   */
  fail(text?: string): void {
    this.stop();
    process.stdout.write(`\r${chalk.red('✗')} ${text ?? this.text}\n`);
  }

  /**
   * 警告
   */
  warn(text?: string): void {
    this.stop();
    process.stdout.write(`\r${chalk.yellow('⚠')} ${text ?? this.text}\n`);
  }

  /**
   * 停止
   */
  stop(): void {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.write('\r' + ' '.repeat(this.text.length + 10) + '\r');
  }
}

// ============ 工具函数 ============

/**
 * 清除终端
 */
export function clearTerminal(): void {
  process.stdout.write('\x1b[2J\x1b[0f');
}

/**
 * 打印分隔线
 */
export function printSeparator(char: string = '─', width: number = 50): void {
  console.log(chalk.gray(char.repeat(width)));
}

/**
 * 打印标题
 */
export function printTitle(title: string, char: string = '═'): void {
  const width = Math.max(title.length + 4, 40);
  const padding = Math.floor((width - title.length) / 2);
  
  console.log();
  console.log(chalk.cyan(char.repeat(width)));
  console.log(chalk.cyan(char) + ' '.repeat(padding) + chalk.bold(title) + ' '.repeat(width - padding - title.length - 1) + chalk.cyan(char));
  console.log(chalk.cyan(char.repeat(width)));
  console.log();
}

/**
 * 打印卡片
 */
export function printCard(title: string, content: string): void {
  const lines = content.split('\n');
  const maxWidth = Math.max(title.length, ...lines.map(l => l.length)) + 4;
  
  console.log();
  console.log(chalk.cyan('┌' + '─'.repeat(maxWidth) + '┐'));
  console.log(chalk.cyan('│') + ' ' + chalk.bold(title).padEnd(maxWidth - 1) + chalk.cyan('│'));
  console.log(chalk.cyan('├' + '─'.repeat(maxWidth) + '┤'));
  
  for (const line of lines) {
    console.log(chalk.cyan('│') + ' ' + line.padEnd(maxWidth - 1) + chalk.cyan('│'));
  }
  
  console.log(chalk.cyan('└' + '─'.repeat(maxWidth) + '┘'));
}