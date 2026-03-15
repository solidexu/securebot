/**
 * config 命令
 */

import chalk from 'chalk';
import JSON5 from 'json5';
import { loadConfig, getConfigPath, getRootDir } from '../../core/config.js';

export async function showConfig(): Promise<void> {
  const config = loadConfig();
  const configPath = getConfigPath(config);
  const rootDir = getRootDir(config);
  
  console.log();
  console.log(chalk.cyan.bold('当前配置:'));
  console.log(chalk.gray(`配置文件: ${configPath}`));
  console.log(chalk.gray(`根目录: ${rootDir}`));
  console.log();
  console.log(JSON5.stringify(config, null, 2));
}