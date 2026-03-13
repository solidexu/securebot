/**
 * config 命令
 */

import chalk from 'chalk';
import JSON5 from 'json5';
import { loadConfig, getConfigPath } from '../../core/config.js';

export async function showConfig(): Promise<void> {
  const config = loadConfig();
  const configPath = getConfigPath();
  
  console.log();
  console.log(chalk.cyan.bold('当前配置:'));
  console.log(chalk.gray(`配置文件: ${configPath}`));
  console.log();
  console.log(JSON5.stringify(config, null, 2));
}