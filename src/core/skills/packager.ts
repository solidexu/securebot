/**
 * 技能打包器
 * 
 * 支持：
 * - 打包技能为 .skill 文件（ZIP 格式）
 * - 从 .skill 文件安装技能
 * - 验证技能包完整性
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync, rmSync, createWriteStream } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

// 动态导入 archiver 和 adm-zip
let archiver: any = null;
let AdmZip: any = null;

async function loadArchiver() {
  if (!archiver) {
    archiver = (await import('archiver')).default;
  }
  return archiver;
}

async function loadAdmZip() {
  if (!AdmZip) {
    AdmZip = (await import('adm-zip')).default;
  }
  return AdmZip;
}

export interface SkillPackageManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  keywords?: string[];
  createdAt: string;
  checksum: string;
  files: string[];
  size: number;
}

export interface PackOptions {
  outputPath?: string;
  includeVersion?: boolean;
}

export interface InstallOptions {
  overwrite?: boolean;
  targetDir?: string;
}

export interface InstallResult {
  success: boolean;
  skillId: string;
  skillName: string;
  installedPath: string;
  message?: string;
}

export class SkillPackager {
  private maxFileSize = 50 * 1024 * 1024; // 50MB
  private allowedExtensions = new Set([
    '.md', '.json', '.yaml', '.yml', '.toml',
    '.js', '.ts', '.mjs', '.cjs',
    '.py', '.rb', '.go', '.rs', '.java', '.kt',
    '.sh', '.bash', '.zsh', '.fish',
    '.txt', '.csv', '.tsv',
    '.html', '.css', '.scss', '.less',
    '.xml', '.svg',
    '.sql',
    '.env.example', '.gitignore', '.dockerignore',
    '.license', '.md', '.rst',
  ]);

  /**
   * 打包技能为 .skill 文件
   */
  async pack(skillId: string, options?: PackOptions): Promise<string> {
    const { getSkillManager } = await import('../skills.js');
    const skillManager = getSkillManager();
    await skillManager.initialize();

    const skill = await skillManager.loadSkill(skillId);
    if (!skill) {
      throw new Error(`技能不存在: ${skillId}`);
    }

    const skillDir = dirname(skill.skillFile);
    const files = this.listFiles(skillDir);
    
    // 验证文件
    this.validateFiles(files);

    // 创建 manifest
    const manifest: SkillPackageManifest = {
      name: skill.name,
      version: skill.version || '1.0.0',
      description: skill.overview,
      keywords: skill.keywords,
      createdAt: new Date().toISOString(),
      checksum: '',
      files,
      size: 0,
    };

    // 计算总大小和校验和
    let totalSize = 0;
    const hash = createHash('sha256');
    
    for (const file of files) {
      const filePath = join(skillDir, file);
      const stat = statSync(filePath);
      totalSize += stat.size;
      hash.update(readFileSync(filePath));
    }
    
    manifest.size = totalSize;
    manifest.checksum = hash.digest('hex').slice(0, 16);

    // 创建输出路径
    const outputDir = options?.outputPath || process.cwd();
    const outputFileName = `${skillId}-${manifest.version}.skill`;
    const outputPath = join(outputDir, outputFileName);

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // 打包为 ZIP
    const archiverLib = await loadArchiver();
    const output = createWriteStream(outputPath);
    const archive = archiverLib('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    // 添加 manifest
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    // 添加技能文件
    for (const file of files) {
      const filePath = join(skillDir, file);
      archive.file(filePath, { name: file });
    }

    await archive.finalize();

    return outputPath;
  }

  /**
   * 从 .skill 文件安装技能
   */
  async install(skillFile: string, options?: InstallOptions): Promise<InstallResult> {
    if (!existsSync(skillFile)) {
      throw new Error(`技能包不存在: ${skillFile}`);
    }

    if (extname(skillFile) !== '.skill') {
      throw new Error('无效的技能包格式，需要 .skill 文件');
    }

    // 解压
    const AdmZipLib = await loadAdmZip();
    const zip = new AdmZipLib(skillFile);
    const entries = zip.getEntries();

    // 读取 manifest
    const manifestEntry = entries.find((e: any) => e.entryName === 'manifest.json');
    if (!manifestEntry) {
      throw new Error('无效的技能包：缺少 manifest.json');
    }

    const manifest: SkillPackageManifest = JSON.parse(manifestEntry.getData().toString('utf8'));

    // 安全检查
    this.validatePackage(entries, manifest);

    // 确定安装目录
    const { getRootDir } = await import('../config.js');
    const rootDir = getRootDir();
    const targetDir = options?.targetDir || join(rootDir, 'skills', 'public', manifest.name.toLowerCase().replace(/\s+/g, '-'));

    // 检查是否已存在
    if (existsSync(targetDir) && !options?.overwrite) {
      return {
        success: false,
        skillId: manifest.name,
        skillName: manifest.name,
        installedPath: targetDir,
        message: '技能已存在，使用 --overwrite 覆盖安装',
      };
    }

    // 创建目录
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    // 解压文件
    for (const entry of entries) {
      if (entry.entryName === 'manifest.json') continue;
      if (entry.isDirectory) continue;

      const outputPath = join(targetDir, entry.entryName);
      const outputDir = dirname(outputPath);

      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      writeFileSync(outputPath, entry.getData());
    }

    return {
      success: true,
      skillId: manifest.name,
      skillName: manifest.name,
      installedPath: targetDir,
      message: `成功安装 ${manifest.name} v${manifest.version}`,
    };
  }

  /**
   * 从远程 URL 安装技能
   */
  async installFromUrl(url: string, options?: InstallOptions): Promise<InstallResult> {
    // 下载到临时文件
    const tmpFile = join(tmpdir(), `skill-${Date.now()}.skill`);
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`下载失败: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      writeFileSync(tmpFile, Buffer.from(buffer));

      // 安装
      const result = await this.install(tmpFile, options);
      
      return result;
    } finally {
      // 清理临时文件
      if (existsSync(tmpFile)) {
        rmSync(tmpFile, { force: true });
      }
    }
  }

  /**
   * 验证技能包
   */
  async verify(skillFile: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!existsSync(skillFile)) {
      return { valid: false, errors: ['文件不存在'] };
    }

    try {
      const AdmZipLib = await loadAdmZip();
      const zip = new AdmZipLib(skillFile);
      const entries = zip.getEntries();

      // 检查 manifest
      const manifestEntry = entries.find((e: any) => e.entryName === 'manifest.json');
      if (!manifestEntry) {
        errors.push('缺少 manifest.json');
        return { valid: false, errors };
      }

      const manifest: SkillPackageManifest = JSON.parse(manifestEntry.getData().toString('utf8'));

      // 验证必需字段
      if (!manifest.name) errors.push('manifest 缺少 name 字段');
      if (!manifest.version) errors.push('manifest 缺少 version 字段');
      if (!manifest.checksum) errors.push('manifest 缺少 checksum 字段');

      // 验证文件
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        if (entry.entryName === 'manifest.json') continue;

        // 检查路径遍历
        if (entry.entryName.includes('..')) {
          errors.push(`检测到路径遍历: ${entry.entryName}`);
        }

        // 检查文件扩展名
        const ext = extname(entry.entryName);
        if (ext && !this.allowedExtensions.has(ext)) {
          errors.push(`不允许的文件类型: ${entry.entryName}`);
        }

        // 检查文件大小
        if (entry.header.size > this.maxFileSize) {
          errors.push(`文件过大: ${entry.entryName}`);
        }
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      return { valid: false, errors: [`解析失败: ${error}`] };
    }
  }

  /**
   * 列出技能包内容
   */
  async listContents(skillFile: string): Promise<SkillPackageManifest | null> {
    if (!existsSync(skillFile)) {
      return null;
    }

    try {
      const AdmZipLib = await loadAdmZip();
      const zip = new AdmZipLib(skillFile);
      const manifestEntry = zip.getEntries().find((e: any) => e.entryName === 'manifest.json');
      
      if (!manifestEntry) {
        return null;
      }

      return JSON.parse(manifestEntry.getData().toString('utf8'));
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
        // 跳过隐藏目录和特殊目录
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }
        files.push(...this.listFiles(fullPath, baseDir));
      } else {
        files.push(relativePath);
      }
    }

    return files;
  }

  private validateFiles(files: string[]): void {
    for (const file of files) {
      const ext = extname(file);
      
      // 允许无扩展名的文件（如 LICENSE, README）
      if (!ext) continue;
      
      if (!this.allowedExtensions.has(ext)) {
        throw new Error(`不允许的文件类型: ${file}`);
      }
    }
  }

  private validatePackage(entries: any[], manifest: SkillPackageManifest): void {
    // 验证 manifest 必需字段
    if (!manifest.name || !manifest.version) {
      throw new Error('manifest 缺少必需字段');
    }

    // 检查路径遍历攻击
    for (const entry of entries) {
      if (entry.entryName.includes('..')) {
        throw new Error(`检测到路径遍历攻击: ${entry.entryName}`);
      }
      
      // 检查绝对路径
      if (entry.entryName.startsWith('/')) {
        throw new Error(`检测到绝对路径: ${entry.entryName}`);
      }
    }

    // 检查总大小
    let totalSize = 0;
    for (const entry of entries) {
      totalSize += entry.header.size;
    }
    
    if (totalSize > this.maxFileSize) {
      throw new Error(`技能包过大: ${totalSize} bytes (最大 ${this.maxFileSize} bytes)`);
    }
  }
}

// 全局实例
let globalPackager: SkillPackager | null = null;

export function getSkillPackager(): SkillPackager {
  if (!globalPackager) {
    globalPackager = new SkillPackager();
  }
  return globalPackager;
}

export function resetSkillPackager(): void {
  globalPackager = null;
}