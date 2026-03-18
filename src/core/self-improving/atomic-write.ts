/**
 * 原子写入工具
 * 
 * 确保文件写入的原子性，避免写入中断导致数据损坏
 */

import { writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * 原子写入 JSON 文件
 * 
 * 使用临时文件 + rename 确保原子性
 */
export function writeJsonAtomic(filePath: string, data: unknown): void {
  const tempPath = filePath + '.tmp';
  
  try {
    // 确保目录存在
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    // 写入临时文件
    writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    
    // 原子重命名
    renameSync(tempPath, filePath);
  } catch (error) {
    // 清理临时文件
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {
      // 忽略清理错误
    }
    throw error;
  }
}

/**
 * 原子写入文本文件
 */
export function writeTextAtomic(filePath: string, content: string): void {
  const tempPath = filePath + '.tmp';
  
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    writeFileSync(tempPath, content, 'utf-8');
    renameSync(tempPath, filePath);
  } catch (error) {
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {
      // 忽略
    }
    throw error;
  }
}