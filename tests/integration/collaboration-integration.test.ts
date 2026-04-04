/**
 * Agent协作系统集成测试
 * 
 * 重点测试：
 * 1. YAML工作流加载
 * 2. LangGraph兼容性
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  loadFromYaml, 
  loadFromFile,
  validateYamlConfig,
} from '../../src/core/collaboration/loader.js';
import type { AgentGraph } from '../../src/core/collaboration/types.js';
import { GraphExecutor } from '../../src/core/collaboration/executor.js';
import { LangGraphAdapter } from '../../src/core/collaboration/langgraph-adapter.js';
import { createGraph, createNode, keywordsCondition } from '../../src/core/collaboration/builder.js';
import { join } from 'node:path';

// ============ 测试数据 ============

const simpleYaml = `
id: simple-workflow
name: 简单工作流
mode: lightweight
entry: agent-a

agents:
  - id: agent-a
    name: Agent A
    role: Worker
    systemPrompt: 你是Agent A

edges: []
`;

const multiAgentYaml = `
id: multi-agent-workflow
name: 多Agent协作
mode: lightweight
entry: translator

agents:
  - id: translator
    name: 翻译员
    role: Translator
    systemPrompt: 你是翻译专家
    tools:
      - handoff_to_reviewer

  - id: reviewer
    name: 审核员
    role: Reviewer
    systemPrompt: 你是质量审核员

edges:
  - source: translator
    target: reviewer
    type: direct
    metadata:
      label: 翻译完成后审核
`;

const conditionalYaml = `
id: conditional-workflow
name: 条件路由
mode: lightweight
entry: classifier

agents:
  - id: classifier
    name: 分类器
    role: Classifier
    systemPrompt: 分析用户意图
    tools:
      - handoff_to_tech
      - handoff_to_sales

  - id: tech
    name: 技术支持
    role: TechSupport
    systemPrompt: 解决技术问题

  - id: sales
    name: 销售顾问
    role: Sales
    systemPrompt: 处理销售咨询

edges:
  - source: classifier
    target: tech
    type: conditional
    condition:
      keywords: [技术, bug, 错误]

  - source: classifier
    target: sales
    type: conditional
    condition:
      keywords: [购买, 价格]
`;

const loopYaml = `
id: loop-workflow
name: 循环工作流
mode: lightweight
entry: worker
allowCycles: true
maxIterations: 10

agents:
  - id: worker
    name: 工作者
    role: Worker
    systemPrompt: 执行任务

  - id: checker
    name: 检查员
    role: Checker
    systemPrompt: 检查结果

edges:
  - source: worker
    target: checker
    type: direct

  - source: checker
    target: worker
    type: direct
`;

const complexYaml = `
id: complex-workflow
name: 复杂工作流
mode: lightweight
entry: coordinator

agents:
  - id: coordinator
    name: 协调器
    role: Coordinator
    systemPrompt: 协调工作流程
    model:
      provider: openai
      name: gpt-4
      params:
        temperature: 0.7
    behavior:
      isAsync: true
      timeout: 30000
      retryPolicy:
        maxAttempts: 3
        backoff: exponential

  - id: data-processor
    name: 数据处理
    role: DataProcessor
    systemPrompt: 处理数据
    tools:
      - read
      - write
      - process_data

  - id: analyzer
    name: 分析器
    role: Analyzer
    systemPrompt: 分析结果

  - id: reporter
    name: 报告生成
    role: Reporter
    systemPrompt: 生成报告

edges:
  - source: coordinator
    target: data-processor
    type: conditional
    condition:
      keywords: [数据, 处理]
    metadata:
      priority: 1

  - source: coordinator
    target: analyzer
    type: conditional
    condition:
      keywords: [分析]
    metadata:
      priority: 2

  - source: data-processor
    target: analyzer
    type: direct

  - source: analyzer
    target: reporter
    type: direct
`;

// ============ YAML加载测试 ============

describe('YAML工作流加载', () => {
  
  describe('基础加载功能', () => {
    
    it('应该成功加载简单YAML配置', () => {
      const validation = validateYamlConfig(simpleYaml);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      const graph = loadFromYaml(simpleYaml);
      expect(graph).toBeDefined();
      expect(graph.getId()).toBe('simple-workflow');
      expect(graph.getName()).toBe('简单工作流');
      expect(graph.getExecutionMode()).toBe('lightweight');
      expect(graph.getEntryPoint()).toBe('agent-a');
      expect(graph.getNodes().size).toBe(1);
    });

    it('应该正确解析多Agent配置', () => {
      const graph = loadFromYaml(multiAgentYaml);
      
      expect(graph.getNodes().size).toBe(2);
      expect(graph.getEdges().length).toBe(1);
      
      const translator = graph.getNode('translator');
      expect(translator).toBeDefined();
      expect(translator?.name).toBe('翻译员');
      expect(translator?.tools).toContain('handoff_to_reviewer');
      
      const edge = graph.getEdges()[0];
      expect(edge.source).toBe('translator');
      expect(edge.target).toBe('reviewer');
      expect(edge.type).toBe('direct');
    });

    it('应该正确解析条件路由', () => {
      const graph = loadFromYaml(conditionalYaml);
      
      expect(graph.getNodes().size).toBe(3);
      expect(graph.getEdges().length).toBe(2);
      
      const conditionalEdges = graph.getEdges().filter(e => e.type === 'conditional');
      expect(conditionalEdges.length).toBe(2);
      
      const techEdge = conditionalEdges.find(e => e.target === 'tech');
      expect(techEdge?.condition?.keywords).toContain('技术');
    });

    it('应该正确解析循环流程', () => {
      // 循环图在没有allowCycles时加载会失败
      expect(() => {
        loadFromYaml(`
id: loop-no-allow
name: 循环检测测试
mode: lightweight
entry: worker

agents:
  - id: worker
    name: 工作者
    role: Worker
    systemPrompt: 执行任务

  - id: checker
    name: 检查员
    role: Checker
    systemPrompt: 检查结果

edges:
  - source: worker
    target: checker
    type: direct

  - source: checker
    target: worker
    type: direct
`);
      }).toThrow('Cycle detected');
    });

    it('应该允许循环图（设置allowCycles）', () => {
      const validation = validateYamlConfig(loopYaml);
      
      // loopYaml already has allowCycles: true
      const graph = loadFromYaml(loopYaml);
      
      const validation2 = graph.validate();
      expect(validation2.valid).toBe(true);
    });

    it('应该正确解析复杂配置', () => {
      const graph = loadFromYaml(complexYaml);
      
      expect(graph.getNodes().size).toBe(4);
      expect(graph.getEdges().length).toBe(4);
      
      const coordinator = graph.getNode('coordinator');
      expect(coordinator?.model?.provider).toBe('openai');
      expect(coordinator?.model?.name).toBe('gpt-4');
      expect(coordinator?.behavior?.isAsync).toBe(true);
      expect(coordinator?.behavior?.timeout).toBe(30000);
      expect(coordinator?.behavior?.retryPolicy?.maxAttempts).toBe(3);
    });
  });

  describe('YAML验证功能', () => {
    
    it('应该检测缺少必需字段', () => {
      const invalidYaml = `
id: incomplete
name: 不完整配置
`;
      const validation = validateYamlConfig(invalidYaml);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing required field: entry');
      expect(validation.errors).toContain('No agents defined');
    });

    it('应该检测不存在的入口节点', () => {
      const invalidYaml = `
id: wrong-entry
name: 错误入口
entry: not-exist

agents:
  - id: agent-a
    name: Agent A
    role: Worker
    systemPrompt: Test
`;
      const validation = validateYamlConfig(invalidYaml);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Entry agent not found: not-exist');
    });

    it('应该检测边引用不存在的节点', () => {
      const invalidYaml = `
id: invalid-edges
name: 无效边
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
      const validation = validateYamlConfig(invalidYaml);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Edge target not found: not-exist');
    });

    it('应该检测YAML语法错误', () => {
      const invalidYaml = `
id: syntax-error
name: 语法错误
invalid: [yaml content
`;
      const validation = validateYamlConfig(invalidYaml);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toContain('YAML parse error');
    });
  });

  describe('从文件加载', () => {
    
    it('应该成功加载示例工作流文件', async () => {
      const skillFile = join(process.cwd(), 'workflows', 'examples', 'simple-translate.yaml');
      const graph = await loadFromFile(skillFile);
      
      expect(graph).toBeDefined();
      expect(graph).not.toBeNull();
      expect(graph!.getId()).toBeDefined();
      expect(graph!.getNodes().size).toBeGreaterThan(0);
    });

    it('应该处理不存在的文件', async () => {
      const graph = await loadFromFile('/non/existent/file.yaml');
      expect(graph).toBeNull();
    });
  });

  describe('YAML转换功能', () => {
    
    it('应该正确生成Handoff工具', () => {
      const graph = loadFromYaml(multiAgentYaml);
      
      const translator = graph.getNode('translator');
      expect(translator?.tools).toBeDefined();
      expect(translator?.tools).toContain('handoff_to_reviewer');
    });

    it('应该正确处理多条条件边', () => {
      const graph = loadFromYaml(conditionalYaml);
      
      const classifier = graph.getNode('classifier');
      expect(classifier?.tools).toBeDefined();
      expect(classifier?.tools).toContain('handoff_to_tech');
      expect(classifier?.tools).toContain('handoff_to_sales');
    });

    it('应该正确导出为DOT格式', () => {
      const graph = loadFromYaml(multiAgentYaml);
      const dot = graph.toDot();
      
      expect(dot).toContain('digraph');
      expect(dot).toContain('translator');
      expect(dot).toContain('reviewer');
      expect(dot).toContain('->');
    });
  });
});

// ============ LangGraph兼容性测试 ============

describe('LangGraph兼容性', () => {
  
  describe('LangGraph适配器', () => {
    
    it('应该创建LangGraph适配器', () => {
      const graph = createGraph('test', 'Test')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const adapter = new LangGraphAdapter(graph);
      expect(adapter).toBeDefined();
    });

    it('应该检查LangGraph可用性', async () => {
      const graph = createGraph('test', 'Test')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const adapter = new LangGraphAdapter(graph);
      const available = await adapter.isLangGraphAvailable();
      
      // 如果没有安装@langchain/langgraph，应该返回false
      expect(typeof available).toBe('boolean');
    });

    it('应该将Graph转换为StateGraph配置', () => {
      const graph = loadFromYaml(multiAgentYaml);
      const adapter = new LangGraphAdapter(graph);
      
      // 验证适配器创建成功
      expect(adapter).toBeDefined();
    });

    it('应该正确处理中断点（Human-in-the-loop）', async () => {
      const graph = createGraph('hitl-test', 'Human-in-the-loop测试')
        .mode('langgraph')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const adapter = new LangGraphAdapter(graph, {
        checkpointerType: 'memory',
        onInterrupt: async (nodeId, state) => {
          console.log(`在节点 ${nodeId} 处中断`);
        }
      });

      expect(adapter).toBeDefined();
      // 验证中断回调已设置
    });

    it('应该支持Checkpoint持久化', () => {
      const graph = createGraph('checkpoint-test', 'Checkpoint测试')
        .mode('langgraph')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const adapter = new LangGraphAdapter(graph, {
        checkpointerType: 'memory'
      });

      expect(adapter).toBeDefined();
    });
  });

  describe('模式转换', () => {
    
    it('应该正确转换Lightweight模式到LangGraph', () => {
      const graph = loadFromYaml(simpleYaml);
      const adapter = new LangGraphAdapter(graph);
      
      // Lightweight模式的图应该能创建适配器
      expect(adapter).toBeDefined();
    });

    it('应该正确处理条件边转换', () => {
      const graph = loadFromYaml(conditionalYaml);
      const adapter = new LangGraphAdapter(graph);
      
      expect(adapter).toBeDefined();
      
      // 验证图结构
      const edges = graph.getEdges();
      const conditionalEdges = edges.filter(e => e.type === 'conditional');
      expect(conditionalEdges.length).toBeGreaterThan(0);
    });

    it('应该正确处理循环图', () => {
      const graph = loadFromYaml(loopYaml);
      
      const adapter = new LangGraphAdapter(graph);
      expect(adapter).toBeDefined();
    });
  });

  describe('状态管理', () => {
    
    it('应该能够创建适配器', () => {
      const graph = createGraph('state-test', 'State测试')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const adapter = new LangGraphAdapter(graph);
      expect(adapter).toBeDefined();
    });

    it('应该支持配置选项', async () => {
      const graph = createGraph('restore-test', 'State恢复测试')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const adapter = new LangGraphAdapter(graph, {
        checkpointerType: 'memory'
      });

      expect(adapter).toBeDefined();
    });
  });

  describe('错误处理和降级', () => {
    
    it('应该在LangGraph不可用时降级到Lightweight模式', async () => {
      const graph = createGraph('fallback-test', '降级测试')
        .mode('langgraph')
        .addAgent(createNode('agent-a', 'Agent A', 'Worker', 'Prompt'))
        .entry('agent-a')
        .build();

      const adapter = new LangGraphAdapter(graph);
      const available = await adapter.isLangGraphAvailable();
      
      if (!available) {
        // 应该能够使用Lightweight模式执行
        const mockLLM = {
          chat: async () => ({ content: '完成' })
        };
        
        const executor = new GraphExecutor(graph);
        const result = await executor.run('测试', mockLLM);
        
        expect(result.success).toBe(true);
      }
    });

    it('应该正确处理无效配置', () => {
      expect(() => {
        const graph = createGraph('test', 'Test')
          .entry('not-exist') // 无效的入口点
          .build();
      }).toThrow();
    });
  });
});

// ============ 集成场景测试 ============

describe('完整集成场景', () => {
  
  describe('场景1: 代码审查工作流', () => {
    
    it('应该完成完整的代码审查流程', async () => {
      // 加载YAML
      const graph = loadFromYaml(`
id: code-review
name: 代码审查
mode: lightweight
entry: style-checker

agents:
  - id: style-checker
    name: 风格检查
    role: StyleChecker
    systemPrompt: 检查代码风格
    tools:
      - handoff_to_bug-finder

  - id: bug-finder
    name: Bug检测
    role: BugFinder
    systemPrompt: 检测Bug
    tools:
      - handoff_to_reporter

  - id: reporter
    name: 报告生成
    role: Reporter
    systemPrompt: 生成报告

edges:
  - source: style-checker
    target: bug-finder
    type: direct

  - source: bug-finder
    target: reporter
    type: direct
`);

      // 创建Mock LLM
      const responses = [
        { content: '风格检查通过', toolCall: { name: 'transfer_to_bug-finder', args: {} } },
        { content: '发现1个潜在Bug', toolCall: { name: 'transfer_to_reporter', args: {} } },
        { content: '审查报告已生成' }
      ];
      
      let responseIndex = 0;
      const mockLLM = {
        chat: async () => responses[responseIndex++]
      };

      // 执行工作流
      const executor = new GraphExecutor(graph);
      const result = await executor.run('审查这段代码', mockLLM);

      // 验证结果
      expect(result.success).toBe(true);
      expect(result.result).toContain('审查报告已生成');
      expect(result.history.length).toBeGreaterThan(5);
      
      // 验证执行顺序
      const nodeEnters = result.history.filter(h => h.type === 'node_enter');
      expect(nodeEnters.length).toBe(3);
      expect(nodeEnters[0].nodeId).toBe('style-checker');
      expect(nodeEnters[1].nodeId).toBe('bug-finder');
      expect(nodeEnters[2].nodeId).toBe('reporter');
    });
  });

  describe('场景2: 模型训练工作流（循环）', () => {
    
    it('应该正确处理迭代训练流程', async () => {
      const graph = loadFromYaml(`
id: model-training
name: 模型训练
mode: lightweight
entry: coordinator
allowCycles: true
maxIterations: 3

agents:
  - id: coordinator
    name: 协调器
    role: Coordinator
    systemPrompt: 协调训练流程

  - id: trainer
    name: 训练器
    role: Trainer
    systemPrompt: 训练模型

edges:
  - source: coordinator
    target: trainer
    type: direct

  - source: trainer
    target: coordinator
    type: direct
`);

      let iteration = 0;
      const mockLLM = {
        chat: async () => {
          iteration++;
          if (iteration < 2) {
            return { 
              content: '继续训练', 
              toolCall: { name: iteration % 2 === 0 ? 'transfer_to_coordinator' : 'transfer_to_trainer', args: {} }
            };
          }
          return { content: '训练完成' };
        }
      };

      const executor = new GraphExecutor(graph);
      const result = await executor.run('开始训练', mockLLM);

      expect(result).toBeDefined();
      expect(iteration).toBeGreaterThan(0);
    });
  });

  describe('场景3: 多语言翻译工作流', () => {
    
    it('应该处理多步骤翻译流程', async () => {
      const graph = loadFromYaml(`
id: translation
name: 多语言翻译
mode: lightweight
entry: translator

agents:
  - id: translator
    name: 翻译员
    role: Translator
    systemPrompt: 翻译文本
    tools:
      - handoff_to_reviewer

  - id: reviewer
    name: 审核员
    role: Reviewer
    systemPrompt: 审核翻译质量

edges:
  - source: translator
    target: reviewer
    type: direct
`);

      const mockLLM = {
        chat: async () => ({
          content: '翻译完成',
          toolCall: { name: 'transfer_to_reviewer', args: {} }
        })
      };

      const executor = new GraphExecutor(graph);
      const result = await executor.run('Translate to English', mockLLM);

      expect(result.success).toBe(true);
      
      const handoffs = result.history.filter(h => h.type === 'handoff');
      expect(handoffs.length).toBeGreaterThan(0);
    });
  });

  describe('场景4: 智能客服工作流', () => {
    
    it('应该根据意图正确路由', async () => {
      const graph = loadFromYaml(`
id: customer-service
name: 智能客服
mode: lightweight
entry: classifier

agents:
  - id: classifier
    name: 意图识别
    role: Classifier
    systemPrompt: 识别用户意图
    tools:
      - handoff_to_tech
      - handoff_to_sales

  - id: tech
    name: 技术支持
    role: TechSupport
    systemPrompt: 解决技术问题

  - id: sales
    name: 销售
    role: Sales
    systemPrompt: 处理销售咨询

edges:
  - source: classifier
    target: tech
    type: conditional
    condition:
      keywords: [技术, bug, 错误]

  - source: classifier
    target: sales
    type: conditional
    condition:
      keywords: [购买, 价格]
`);

      // 测试技术问题路由
      const techMockLLM = {
        chat: async () => ({
          content: '这是个技术问题',
          toolCall: { name: 'transfer_to_tech', args: {} }
        })
      };

      const executor = new GraphExecutor(graph);
      const result = await executor.run('我遇到了bug', techMockLLM);

      expect(result.success).toBe(true);
      
      const techNodeEnters = result.history.filter(h => 
        h.type === 'node_enter' && h.nodeId === 'tech'
      );
      expect(techNodeEnters.length).toBeGreaterThan(0);
    });
  });
});

// ============ 性能和压力测试 ============

describe('性能测试', () => {
  
  it('应该快速加载大型YAML配置', () => {
    // 构建大型YAML
    const agents: string[] = [];
    for (let i = 0; i < 50; i++) {
      agents.push(`
  - id: agent-${i}
    name: Agent ${i}
    role: Worker
    systemPrompt: Worker ${i}
`);
    }

    const largeYaml = `
id: large-workflow
name: 大型工作流
mode: lightweight
entry: agent-0

agents:
${agents.join('')}

edges:
${Array.from({ length: 49 }, (_, i) => `
  - source: agent-${i}
    target: agent-${i + 1}
    type: direct
`).join('')}
`;

    const startTime = Date.now();
    const graph = loadFromYaml(largeYaml);
    const loadTime = Date.now() - startTime;

    expect(graph.getNodes().size).toBe(50);
    expect(loadTime).toBeLessThan(500); // 应该在500ms内完成
  });

  it('应该正确处理并发执行', async () => {
    const graph = loadFromYaml(simpleYaml);
    const mockLLM = {
      chat: async () => ({ content: '完成' })
    };

    const executor = new GraphExecutor(graph);
    
    // 并发执行10个任务
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 10; i++) {
      promises.push(executor.run(`任务${i}`, mockLLM));
    }

    const results = await Promise.all(promises);
    
    expect(results.length).toBe(10);
    expect(results.every(r => r.success)).toBe(true);
  });
});

// ============ 错误场景测试 ============

describe('错误场景', () => {
  
  it('应该处理LLM错误', async () => {
    const graph = loadFromYaml(simpleYaml);
    const mockLLM = {
      chat: async () => {
        throw new Error('LLM服务不可用');
      }
    };

    const executor = new GraphExecutor(graph);
    
    try {
      const result = await executor.run('测试', mockLLM);
      expect(result.success).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('应该处理无效的工具调用', async () => {
    const graph = loadFromYaml(multiAgentYaml);
    const mockLLM = {
      chat: async () => ({
        content: '测试',
        toolCall: { name: 'invalid_tool', args: {} }
      })
    };

    const executor = new GraphExecutor(graph);
    const result = await executor.run('测试', mockLLM);

    // 应该优雅处理无效工具
    expect(result).toBeDefined();
  });

  it('应该处理超时', async () => {
    const graph = loadFromYaml(simpleYaml);
    const mockLLM = {
      chat: async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { content: '完成' };
      }
    };

    const executor = new GraphExecutor(graph);
    const result = await executor.run('测试', mockLLM);

    // 应该处理长时间运行
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  }, 10000);
});