/**
 * 知识库管理命令
 */

import * as p from '@clack/prompts';
import chalk from 'chalk';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { 
  MultiKnowledgeBaseManager, 
  type KnowledgeBase 
} from '../../rag/enhanced.js';
import { getSkillsDir } from '../../core/config.js';

// ============ 全局管理器 ============

let globalKBManager: MultiKnowledgeBaseManager | null = null;

async function getKBManager(): Promise<MultiKnowledgeBaseManager> {
  if (!globalKBManager) {
    const baseDir = join(getSkillsDir(), '..', 'rag');
    globalKBManager = new MultiKnowledgeBaseManager(baseDir);
  }
  return globalKBManager;
}

// ============ 命令实现 ============

/**
 * 列出知识库
 */
export async function listKnowledgeBases(): Promise<void> {
  const manager = await getKBManager();
  const kbs = manager.listKnowledgeBases();

  console.log(chalk.cyan.bold('\n📚 知识库列表\n'));

  if (kbs.length === 0) {
    console.log(chalk.gray('暂无知识库'));
    console.log(chalk.gray('创建知识库: securebot kb create'));
    return;
  }

  for (const kb of kbs) {
    const status = kb.lastIndexed 
      ? chalk.green(`已索引 (${new Date(kb.lastIndexed).toLocaleString('zh-CN')})`)
      : chalk.yellow('未索引');
    
    console.log(chalk.white(`${kb.id} - ${kb.name}`));
    console.log(chalk.gray(`  路径: ${kb.path}`));
    console.log(chalk.gray(`  状态: ${status}`));
    if (kb.documentCount) {
      console.log(chalk.gray(`  文档: ${kb.documentCount}`));
    }
    console.log();
  }
}

/**
 * 创建知识库
 */
export async function createKnowledgeBaseInteractive(): Promise<void> {
  console.log(chalk.cyan.bold('\n✨ 创建新知识库\n'));

  const kbId = await p.text({
    message: '知识库 ID',
    placeholder: 'my-kb',
    validate: (value) => {
      if (!value) return '请输入 ID';
      if (!/^[a-z0-9-]+$/.test(value)) return '只能包含小写字母、数字、连字符';
      return undefined;
    },
  });

  if (p.isCancel(kbId)) {
    console.log(chalk.gray('已取消'));
    return;
  }

  const kbName = await p.text({
    message: '知识库名称',
    placeholder: '我的知识库',
  });

  if (p.isCancel(kbName)) {
    console.log(chalk.gray('已取消'));
    return;
  }

  const kbPath = await p.text({
    message: '知识库目录路径',
    placeholder: '/path/to/documents',
    validate: (value) => {
      if (!value) return '请输入路径';
      return undefined;
    },
  });

  if (p.isCancel(kbPath)) {
    console.log(chalk.gray('已取消'));
    return;
  }

  // 创建知识库
  const kb: KnowledgeBase = {
    id: kbId as string,
    name: (kbName as string) || (kbId as string),
    path: kbPath as string,
    filePatterns: ['*.md', '*.txt', '*.json', '.ts', '.js', '.py'],
    excludePatterns: ['node_modules', '.git', 'dist'],
  };

  // 确保目录存在
  if (!existsSync(kb.path)) {
    const create = await p.confirm({
      message: '目录不存在，是否创建？',
      initialValue: true,
    });

    if (create) {
      mkdirSync(kb.path, { recursive: true });
    } else {
      console.log(chalk.gray('已取消'));
      return;
    }
  }

  try {
    const manager = await getKBManager();
    await manager.addKnowledgeBase(kb);

    console.log(chalk.green(`\n✓ 知识库 "${kb.name}" 创建成功！\n`));
    console.log(chalk.gray('索引知识库: securebot kb index ' + kb.id));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`创建失败: ${msg}`));
  }
}

/**
 * 索引知识库
 */
export async function indexKnowledgeBase(kbId?: string): Promise<void> {
  const manager = await getKBManager();
  
  if (!kbId) {
    const kbs = manager.listKnowledgeBases();
    
    if (kbs.length === 0) {
      console.log(chalk.yellow('暂无知识库'));
      return;
    }

    const selected = await p.select({
      message: '选择要索引的知识库',
      options: kbs.map(kb => ({ value: kb.id, label: kb.name })),
    });

    if (p.isCancel(selected)) {
      console.log(chalk.gray('已取消'));
      return;
    }

    kbId = selected as string;
  }

  const kb = manager.getKnowledgeBase(kbId);
  if (!kb) {
    console.log(chalk.red(`知识库不存在: ${kbId}`));
    return;
  }

  console.log(chalk.cyan(`\n🔍 正在索引知识库 "${kb.name}"...\n`));

  const spinner = p.spinner();
  spinner.start('索引中...');

  try {
    const status = await manager.indexKnowledgeBase(kbId);
    
    spinner.stop('索引完成');
    
    if (!status) {
      console.log(chalk.yellow('索引失败: 知识库不存在'));
      return;
    }
    
    console.log();
    console.log(chalk.white('索引结果:'));
    console.log(`  总文件: ${status.totalFiles}`);
    console.log(`  新增: ${status.newFiles}`);
    console.log(`  修改: ${status.modifiedFiles}`);
    console.log(`  删除: ${status.deletedFiles}`);
    console.log(`  耗时: ${status.duration}ms`);
    
    if (status.errors > 0) {
      console.log(chalk.yellow(`  错误: ${status.errors}`));
    }
  } catch (error) {
    spinner.stop('索引失败');
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`错误: ${msg}`));
  }
}

/**
 * 删除知识库
 */
export async function deleteKnowledgeBaseInteractive(kbId?: string): Promise<void> {
  const manager = await getKBManager();

  if (!kbId) {
    const kbs = manager.listKnowledgeBases();
    
    if (kbs.length === 0) {
      console.log(chalk.yellow('暂无知识库'));
      return;
    }

    const selected = await p.select({
      message: '选择要删除的知识库',
      options: kbs.map((kb: KnowledgeBase) => ({ value: kb.id, label: kb.name })),
    });

    if (p.isCancel(selected)) {
      console.log(chalk.gray('已取消'));
      return;
    }

    kbId = selected as string;
  }

  const kb = manager.getKnowledgeBase(kbId);
  if (!kb) {
    console.log(chalk.red(`知识库不存在: ${kbId}`));
    return;
  }

  const confirmed = await p.confirm({
    message: `确认删除知识库 "${kb.name}"？（不会删除源文件）`,
    initialValue: false,
  });

  if (!confirmed) {
    console.log(chalk.gray('已取消'));
    return;
  }

  await manager.removeKnowledgeBase(kbId);
  console.log(chalk.green(`✓ 知识库 "${kb.name}" 已删除`));
}

/**
 * 搜索知识库
 */
export async function searchKnowledgeBases(query: string, kbIds?: string[]): Promise<void> {
  const manager = await getKBManager();

  console.log(chalk.cyan(`\n🔍 搜索: "${query}"\n`));

  const spinner = p.spinner();
  spinner.start('搜索中...');

  try {
    const results = await manager.searchAll(query, { 
      topK: 10, 
      minScore: 0.3,
      kbIds,
    });

    spinner.stop();

    if (results.length === 0) {
      console.log(chalk.gray('未找到相关内容'));
      return;
    }

    console.log(chalk.white(`找到 ${results.length} 条结果:\n`));

    for (const result of results) {
      const { chunk, score, kbId } = result;
      const kb = manager.getKnowledgeBase(kbId);
      
      console.log(chalk.cyan(`[${kb?.name ?? kbId}] (相似度: ${(score * 100).toFixed(1)}%)`));
      console.log(chalk.gray(`   来源: ${chunk.metadata.source}`));
      console.log(chalk.white(`   ${chunk.content.slice(0, 200)}${chunk.content.length > 200 ? '...' : ''}`));
      console.log();
    }
  } catch (error) {
    spinner.stop('搜索失败');
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`错误: ${msg}`));
  }
}