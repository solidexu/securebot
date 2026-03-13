/**
 * 安全检查命令
 */

import chalk from 'chalk';
import { loadConfig } from '../../core/config.js';
import { validateConfig } from '../../utils/security.js';

export async function runSecurityCheck(): Promise<void> {
  console.log();
  console.log(chalk.cyan.bold('安全检查'));
  console.log();

  const config = loadConfig();
  const result = validateConfig(config);

  // 显示错误
  if (result.errors.length > 0) {
    console.log(chalk.red('错误:'));
    for (const error of result.errors) {
      console.log(chalk.red(`  ✗ ${error}`));
    }
    console.log();
  }

  // 显示警告
  if (result.warnings.length > 0) {
    console.log(chalk.yellow('警告:'));
    for (const warning of result.warnings) {
      console.log(chalk.yellow(`  ⚠ ${warning}`));
    }
    console.log();
  }

  // 总结
  if (result.valid) {
    console.log(chalk.green('✓ 配置验证通过'));
    if (result.warnings.length > 0) {
      console.log(chalk.gray(`  有 ${result.warnings.length} 个警告`));
    }
  } else {
    console.log(chalk.red(`✗ 发现 ${result.errors.length} 个错误`));
    process.exit(1);
  }
}