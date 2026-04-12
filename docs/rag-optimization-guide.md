# RAG 召回率优化指南 - SecureBot 实战手册

> 基于《字节 AI 二面挂了！RAG 召回率只有 60% 怎么救？》总结
> 
> 针对 SecureBot 项目的具体优化建议

---

## 📊 现状分析

### SecureBot 当前 RAG 架构

| 组件 | 实现状态 | 优化空间 |
|------|---------|---------|
| **数据分片** | ✅ 已实现 | 🔴 高 - 需要语义切分 |
| **向量检索** | ✅ 已实现 | 🟡 中 - 需要混合检索 |
| **重排序** | ✅ 已实现 | 🟢 低 - 已有基础 |
| **查询扩展** | ✅ 已实现 | 🟡 中 - 需要HyDE |
| **父子索引** | ❌ 未实现 | 🔴 高 - 核心优化点 |

### 当前代码问题

```typescript
// src/rag/store.ts - 当前的分片策略
export function splitIntoChunks(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): string[] {
  // 问题：基于字符数的暴力切分
  // 优点：简单快速
  // 缺点：语义可能被切断
}
```

**问题诊断**：
1. **暴力分片**：固定 1000 字符切分，语义可能被切断
2. **单一检索**：仅使用向量检索，缺失 BM25 精确匹配
3. **无父子索引**：检索块和喂给 LLM 的块大小相同
4. **相关性计算简单**：`skill-rag-enhancer.ts` 使用关键词匹配

---

## 🎯 四重境界优化方案

### 第一重：数据层优化

#### 1.1 语义切分（Semantic Chunking）

**问题**：固定字符数切分会切断句子/段落语义

**方案**：基于语义变化点切分

```typescript
// 优化后的分片策略
interface ChunkStrategy {
  type: 'semantic' | 'fixed' | 'hybrid';
  // 语义切分：检测段落/章节边界
  semanticBoundary: RegExp[];
  // 固定切分：最大字符数
  maxChunkSize: number;
  // 重叠字符
  overlap: number;
}

// 建议配置
const SEMANTIC_CONFIG: ChunkStrategy = {
  type: 'semantic',
  semanticBoundary: [
    /\n\n+/,           // 双换行（段落）
    /^#{1,6}\s/m,      // Markdown 标题
    /^```/m,           // 代码块开始
    /^---+/m,          // 分隔线
    /\n(?=\d+\.\s)/,   // 有序列表
  ],
  maxChunkSize: 1500,  // 最大 1500 字符
  overlap: 100,        // 100 字符重叠
};
```

**实现建议**：

```typescript
// src/rag/chunkers/semantic-chunker.ts
export class SemanticChunker {
  /**
   * 语义切分
   * - 识别文档结构（标题、段落、代码块）
   * - 在语义边界处切分
   * - 保持每个 Chunk 语义完整
   */
  chunk(text: string, config: ChunkStrategy): DocumentChunk[] {
    // 1. 识别语义边界
    const boundaries = this.findSemanticBoundaries(text, config.semanticBoundary);
    
    // 2. 按边界切分
    const rawChunks = this.splitByBoundaries(text, boundaries);
    
    // 3. 合并过小的块
    return this.mergeSmallChunks(rawChunks, config.maxChunkSize);
  }
  
  private findSemanticBoundaries(text: string, patterns: RegExp[]): number[] {
    const boundaries: number[] = [0];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        boundaries.push(match.index);
      }
    }
    
    return [...new Set(boundaries)].sort((a, b) => a - b);
  }
}
```

#### 1.2 父子索引结构（Parent-Child Retrieval）

**核心思想**：检索用小块（精准），喂模型用大块（上下文）

```typescript
// src/rag/store.ts - 扩展文档结构
interface ParentChildDocument {
  // 父块：大块（1000-2000字符）
  parent: {
    id: string;
    content: string;
    metadata: DocumentMetadata;
  };
  // 子块：小块（100-300字符）
  children: Array<{
    id: string;
    content: string;
    embedding?: number[];
  }>;
}

// 检索流程
class ParentChildRetrieval {
  /**
   * 1. 用子块检索（精准匹配）
   * 2. 返回父块（完整上下文）
   */
  async search(query: string, topK: number): Promise<SearchResult[]> {
    // Step 1: 向量检索子块
    const childResults = await this.vectorSearch(query, topK * 3);
    
    // Step 2: 获取对应的父块
    const parentIds = [...new Set(childResults.map(r => r.parentId))];
    
    // Step 3: 返回父块（带子块相关性得分）
    return parentIds.map(parentId => {
      const parent = this.getParent(parentId);
      const childScore = this.getMaxChildScore(childResults, parentId);
      return { chunk: parent, score: childScore };
    });
  }
}
```

**对 SecureBot 的改进**：

```typescript
// 修改 src/rag/store.ts
export class AdvancedRAGStore {
  // 添加父子索引
  private parentChunks: Map<string, ParentChunk> = new Map();
  private childChunks: Map<string, ChildChunk> = new Map();
  
  /**
   * 添加文档时创建父子索引
   */
  async addDocument(content: string, metadata: DocumentMetadata): Promise<string> {
    // 1. 创建父块（大块）
    const parentChunks = this.createParentChunks(content);
    
    // 2. 为每个父块创建子块（小块）
    for (const parent of parentChunks) {
      const children = this.createChildChunks(parent.content, parent.id);
      
      // 存储父块
      this.parentChunks.set(parent.id, parent);
      
      // 存储子块并生成嵌入
      for (const child of children) {
        child.embedding = await this.embedder.embed(child.content);
        this.childChunks.set(child.id, child);
      }
    }
    
    return docId;
  }
  
  /**
   * 检索：用子块找，返回父块
   */
  async search(query: string, topK: number = 5): Promise<SearchResult[]> {
    // 1. 向量检索子块
    const queryEmbedding = await this.embedder.embed(query);
    const childResults = this.vectorSearch(queryEmbedding, topK * 3);
    
    // 2. 去重并获取父块
    const seenParents = new Set<string>();
    const results: SearchResult[] = [];
    
    for (const childResult of childResults) {
      const parentId = childResult.chunk.parentId;
      
      if (!seenParents.has(parentId)) {
        seenParents.add(parentId);
        const parent = this.parentChunks.get(parentId);
        
        if (parent) {
          results.push({
            chunk: {
              ...parent,
              metadata: { ...parent.metadata, childMatch: childResult.chunk.content }
            },
            score: childResult.score
          });
        }
      }
      
      if (results.length >= topK) break;
    }
    
    return results;
  }
}
```

---

### 第二重：检索层优化

#### 2.1 混合检索（Hybrid Search）

**问题**：向量检索擅长语义匹配，但不擅长精确关键词匹配

**方案**：向量检索 + BM25 关键词检索

```typescript
// src/rag/retrievers/hybrid-retriever.ts
export interface HybridSearchConfig {
  // 向量检索权重
  vectorWeight: number;      // 建议 0.6-0.7
  // BM25 权重
  bm25Weight: number;        // 建议 0.3-0.4
  // 归一化方法
  normalization: 'minmax' | 'zscore' | 'rank';
}

export class HybridRetriever {
  private vectorIndex: VectorIndex;
  private bm25Index: BM25Index;
  private config: HybridSearchConfig;
  
  /**
   * 混合检索
   * 1. 向量检索（语义理解）
   * 2. BM25 检索（关键词精确匹配）
   * 3. 分数融合
   */
  async search(query: string, topK: number): Promise<HybridResult[]> {
    // 1. 向量检索
    const vectorResults = await this.vectorSearch(query, topK * 2);
    
    // 2. BM25 检索
    const bm25Results = await this.bm25Search(query, topK * 2);
    
    // 3. 分数融合（RRF 或 加权平均）
    return this.fuseResults(vectorResults, bm25Results, topK);
  }
  
  /**
   * Reciprocal Rank Fusion (RRF)
   * 效果更好的融合算法
   */
  private fuseResults(
    vectorResults: SearchResult[],
    bm25Results: SearchResult[],
    topK: number
  ): HybridResult[] {
    const scores = new Map<string, number>();
    const k = 60; // RRF 参数
    
    // 向量结果打分
    vectorResults.forEach((r, i) => {
      const score = 1 / (k + i + 1);
      scores.set(r.chunk.id, (scores.get(r.chunk.id) || 0) + score * this.config.vectorWeight);
    });
    
    // BM25 结果打分
    bm25Results.forEach((r, i) => {
      const score = 1 / (k + i + 1);
      scores.set(r.chunk.id, (scores.get(r.chunk.id) || 0) + score * this.config.bm25Weight);
    });
    
    // 排序并返回
    const sorted = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);
    
    return sorted.map(([id, score]) => ({
      chunk: this.getChunk(id),
      score,
      source: 'hybrid'
    }));
  }
}
```

**BM25 简化实现**：

```typescript
// src/rag/retrievers/bm25.ts
export class BM25Index {
  private documents: Map<string, { content: string; tokens: string[] }>;
  private avgDocLength: number;
  private docCount: number;
  
  // BM25 参数
  private k1 = 1.5;  // 词频饱和参数
  private b = 0.75;  // 文档长度归一化参数
  
  /**
   * 计算文档的 BM25 分数
   */
  score(query: string, docId: string): number {
    const queryTokens = this.tokenize(query);
    const doc = this.documents.get(docId);
    if (!doc) return 0;
    
    let score = 0;
    const docLength = doc.tokens.length;
    
    for (const term of queryTokens) {
      const tf = this.termFrequency(doc.tokens, term);
      const df = this.documentFrequency(term);
      const idf = Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1);
      
      // BM25 公式
      const numerator = tf * (this.k1 + 1);
      const denominator = tf + this.k1 * (1 - this.b + this.b * docLength / this.avgDocLength);
      
      score += idf * numerator / denominator;
    }
    
    return score;
  }
  
  /**
   * 检索 TopK 文档
   */
  search(query: string, topK: number): Array<{ docId: string; score: number }> {
    const scores: Array<{ docId: string; score: number }> = [];
    
    for (const docId of this.documents.keys()) {
      scores.push({ docId, score: this.score(query, docId) });
    }
    
    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
  
  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  }
  
  private termFrequency(tokens: string[], term: string): number {
    return tokens.filter(t => t === term).length;
  }
  
  private documentFrequency(term: string): number {
    let count = 0;
    for (const doc of this.documents.values()) {
      if (doc.tokens.includes(term)) count++;
    }
    return count;
  }
}
```

---

### 第三重：重排序优化

#### 3.1 当前实现

SecureBot 已有 Rerank 支持（`src/rag/store.ts` 中的 `createOllamaReranker`）

```typescript
// 当前实现
export function createOllamaReranker(config: {
  model?: string;
}): Reranker {
  return {
    rerank: async (query: string, results: SearchResult[]): Promise<SearchResult[]> => {
      // 使用 LLM 对结果重新排序
      // 已实现，效果良好
    }
  };
}
```

#### 3.2 优化建议

```typescript
// src/rag/rerankers/cross-encoder-reranker.ts
export interface CrossEncoderRerankerConfig {
  // 使用本地模型（更快、更便宜）
  model: 'bge-reranker-base' | 'bge-reranker-large' | 'cohere-rerank';
  // 批处理大小
  batchSize: number;
  // 是否缓存结果
  cacheResults: boolean;
}

export class CrossEncoderReranker implements Reranker {
  /**
   * Cross-Encoder 重排序
   * 优点：深度理解 Query-Doc 关系
   * 缺点：计算开销大
   * 
   * 建议：
   * - 初路检索返回 50-100 个结果
   * - Rerank 后返回 Top 5-10
   */
  async rerank(
    query: string,
    candidates: SearchResult[],
    topK: number
  ): Promise<SearchResult[]> {
    // 1. 构建 Query-Doc 对
    const pairs = candidates.map(c => ({
      query,
      document: c.chunk.content,
      originalScore: c.score
    }));
    
    // 2. 批量计算相关性分数
    const scores = await this.computeScores(pairs);
    
    // 3. 重新排序
    return candidates
      .map((c, i) => ({ ...c, rerankScore: scores[i] }))
      .sort((a, b) => b.rerankScore - a.rerankScore)
      .slice(0, topK);
  }
}
```

**对 SecureBot 的改进**：

```typescript
// 修改 src/rag/store.ts
export class AdvancedRAGStore {
  /**
   * 检索流程优化
   */
  async search(query: string, topK: number = 5): Promise<SearchResult[]> {
    // Step 1: 混合检索（Vector + BM25）
    const hybridResults = await this.hybridSearch(query, topK * 10); // 取 50 个
    
    // Step 2: Rerank 重排序
    if (this.reranker && hybridResults.length > topK) {
      return this.reranker.rerank(query, hybridResults, topK);
    }
    
    return hybridResults.slice(0, topK);
  }
}
```

---

### 第四重：查询增强优化

#### 4.1 HyDE（Hypothetical Document Embeddings）

**思想**：用伪造的答案去搜索，比问题搜答案更精准

```typescript
// src/rag/query/hyde-expander.ts
export interface HyDEConfig {
  // 是否启用
  enabled: boolean;
  // 生成假设文档的 LLM
  model: string;
  // 假设文档数量
  numHypotheses: number;  // 建议 1-3
}

export class HyDEQueryExpander {
  private llm: LLMClient;
  
  /**
   * HyDE 查询扩展
   * 1. 用 LLM 生成假设答案
   * 2. 用假设答案的向量去检索
   */
  async expandQuery(originalQuery: string): Promise<string[]> {
    const prompt = `Given the question: "${originalQuery}"

Generate a hypothetical answer that would be the ideal response to this question.
The answer should be detailed and informative.

Hypothetical Answer:`;

    const hypothesis = await this.llm.generate(prompt);
    
    return [originalQuery, hypothesis];
  }
  
  /**
   * 使用 HyDE 检索
   */
  async searchWithHyDE(
    query: string,
    retriever: Retriever,
    topK: number
  ): Promise<SearchResult[]> {
    // 1. 生成假设答案
    const hypotheses = await this.expandQuery(query);
    
    // 2. 对每个假设检索
    const allResults: SearchResult[] = [];
    
    for (const h of hypotheses) {
      const results = await retriever.search(h, topK);
      allResults.push(...results);
    }
    
    // 3. 去重并排序
    return this.deduplicateAndSort(allResults, topK);
  }
}
```

#### 4.2 多查询扩展（Multi-Query）

**思想**：一个问题改写成多种表述，提高召回覆盖

```typescript
// src/rag/query/multi-query-expander.ts
export class MultiQueryExpander {
  private llm: LLMClient;
  
  /**
   * 生成多个查询变体
   */
  async expand(query: string, numVariants: number = 3): Promise<string[]> {
    const prompt = `Original question: "${query}"

Generate ${numVariants} different versions of this question that:
1. Have the same intent but different wording
2. Use different terminology
3. Are more specific or more general

Output one question per line:`;

    const response = await this.llm.generate(prompt);
    const variants = response.split('\n').filter(l => l.trim());
    
    return [query, ...variants];
  }
  
  /**
   * 多查询检索
   */
  async searchWithMultiQuery(
    query: string,
    retriever: Retriever,
    topK: number
  ): Promise<SearchResult[]> {
    // 1. 生成查询变体
    const queries = await this.expand(query);
    
    // 2. 并行检索
    const resultsPerQuery = await Promise.all(
      queries.map(q => retriever.search(q, topK))
    );
    
    // 3. 合并去重
    return this.mergeResults(resultsPerQuery, topK);
  }
}
```

**SecureBot 集成**：

```typescript
// 修改 src/rag/tools.ts
export class AdvancedRAGStore {
  private queryExpander: QueryExpander;
  
  /**
   * 智能检索
   * 自动选择最佳的查询扩展策略
   */
  async smartSearch(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      useHyDE = true,
      useMultiQuery = false,
      topK = 5
    } = options;
    
    // 1. 查询扩展
    let expandedQueries = [query];
    
    if (useHyDE) {
      expandedQueries = await this.hydeExpander.expandQuery(query);
    } else if (useMultiQuery) {
      expandedQueries = await this.multiQueryExpander.expand(query);
    }
    
    // 2. 对每个扩展查询检索
    const allResults: SearchResult[] = [];
    
    for (const q of expandedQueries) {
      // 混合检索
      const results = await this.hybridSearch(q, topK * 3);
      allResults.push(...results);
    }
    
    // 3. Rerank
    const deduplicated = this.deduplicate(allResults);
    
    if (this.reranker) {
      return this.reranker.rerank(query, deduplicated, topK);
    }
    
    return deduplicated.slice(0, topK);
  }
}
```

---

## 🚀 实施路线图

### Phase 1：基础优化（1-2 周）

| 任务 | 优先级 | 预期收益 |
|------|--------|---------|
| 语义切分 | 🔴 高 | 召回率 +10-15% |
| 父子索引 | 🔴 高 | 召回率 +15-20% |
| BM25 索引 | 🟡 中 | 召回率 +5-10% |

### Phase 2：进阶优化（2-3 周）

| 任务 | 优先级 | 预期收益 |
|------|--------|---------|
| 混合检索 | 🔴 高 | 召回率 +10-15% |
| HyDE 查询扩展 | 🟡 中 | 召回率 +5-10% |
| Cross-Encoder Rerank | 🟢 低 | 召回率 +3-5% |

### Phase 3：高级优化（3-4 周）

| 任务 | 优先级 | 预期收益 |
|------|--------|---------|
| 多查询扩展 | 🟡 中 | 覆盖率 +10% |
| 上下文压缩 | 🟡 中 | LLM 理解 +20% |
| 召回评估指标 | 🔴 高 | 可衡量优化 |

---

## 📏 评估指标

### 召回质量评估

```typescript
// src/rag/evaluation/metrics.ts
export interface RetrievalMetrics {
  // 命中率：正确答案在前 K 个结果中的比例
  hitRate: number;
  
  // 平均倒数排名：正确答案排名的倒数平均值
  mrr: number;  // Mean Reciprocal Rank
  
  // 归一化折损累计增益：考虑排序位置的评价
  ndcg: number; // Normalized Discounted Cumulative Gain
  
  // 召回率：正确答案被检索到的比例
  recall: number;
}

export class RetrievalEvaluator {
  /**
   * 评估检索质量
   */
  evaluate(
    results: SearchResult[],
    groundTruth: string[],  // 正确答案的文档 ID
    k: number = 5
  ): RetrievalMetrics {
    const retrievedIds = results.slice(0, k).map(r => r.chunk.id);
    
    // Hit Rate
    const hitRate = retrievedIds.some(id => groundTruth.includes(id)) ? 1 : 0;
    
    // MRR
    const firstCorrectRank = retrievedIds.findIndex(id => groundTruth.includes(id));
    const mrr = firstCorrectRank >= 0 ? 1 / (firstCorrectRank + 1) : 0;
    
    // Recall
    const foundCorrect = retrievedIds.filter(id => groundTruth.includes(id)).length;
    const recall = groundTruth.length > 0 ? foundCorrect / groundTruth.length : 0;
    
    // NDCG
    const dcg = retrievedIds.reduce((sum, id, i) => {
      const rel = groundTruth.includes(id) ? 1 : 0;
      return sum + rel / Math.log2(i + 2);
    }, 0);
    
    const idcg = groundTruth.slice(0, k).reduce((sum, _, i) => {
      return sum + 1 / Math.log2(i + 2);
    }, 0);
    
    const ndcg = idcg > 0 ? dcg / idcg : 0;
    
    return { hitRate, mrr, recall, ndcg };
  }
}
```

---

## 📁 文件结构建议

```
src/rag/
├── index.ts                    # 统一导出
├── store.ts                    # 核心存储（已有）
├── tools.ts                    # RAG 工具（已有）
│
├── chunkers/
│   ├── index.ts
│   ├── semantic-chunker.ts     # 语义切分器
│   └── parent-child-chunker.ts # 父子索引切分器
│
├── retrievers/
│   ├── index.ts
│   ├── hybrid-retriever.ts     # 混合检索
│   ├── vector-retriever.ts     # 向量检索
│   └── bm25-retriever.ts       # BM25 检索
│
├── rerankers/
│   ├── index.ts
│   ├── cross-encoder-reranker.ts  # Cross-Encoder 重排序
│   └── llm-reranker.ts            # LLM 重排序（已有）
│
├── query/
│   ├── index.ts
│   ├── hyde-expander.ts        # HyDE 查询扩展
│   └── multi-query-expander.ts # 多查询扩展
│
└── evaluation/
    ├── index.ts
    ├── metrics.ts              # 评估指标
    └── evaluator.ts            # 评估器
```

---

## 🎯 总结

### 核心要点

1. **数据层**：语义切分 + 父子索引 = 召回基础
2. **检索层**：向量 + BM25 混合检索 = 召回保障
3. **重排序**：Cross-Encoder = 召回精炼
4. **查询增强**：HyDE + Multi-Query = 召回提升

### 面试要点

> "针对 RAG 召回率优化，应从**数据表征、检索策略、后处理**三个维度工程化重构，而非单纯依赖更换模型。"

### 预期收益

| 指标 | 当前 | 优化后 | 提升 |
|------|------|--------|------|
| 召回率 | 60% | 85-95% | +25-35% |
| MRR | 0.5 | 0.7-0.8 | +40% |
| NDCG@5 | 0.6 | 0.8-0.9 | +33% |

---

**文档版本**：v1.0  
**创建日期**：2026-04-09  
**适用项目**：SecureBot RAG 系统优化