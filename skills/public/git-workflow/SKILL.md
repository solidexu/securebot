---
name: git-workflow
description: |
  当用户需要 Git 操作帮助时使用，包括提交、分支管理、合并、解决冲突、变基等。
  即使用户没有明确说"git"，只要提到"提交"、"分支"、"合并"、"冲突"、"rebase"、"推送"、"拉取"等相关请求，都应该使用此技能。
  提供 Git 最佳实践和工作流程指导。
version: "1.0.0"
keywords:
  - git
  - commit
  - branch
  - merge
  - rebase
  - 分支
  - 合并
  - 提交
  - 冲突
metadata:
  openclaw:
    emoji: "🔀"
    requires:
      bins: [git]
---

# Git 工作流技能

提供 Git 版本控制的最佳实践和工作流程指导。

## 何时使用

- 用户需要 Git 操作帮助
- 用户问关于分支、合并、变基的问题
- 用户遇到 Git 冲突需要解决
- 用户想了解 Git 工作流程

## 常用工作流程

### GitHub Flow

```
main (始终可部署)
  └── feature/xxx (功能分支)
```

1. 从 `main` 创建分支
2. 开发并提交
3. 创建 Pull Request
4. 代码审查
5. 合并到 `main` 并部署

## 常用命令

### 分支操作

```bash
git checkout -b feature/new-feature
git branch -a
git branch -d feature/old-feature
```

### 提交操作

```bash
git status
git add .
git commit -m "feat: 添加用户登录功能"
```

### 合并与变基

```bash
git merge feature/new-feature
git rebase main
```

## 提交消息规范

```
<type>(<scope>): <subject>

类型：feat | fix | docs | style | refactor | test | chore
```

## 冲突解决

1. 打开冲突文件
2. 找到冲突标记并修改
3. 删除冲突标记
4. `git add . && git commit`

## 最佳实践

1. **频繁提交**：小步提交，便于回滚
2. **有意义的提交消息**：清楚描述做了什么
3. **保持分支整洁**：定期清理已合并的分支
4. **代码审查**：通过 Pull Request 进行审查