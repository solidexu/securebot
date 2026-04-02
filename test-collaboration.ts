/**
 * 协作系统测试脚本
 */

import { readFileSync } from 'fs';
import { join } from 'path';
// @ts-ignore - TypeScript 可能找不到类型
import collaboration from './src/core/collaboration/index.js';

async function main() {
  console.log('=== 协作系统测试 ===\n');

  // 动态导入
  const { GraphBuilder, loadFromYaml } = await import('./src/core/collaboration/index.js');

  // 1. 加载 YAML 工作流
  console.log('1. 加载工作流配置...');
  const yamlPath = join(process.cwd(), 'workflows/examples/simple-translate.yaml');
  const yamlContent = readFileSync(yamlPath, 'utf-8');

  const graph = loadFromYaml(yamlContent);

  console.log('✅ 工作流加载成功');
  console.log(`   ID: ${graph.getId()}`);
  console.log(`   Name: ${graph.getName()}`);
  console.log(`   Mode: ${graph.getExecutionMode()}`);
  console.log(`   Entry: ${graph.getEntryPoint()}`);
  console.log(`   Agents: ${graph.getNodes().size}`);
  console.log(`   Edges: ${graph.getEdges().length}\n`);

  // 2. 显示图结构
  console.log('2. 图结构:');
  for (const [id, node] of graph.getNodes()) {
    console.log(`   - ${id} (${node.name}): ${node.role}`);
  }
  for (const edge of graph.getEdges()) {
    console.log(`   → ${edge.source} → ${edge.target}`);
  }
  console.log();

  // 3. 测试 GraphBuilder
  console.log('3. 测试 GraphBuilder API...');
  const builder = new GraphBuilder('test-graph', '测试图');

  const builtGraph = builder
    .mode('lightweight')
    .addAgent({
      id: 'agent-a',
      name: 'Agent A',
      role: '测试角色',
      systemPrompt: '你是 Agent A',
    })
    .addAgent({
      id: 'agent-b',
      name: 'Agent B',
      role: '测试角色',
      systemPrompt: '你是 Agent B',
    })
    .addDirectEdge('agent-a', 'agent-b')
    .entry('agent-a')
    .build();

  console.log('✅ GraphBuilder 构建成功');
  console.log(`   Nodes: ${builtGraph.getNodes().size}`);
  console.log(`   Edges: ${builtGraph.getEdges().length}\n`);

  // 4. 测试验证
  console.log('4. 测试图验证...');
  const validation = builtGraph.validate();
  if (validation.valid) {
    console.log('✅ 图验证通过');
  } else {
    console.log('❌ 图验证失败:');
    for (const error of validation.errors || []) {
      console.log(`   - ${error}`);
    }
  }
  console.log();

  console.log('=== 测试完成 ===');
}

main().catch(console.error);