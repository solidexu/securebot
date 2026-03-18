/**
 * RAG 增强功能
 * 
 * - 增量索引
 * - 多知识库支持
 * - 文件监控
 * - 智能分块
 */

import { existsSync, statSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { RAGStore, createRAGStore, createOllamaEmbedder, type DocumentChunk } from './store.js';

// ============ 类型定义 ============

/**
 * 知识库配置
 */
export interface KnowledgeBase {
  /** 知识库 ID */
  id: string;
  /** 名称 */
  name: string;
  /** 目录路径 */
  path: string;
  /** 文件模式 */
  filePatterns: string[];
  /** 排除模式 */
  excludePatterns: string[];
  /** 最后索引时间 */
  lastIndexed?: number;
  /** 文档数量 */
  documentCount?: number;
  /** 块数量 */
  chunkCount?: number;
}

/**
 * 索引状态
 */
export interface IndexStatus {
  /** 总文件数 */
  totalFiles: number;
  /** 新增文件 */
  newFiles: number;
  /** 修改文件 */
  modifiedFiles: number;
  /** 删除文件 */
  deletedFiles: number;
  /** 错误数 */
  errors: number;
  /** 耗时 (ms) */
  duration: number;
}

/**
 * 文件索引记录
 */
interface FileIndexRecord {
  /** 文件路径 */
  path: string;
  /** 内容哈希 */
  contentHash: string;
  /** 文档 ID */
  docId: string;
  /** 最后修改时间 */
  mtime: number;
  /** 文件大小 */
  size: number;
}

// ============ 增量索引管理器 ============

/**
 * 增量索引管理器
 */
export class IncrementalIndexer {
  private store: RAGStore;
  private indexDir: string;
  private fileRecords: Map<string, FileIndexRecord> = new Map();

  constructor(store: RAGStore, indexDir: string) {
    this.store = store;
    this.indexDir = indexDir;
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (!existsSync(this.indexDir)) {
      mkdirSync(this.indexDir, { recursive: true });
    }
    await this.loadFileRecords();
  }

  /**
   * 加载文件记录
   */
  private async loadFileRecords(): Promise<void> {
    const recordsPath = join(this.indexDir, 'file-records.json');
    if (existsSync(recordsPath)) {
      try {
        const data = JSON.parse(readFileSync(recordsPath, 'utf-8'));
        for (const record of data) {
          this.fileRecords.set(record.path, record);
        }
      } catch {
        // 忽略错误
      }
    }
  }

  /**
   * 保存文件记录
   */
  private async saveFileRecords(): Promise<void> {
    const recordsPath = join(this.indexDir, 'file-records.json');
    const data = Array.from(this.fileRecords.values());
    writeFileSync(recordsPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * 计算文件哈希
   */
  private hashFile(content: string): string {
    return createHash('md5').update(content).digest('hex');
  }

  /**
   * 检查文件是否需要索引
   */
  private needsIndexing(filePath: string): { needsIndex: boolean; reason: string } {
    if (!existsSync(filePath)) {
      return { needsIndex: false, reason: 'file_not_exists' };
    }

    const stat = statSync(filePath);
    const record = this.fileRecords.get(filePath);

    if (!record) {
      return { needsIndex: true, reason: 'new_file' };
    }

    if (stat.mtimeMs > record.mtime) {
      return { needsIndex: true, reason: 'modified' };
    }

    return { needsIndex: false, reason: 'unchanged' };
  }

  /**
   * 索引目录（增量）
   */
  async indexDirectory(
    dir: string,
    options: {
      filePatterns?: string[];
      excludePatterns?: string[];
      onProgress?: (file: string, status: string) => void;
    } = {}
  ): Promise<IndexStatus> {
    const startTime = Date.now();
    const status: IndexStatus = {
      totalFiles: 0,
      newFiles: 0,
      modifiedFiles: 0,
      deletedFiles: 0,
      errors: 0,
      duration: 0,
    };

    const filePatterns = options.filePatterns ?? DEFAULT_FILE_PATTERNS;
    const excludePatterns = options.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS;

    // 获取所有文件
    const files = this.listFiles(dir, filePatterns, excludePatterns);
    status.totalFiles = files.length;

    // 跟踪已处理的文件
    const processedFiles = new Set<string>();

    // 处理每个文件
    for (const file of files) {
      processedFiles.add(file);

      const check = this.needsIndexing(file);
      
      if (check.needsIndex) {
        try {
          const content = readFileSync(file, 'utf-8');
          const contentHash = this.hashFile(content);
          const stat = statSync(file);

          // 添加到 RAG 存储
          await this.store.addDocument(content, {
            source: file,
            title: basename(file),
          });

          // 更新记录
          this.fileRecords.set(file, {
            path: file,
            contentHash,
            docId: contentHash,
            mtime: stat.mtimeMs,
            size: stat.size,
          });

          if (check.reason === 'new_file') {
            status.newFiles++;
          } else {
            status.modifiedFiles++;
          }

          options.onProgress?.(file, check.reason);
        } catch {
          status.errors++;
          options.onProgress?.(file, 'error');
        }
      } else {
        options.onProgress?.(file, 'skipped');
      }
    }

    // 检测删除的文件
    for (const [path, record] of this.fileRecords) {
      if (!processedFiles.has(path) && path.startsWith(dir)) {
        // 从 RAG 存储中移除文档
        try {
          await this.store.deleteDocument(record.docId);
        } catch {
          // 忽略删除错误（文档可能已不存在）
        }
        // 从文件记录中移除
        this.fileRecords.delete(path);
        status.deletedFiles++;
      }
    }

    // 保存记录
    await this.saveFileRecords();

    status.duration = Date.now() - startTime;
    return status;
  }

  /**
   * 列出目录中的文件
   */
  private listFiles(
    dir: string,
    filePatterns: string[],
    excludePatterns: string[]
  ): string[] {
    const files: string[] = [];

    const walk = (currentDir: string) => {
      if (!existsSync(currentDir)) return;

      const entries = readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);

        // 检查排除模式
        if (excludePatterns.some(p => this.matchPattern(entry.name, p))) {
          continue;
        }

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          // 检查文件模式
          const ext = extname(entry.name);
          if (filePatterns.some(p => this.matchPattern(entry.name, p) || p === ext)) {
            files.push(fullPath);
          }
        }
      }
    };

    walk(dir);
    return files;
  }

  /**
   * 简单模式匹配
   */
  private matchPattern(text: string, pattern: string): boolean {
    if (pattern.startsWith('*')) {
      return text.endsWith(pattern.slice(1));
    }
    if (pattern.endsWith('*')) {
      return text.startsWith(pattern.slice(0, -1));
    }
    return text === pattern;
  }
}

// ============ 多知识库管理器 ============

/**
 * 多知识库管理器
 */
export class MultiKnowledgeBaseManager {
  private knowledgeBases: Map<string, KnowledgeBase> = new Map();
  private stores: Map<string, RAGStore> = new Map();
  private indexers: Map<string, IncrementalIndexer> = new Map();
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * 添加知识库
   */
  async addKnowledgeBase(kb: KnowledgeBase): Promise<void> {
    if (!existsSync(kb.path)) {
      mkdirSync(kb.path, { recursive: true });
    }

    // 创建存储
    const storeDir = join(this.baseDir, 'kb', kb.id);
    const store = createRAGStore({ storageDir: storeDir });
    const embedder = createOllamaEmbedder({ model: 'nomic-embed-text' });
    store.setEmbedder(embedder);
    await store.initialize();

    // 创建增量索引器
    const indexer = new IncrementalIndexer(store, join(storeDir, 'index'));
    await indexer.initialize();

    this.knowledgeBases.set(kb.id, kb);
    this.stores.set(kb.id, store);
    this.indexers.set(kb.id, indexer);
  }

  /**
   * 索引知识库
   */
  async indexKnowledgeBase(kbId: string): Promise<IndexStatus | null> {
    const kb = this.knowledgeBases.get(kbId);
    const indexer = this.indexers.get(kbId);

    if (!kb || !indexer) {
      return null;
    }

    const status = await indexer.indexDirectory(kb.path, {
      filePatterns: kb.filePatterns,
      excludePatterns: kb.excludePatterns,
    });

    // 更新知识库统计
    kb.lastIndexed = Date.now();
    kb.documentCount = status.totalFiles;
    kb.chunkCount = status.newFiles + status.modifiedFiles;

    return status;
  }

  /**
   * 搜索所有知识库
   */
  async searchAll(
    query: string,
    options: {
      topK?: number;
      minScore?: number;
      kbIds?: string[];
    } = {}
  ): Promise<Array<{ chunk: DocumentChunk; score: number; kbId: string }>> {
    const results: Array<{ chunk: DocumentChunk; score: number; kbId: string }> = [];

    const kbIds = options.kbIds ?? Array.from(this.knowledgeBases.keys());
    const topK = options.topK ?? 5;
    const minScore = options.minScore ?? 0.5;

    for (const kbId of kbIds) {
      const store = this.stores.get(kbId);
      if (!store) continue;

      const kbResults = await store.search(query, topK);

      for (const result of kbResults) {
        // 过滤低分结果
        if (result.score >= minScore) {
          results.push({
            ...result,
            kbId,
          });
        }
      }
    }

    // 按分数排序
    results.sort((a, b) => b.score - a.score);

    // 返回 top K
    return results.slice(0, topK);
  }

  /**
   * 获取知识库
   */
  getKnowledgeBase(kbId: string): KnowledgeBase | undefined {
    return this.knowledgeBases.get(kbId);
  }

  /**
   * 列出所有知识库
   */
  listKnowledgeBases(): KnowledgeBase[] {
    return Array.from(this.knowledgeBases.values());
  }

  /**
   * 删除知识库
   */
  async removeKnowledgeBase(kbId: string): Promise<boolean> {
    const store = this.stores.get(kbId);
    if (store) {
      await store.clear();
    }

    this.knowledgeBases.delete(kbId);
    this.stores.delete(kbId);
    this.indexers.delete(kbId);

    return true;
  }
}

// ============ 默认配置 ============

const DEFAULT_FILE_PATTERNS = [
  '*.md', '*.txt', '*.json', '*.yaml', '*.yml',
  '.ts', '.js', '.jsx', '.tsx',
  '.py', '.go', '.java', '.rs',
  '.c', '.cpp', '.h', '.hpp',
];

const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules', '.git', 'dist', 'build',
  '*.min.js', '*.min.css',
  '.env', '.env.*',
];

// ============ 导出 ============

export {
  RAGStore,
  createRAGStore,
  createOllamaEmbedder,
};