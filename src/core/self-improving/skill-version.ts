/**
 * 技能版本管理
 * 
 * 支持技能版本追踪、回滚和对比
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { GeneratedSkill } from './types.js';
import { writeJsonAtomic } from './atomic-write.js';

// ============ 类型定义 ============

/**
 * 技能版本
 */
export interface SkillVersion {
  version: string;
  skill: GeneratedSkill;
  changelog: string;
  createdAt: string;
  createdBy: 'user' | 'auto';
}

/**
 * 版本差异
 */
export interface SkillDiff {
  versionA: string;
  versionB: string;
  changes: {
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }[];
  addedFields: string[];
  removedFields: string[];
}

/**
 * 版本历史
 */
export interface VersionHistory {
  skillId: string;
  currentVersion: string;
  versions: SkillVersion[];
  totalVersions: number;
}

/**
 * 版本管理配置
 */
export interface VersionManagerConfig {
  storageDir: string;
  maxVersionsPerSkill: number;
  autoVersionOnUpdate: boolean;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: VersionManagerConfig = {
  storageDir: join(homedir(), '.securebot', 'self-improving', 'skill-versions'),
  maxVersionsPerSkill: 10,
  autoVersionOnUpdate: true,
};

// ============ 技能版本管理器 ============

/**
 * 技能版本管理器
 */
export class SkillVersionManager {
  private config: VersionManagerConfig;
  private initialized: boolean = false;

  constructor(config?: Partial<VersionManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!existsSync(this.config.storageDir)) {
      mkdirSync(this.config.storageDir, { recursive: true });
    }

    this.initialized = true;
  }

  /**
   * 创建新版本
   */
  async createVersion(
    skill: GeneratedSkill,
    changelog: string,
    createdBy: 'user' | 'auto' = 'auto'
  ): Promise<SkillVersion> {
    await this.initialize();

    const history = await this.getVersionHistory(skill.id);
    
    let newVersion: string;
    if (history.versions.length === 0) {
      newVersion = '1.0.0';
    } else {
      const currentVersion = history.versions[0]!.version;
      newVersion = this.incrementVersion(currentVersion, 'minor');
    }

    const version: SkillVersion = {
      version: newVersion,
      skill: { ...skill },
      changelog,
      createdAt: new Date().toISOString(),
      createdBy,
    };

    const versionFile = this.getVersionFilePath(skill.id, newVersion);
    writeJsonAtomic(versionFile, version);

    await this.pruneOldVersions(skill.id);

    return version;
  }

  /**
   * 获取版本历史
   */
  async getVersionHistory(skillId: string): Promise<VersionHistory> {
    await this.initialize();

    const skillDir = join(this.config.storageDir, skillId);
    const versions: SkillVersion[] = [];

    if (existsSync(skillDir)) {
      const files = readdirSync(skillDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse();

      for (const file of files) {
        try {
          const content = readFileSync(join(skillDir, file), 'utf-8');
          versions.push(JSON.parse(content) as SkillVersion);
        } catch {
          // 忽略无效文件
        }
      }
    }

    return {
      skillId,
      currentVersion: versions[0]?.version || '0.0.0',
      versions,
      totalVersions: versions.length,
    };
  }

  /**
   * 回滚到指定版本
   */
  async rollback(skillId: string, targetVersion: string): Promise<GeneratedSkill | null> {
    await this.initialize();

    const version = await this.getVersion(skillId, targetVersion);
    if (!version) {
      return null;
    }

    const skill = { ...version.skill };
    
    const currentHistory = await this.getVersionHistory(skillId);
    const currentVersion = currentHistory.versions[0];

    const rollbackVersion = await this.createVersion(
      skill,
      `回滚到版本 ${targetVersion}${currentVersion ? ` (从 ${currentVersion.version})` : ''}`,
      'user'
    );

    return { ...skill, id: rollbackVersion.skill.id };
  }

  /**
   * 获取指定版本
   */
  async getVersion(skillId: string, version: string): Promise<SkillVersion | null> {
    await this.initialize();

    const versionFile = this.getVersionFilePath(skillId, version);

    if (!existsSync(versionFile)) {
      return null;
    }

    try {
      const content = readFileSync(versionFile, 'utf-8');
      return JSON.parse(content) as SkillVersion;
    } catch {
      return null;
    }
  }

  /**
   * 对比两个版本
   */
  async diff(skillId: string, versionA: string, versionB: string): Promise<SkillDiff | null> {
    const vA = await this.getVersion(skillId, versionA);
    const vB = await this.getVersion(skillId, versionB);

    if (!vA || !vB) {
      return null;
    }

    const changes: SkillDiff['changes'] = [];
    const addedFields: string[] = [];
    const removedFields: string[] = [];

    const allKeys = new Set([
      ...Object.keys(vA.skill),
      ...Object.keys(vB.skill),
    ]);

    for (const key of allKeys) {
      const inA = key in vA.skill;
      const inB = key in vB.skill;

      if (!inA && inB) {
        addedFields.push(key);
      } else if (inA && !inB) {
        removedFields.push(key);
      } else {
        const valA = vA.skill[key as keyof GeneratedSkill];
        const valB = vB.skill[key as keyof GeneratedSkill];

        if (JSON.stringify(valA) !== JSON.stringify(valB)) {
          changes.push({
            field: key,
            oldValue: valA,
            newValue: valB,
          });
        }
      }
    }

    return {
      versionA,
      versionB,
      changes,
      addedFields,
      removedFields,
    };
  }

  /**
   * 删除版本
   */
  async deleteVersion(skillId: string, version: string): Promise<boolean> {
    await this.initialize();

    const versionFile = this.getVersionFilePath(skillId, version);

    if (!existsSync(versionFile)) {
      return false;
    }

    try {
      unlinkSync(versionFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 清理旧版本
   */
  private async pruneOldVersions(skillId: string): Promise<void> {
    const history = await this.getVersionHistory(skillId);

    if (history.versions.length > this.config.maxVersionsPerSkill) {
      const toDelete = history.versions.slice(this.config.maxVersionsPerSkill);

      for (const version of toDelete) {
        await this.deleteVersion(skillId, version.version);
      }
    }
  }

  /**
   * 递增版本号
   */
  private incrementVersion(version: string, type: 'major' | 'minor' | 'patch'): string {
    const parts = version.split('.').map(Number);
    const [major = 0, minor = 0, patch = 0] = parts;

    switch (type) {
      case 'major':
        return `${major + 1}.0.0`;
      case 'minor':
        return `${major}.${minor + 1}.0`;
      case 'patch':
        return `${major}.${minor}.${patch + 1}`;
    }
  }

  /**
   * 获取版本文件路径
   */
  private getVersionFilePath(skillId: string, version: string): string {
    const skillDir = join(this.config.storageDir, skillId);
    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true });
    }
    return join(skillDir, `v${version}.json`);
  }

  /**
   * 列出所有技能的版本历史
   */
  async listAllVersionHistories(): Promise<VersionHistory[]> {
    await this.initialize();

    const histories: VersionHistory[] = [];
    const skillDirs = readdirSync(this.config.storageDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const skillId of skillDirs) {
      const history = await this.getVersionHistory(skillId);
      if (history.totalVersions > 0) {
        histories.push(history);
      }
    }

    return histories;
  }
}

// ============ 全局实例 ============

let globalVersionManager: SkillVersionManager | null = null;

/**
 * 获取技能版本管理器
 */
export function getSkillVersionManager(config?: Partial<VersionManagerConfig>): SkillVersionManager {
  if (!globalVersionManager) {
    globalVersionManager = new SkillVersionManager(config);
  }
  return globalVersionManager;
}

/**
 * 重置版本管理器
 */
export function resetSkillVersionManager(): void {
  globalVersionManager = null;
}