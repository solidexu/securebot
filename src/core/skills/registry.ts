/**
 * 技能发现客户端
 * 
 * 支持：
 * - 从远程仓库搜索技能
 * - 浏览热门技能
 * - 查看技能详情
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getSkillPackager } from './packager.js';
import { getRootDir } from '../config.js';

export interface RemoteSkill {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  downloads?: number;
  stars?: number;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SearchResult {
  skills: RemoteSkill[];
  total: number;
  page: number;
  limit: number;
}

export interface SkillRegistryConfig {
  registryUrl?: string;
  cacheDir?: string;
  cacheTtl?: number;
}

const DEFAULT_REGISTRY = 'https://clawhub.ai/api';

export class SkillRegistry {
  private registryUrl: string;
  private cacheDir: string;

  constructor(config?: SkillRegistryConfig) {
    this.registryUrl = config?.registryUrl || DEFAULT_REGISTRY;
    this.cacheDir = config?.cacheDir || join(getRootDir(), 'skill-cache');

    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * 搜索技能
   */
  async search(query: string, options?: { page?: number; limit?: number }): Promise<SearchResult> {
    const page = options?.page || 1;
    const limit = options?.limit || 20;

    try {
      const url = `${this.registryUrl}/skills?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`搜索失败: ${response.statusText}`);
      }

      return (await response.json()) as SearchResult;
    } catch (error) {
      // 如果远程失败，返回空结果
      console.error('搜索失败，请检查网络连接');
      return { skills: [], total: 0, page, limit };
    }
  }

  /**
   * 获取热门技能
   */
  async getPopular(limit: number = 10): Promise<RemoteSkill[]> {
    try {
      const url = `${this.registryUrl}/skills?sort=downloads&limit=${limit}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`获取失败: ${response.statusText}`);
      }

      const data = (await response.json()) as { skills?: RemoteSkill[] };
      return data.skills || [];
    } catch (error) {
      console.error('获取热门技能失败');
      return [];
    }
  }

  /**
   * 获取最新技能
   */
  async getLatest(limit: number = 10): Promise<RemoteSkill[]> {
    try {
      const url = `${this.registryUrl}/skills?sort=updated&limit=${limit}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`获取失败: ${response.statusText}`);
      }

      const data = (await response.json()) as { skills?: RemoteSkill[] };
      return data.skills || [];
    } catch (error) {
      console.error('获取最新技能失败');
      return [];
    }
  }

  /**
   * 获取技能详情
   */
  async getSkill(skillId: string): Promise<RemoteSkill | null> {
    try {
      const url = `${this.registryUrl}/skills/${skillId}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`获取失败: ${response.statusText}`);
      }

      return (await response.json()) as RemoteSkill;
    } catch (error) {
      return null;
    }
  }

  /**
   * 从远程安装技能
   */
  async install(skillId: string, options?: { version?: string; overwrite?: boolean }): Promise<boolean> {
    const packager = getSkillPackager();

    try {
      // 构建下载 URL
      const version = options?.version || 'latest';
      const url = `${this.registryUrl}/skills/${skillId}/download/${version}`;

      // 安装
      const result = await packager.installFromUrl(url, {
        overwrite: options?.overwrite,
      });

      return result.success;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`安装失败: ${msg}`);
      return false;
    }
  }

  /**
   * 获取技能下载 URL
   */
  getDownloadUrl(skillId: string, version?: string): string {
    const v = version || 'latest';
    return `${this.registryUrl}/skills/${skillId}/download/${v}`;
  }
}

// 全局实例
let globalRegistry: SkillRegistry | null = null;

export function getSkillRegistry(config?: SkillRegistryConfig): SkillRegistry {
  if (!globalRegistry) {
    globalRegistry = new SkillRegistry(config);
  }
  return globalRegistry;
}

export function resetSkillRegistry(): void {
  globalRegistry = null;
}