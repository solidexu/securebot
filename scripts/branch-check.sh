#!/bin/bash
# SecureBot 分支差异检查
# 每天下午6点运行

REPO_DIR="$HOME/.openclaw/workspace_arch/products/securebot"
MEMORY_FILE="$HOME/.openclaw/workspace_app/memory/branch-check.md"

cd "$REPO_DIR" || exit 1

# 拉取最新
git fetch origin main dev 2>/dev/null
git fetch github main dev 2>/dev/null

# 检查差异
COMMITS=$(git log origin/main..origin/dev --oneline 2>/dev/null)

if [ -z "$COMMITS" ]; then
  echo "✅ main 和 dev 分支已同步" > "$MEMORY_FILE"
else
  COUNT=$(echo "$COMMITS" | wc -l)
  {
    echo "# 📋 SecureBot 待测试功能"
    echo ""
    echo "**检查时间**: $(date '+%Y-%m-%d %H:%M')"
    echo ""
    echo "dev 分支领先 main 分支 **$COUNT** 个提交："
    echo ""
    echo '```'
    echo "$COMMITS"
    echo '```'
    echo ""
    echo "---"
    echo ""
    echo "**测试完成后合并到 main：**"
    echo '```bash'
    echo "git checkout main"
    echo "git merge dev"
    echo "git push origin main"
    echo "git push github main"
    echo '```'
  } > "$MEMORY_FILE"
fi

echo "分支差异已写入 $MEMORY_FILE"