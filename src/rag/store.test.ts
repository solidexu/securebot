import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashContent,
  splitIntoChunks,
  cosineSimilarity,
  RAGStore,
} from './store.js';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

describe('RAG Utils', () => {
  describe('hashContent', () => {
    it('should generate consistent hash', () => {
      const content = 'Hello, world!';
      const hash1 = hashContent(content);
      const hash2 = hashContent(content);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(16);
    });

    it('should generate different hashes for different content', () => {
      const hash1 = hashContent('Content A');
      const hash2 = hashContent('Content B');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('splitIntoChunks', () => {
    it('should split text into chunks', () => {
      // Use paragraphs to trigger splitting
      const text = 'A'.repeat(600) + '\n\n' + 'B'.repeat(600) + '\n\n' + 'C'.repeat(600);
      const chunks = splitIntoChunks(text, 500, 0);

      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it('should respect paragraph boundaries', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const chunks = splitIntoChunks(text, 100, 0);

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should handle short text', () => {
      const text = 'Short text';
      const chunks = splitIntoChunks(text, 1000, 0);

      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe(text);
    });

    it('should add overlap when specified', () => {
      const text = 'A'.repeat(500) + '\n\n' + 'B'.repeat(500);
      const chunks = splitIntoChunks(text, 300, 50);

      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vec = [1, 2, 3, 4, 5];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [-1, -2, -3];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(-1, 5);
    });

    it('should throw for different length vectors', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [1, 2];

      expect(() => cosineSimilarity(vec1, vec2)).toThrow();
    });

    it('should return 0 for zero vectors', () => {
      const vec1 = [0, 0, 0];
      const vec2 = [1, 2, 3];
      expect(cosineSimilarity(vec1, vec2)).toBe(0);
    });
  });
});

describe('RAGStore', () => {
  const testDir = '/tmp/securebot-rag-test';
  let store: RAGStore;

  beforeEach(async () => {
    // 清理测试目录
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });

    // 创建新的 store
    store = new RAGStore({ storageDir: testDir });
    await store.initialize();
  });

  describe('addDocument', () => {
    it('should add a document', async () => {
      const doc = await store.addDocument(
        'This is a test document. It contains some text.',
        { source: 'test.txt' }
      );

      expect(doc.id).toBeDefined();
      expect(doc.chunkCount).toBeGreaterThan(0);
    });

    it('should not duplicate documents', async () => {
      const content = 'Duplicate content test';
      
      const doc1 = await store.addDocument(content, { source: 'test1.txt' });
      const doc2 = await store.addDocument(content, { source: 'test2.txt' });

      expect(doc1.id).toBe(doc2.id);
    });
  });

  describe('addFile', () => {
    it('should add a markdown file', async () => {
      const filePath = join(testDir, 'test.md');
      writeFileSync(filePath, '# Test\n\nThis is a test document.', 'utf-8');

      const doc = await store.addFile(filePath);

      expect(doc).not.toBeNull();
      if (doc) {
        expect(doc.filename).toBe('test.md');
      }
    });

    it('should return null for non-existent file', async () => {
      const doc = await store.addFile('/nonexistent/file.md');
      expect(doc).toBeNull();
    });
  });

  describe('searchByKeywords', () => {
    it('should find matching chunks', async () => {
      await store.addDocument(
        'The quick brown fox jumps over the lazy dog.',
        { source: 'fox.txt' }
      );

      const results = store.searchByKeywords('fox jumps', 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.chunk.content).toContain('fox');
    });

    it('should return empty array for no matches', async () => {
      await store.addDocument(
        'This document has nothing related.',
        { source: 'test.txt' }
      );

      const results = store.searchByKeywords('xyz abc 123', 5);

      expect(results.length).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct stats', async () => {
      await store.addDocument('Document one.', { source: 'one.txt' });
      await store.addDocument('Document two.', { source: 'two.txt' });

      const stats = store.getStats();

      expect(stats.documentCount).toBe(2);
      expect(stats.chunkCount).toBeGreaterThan(0);
    });
  });

  describe('deleteDocument', () => {
    it('should delete a document', async () => {
      const doc = await store.addDocument(
        'To be deleted.',
        { source: 'delete.txt' }
      );

      const deleted = await store.deleteDocument(doc.id);
      expect(deleted).toBe(true);

      const stats = store.getStats();
      expect(stats.documentCount).toBe(0);
    });

    it('should return false for non-existent document', async () => {
      const deleted = await store.deleteDocument('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('persistence', () => {
    it('should persist data across instances', async () => {
      await store.addDocument('Persistent content.', { source: 'persist.txt' });

      // 创建新实例
      const newStore = new RAGStore({ storageDir: testDir });
      await newStore.initialize();

      const stats = newStore.getStats();
      expect(stats.documentCount).toBe(1);
    });
  });
});