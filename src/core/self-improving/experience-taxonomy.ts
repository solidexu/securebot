/**
 * 经验分类体系
 * 
 * 层次化组织经验，提高检索效率
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SuccessPattern, TaskType } from './types.js';
import { writeJsonAtomic } from './atomic-write.js';

// ============ 类型定义 ============

/**
 * 经验分类
 */
export interface ExperienceCategory {
  id: string;
  name: string;
  description: string;
  parent?: string;
  children?: string[];
  tags: string[];
  count: number;
}

/**
 * 分类维度
 */
export type ClassificationDimension = 
  | 'taskType'
  | 'domain'
  | 'difficulty'
  | 'effectiveness'
  | 'recency';

/**
 * 分类规则
 */
export interface ClassificationRule {
  dimension: ClassificationDimension;
  condition: (pattern: SuccessPattern) => boolean;
  category: string;
}

/**
 * 分类结果
 */
export interface ClassificationResult {
  patternId: string;
  categories: string[];
  primaryCategory: string;
  tags: string[];
}

/**
 * 分类树节点
 */
export interface CategoryTreeNode {
  category: ExperienceCategory;
  patterns: SuccessPattern[];
  children: CategoryTreeNode[];
}

/**
 * 分类体系配置
 */
export interface TaxonomyConfig {
  storageDir: string;
  autoClassify: boolean;
}

// ============ 默认分类体系 ============

/**
 * 默认分类
 */
const DEFAULT_CATEGORIES: ExperienceCategory[] = [
  // 按任务类型分类
  { id: 'coding', name: '代码开发', description: '代码编写、实现相关', tags: ['code', 'implement', 'develop'], count: 0 },
  { id: 'coding.python', name: 'Python 开发', description: 'Python 相关开发', parent: 'coding', tags: ['python', 'py'], count: 0 },
  { id: 'coding.javascript', name: 'JavaScript 开发', description: 'JavaScript/TypeScript 相关', parent: 'coding', tags: ['javascript', 'js', 'ts', 'node'], count: 0 },
  { id: 'coding.go', name: 'Go 开发', description: 'Go 语言相关', parent: 'coding', tags: ['go', 'golang'], count: 0 },
  { id: 'coding.rust', name: 'Rust 开发', description: 'Rust 语言相关', parent: 'coding', tags: ['rust', 'cargo'], count: 0 },
  
  { id: 'debugging', name: '调试修复', description: 'Bug 修复、问题排查', tags: ['debug', 'fix', 'bug'], count: 0 },
  { id: 'debugging.error', name: '错误修复', description: '运行时错误修复', parent: 'debugging', tags: ['error', 'exception'], count: 0 },
  { id: 'debugging.performance', name: '性能优化', description: '性能问题排查', parent: 'debugging', tags: ['performance', 'slow'], count: 0 },
  
  { id: 'testing', name: '测试', description: '测试相关', tags: ['test', 'spec'], count: 0 },
  { id: 'testing.unit', name: '单元测试', description: '单元测试编写', parent: 'testing', tags: ['unit-test', 'unittest'], count: 0 },
  { id: 'testing.integration', name: '集成测试', description: '集成测试相关', parent: 'testing', tags: ['integration', 'e2e'], count: 0 },
  
  { id: 'deployment', name: '部署运维', description: '部署、配置相关', tags: ['deploy', 'config', 'ops'], count: 0 },
  { id: 'deployment.docker', name: 'Docker 部署', description: '容器化部署', parent: 'deployment', tags: ['docker', 'container'], count: 0 },
  { id: 'deployment.k8s', name: 'Kubernetes', description: 'K8s 相关', parent: 'deployment', tags: ['k8s', 'kubernetes'], count: 0 },
  
  { id: 'documentation', name: '文档编写', description: '文档相关', tags: ['doc', 'readme', 'documentation'], count: 0 },
  
  { id: 'analysis', name: '分析研究', description: '数据分析、研究', tags: ['analysis', 'research'], count: 0 },
  
  // 按效果分类
  { id: 'best-practices', name: '最佳实践', description: '经过验证的优秀实践', tags: ['best-practice', 'proven'], count: 0 },
  { id: 'lessons-learned', name: '经验教训', description: '从失败中学到的教训', tags: ['lesson', 'learned'], count: 0 },
  
  // 按领域分类
  { id: 'web', name: 'Web 开发', description: 'Web 前后端', tags: ['web', 'http', 'api'], count: 0 },
  { id: 'data', name: '数据处理', description: '数据分析、处理', tags: ['data', 'etl', 'pipeline'], count: 0 },
  { id: 'ai', name: 'AI/ML', description: '人工智能相关', tags: ['ai', 'ml', 'machine-learning'], count: 0 },
  { id: 'database', name: '数据库', description: '数据库相关', tags: ['database', 'sql', 'nosql'], count: 0 },
];

// ============ 默认配置 ============

const DEFAULT_CONFIG: TaxonomyConfig = {
  storageDir: join(homedir(), '.securebot', 'self-improving', 'taxonomy'),
  autoClassify: true,
};

// ============ 经验分类体系 ============

/**
 * 经验分类体系管理器
 */
export class ExperienceTaxonomy {
  private config: TaxonomyConfig;
  private categories: Map<string, ExperienceCategory> = new Map();
  private patternCategories: Map<string, string[]> = new Map();
  private initialized: boolean = false;

  constructor(config?: Partial<TaxonomyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initDefaultCategories();
  }

  /**
   * 初始化默认分类
   */
  private initDefaultCategories(): void {
    for (const cat of DEFAULT_CATEGORIES) {
      this.categories.set(cat.id, { ...cat });
    }
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!existsSync(this.config.storageDir)) {
      mkdirSync(this.config.storageDir, { recursive: true });
    }

    await this.load();
    this.initialized = true;
  }

  /**
   * 加载已保存的分类
   */
  private async load(): Promise<void> {
    const indexFile = join(this.config.storageDir, 'index.json');
    if (existsSync(indexFile)) {
      try {
        const content = readFileSync(indexFile, 'utf-8');
        const data = JSON.parse(content) as {
          categories: ExperienceCategory[];
          patternCategories: [string, string[]][];
        };
        
        for (const cat of data.categories) {
          this.categories.set(cat.id, cat);
        }
        
        this.patternCategories = new Map(data.patternCategories);
      } catch {
        // 忽略错误
      }
    }
  }

  /**
   * 保存分类
   */
  private async save(): Promise<void> {
    const indexFile = join(this.config.storageDir, 'index.json');
    const data = {
      categories: Array.from(this.categories.values()),
      patternCategories: Array.from(this.patternCategories.entries()),
    };
    writeJsonAtomic(indexFile, data);
  }

  /**
   * 对经验进行分类
   */
  async classify(pattern: SuccessPattern): Promise<ClassificationResult> {
    await this.initialize();

    const categories: string[] = [];
    const tags: string[] = [...pattern.keywords];

    // 按任务类型分类
    const taskTypeCategory = this.mapTaskTypeToCategory(pattern.taskType);
    if (taskTypeCategory) {
      categories.push(taskTypeCategory);
    }

    // 按关键词匹配分类
    for (const [catId, cat] of this.categories) {
      if (cat.tags.some(tag => 
        pattern.keywords.some(kw => kw.toLowerCase().includes(tag.toLowerCase())) ||
        pattern.taskDescription.toLowerCase().includes(tag.toLowerCase()) ||
        pattern.approach.toLowerCase().includes(tag.toLowerCase())
      )) {
        if (!categories.includes(catId)) {
          categories.push(catId);
        }
      }
    }

    // 按效果分类
    if (pattern.effectiveness >= 0.8) {
      categories.push('best-practices');
    }

    // 确定主分类
    const primaryCategory = this.determinePrimaryCategory(categories);

    // 更新分类计数
    for (const catId of categories) {
      const cat = this.categories.get(catId);
      if (cat) {
        cat.count++;
      }
    }

    // 记录模式的分类
    this.patternCategories.set(pattern.id, categories);

    // 提取额外标签
    const extractedTags = this.extractTags(pattern);
    tags.push(...extractedTags);

    await this.save();

    return {
      patternId: pattern.id,
      categories,
      primaryCategory,
      tags: [...new Set(tags)],
    };
  }

  /**
   * 任务类型到分类的映射
   */
  private mapTaskTypeToCategory(taskType: TaskType): string | null {
    const mapping: Record<TaskType, string> = {
      coding: 'coding',
      analysis: 'analysis',
      writing: 'documentation',
      planning: 'analysis',
      execution: 'deployment',
      debugging: 'debugging',
      learning: 'analysis',
      general: 'analysis',
    };
    return mapping[taskType] || null;
  }

  /**
   * 确定主分类
   */
  private determinePrimaryCategory(categories: string[]): string {
    // 优先选择叶子节点
    const leafCategories = categories.filter(catId => {
      const cat = this.categories.get(catId);
      return cat && !cat.children?.length;
    });

    if (leafCategories.length > 0) {
      return leafCategories[0]!;
    }

    return categories[0] || 'general';
  }

  /**
   * 提取标签
   */
  private extractTags(pattern: SuccessPattern): string[] {
    const tags: string[] = [];
    const content = `${pattern.taskDescription} ${pattern.approach}`.toLowerCase();

    // 技术标签
    const techPatterns: [RegExp, string][] = [
      [/python|pip|uv|django|flask|fastapi/, 'python'],
      [/javascript|typescript|node|npm|react|vue/, 'javascript'],
      [/docker|container|镜像|容器/, 'docker'],
      [/git|commit|branch|merge/, 'git'],
      [/api|rest|graphql/, 'api'],
      [/database|sql|mysql|postgres|mongodb/, 'database'],
      [/test|测试|jest|pytest/, 'testing'],
      [/api|endpoint|route/, 'web'],
    ];

    for (const [pattern_re, tag] of techPatterns) {
      if (pattern_re.test(content)) {
        tags.push(tag);
      }
    }

    return tags;
  }

  /**
   * 按分类检索经验
   */
  async getPatternsByCategory(categoryId: string): Promise<string[]> {
    await this.initialize();

    const patternIds: string[] = [];

    // 匹配该分类及其子分类
    const categoriesToMatch = this.getCategoryAndDescendants(categoryId);

    for (const [patternId, cats] of this.patternCategories) {
      if (cats.some(c => categoriesToMatch.includes(c))) {
        patternIds.push(patternId);
      }
    }

    return patternIds;
  }

  /**
   * 获取分类及其所有子分类
   */
  private getCategoryAndDescendants(categoryId: string): string[] {
    const result = [categoryId];

    for (const [id, cat] of this.categories) {
      if (cat.parent === categoryId) {
        result.push(...this.getCategoryAndDescendants(id));
      }
    }

    return result;
  }

  /**
   * 获取分类树
   */
  async getCategoryTree(): Promise<CategoryTreeNode[]> {
    await this.initialize();

    const roots = Array.from(this.categories.values())
      .filter(cat => !cat.parent);

    return roots.map(root => this.buildTreeNode(root));
  }

  /**
   * 构建树节点
   */
  private buildTreeNode(category: ExperienceCategory): CategoryTreeNode {
    const children = Array.from(this.categories.values())
      .filter(cat => cat.parent === category.id)
      .map(child => this.buildTreeNode(child));

    const patternIds = Array.from(this.patternCategories.entries())
      .filter(([_, cats]) => cats.includes(category.id))
      .map(([id]) => id);

    return {
      category,
      patterns: [], // 实际模式需要从外部加载
      children,
    };
  }

  /**
   * 添加自定义分类
   */
  async addCategory(category: ExperienceCategory): Promise<void> {
    await this.initialize();

    this.categories.set(category.id, category);

    if (category.parent) {
      const parent = this.categories.get(category.parent);
      if (parent) {
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(category.id);
      }
    }

    await this.save();
  }

  /**
   * 获取所有分类
   */
  getAllCategories(): ExperienceCategory[] {
    return Array.from(this.categories.values());
  }

  /**
   * 搜索分类
   */
  searchCategories(query: string): ExperienceCategory[] {
    const lowerQuery = query.toLowerCase();

    return Array.from(this.categories.values())
      .filter(cat => 
        cat.name.toLowerCase().includes(lowerQuery) ||
        cat.description.toLowerCase().includes(lowerQuery) ||
        cat.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      );
  }

  /**
   * 获取推荐的分类
   */
  getRecommendedCategories(pattern: SuccessPattern): string[] {
    const recommendations: string[] = [];

    // 基于任务类型
    const taskCat = this.mapTaskTypeToCategory(pattern.taskType);
    if (taskCat) recommendations.push(taskCat);

    // 基于效果
    if (pattern.effectiveness >= 0.8) {
      recommendations.push('best-practices');
    }

    // 基于关键词
    for (const [catId, cat] of this.categories) {
      if (cat.tags.some(tag => 
        pattern.keywords.some(kw => kw.toLowerCase().includes(tag.toLowerCase()))
      )) {
        if (!recommendations.includes(catId)) {
          recommendations.push(catId);
        }
      }
    }

    return recommendations;
  }
}

// ============ 全局实例 ============

let globalTaxonomy: ExperienceTaxonomy | null = null;

/**
 * 获取经验分类体系
 */
export function getExperienceTaxonomy(config?: Partial<TaxonomyConfig>): ExperienceTaxonomy {
  if (!globalTaxonomy) {
    globalTaxonomy = new ExperienceTaxonomy(config);
  }
  return globalTaxonomy;
}

/**
 * 重置分类体系
 */
export function resetExperienceTaxonomy(): void {
  globalTaxonomy = null;
}