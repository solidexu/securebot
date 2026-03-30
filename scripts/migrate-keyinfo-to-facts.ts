#!/usr/bin/env node
/**
 * 数据迁移脚本：将 keyInfo 迁移到 facts
 * 
 * 使用方法：
 *   npx tsx scripts/migrate-keyinfo-to-facts.ts
 *   
 * 或添加到 package.json:
 *   npm run migrate:keyinfo
 */

import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const MEMORY_DIR = join(homedir(), '.securebot', 'memory');
const PROFILES_DIR = join(MEMORY_DIR, 'profiles');
const USER_PROFILE_PATH = join(PROFILES_DIR, 'user.json');

interface MemoryFact {
  id: string;
  content: string;
  category: 'preference' | 'knowledge' | 'context' | 'behavior' | 'goal';
  confidence: number;
  createdAt: string;
  source: string;
  tags?: string[];
}

interface UserProfile {
  userId: string;
  keyInfo: Record<string, string>;
  facts: MemoryFact[];
  updatedAt: string;
  [key: string]: any;
}

/**
 * 从 key 推断分类
 */
function inferCategory(key: string): MemoryFact['category'] {
  const keyLower = key.toLowerCase();
  
  if (/pref|like|dislike|favorite|style|mode/.test(keyLower)) {
    return 'preference';
  }
  if (/skill|tech|language|framework|tool|expert|know/.test(keyLower)) {
    return 'knowledge';
  }
  if (/work|company|team|project|role|position|location/.test(keyLower)) {
    return 'context';
  }
  if (/habit|routine|style|approach|workflow/.test(keyLower)) {
    return 'behavior';
  }
  if (/goal|plan|target|objective|wish/.test(keyLower)) {
    return 'goal';
  }
  
  return 'context';
}

/**
 * 从 key 推断置信度
 */
function inferConfidence(key: string): number {
  const keyLower = key.toLowerCase();
  
  if (/name|email|phone|timezone|location|company|role/.test(keyLower)) {
    return 0.95;
  }
  if (/skill|language|framework|pref|like/.test(keyLower)) {
    return 0.85;
  }
  
  return 0.8;
}

/**
 * 生成事实 ID
 */
function generateFactId(): string {
  return `fact_migrated_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 检查是否已存在类似事实
 */
function findSimilarFact(content: string, facts: MemoryFact[]): MemoryFact | undefined {
  const normalized = content.toLowerCase().replace(/\s+/g, '');
  
  return facts.find(fact => {
    const existingNormalized = fact.content.toLowerCase().replace(/\s+/g, '');
    return normalized === existingNormalized || 
           normalized.includes(existingNormalized) || 
           existingNormalized.includes(normalized);
  });
}

async function migrate() {
  console.log('🔄 keyInfo → facts 迁移脚本\n');
  
  // 检查文件是否存在
  if (!existsSync(USER_PROFILE_PATH)) {
    console.log('❌ 用户档案不存在:', USER_PROFILE_PATH);
    console.log('   请先运行 SecureBot 创建用户档案');
    process.exit(1);
  }
  
  // 读取用户档案
  let profile: UserProfile;
  try {
    const content = readFileSync(USER_PROFILE_PATH, 'utf-8');
    profile = JSON.parse(content);
  } catch (error) {
    console.log('❌ 读取用户档案失败:', error);
    process.exit(1);
  }
  
  // 检查 keyInfo 是否存在
  if (!profile.keyInfo || Object.keys(profile.keyInfo).length === 0) {
    console.log('✅ keyInfo 为空，无需迁移');
    process.exit(0);
  }
  
  console.log(`📋 发现 ${Object.keys(profile.keyInfo).length} 条 keyInfo 待迁移\n`);
  
  // 确保facts数组存在
  if (!profile.facts) {
    profile.facts = [];
  }
  
  // 备份原文件
  const backupPath = `${USER_PROFILE_PATH}.backup-${Date.now()}`;
  try {
    writeFileSync(backupPath, JSON.stringify(profile, null, 2));
    console.log(`📦 已备份到: ${backupPath}\n`);
  } catch (error) {
    console.log('❌ 备份失败:', error);
    process.exit(1);
  }
  
  // 迁移每条 keyInfo
  let migratedCount = 0;
  let skippedCount = 0;
  let duplicateCount = 0;
  
  for (const [key, value] of Object.entries(profile.keyInfo)) {
    const content = `${key}: ${value}`;
    
    // 检查是否已存在类似事实
    const existingFact = findSimilarFact(content, profile.facts);
    
    if (existingFact) {
      console.log(`  ⏭️  跳过（已存在类似）: ${key}`);
      duplicateCount++;
      continue;
    }
    
    // 创建新事实
    const newFact: MemoryFact = {
      id: generateFactId(),
      content,
      category: inferCategory(key),
      confidence: inferConfidence(key),
      createdAt: new Date().toISOString(),
      source: 'keyinfo_migration',
    };
    
    profile.facts.push(newFact);
    console.log(`  ✅ 迁移: ${key} → [${newFact.category}|${Math.round(newFact.confidence * 100)}%]`);
    migratedCount++;
  }
  
  // 清空 keyInfo（保留字段但清空内容）
  profile.keyInfo = {};
  profile.updatedAt = new Date().toISOString();
  
  // 保存更新后的档案
  try {
    writeFileSync(USER_PROFILE_PATH, JSON.stringify(profile, null, 2));
  } catch (error) {
    console.log('\n❌ 保存失败:', error);
    console.log('   可以从备份恢复:', backupPath);
    process.exit(1);
  }
  
  // 输出统计
  console.log('\n📊 迁移完成\n');
  console.log(`  ✅ 迁移成功: ${migratedCount} 条`);
  console.log(`  ⏭️  跳过重复: ${duplicateCount} 条`);
  console.log(`  📝 当前 facts 总数: ${profile.facts.length} 条`);
  console.log('\n💡 提示:');
  console.log('   - 使用 /fact list 查看所有事实');
  console.log('   - 使用 /fact clean 清理重复项');
  console.log('   - 备份文件可以删除:', backupPath);
}

migrate().catch(console.error);