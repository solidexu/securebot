/**
 * 技能条件激活验证脚本
 * 
 * 测试 Hermes 条件配置是否正确工作
 */

import { getSkillManager } from '../src/core/skills.js';
import { getAvailableToolsets, type ToolsetConfig } from '../src/core/toolsets.js';
import { isSkillConditionsAllowed } from '../src/core/skills/skill-conditions.js';
import { getRootDir } from '../src/core/config.js';

async function testSkillConditions() {
  console.log('=== 技能条件激活验证 ===\n');
  
  const skillManager = getSkillManager();
  const rootDir = getRootDir();
  
  console.log(`工作目录: ${rootDir}`);
  
  // 初始化技能加载器
  await skillManager.initialize();
  
  console.log('初始化完成\n');
  
  // 测试场景 1：启用 web 工具集
  console.log('场景 1: enabled: [web, file, memory, skills]');
  const config1: ToolsetConfig = {
    enabled: ['web', 'file', 'memory', 'skills'],
  };
  const availableToolsets1 = new Set(getAvailableToolsets(config1));
  
  const skills1 = await skillManager.listPublicSkills();
  const filtered1 = skills1.filter(s => 
    isSkillConditionsAllowed(s as any, availableToolsets1)
  );
  
  console.log(`可用工具集: ${Array.from(availableToolsets1).join(', ')}`);
  console.log(`总技能数: ${skills1.length}`);
  console.log(`过滤后技能数: ${filtered1.length}`);
  if (filtered1.length > 0) {
    console.log(`技能列表: ${filtered1.map(s => s.name).join(', ')}`);
  }
  console.log();
  
  // 测试场景 2：启用 full_stack
  console.log('场景 2: enabled: [full_stack]');
  const config2: ToolsetConfig = {
    enabled: ['full_stack'],
  };
  const availableToolsets2 = new Set(getAvailableToolsets(config2));
  
  const skills2 = await skillManager.listPublicSkills();
  const filtered2 = skills2.filter(s => 
    isSkillConditionsAllowed(s as any, availableToolsets2)
  );
  
  console.log(`可用工具集: ${Array.from(availableToolsets2).join(', ')}`);
  console.log(`总技能数: ${skills2.length}`);
  console.log(`过滤后技能数: ${filtered2.length}`);
  if (filtered2.length > 0) {
    console.log(`技能列表: ${filtered2.map(s => s.name).join(', ')}`);
  }
  console.log();
  
  // 测试场景 3：禁用 browser
  console.log('场景 3: disabled: [browser, collaboration]');
  const config3: ToolsetConfig = {
    disabled: ['browser', 'collaboration'],
  };
  const availableToolsets3 = new Set(getAvailableToolsets(config3));
  
  const skills3 = await skillManager.listPublicSkills();
  const filtered3 = skills3.filter(s => 
    isSkillConditionsAllowed(s as any, availableToolsets3)
  );
  
  console.log(`可用工具集: ${Array.from(availableToolsets3).join(', ')}`);
  console.log(`总技能数: ${skills3.length}`);
  console.log(`过滤后技能数: ${filtered3.length}`);
  if (filtered3.length > 0) {
    console.log(`技能列表: ${filtered3.map(s => s.name).join(', ')}`);
  }
  console.log();
  
  // 检查特定技能
  console.log('=== 特定技能检查 ===');
  
  const allSkills = await skillManager.listPublicSkills();
  console.log(`加载的技能总数: ${allSkills.length}`);
  console.log(`技能列表: ${allSkills.map(s => s.id).join(', ')}`);
  
  const webResearch = allSkills.find(s => s.id === 'web-research');
  if (webResearch) {
    console.log(`\nweb-research:`);
    console.log(`  条件: ${JSON.stringify(webResearch.conditions)}`);
    const allowed1 = isSkillConditionsAllowed(webResearch as any, availableToolsets1);
    const allowed2 = isSkillConditionsAllowed(webResearch as any, availableToolsets2);
    console.log(`  场景 1 (web 可用): ${allowed1 ? '显示' : '隐藏'}`);
    console.log(`  场景 2 (full_stack 可用): ${allowed2 ? '显示' : '隐藏'}`);
  } else {
    console.log('\nweb-research 技能未找到');
  }
  
  const basicResearch = allSkills.find(s => s.id === 'basic-research');
  if (basicResearch) {
    console.log(`\nbasic-research:`);
    console.log(`  条件: ${JSON.stringify(basicResearch.conditions)}`);
    const allowed1 = isSkillConditionsAllowed(basicResearch as any, availableToolsets1);
    const allowed2 = isSkillConditionsAllowed(basicResearch as any, availableToolsets2);
    console.log(`  场景 1 (full_stack 不可用): ${allowed1 ? '显示' : '隐藏'} (预期: 显示)`);
    console.log(`  场景 2 (full_stack 可用): ${allowed2 ? '显示' : '隐藏'} (预期: 隐藏)`);
  } else {
    console.log('\nbasic-research 技能未找到');
  }
  
  const browserAutomation = allSkills.find(s => s.id === 'browser-automation');
  if (browserAutomation) {
    console.log(`\nbrowser-automation:`);
    console.log(`  条件: ${JSON.stringify(browserAutomation.conditions)}`);
    const allowed3 = isSkillConditionsAllowed(browserAutomation as any, availableToolsets3);
    console.log(`  场景 3 (browser 不可用): ${allowed3 ? '显示' : '隐藏'} (预期: 隐藏)`);
  } else {
    console.log('\nbrowser-automation 技能未找到');
  }
  
  console.log('\n=== 验证完成 ===');
}

testSkillConditions().catch(console.error);
