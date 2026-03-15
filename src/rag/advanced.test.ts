/**
 * 高级 RAG 功能测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OllamaReranker,
  OllamaQueryExpander,
  OllamaEmbedder,
  AdvancedRAGStore,
  createAdvancedRAGStore,
} from './store.js';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('RAG Advanced Features', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('OllamaEmbedder', () => {
    it('should check model availability', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'all-minilm:latest' }],
        }),
      });

      const embedder = new OllamaEmbedder({ model: 'all-minilm' });
      const status = await embedder.checkModelAvailable();

      expect(status.available).toBe(true);
    });

    it('should report missing model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'other-model:latest' }],
        }),
      });

      const embedder = new OllamaEmbedder({ model: 'all-minilm' });
      const status = await embedder.checkModelAvailable();

      expect(status.available).toBe(false);
      expect(status.error).toContain('未安装');
    });

    it('should embed text', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            models: [{ name: 'all-minilm:latest' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            embedding: [0.1, 0.2, 0.3],
          }),
        });

      const embedder = new OllamaEmbedder({ model: 'all-minilm' });
      const embedding = await embedder.embed('test text');

      expect(embedding).toEqual([0.1, 0.2, 0.3]);
      expect(embedder.dimension).toBe(3);
    });
  });

  describe('OllamaReranker', () => {
    it('should check model availability', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'qwen3-reranker:latest' }],
        }),
      });

      const reranker = new OllamaReranker({ model: 'qwen3-reranker' });
      const status = await reranker.checkModelAvailable();

      expect(status.available).toBe(true);
    });

    it('should return default scores when model unavailable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [],
        }),
      });

      const reranker = new OllamaReranker({ model: 'qwen3-reranker' });
      const scores = await reranker.rerank('query', ['doc1', 'doc2']);

      expect(scores).toEqual([0.5, 0.5]);
    });

    it('should rerank documents', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            models: [{ name: 'qwen3-reranker:latest' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            response: '0.8\n0.3',
          }),
        });

      const reranker = new OllamaReranker({ model: 'qwen3-reranker' });
      const scores = await reranker.rerank('query', ['doc1', 'doc2']);

      expect(scores).toEqual([0.8, 0.3]);
    });
  });

  describe('OllamaQueryExpander', () => {
    it('should check model availability', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'qmd-query-expansion:latest' }],
        }),
      });

      const expander = new OllamaQueryExpander({ model: 'qmd-query-expansion' });
      const status = await expander.checkModelAvailable();

      expect(status.available).toBe(true);
    });

    it('should return original query when model unavailable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [],
        }),
      });

      const expander = new OllamaQueryExpander({ model: 'qmd-query-expansion' });
      const queries = await expander.expand('test query');

      expect(queries).toEqual(['test query']);
    });

    it('should expand queries', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            models: [{ name: 'qmd-query-expansion:latest' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            response: 'expanded query 1\nexpanded query 2\nexpanded query 3',
          }),
        });

      const expander = new OllamaQueryExpander({ model: 'qmd-query-expansion' });
      const queries = await expander.expand('test query');

      expect(queries).toEqual([
        'test query',
        'expanded query 1',
        'expanded query 2',
        'expanded query 3',
      ]);
    });
  });

  describe('AdvancedRAGStore', () => {
    it('should create advanced store', () => {
      const store = createAdvancedRAGStore({
        storageDir: '/tmp/test-rag',
        embeddingModel: 'all-minilm',
      });

      expect(store).toBeInstanceOf(AdvancedRAGStore);
    });
  });
});