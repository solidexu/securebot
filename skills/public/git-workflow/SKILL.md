---
name: git-workflow
description: 当用户需要 Git 操作帮助时使用，包括提交、分支管理、合并、解决冲突、变基等。提供 Git 最佳实践和工作流程指导。
---

# Git 工作流技能

## 概述

此技能提供 Git 版本控制的最佳实践和工作流程指导。

## 何时使用

- 用户需要 Git 操作帮助
- 用户问关于分支、合并、变基的问题
- 用户遇到 Git 冲突需要解决
- 用户想了解 Git 工作流程

## 常用工作流程

### 1. Git Flow

适用于有计划发布周期的项目。

```
main (生产分支)
  └── develop (开发分支)
        ├── feature/xxx (功能分支)
        ├── feature/yyy
        └── release/x.x (发布分支)
              └── hotfix/xxx (热修复分支)
```

**工作流程：**
1. 从 `develop` 创建 `feature` 分支
2. 开发完成后合并回 `develop`
3. 准备发布时创建 `release` 分支
4. 测试后合并到 `main` 和 `develop`
5. 生产问题从 `main` 创建 `hotfix` 分支

### 2. GitHub Flow

适用于持续部署的项目。

```
main (始终可部署)
  └── feature/xxx (功能分支)
```

**工作流程：**
1. 从 `main` 创建分支
2. 开发并提交
3. 创建 Pull Request
4. 代码审查
5. 合并到 `main` 并部署

### 3. Trunk Based Development

适用于快速迭代的项目。

```
main (主干)
  └── short-lived-feature (短命分支，1-2天)
```

## 常用命令

### 分支操作

```bash
# 创建并切换分支
git checkout -b feature/new-feature

# 查看所有分支
git branch -a

# 删除本地分支
git branch -d feature/old-feature

# 删除远程分支
git push origin --delete feature/old-feature
```

### 提交操作

```bash
# 查看状态
git status

# 添加文件
git add .
git add path/to/file

# 提交（使用规范消息）
git commit -m "feat: 添加用户登录功能"

# 修改最后一次提交
git commit --amend
```

### 合并与变基

```bash
# 合并分支
git merge feature/new-feature

# 变基（保持线性历史）
git rebase main

# 交互式变基（整理提交）
git rebase -i HEAD~3
```

### 远程操作

```bash
# 拉取最新代码
git pull origin main

# 推送到远程
git push origin feature/new-feature

# 设置上游分支
git push -u origin feature/new-feature
```

## 提交消息规范

### Conventional Commits

```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型：**
| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档更新 |
| `style` | 代码格式（不影响功能） |
| `refactor` | 重构 |
| `test` | 测试相关 |
| `chore` | 构建/工具相关 |

**示例：**
```
feat(auth): 添加 JWT 认证支持

- 实现 token 生成和验证
- 添加登录/登出接口
- 更新用户模型

Closes #123
```

## 冲突解决

### 查看冲突

```bash
# 查看冲突文件
git status

# 查看冲突详情
git diff
```

### 解决步骤

1. 打开冲突文件
2. 找到冲突标记：
   ```
   <<<<<<< HEAD
   当前分支的代码
   =======
   要合并分支的代码
   >>>>>>> feature/xxx
   ```
3. 手动修改代码，保留正确的内容
4. 删除冲突标记
5. 添加并提交：
   ```bash
   git add .
   git commit
   ```

## 常见问题

### 撤销操作

```bash
# 撤销工作区修改
git checkout -- file

# 撤销暂存区
git reset HEAD file

# 撤销最后一次提交（保留修改）
git reset --soft HEAD~1

# 撤销最后一次提交（丢弃修改）
git reset --hard HEAD~1
```

### 暂存工作

```bash
# 暂存当前修改
git stash

# 查看暂存列表
git stash list

# 恢复暂存
git stash pop

# 恢复特定暂存
git stash apply stash@{0}
```

### 回滚发布

```bash
# 创建回滚提交
git revert <commit-hash>

# 回滚多个提交
git revert <older-commit>..<newer-commit>
```

## 最佳实践

1. **频繁提交**：小步提交，便于回滚和理解变更
2. **有意义的提交消息**：清楚描述做了什么和为什么
3. **保持分支整洁**：定期清理已合并的分支
4. **使用 .gitignore**：忽略不应版本控制的文件
5. **代码审查**：通过 Pull Request 进行代码审查
6. **保护主分支**：禁止直接推送到 main/master