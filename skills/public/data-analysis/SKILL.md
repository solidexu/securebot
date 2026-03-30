---
name: data-analysis
description: |
  当用户上传 Excel (.xlsx/.xls) 或 CSV 文件并希望进行数据分析、生成统计、创建摘要、数据透视表、SQL 查询或任何形式的结构化数据探索时使用。
  即使用户没有明确说"分析"，只要上传了数据文件并请求处理，或者提到"统计"、"数据"、"报表"等，都应该使用此技能。
  支持多工作表 Excel、聚合、过滤、连接和导出结果。
version: "1.0.0"
keywords:
  - 数据分析
  - Excel
  - CSV
  - 统计
  - DuckDB
  - 数据透视
metadata:
  openclaw:
    emoji: "📊"
    requires:
      bins: [python3]
---

# 数据分析技能

使用 DuckDB 分析用户上传的 Excel/CSV 文件。

## 何时使用

- 用户上传 Excel 或 CSV 文件
- 用户请求数据分析
- 用户需要统计摘要
- 用户需要数据透视表

## 核心能力

- 自动检测文件格式
- 多工作表支持
- SQL 查询接口
- 聚合和过滤
- 导出多种格式

## 工作流程

1. 检查上传的文件结构
2. 自动推断列类型
3. 执行用户请求的分析
4. 生成可视化或报告

## 分析模式

```sql
-- 基础探索
SELECT COUNT(*) FROM Sheet1

-- 聚合分组
SELECT category, COUNT(*) as cnt 
FROM Sheet1 GROUP BY category

-- 窗口函数
SELECT *, RANK() OVER (ORDER BY amount DESC) as rank
FROM Sales
```

## 输出格式

```markdown
# 数据分析报告

## 数据概览
- 行数：X
- 列数：Y

## 统计摘要
[表格统计]

## 关键发现
1. [发现 1]
2. [发现 2]
```