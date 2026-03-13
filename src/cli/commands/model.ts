/**
 * model 命令
 */

import chalk from 'chalk';
import { OllamaAdapter } from '../../model/ollama.js';
import { loadConfig } from '../../core/config.js';

export async function listModels(): Promise<void> {
  const config = loadConfig();
  
  console.log();
  console.log(chalk.cyan.bold('可用模型:'));
  console.log(chalk.gray(`Ollama 地址: ${config.model.baseUrl ?? 'http://localhost:11434'}`));
  console.log();
  
  try {
    const adapter = new OllamaAdapter({
      baseUrl: config.model.baseUrl,
      defaultModel: config.model.model,
    });
    
    const models = await adapter.listModels();
    
    if (models.length === 0) {
      console.log(chalk.yellow('没有找到模型'));
      console.log(chalk.gray('使用 ollama pull <model> 下载模型'));
    } else {
      for (const model of models) {
        const isCurrent = model.startsWith(config.model.model);
        const marker = isCurrent ? chalk.green(' (当前)') : '';
        console.log(`  ${model}${marker}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`获取模型列表失败: ${message}`));
    console.log(chalk.gray('请确保 Ollama 正在运行'));
  }
}