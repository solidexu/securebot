/**
 * agent 命令
 */

import chalk from 'chalk';
import { loadConfig } from '../../core/config.js';

export async function listAgents(): Promise<void> {
  const config = loadConfig();
  
  console.log();
  console.log(chalk.cyan.bold('Agent 列表:'));
  console.log();
  
  for (const agent of config.agents) {
    const isDefault = agent.default ? chalk.green(' (默认)') : '';
    console.log(`  ${chalk.cyan(agent.id)} - ${agent.name}${isDefault}`);
    console.log(chalk.gray(`    workspace: ${agent.workspace}`));
    
    if (agent.tools?.profile) {
      console.log(chalk.gray(`    profile: ${agent.tools.profile}`));
    }
    if (agent.tools?.deny?.length) {
      console.log(chalk.gray(`    deny: ${agent.tools.deny.join(', ')}`));
    }
    console.log();
  }
}