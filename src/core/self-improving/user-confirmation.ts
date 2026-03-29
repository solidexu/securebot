/**
 * 用户确认管理器
 * 
 * 在自动生成技能前询问用户确认
 */

import chalk from 'chalk';

// ============ 类型定义 ============

/**
 * 确认请求类型
 */
export type ConfirmationType = 
  | 'skill_generation'
  | 'skill_merge'
  | 'skill_retire'
  | 'experience_save';

/**
 * 确认请求
 */
export interface ConfirmationRequest {
  type: ConfirmationType;
  title: string;
  description: string;
  details: Record<string, unknown>;
  defaultChoice?: 'yes' | 'no';
}

/**
 * 确认结果
 */
export interface ConfirmationResult {
  confirmed: boolean;
  remember?: boolean;
}

/**
 * 确认管理器配置
 */
export interface ConfirmationManagerConfig {
  autoConfirmThreshold: number;
  rememberDecisions: boolean;
  silentMode: boolean;
}

/**
 * 用户偏好记录
 */
interface UserPreference {
  type: ConfirmationType;
  pattern: string;
  alwaysConfirm: boolean;
  alwaysReject: boolean;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: ConfirmationManagerConfig = {
  autoConfirmThreshold: 0.9,
  rememberDecisions: true,
  silentMode: false,
};

// ============ 用户确认管理器 ============

/**
 * 用户确认管理器
 */
export class UserConfirmationManager {
  private config: ConfirmationManagerConfig;
  private preferences: Map<string, UserPreference> = new Map();
  private rl: import('node:readline/promises').Interface | null = null;

  constructor(config?: Partial<ConfirmationManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 设置 readline 接口
   */
  setReadlineInterface(rl: import('node:readline/promises').Interface): void {
    this.rl = rl;
  }

  /**
   * 请求用户确认
   */
  async requestConfirmation(request: ConfirmationRequest): Promise<ConfirmationResult> {
    const preference = this.findPreference(request);

    if (preference?.alwaysConfirm) {
      return { confirmed: true };
    }

    if (preference?.alwaysReject) {
      return { confirmed: false };
    }

    if (this.config.silentMode) {
      return { confirmed: request.defaultChoice !== 'no' };
    }

    if (!this.rl) {
      return { confirmed: request.defaultChoice !== 'no' };
    }

    this.displayRequest(request);

    const answer = await this.rl.question(
      chalk.cyan('确认执行？[y/n/always/never]: ')
    );

    const normalized = answer.toLowerCase().trim();

    switch (normalized) {
      case 'always':
      case 'a':
        this.savePreference(request, 'always');
        return { confirmed: true, remember: true };

      case 'never':
      case 'n':
        this.savePreference(request, 'never');
        return { confirmed: false, remember: true };

      case 'y':
      case 'yes':
        return { confirmed: true };

      case 'n':
      case 'no':
      default:
        return { confirmed: false };
    }
  }

  /**
   * 批量确认
   */
  async requestBatchConfirmation(
    requests: ConfirmationRequest[],
    options?: { stopOnReject?: boolean }
  ): Promise<ConfirmationResult[]> {
    const results: ConfirmationResult[] = [];

    for (const request of requests) {
      const result = await this.requestConfirmation(request);
      results.push(result);

      if (!result.confirmed && options?.stopOnReject) {
        break;
      }
    }

    return results;
  }

  /**
   * 显示请求详情
   */
  private displayRequest(request: ConfirmationRequest): void {
    console.log();
    console.log(chalk.yellow(`⚠️  需要确认: ${request.title}`));
    console.log(chalk.gray(request.description));

    if (Object.keys(request.details).length > 0) {
      console.log();
      for (const [key, value] of Object.entries(request.details)) {
        const displayValue = typeof value === 'string' && value.length > 50
          ? value.slice(0, 50) + '...'
          : value;
        console.log(chalk.gray(`  ${key}: ${displayValue}`));
      }
    }

    console.log();
  }

  /**
   * 查找用户偏好
   */
  private findPreference(request: ConfirmationRequest): UserPreference | undefined {
    const key = `${request.type}:${this.extractPattern(request)}`;
    return this.preferences.get(key);
  }

  /**
   * 保存用户偏好
   */
  private savePreference(
    request: ConfirmationRequest,
    choice: 'always' | 'never'
  ): void {
    if (!this.config.rememberDecisions) return;

    const pattern = this.extractPattern(request);
    const key = `${request.type}:${pattern}`;

    this.preferences.set(key, {
      type: request.type,
      pattern,
      alwaysConfirm: choice === 'always',
      alwaysReject: choice === 'never',
    });
  }

  /**
   * 提取模式用于匹配
   */
  private extractPattern(request: ConfirmationRequest): string {
    if (request.type === 'skill_generation') {
      return String(request.details.taskType || 'general');
    }
    if (request.type === 'skill_merge') {
      return 'merge';
    }
    if (request.type === 'skill_retire') {
      return 'retire';
    }
    return 'default';
  }

  /**
   * 重置偏好
   */
  resetPreferences(): void {
    this.preferences.clear();
  }

  /**
   * 快速确认（无需用户交互）
   */
  quickConfirm(request: ConfirmationRequest): boolean {
    const preference = this.findPreference(request);

    if (preference?.alwaysConfirm) return true;
    if (preference?.alwaysReject) return false;

    return request.defaultChoice !== 'no';
  }
}

// ============ 预定义确认请求构建器 ============

/**
 * 构建技能生成确认请求
 */
export function buildSkillGenerationRequest(
  skillName: string,
  taskType: string,
  sourcePattern: string
): ConfirmationRequest {
  return {
    type: 'skill_generation',
    title: '生成新技能',
    description: '检测到高成功率的任务模式，可以生成新技能',
    details: {
      技能名称: skillName,
      任务类型: taskType,
      来源模式: sourcePattern.slice(0, 80),
    },
    defaultChoice: 'yes',
  };
}

/**
 * 构建技能合并确认请求
 */
export function buildSkillMergeRequest(
  skillNames: string[],
  similarity: number
): ConfirmationRequest {
  return {
    type: 'skill_merge',
    title: '合并相似技能',
    description: `检测到 ${skillNames.length} 个相似度 ${(similarity * 100).toFixed(0)}% 的技能`,
    details: {
      技能列表: skillNames.join(', '),
      相似度: `${(similarity * 100).toFixed(1)}%`,
    },
    defaultChoice: 'yes',
  };
}

/**
 * 构建技能淘汰确认请求
 */
export function buildSkillRetireRequest(
  skillName: string,
  reason: string,
  successRate: number
): ConfirmationRequest {
  return {
    type: 'skill_retire',
    title: '淘汰低效技能',
    description: `技能 "${skillName}" 效果不佳，建议淘汰`,
    details: {
      技能名称: skillName,
      成功率: `${(successRate * 100).toFixed(1)}%`,
      原因: reason,
    },
    defaultChoice: 'no',
  };
}

// ============ 全局实例 ============

let globalConfirmationManager: UserConfirmationManager | null = null;

/**
 * 获取用户确认管理器
 */
export function getUserConfirmationManager(
  config?: Partial<ConfirmationManagerConfig>
): UserConfirmationManager {
  if (!globalConfirmationManager) {
    globalConfirmationManager = new UserConfirmationManager(config);
  }
  return globalConfirmationManager;
}

/**
 * 重置确认管理器
 */
export function resetUserConfirmationManager(): void {
  globalConfirmationManager = null;
}