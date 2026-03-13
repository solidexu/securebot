#!/bin/bash
# SecureBot 集成测试脚本

set -e

echo "=== SecureBot 集成测试 ==="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass=0
fail=0

check() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $1${NC}"
        ((pass++))
    else
        echo -e "${RED}✗ $1${NC}"
        ((fail++))
    fi
}

warn() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# 1. 检查 Ollama
echo ">>> 检查 Ollama 服务..."
curl -s http://localhost:11434/api/tags > /dev/null 2>&1
check "Ollama 服务可访问"

# 2. 检查模型
echo ""
echo ">>> 检查模型..."
if curl -s http://localhost:11434/api/tags | grep -q "qwen"; then
    echo -e "${GREEN}✓ qwen 模型已安装${NC}"
    ((pass++))
else
    warn "qwen 模型未安装，运行: ollama pull qwen3.5-35b-a3b"
    ((fail++))
fi

# 3. 检查嵌入模型
echo ""
echo ">>> 检查嵌入模型..."
if curl -s http://localhost:11434/api/tags | grep -q "nomic-embed-text"; then
    echo -e "${GREEN}✓ nomic-embed-text 模型已安装${NC}"
    ((pass++))
else
    warn "nomic-embed-text 模型未安装，RAG 功能将受限"
fi

# 4. 构建检查
echo ""
echo ">>> 构建检查..."
npm run build > /dev/null 2>&1
check "项目构建成功"

# 5. 类型检查
echo ""
echo ">>> 类型检查..."
npm run typecheck > /dev/null 2>&1
check "TypeScript 类型检查通过"

# 6. 单元测试
echo ""
echo ">>> 单元测试..."
npm test > /dev/null 2>&1
check "单元测试全部通过"

# 7. 配置文件检查
echo ""
echo ">>> 配置文件检查..."
if [ -f ~/.securebot/config.json ]; then
    echo -e "${GREEN}✓ 配置文件存在${NC}"
    ((pass++))
else
    echo -e "${YELLOW}⚠ 配置文件不存在，首次运行会自动创建${NC}"
fi

# 8. CLI 帮助测试
echo ""
echo ">>> CLI 测试..."
node dist/cli/index.js --help > /dev/null 2>&1
check "CLI 帮助命令正常"

# 总结
echo ""
echo "=== 测试总结 ==="
echo -e "${GREEN}通过: $pass${NC}"
if [ $fail -gt 0 ]; then
    echo -e "${RED}失败: $fail${NC}"
fi
echo ""

if [ $fail -eq 0 ]; then
    echo -e "${GREEN}所有检查通过！可以运行 npm run dev 启动 SecureBot${NC}"
    exit 0
else
    echo -e "${YELLOW}部分检查未通过，请根据提示修复${NC}"
    exit 1
fi