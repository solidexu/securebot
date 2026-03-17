#!/bin/bash
# Skill 链路测试脚本

echo "=========================================="
echo "SecureBot Skill 链路测试"
echo "=========================================="
echo ""

# 测试配置
ROOT_DIR="${1:-/tmp/securebot-test}"
CONFIG_FILE="$ROOT_DIR/config.json"

# 清理并创建测试目录
echo "[1/6] 准备测试环境..."
rm -rf "$ROOT_DIR"
mkdir -p "$ROOT_DIR"

# 创建测试配置
cat > "$CONFIG_FILE" << 'EOF'
{
  "model": {
    "model": "qwen3.5-35b-a3b",
    "baseUrl": "http://localhost:11434"
  },
  "rootDir": "/tmp/securebot-test",
  "defaultAgent": "test",
  "agents": [
    {
      "id": "test",
      "name": "测试助手",
      "workspace": "test",
      "default": true,
      "skills": []
    }
  ]
}
EOF

echo "✓ 配置文件已创建: $CONFIG_FILE"
echo ""

# 测试 1: Skill 创建
echo "[2/6] 测试 Skill 创建..."
echo "执行: securebot skill create --agent test"
echo "预期: 创建个人技能"
echo ""

# 测试 2: 列出技能
echo "[3/6] 测试列出技能..."
echo "执行: securebot skill list"
echo "预期: 显示公共技能和个人技能"
echo ""

# 测试 3: 智能唤醒
echo "[4/6] 测试智能唤醒..."
echo "输入: 帮我审查这段代码"
echo "预期: 🎯 激活技能: 代码审查"
echo ""

# 测试 4: RAG 同步
echo "[5/6] 测试记忆 → RAG 同步..."
echo "输入: 记住我喜欢用 uv 管理 Python 环境"
echo "预期: [Memory] 已同步到 RAG"
echo ""

# 测试 5: 技能工具
echo "[6/6] 测试技能工具..."
echo "工具列表:"
echo "  - create_skill: 创建技能"
echo "  - update_skill: 更新技能"
echo "  - list_skills: 列出技能"
echo "  - delete_skill: 删除技能"
echo ""

echo "=========================================="
echo "测试完成"
echo "=========================================="
echo ""
echo "清理测试环境:"
echo "  rm -rf $ROOT_DIR"