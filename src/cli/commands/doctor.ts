/**
 * Doctor 命令
 * 
 * 诊断和修复配置问题
 */

import chalk from 'chalk';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadConfig, createDefaultConfig, DEFAULT_AGENTS } from '../../core/config.js';
import { validateConfig } from '../../utils/security.js';
import { OllamaAdapter } from '../../model/ollama.js';

export async function runDoctor(): Promise<void> {
  console.log();
  console.log(chalk.cyan.bold('SecureBot Doctor'));
  console.log(chalk.gray('诊断和修复配置问题'));
  console.log();

  const checks: { name: string; status: 'ok' | 'error' | 'warning'; message: string }[] = [];

  // 1. 检查配置文件
  const configDir = join(homedir(), '.securebot');
  const configFile = join(configDir, 'config.json');

  if (existsSync(configFile)) {
    checks.push({ name: '配置文件', status: 'ok', message: configFile });
  } else {
    checks.push({ name: '配置文件', status: 'warning', message: '不存在，将创建默认配置' });
    createDefaultConfig();
  }

  // 2. 检查工作空间目录
  const homeDir = homedir();
  
  for (const agent of DEFAULT_AGENTS) {
    const workspace = agent.workspace.startsWith('~/')
      ? join(homeDir, agent.workspace.slice(2))
      : resolve(agent.workspace);

    if (existsSync(workspace)) {
      checks.push({ name: `workspace/${agent.id}`, status: 'ok', message: workspace });
    } else {
      try {
        mkdirSync(workspace, { recursive: true });
        checks.push({ name: `workspace/${agent.id}`, status: 'ok', message: `${workspace} (已创建)` });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        checks.push({ name: `workspace/${agent.id}`, status: 'error', message: `无法创建: ${workspace} (${errMsg})` });
      }
    }
  }

  // 3. 检查配置有效性
  try {
    const config = loadConfig();
    const result = validateConfig(config);
    if (result.valid) {
      checks.push({ name: '配置验证', status: 'ok', message: '配置有效' });
    } else {
      checks.push({ name: '配置验证', status: 'error', message: result.errors.join('; ') });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ name: '配置验证', status: 'error', message });
  }

  // 4. 检查 Ollama 连接
  try {
    const config = loadConfig();
    const adapter = new OllamaAdapter({
      baseUrl: config.model.baseUrl ?? undefined,
      defaultModel: config.model.model,
    });
    const health = await adapter.healthCheck();
    if (health.ok) {
      checks.push({ name: 'Ollama 连接', status: 'ok', message: config.model.baseUrl ?? 'http://localhost:11434' });
    } else {
      checks.push({ name: 'Ollama 连接', status: 'error', message: health.error ?? '连接失败' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ name: 'Ollama 连接', status: 'error', message });
  }

  // 5. 检查模型是否存在
  try {
    const config = loadConfig();
    const adapter = new OllamaAdapter({
      baseUrl: config.model.baseUrl ?? undefined,
      defaultModel: config.model.model,
    });
    const models = await adapter.listModels();
    const modelExists = models.some(m => m.startsWith(config.model.model));
    if (modelExists) {
      checks.push({ name: '模型', status: 'ok', message: config.model.model });
    } else {
      checks.push({
        name: '模型',
        status: 'warning',
        message: `${config.model.model} 不存在，运行 ollama pull ${config.model.model} 下载`
      });
    }
  } catch {
    checks.push({ name: '模型', status: 'warning', message: '无法检查模型列表' });
  }

  // 输出结果
  for (const check of checks) {
    const icon = {
      ok: chalk.green('✓'),
      error: chalk.red('✗'),
      warning: chalk.yellow('⚠'),
    }[check.status];

    console.log(`  ${icon} ${check.name}: ${chalk.gray(check.message)}`);
  }

  // 总结
  const errors = checks.filter(c => c.status === 'error');
  const warnings = checks.filter(c => c.status === 'warning');

  console.log();
  if (errors.length === 0) {
    console.log(chalk.green('✓ 所有检查通过'));
    if (warnings.length > 0) {
      console.log(chalk.yellow(`  有 ${warnings.length} 个警告`));
    }
  } else {
    console.log(chalk.red(`✗ 发现 ${errors.length} 个错误`));
    process.exit(1);
  }
}