# 多模型配置指南

Securebot 支持配置多个模型，用于不同场景：

- **规划模型 (planner)**: 用于复杂任务拆分、计划生成
- **编码模型 (coder)**: 用于代码生成、编程任务
- **默认模型 (default)**: 用于一般对话

## 配置方法

编辑 `~/.securebot/config.json`:

```json
{
  "model": {
    "default": "mdq100/qwen3.5-flash:35b-code",
    "planner": "qwen3.5:35b-a3b",
    "coder": "mdq100/qwen3.5-flash:35b-code"
  },
  "ollama": {
    "baseUrl": "http://localhost:11434",
    "timeout": 300000
  }
}
```

## 你的模型配置

根据你的可用模型，推荐配置：

```json
{
  "model": {
    "default": "mdq100/qwen3.5-flash:35b-code",
    "planner": "mdq100/qwen3.5-flash:35b-code",
    "coder": "mdq100/qwen3.5-flash:35b-code"
  }
}
```

**说明**：
- `qwen3.5:35b-a3b` 用于规划时需要完整模型名
- `mdq100/qwen3.5-flash:35b-code` 已被验证可用

## 使用场景

| 场景 | 使用模型 |
|------|----------|
| 复杂任务规划 | planner 模型 |
| 代码生成/编辑 | coder 模型 |
| 简单对话 | default 模型 |

## 切换模型

运行时切换：
```
/model mdq100/qwen3.5-flash:35b-code
```