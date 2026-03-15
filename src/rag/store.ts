/**
 * RAG (Retrieval-Augmented Generation) 系统
 * 
 * 本地向量存储和检索系统，用于增强 Agent 的知识库
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';

// ============ 类型定义 ============

/**
 * 文档块
 */
export interface DocumentChunk {
  /** 块 ID */
  id: string;
  /** 文档 ID */
  docId: string;
  /** 块索引 */
  chunkIndex: number;
  /** 文本内容 */
  content: string;
  /** 向量嵌入 */
  embedding?: number[];
  /** 元数据 */
  metadata: {
    source: string;
    title?: string;
    createdAt: number;
  };
}

/**
 * 文档
 */
export interface Document {
  /** 文档 ID */
  id: string;
  /** 文件路径 */
  path: string;
  /** 文件名 */
  filename: string;
  /** 内容哈希 */
  contentHash: string;
  /** 块数量 */
  chunkCount: number;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/**
 * RAG 配置
 */
export interface RAGConfig {
  /** 存储目录 */
  storageDir: string;
  /** 嵌入模型 */
  embeddingModel: string;
  /** 块大小 (字符数) */
  chunkSize: number;
  /** 块重叠 (字符数) */
  chunkOverlap: number;
  /** 检索数量 */
  topK: number;
  /** 最小相似度 */
  minScore: number;
}

/**
 * 检索结果
 */
export interface SearchResult {
  chunk: DocumentChunk;
  score: number;
}

/**
 * 向量嵌入器接口
 */
export interface Embedder {
  /** 生成向量嵌入 */
  embed(text: string): Promise<number[]>;
  /** 批量生成向量嵌入 */
  embedBatch(texts: string[]): Promise<number[][]>;
  /** 向量维度 */
  dimension: number;
}

// ============ 默认配置 ============

export const DEFAULT_RAG_CONFIG: RAGConfig = {
  storageDir: '.securebot/rag',
  embeddingModel: 'nomic-embed-text',
  chunkSize: 1000,
  chunkOverlap: 200,
  topK: 5,
  minScore: 0.5,
};

// ============ 工具函数 ============

/**
 * 计算文本哈希
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * 将文本分割成块
 */
export function splitIntoChunks(
  text: string,
  chunkSize: number = DEFAULT_RAG_CONFIG.chunkSize,
  overlap: number = DEFAULT_RAG_CONFIG.chunkOverlap
): string[] {
  const chunks: string[] = [];
  
  // 按段落分割
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';
  
  for (const para of paragraphs) {
    // 如果当前块加上新段落不超过大小，则添加
    if (currentChunk.length + para.length + 2 <= chunkSize) {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    } else {
      // 保存当前块
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      
      // 如果段落本身超过块大小，需要进一步分割
      if (para.length > chunkSize) {
        // 按句子分割
        const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
        let sentenceChunk = '';
        
        for (const sentence of sentences) {
          if (sentenceChunk.length + sentence.length <= chunkSize) {
            sentenceChunk += sentence;
          } else {
            if (sentenceChunk) chunks.push(sentenceChunk);
            sentenceChunk = sentence;
          }
        }
        
        if (sentenceChunk) {
          currentChunk = sentenceChunk;
        } else {
          currentChunk = '';
        }
      } else {
        currentChunk = para;
      }
    }
  }
  
  // 保存最后一个块
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  // 添加重叠
  if (overlap > 0 && chunks.length > 1) {
    const overlappedChunks: string[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i]!;
      
      // 添加前一个块的结尾
      if (i > 0) {
        const prevChunk = chunks[i - 1]!;
        const overlapText = prevChunk.slice(-overlap);
        chunk = overlapText + '\n...\n' + chunk;
      }
      
      overlappedChunks.push(chunk);
    }
    
    return overlappedChunks;
  }
  
  return chunks;
}

/**
 * 计算余弦相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    const aVal = a[i]!;
    const bVal = b[i]!;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
}

// ============ RAG 存储类 ============

/**
 * RAG 向量存储
 */
export class RAGStore {
  private config: RAGConfig;
  private embedder: Embedder | null = null;
  private documents: Map<string, Document> = new Map();
  private chunks: Map<string, DocumentChunk> = new Map();
  private embeddings: Map<string, number[]> = new Map();
  private initialized: boolean = false;

  constructor(config: Partial<RAGConfig> = {}) {
    this.config = { ...DEFAULT_RAG_CONFIG, ...config };
  }

  /**
   * 设置嵌入器
   */
  setEmbedder(embedder: Embedder): void {
    this.embedder = embedder;
  }

  /**
   * 初始化存储
   */
  async initialize(): Promise<void> {
    // 确保存储目录存在
    if (!existsSync(this.config.storageDir)) {
      mkdirSync(this.config.storageDir, { recursive: true });
    }

    // 加载已有数据
    await this.load();
    this.initialized = true;
  }

  /**
   * 添加文档
   */
  async addDocument(
    content: string,
    metadata: { source: string; title?: string }
  ): Promise<Document> {
    if (!this.initialized) {
      await this.initialize();
    }

    const docId = hashContent(content);
    const contentHash = docId;

    // 检查是否已存在
    const existing = this.documents.get(docId);
    if (existing) {
      return existing;
    }

    // 分割成块
    const textChunks = splitIntoChunks(content, this.config.chunkSize, this.config.chunkOverlap);

    // 创建文档
    const doc: Document = {
      id: docId,
      path: metadata.source,
      filename: basename(metadata.source),
      contentHash,
      chunkCount: textChunks.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // 创建块
    const chunks: DocumentChunk[] = textChunks.map((text, index) => ({
      id: `${docId}_${index}`,
      docId,
      chunkIndex: index,
      content: text,
      metadata: {
        source: metadata.source,
        title: metadata.title,
        createdAt: Date.now(),
      },
    }));

    // 生成嵌入
    if (this.embedder) {
      const embeddings = await this.embedder.embedBatch(textChunks);
      chunks.forEach((chunk, i) => {
        const embedding = embeddings[i];
        if (embedding) {
          chunk.embedding = embedding;
          this.embeddings.set(chunk.id, embedding);
        }
      });
    }

    // 存储
    this.documents.set(docId, doc);
    chunks.forEach(chunk => this.chunks.set(chunk.id, chunk));

    // 持久化
    await this.save();

    return doc;
  }

  /**
   * 从文件添加文档
   */
  async addFile(filePath: string): Promise<Document | null> {
    if (!existsSync(filePath)) {
      return null;
    }

    const content = readFileSync(filePath, 'utf-8');
    const ext = extname(filePath).toLowerCase();

    // 处理不同文件类型
    let processedContent = content;

    if (ext === '.md') {
      // Markdown: 直接使用
      processedContent = content;
    } else if (ext === '.json') {
      // JSON: 格式化
      try {
        const json = JSON.parse(content);
        processedContent = JSON.stringify(json, null, 2);
      } catch {
        processedContent = content;
      }
    }

    return this.addDocument(processedContent, {
      source: filePath,
      title: basename(filePath),
    });
  }

  /**
   * 添加目录下的所有文档
   */
  async addDirectory(dirPath: string, extensions: string[] = ['.md', '.txt', '.json']): Promise<number> {
    if (!existsSync(dirPath)) {
      return 0;
    }

    let count = 0;
    const files = readdirSync(dirPath);

    for (const file of files) {
      const filePath = join(dirPath, file);
      const stat = statSync(filePath);

      if (stat.isDirectory()) {
        count += await this.addDirectory(filePath, extensions);
      } else if (extensions.includes(extname(file).toLowerCase())) {
        await this.addFile(filePath);
        count++;
      }
    }

    return count;
  }

  /**
   * 删除文档
   */
  async deleteDocument(docId: string): Promise<boolean> {
    const doc = this.documents.get(docId);
    if (!doc) {
      return false;
    }

    // 删除相关块
    for (const [chunkId, chunk] of this.chunks) {
      if (chunk.docId === docId) {
        this.chunks.delete(chunkId);
        this.embeddings.delete(chunkId);
      }
    }

    // 删除文档
    this.documents.delete(docId);

    // 持久化
    await this.save();

    return true;
  }

  /**
   * 搜索相似内容
   */
  async search(query: string, topK?: number): Promise<SearchResult[]> {
    if (!this.embedder) {
      throw new Error('Embedder not configured');
    }

    if (!this.initialized) {
      await this.initialize();
    }

    const k = topK ?? this.config.topK;
    const queryEmbedding = await this.embedder.embed(query);

    const results: SearchResult[] = [];

    for (const [chunkId, embedding] of this.embeddings) {
      const chunk = this.chunks.get(chunkId);
      if (!chunk) continue;

      const score = cosineSimilarity(queryEmbedding, embedding);
      
      if (score >= this.config.minScore) {
        results.push({ chunk, score });
      }
    }

    // 按相似度排序，取 topK
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  /**
   * 关键词搜索 (无需嵌入)
   */
  searchByKeywords(query: string, topK?: number): SearchResult[] {
    const k = topK ?? this.config.topK;
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2);
    
    const results: SearchResult[] = [];

    for (const chunk of this.chunks.values()) {
      const content = chunk.content.toLowerCase();
      let score = 0;

      for (const keyword of keywords) {
        const matches = content.split(keyword).length - 1;
        score += matches;
      }

      if (score > 0) {
        results.push({ chunk, score: score / keywords.length });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  /**
   * 获取上下文
   */
  async getContext(query: string, maxTokens: number = 4000): Promise<string> {
    const results = this.embedder 
      ? await this.search(query)
      : this.searchByKeywords(query);

    let context = '';
    let totalLength = 0;

    for (const { chunk } of results) {
      if (totalLength + chunk.content.length > maxTokens * 4) {
        break;
      }
      context += `\n---\n来源: ${chunk.metadata.source}\n${chunk.content}`;
      totalLength += chunk.content.length;
    }

    return context;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    documentCount: number;
    chunkCount: number;
    hasEmbeddings: boolean;
    embeddingDimension: number | null;
  } {
    const firstEmbedding = this.embeddings.values().next().value;
    
    return {
      documentCount: this.documents.size,
      chunkCount: this.chunks.size,
      hasEmbeddings: this.embeddings.size > 0,
      embeddingDimension: firstEmbedding?.length ?? null,
    };
  }

  /**
   * 保存到磁盘
   */
  private async save(): Promise<void> {
    const dataDir = join(this.config.storageDir, 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    // 保存文档索引
    const docIndex = Array.from(this.documents.values());
    writeFileSync(
      join(dataDir, 'documents.json'),
      JSON.stringify(docIndex, null, 2),
      'utf-8'
    );

    // 保存块
    const chunkData = Array.from(this.chunks.values()).map(c => ({
      ...c,
      embedding: this.embeddings.get(c.id),
    }));
    writeFileSync(
      join(dataDir, 'chunks.json'),
      JSON.stringify(chunkData, null, 2),
      'utf-8'
    );
  }

  /**
   * 从磁盘加载
   */
  private async load(): Promise<void> {
    const dataDir = join(this.config.storageDir, 'data');
    
    // 加载文档
    const docPath = join(dataDir, 'documents.json');
    if (existsSync(docPath)) {
      const docs: Document[] = JSON.parse(readFileSync(docPath, 'utf-8'));
      docs.forEach(doc => this.documents.set(doc.id, doc));
    }

    // 加载块
    const chunkPath = join(dataDir, 'chunks.json');
    if (existsSync(chunkPath)) {
      const chunks: (DocumentChunk & { embedding?: number[] })[] = 
        JSON.parse(readFileSync(chunkPath, 'utf-8'));
      
      chunks.forEach(chunk => {
        const { embedding, ...chunkData } = chunk;
        this.chunks.set(chunkData.id, chunkData);
        if (embedding) {
          this.embeddings.set(chunkData.id, embedding);
        }
      });
    }
  }

  /**
   * 清空存储
   */
  async clear(): Promise<void> {
    this.documents.clear();
    this.chunks.clear();
    this.embeddings.clear();
    await this.save();
  }
}

// ============ Ollama 嵌入器 ============

/**
 * Ollama 嵌入器
 */
export class OllamaEmbedder implements Embedder {
  private baseUrl: string;
  private model: string;
  private _dimension: number = 768; // nomic-embed-text 默认维度

  constructor(options: { baseUrl?: string; model?: string } = {}) {
    this.baseUrl = options.baseUrl ?? 'http://localhost:11434';
    this.model = options.model ?? 'nomic-embed-text';
  }

  get dimension(): number {
    return this._dimension;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding failed: ${response.statusText}`);
    }

    const data = await response.json() as { embedding: number[] };
    this._dimension = data.embedding.length;
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Ollama 不支持批量嵌入，逐个处理
    const embeddings: number[][] = [];
    for (const text of texts) {
      const embedding = await this.embed(text);
      embeddings.push(embedding);
    }
    return embeddings;
  }
}

// ============ 导出 ============

export function createRAGStore(config?: Partial<RAGConfig>): RAGStore {
  return new RAGStore(config);
}

export function createOllamaEmbedder(options?: {
  baseUrl?: string;
  model?: string;
}): OllamaEmbedder {
  return new OllamaEmbedder(options);
}

// ============ Reranker ============

/**
 * 重排序器接口
 */
export interface Reranker {
  rerank(query: string, documents: string[]): Promise<number[]>;
}

/**
 * Ollama 重排序器
 * 使用交叉编码器模型对检索结果进行重排序
 */
export class OllamaReranker implements Reranker {
  private baseUrl: string;
  private model: string;

  constructor(options: { baseUrl?: string; model?: string } = {}) {
    this.baseUrl = options.baseUrl ?? 'http://localhost:11434';
    this.model = options.model ?? 'qwen3-reranker';
  }

  /**
   * 对文档进行重排序，返回相关性分数
   */
  async rerank(query: string, documents: string[]): Promise<number[]> {
    if (documents.length === 0) {
      return [];
    }

    // 使用 Ollama 的 generate 接口进行重排序
    // 为每个文档计算相关性分数
    const scores: number[] = [];
    
    for (const doc of documents) {
      const prompt = `判断以下文档与查询的相关性，只返回一个0到1之间的数字，不要其他内容。

查询: ${query}

文档: ${doc.slice(0, 500)}

相关性分数:`;

      try {
        const response = await fetch(`${this.baseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            prompt,
            stream: false,
            options: {
              temperature: 0,
              num_predict: 10,
            },
          }),
        });

        if (!response.ok) {
          scores.push(0.5); // 默认分数
          continue;
        }

        const data = await response.json() as { response: string };
        const scoreStr = data.response?.trim() || '0.5';
        const score = parseFloat(scoreStr);
        scores.push(isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score)));
      } catch {
        scores.push(0.5);
      }
    }

    return scores;
  }
}

// ============ Query Expander ============

/**
 * 查询扩展器接口
 */
export interface QueryExpander {
  expand(query: string): Promise<string[]>;
}

/**
 * Ollama 查询扩展器
 * 生成多个相关查询以改进检索效果
 */
export class OllamaQueryExpander implements QueryExpander {
  private baseUrl: string;
  private model: string;

  constructor(options: { baseUrl?: string; model?: string } = {}) {
    this.baseUrl = options.baseUrl ?? 'http://localhost:11434';
    this.model = options.model ?? 'qmd-query-expansion';
  }

  /**
   * 扩展查询，返回原始查询和相关变体
   */
  async expand(query: string): Promise<string[]> {
    const prompt = `为以下查询生成3个语义相似但表述不同的查询，用于改进搜索效果。

原始查询: ${query}

要求：
1. 保持原始意图
2. 使用不同词汇
3. 每行一个查询
4. 只输出查询，不要编号或其他内容

扩展查询:`;

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 200,
          },
        }),
      });

      if (!response.ok) {
        return [query];
      }

      const data = await response.json() as { response: string };
      const expanded = data.response
        ?.split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0 && !line.startsWith('扩展'))
        .slice(0, 3) || [];

      // 始终包含原始查询
      return [query, ...expanded];
    } catch {
      return [query];
    }
  }
}

// ============ 高级 RAG 存储 ============

/**
 * 高级 RAG 存储配置
 */
export interface AdvancedRAGConfig extends RAGConfig {
  /** 是否启用重排序 */
  enableRerank?: boolean;
  /** 是否启用查询扩展 */
  enableQueryExpansion?: boolean;
  /** 重排序模型 */
  rerankModel?: string;
  /** 查询扩展模型 */
  queryExpansionModel?: string;
}

/**
 * 高级 RAG 存储（支持三阶段）
 */
export class AdvancedRAGStore extends RAGStore {
  private reranker: Reranker | null = null;
  private queryExpander: QueryExpander | null = null;
  private advancedConfig: AdvancedRAGConfig;

  constructor(config: Partial<AdvancedRAGConfig> = {}) {
    super(config);
    this.advancedConfig = {
      ...DEFAULT_RAG_CONFIG,
      ...config,
    };
  }

  /**
   * 设置重排序器
   */
  setReranker(reranker: Reranker): void {
    this.reranker = reranker;
  }

  /**
   * 设置查询扩展器
   */
  setQueryExpander(expander: QueryExpander): void {
    this.queryExpander = expander;
  }

  /**
   * 高级搜索（支持三阶段）
   */
  async advancedSearch(query: string, topK?: number): Promise<SearchResult[]> {
    // 阶段 1: 查询扩展
    let queries = [query];
    if (this.advancedConfig.enableQueryExpansion && this.queryExpander) {
      queries = await this.queryExpander.expand(query);
    }

    // 阶段 2: 向量检索（对所有扩展查询）
    const allResults: Map<string, SearchResult> = new Map();
    for (const q of queries) {
      const results = await this.search(q, topK ?? this.advancedConfig.topK);
      for (const r of results) {
        const existing = allResults.get(r.chunk.id);
        if (!existing || r.score > existing.score) {
          allResults.set(r.chunk.id, r);
        }
      }
    }

    let results = Array.from(allResults.values());

    // 阶段 3: 重排序
    if (this.advancedConfig.enableRerank && this.reranker && results.length > 0) {
      const documents = results.map(r => r.chunk.content);
      const scores = await this.reranker.rerank(query, documents);
      
      // 更新分数并重新排序
      results = results.map((r, i) => ({
        ...r,
        score: scores[i] ?? r.score,
      })).sort((a, b) => b.score - a.score);
    }

    // 返回 topK 结果
    return results.slice(0, topK ?? this.advancedConfig.topK);
  }
}

// ============ 工厂函数 ============

export function createAdvancedRAGStore(config?: Partial<AdvancedRAGConfig>): AdvancedRAGStore {
  return new AdvancedRAGStore(config);
}

export function createOllamaReranker(options?: {
  baseUrl?: string;
  model?: string;
}): OllamaReranker {
  return new OllamaReranker(options);
}

export function createOllamaQueryExpander(options?: {
  baseUrl?: string;
  model?: string;
}): OllamaQueryExpander {
  return new OllamaQueryExpander(options);
}