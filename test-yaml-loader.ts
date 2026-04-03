/**
 * YAML配置加载测试示例
 * 
 * 测试从YAML加载工作流配置
 */

import { loadFromYaml, validateYamlConfig, loadFromFile } from './src/core/collaboration/loader.js';
import { GraphExecutor } from './src/core/collaboration/executor.js';

// ============ 测试用例 1: 简单YAML字符串加载 ============

const simpleYaml = `
id: hello-world
name: Hello World工作流
mode: lightweight
entry: greeter

agents:
  - id: greeter
    name: 问候者
    role: 问候用户
    systemPrompt: |
      你是问候者。
      用友好的方式问候用户。
      完成后调用 handoff_to_farewell 说再见。

  - id: farewell
    name: 告别者
    role: 告别用户
    systemPrompt: |
      你是告别者。
      用温暖的方式与用户告别。

edges:
  - source: greeter
    target: farewell
    type: direct
    metadata:
      label: 问候完成，开始告别
`;

console.log('========== 测试 1: YAML字符串加载 ==========');

// 验证YAML配置
const validation = validateYamlConfig(simpleYaml);
console.log('验证结果:', validation.valid ? '✅ 通过' : '❌ 失败');
if (!validation.valid) {
  console.log('错误:', validation.errors);
}

// 加载图
const graph = loadFromYaml(simpleYaml);
console.log('\n图信息:');
console.log('  ID:', graph.getId());
console.log('  名称:', graph.getName());
console.log('  模式:', graph.getExecutionMode());
console.log('  入口点:', graph.getEntryPoint());
console.log('  节点数:', graph.getNodes().size);
console.log('  边数:', graph.getEdges().length);

// 显示节点
console.log('\n节点列表:');
graph.getNodes().forEach((node, id) => {
  console.log(`  - ${id}: ${node.name} (${node.role})`);
});

// 显示边
console.log('\n边列表:');
graph.getEdges().forEach((edge, idx) => {
  console.log(`  ${idx + 1}. ${edge.source} -> ${edge.target} (${edge.type})`);
});

// 导出DOT格式（可视化）
console.log('\nDOT格式导出:');
console.log(graph.toDot());

// ============ 测试用例 2: 条件路由YAML ============

console.log('\n========== 测试 2: 条件路由YAML ==========');

const conditionalYaml = `
id: smart-router
name: 智能路由
mode: lightweight
entry: classifier

agents:
  - id: classifier
    name: 分类器
    role: 分类用户请求
    systemPrompt: |
      分析用户输入，判断类型：
      - 如果是技术问题，调用 handoff_to_tech_support
      - 如果是销售问题，调用 handoff_to_sales
      - 如果是投诉，调用 handoff_to_complaint
    tools:
      - handoff_to_tech_support
      - handoff_to_sales
      - handoff_to_complaint

  - id: tech-support
    name: 技术支持
    role: 解决技术问题
    systemPrompt: 你是技术支持工程师，帮助用户解决技术问题。

  - id: sales
    name: 销售顾问
    role: 销售咨询
    systemPrompt: 你是销售顾问，帮助用户了解产品。

  - id: complaint
    name: 投诉处理
    role: 处理投诉
    systemPrompt: 你是投诉处理专员，耐心倾听并解决用户问题。

edges:
  - source: classifier
    target: tech-support
    type: conditional
    condition:
      keywords: [技术, bug, 错误, 崩溃]
    metadata:
      label: 技术问题

  - source: classifier
    target: sales
    type: conditional
    condition:
      keywords: [价格, 购买, 订阅]
    metadata:
      label: 销售咨询

  - source: classifier
    target: complaint
    type: conditional
    condition:
      keywords: [投诉, 不满, 差评]
    metadata:
      label: 用户投诉
`;

const graph2 = loadFromYaml(conditionalYaml);
console.log('条件路由图加载成功');
console.log('  入口节点:', graph2.getEntryPoint());
console.log('  条件边数:', graph2.getEdges().filter(e => e.type === 'conditional').length);

// 显示条件边
console.log('\n条件路由规则:');
graph2.getEdges().forEach(edge => {
  if (edge.type === 'conditional' && edge.condition) {
    console.log(`  ${edge.source} -> ${edge.target}`);
    console.log(`    关键词: ${edge.condition.keywords?.join(', ') || '无'}`);
  }
});

// ============ 测试用例 3: 从文件加载 ============

console.log('\n========== 测试 3: 从文件加载YAML ==========');

async function testFileLoading() {
  try {
    // 加载示例工作流
    const graph = await loadFromFile('workflows/examples/simple-translate.yaml');
    console.log('✅ 文件加载成功');
    console.log('  图ID:', graph.getId());
    console.log('  节点数:', graph.getNodes().size);
    
    return graph;
  } catch (error) {
    console.log('❌ 文件加载失败:', (error as Error).message);
    return null;
  }
}

testFileLoading().then(graph => {
  if (graph) {
    console.log('\n完整测试通过 ✅');
  }
});

// ============ 测试用例 4: 错误配置验证 ============

console.log('\n========== 测试 4: 错误配置验证 ==========');

// 缺少必需字段
const invalidYaml1 = `
id: incomplete
name: 不完整配置
# 缺少 entry 和 agents
`;

const result1 = validateYamlConfig(invalidYaml1);
console.log('测试缺少字段:', result1.valid ? '✅' : '❌');
if (!result1.valid) {
  console.log('  错误信息:', result1.errors);
}

// 入口节点不存在
const invalidYaml2 = `
id: wrong-entry
name: 错误入口
entry: not-exist

agents:
  - id: agent-a
    name: Agent A
    role: Worker
    systemPrompt: Test
`;

const result2 = validateYamlConfig(invalidYaml2);
console.log('\n测试错误入口:', result2.valid ? '✅' : '❌');
if (!result2.valid) {
  console.log('  错误信息:', result2.errors);
}

// 边指向不存在的节点
const invalidYaml3 = `
id: invalid-edge
name: 错误边
entry: agent-a

agents:
  - id: agent-a
    name: Agent A
    role: Worker
    systemPrompt: Test

edges:
  - source: agent-a
    target: not-exist
    type: direct
`;

const result3 = validateYamlConfig(invalidYaml3);
console.log('\n测试错误边:', result3.valid ? '✅' : '❌');
if (!result3.valid) {
  console.log('  错误信息:', result3.errors);
}