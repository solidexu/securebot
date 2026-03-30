/**
 * 技能版本管理
 * 
 * 支持：
 * - 版本历史记录
 * - 版本回滚
 * - 版本对比
 * - 变更日志
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { getSkillManager } from '../skills.js';
import { getRootDir } from '../config.js';

export interface SkillVersion {
  version: string;
  skillId: string;
  createdAt: string;
  checksum: string;
  changelog?: string;
  author?: string;
  size: number;
}

export interface VersionDiff {
  added: string[];
  removed: string[];
  modified: string[];
  changelog: string;
}

export class SkillVersionManager {
  private versionsDir: string;

  constructor(versionsDir?: string) {
    this.versionsDir = versionsDir || join(getRootDir(), 'skill-versions');
    
    if (!existsSync(this.versionsDir)) {
      mkdirSync(this.versionsDir, { recursive: true });
    }
  }

  /**
   * 保存技能版本
   */
  async saveVersion(skillId: string, changelog?: string): Promise<SkillVersion> {
    const skillManager = getSkillManager();
    await skillManager.initialize();
    
    const skill = await skillManager.loadSkill(skillId);
    if (!skill) {
      throw new Error(`技能不存在: ${skillId}`);
    }

    // 获取当前版本号
    const currentVersion = skill.version || '1.0.0';
    const versions = await this.listVersions(skillId);
    const latestVersion = versions.length > 0 && versions[0] ? versions[0].version : null;

    // 计算新版本号
    let newVersion: string;
    if (latestVersion && this.compareVersions(currentVersion, latestVersion) > 0) {
      newVersion = currentVersion;
    } else {
      newVersion = this.incrementVersion(latestVersion || currentVersion);
    }

    // 创建版本目录
    const versionDir = join(this.versionsDir, skillId, newVersion);
    if (!existsSync(versionDir)) {
      mkdirSync(versionDir, { recursive: true });
    }

    // 复制技能文件
    const skillDir = dirname(skill.skillFile);
    const files = this.listFiles(skillDir);
    let totalSize = 0;

    for (const file of files) {
      const srcPath = join(skillDir, file);
      const destPath = join(versionDir, file);
      const destDir = dirname(destPath);
      
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }
      
      copyFileSync(srcPath, destPath);
      totalSize += statSync(srcPath).size;
    }

    // 计算校验和
    const checksum = this.calculateChecksum(skillDir);

    // 保存版本元数据
    const versionInfo: SkillVersion = {
      version: newVersion,
      skillId,
      createdAt: new Date().toISOString(),
      checksum,
      changelog,
      size: totalSize,
    };

    writeFileSync(
      join(versionDir, '.version.json'),
      JSON.stringify(versionInfo, null, 2),
      'utf-8'
    );

    return versionInfo;
  }

  /**
   * 列出技能的所有版本
   */
  async listVersions(skillId: string): Promise<SkillVersion[]> {
    const skillVersionsDir = join(this.versionsDir, skillId);
    
    if (!existsSync(skillVersionsDir)) {
      return [];
    }

    const versions: SkillVersion[] = [];
    const dirs = readdirSync(skillVersionsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const version of dirs) {
      const versionFile = join(skillVersionsDir, version, '.version.json');
      if (existsSync(versionFile)) {
        try {
          const info = JSON.parse(readFileSync(versionFile, 'utf-8'));
          versions.push(info);
        } catch {
          // 忽略无效的版本文件
        }
      }
    }

    // 按版本号降序排列
    return versions.sort((a, b) => this.compareVersions(b.version, a.version));
  }

  /**
   * 回滚到指定版本
   */
  async rollback(skillId: string, targetVersion: string): Promise<boolean> {
    const versionDir = join(this.versionsDir, skillId, targetVersion);
    
    if (!existsSync(versionDir)) {
      throw new Error(`版本不存在: ${targetVersion}`);
    }

    const skillManager = getSkillManager();
    await skillManager.initialize();
    
    const skill = await skillManager.loadSkill(skillId);
    if (!skill) {
      throw new Error(`技能不存在: ${skillId}`);
    }

    const skillDir = dirname(skill.skillFile);

    // 备份当前版本
    await this.saveVersion(skillId, `自动备份 - 回滚前`);

    // 删除当前文件
    const currentFiles = this.listFiles(skillDir);
    for (const file of currentFiles) {
      const filePath = join(skillDir, file);
      if (existsSync(filePath)) {
        rmSync(filePath, { recursive: true, force: true });
      }
    }

    // 复制目标版本文件
    const versionFiles = this.listFiles(versionDir);
    for (const file of versionFiles) {
      if (file === '.version.json') continue;
      
      const srcPath = join(versionDir, file);
      const destPath = join(skillDir, file);
      const destDir = dirname(destPath);
      
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }
      
      copyFileSync(srcPath, destPath);
    }

    return true;
  }

  /**
   * 对比两个版本
   */
  async diff(skillId: string, version1: string, version2: string): Promise<VersionDiff> {
    const v1Dir = join(this.versionsDir, skillId, version1);
    const v2Dir = join(this.versionsDir, skillId, version2);

    if (!existsSync(v1Dir) || !existsSync(v2Dir)) {
      throw new Error('版本不存在');
    }

    const v1Files = new Set(this.listFiles(v1Dir).filter(f => f !== '.version.json'));
    const v2Files = new Set(this.listFiles(v2Dir).filter(f => f !== '.version.json'));

    const added: string[] = [];
    const removed: string[] = [];
    const modified: string[] = [];

    // 找出新增和修改的文件
    for (const file of v2Files) {
      if (!v1Files.has(file)) {
        added.push(file);
      } else {
        const v1Content = readFileSync(join(v1Dir, file), 'utf-8');
        const v2Content = readFileSync(join(v2Dir, file), 'utf-8');
        if (v1Content !== v2Content) {
          modified.push(file);
        }
      }
    }

    // 找出删除的文件
    for (const file of v1Files) {
      if (!v2Files.has(file)) {
        removed.push(file);
      }
    }

    return {
      added,
      removed,
      modified,
      changelog: `+${added.length} -${removed.length} ~${modified.length}`,
    };
  }

  /**
   * 删除指定版本
   */
  async deleteVersion(skillId: string, version: string): Promise<boolean> {
    const versionDir = join(this.versionsDir, skillId, version);
    
    if (!existsSync(versionDir)) {
      return false;
    }

    rmSync(versionDir, { recursive: true, force: true });
    return true;
  }

  /**
   * 获取版本详情
   */
  async getVersion(skillId: string, version: string): Promise<SkillVersion | null> {
    const versionFile = join(this.versionsDir, skillId, version, '.version.json');
    
    if (!existsSync(versionFile)) {
      return null;
    }

    try {
      return JSON.parse(readFileSync(versionFile, 'utf-8'));
    } catch {
      return null;
    }
  }

  // ============ 辅助方法 ============

  private listFiles(dir: string, baseDir: string = dir): string[] {
    const files: string[] = [];
    
    if (!existsSync(dir)) {
      return files;
    }

    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = fullPath.slice(baseDir.length + 1);
      
      if (entry.isDirectory()) {
        files.push(...this.listFiles(fullPath, baseDir));
      } else {
        files.push(relativePath);
      }
    }

    return files;
  }

  private calculateChecksum(dir: string): string {
    const files = this.listFiles(dir).sort();
    const hash = createHash('sha256');
    
    for (const file of files) {
      const content = readFileSync(join(dir, file));
      hash.update(file);
      hash.update(content);
    }
    
    return hash.digest('hex').slice(0, 16);
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    
    return 0;
  }

  private incrementVersion(version: string): string {
    const parts = version.split('.').map(Number);
    parts[2] = (parts[2] || 0) + 1;
    return parts.join('.');
  }
}

// 全局实例
let globalVersionManager: SkillVersionManager | null = null;

export function getSkillVersionManager(): SkillVersionManager {
  if (!globalVersionManager) {
    globalVersionManager = new SkillVersionManager();
  }
  return globalVersionManager;
}

export function resetSkillVersionManager(): void {
  globalVersionManager = null;
}