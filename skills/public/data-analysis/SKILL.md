---
name: data-analysis
description: 当用户上传 Excel (.xlsx/.xls) 或 CSV 文件并希望进行数据分析、生成统计、创建摘要、数据透视表、SQL 查询或任何形式的结构化数据探索时使用此技能。支持多工作表 Excel 工作簿、聚合、过滤、连接和导出结果到 CSV/JSON/Markdown。
---

# 数据分析技能

## 概述

使用 DuckDB（一个进程内分析 SQL 引擎）分析用户上传的 Excel/CSV 文件。支持模式检查、基于 SQL 的查询、统计摘要和结果导出。

## 核心能力

- 检查 Excel/CSV 文件结构（工作表、列、类型、行数）
- 对上传的数据执行任意 SQL 查询
- 生成统计摘要（均值、中位数、标准差、百分位、空值）
- 支持多工作表 Excel 工作簿（每个工作表成为一个表）
- 将查询结果导出为 CSV、JSON 或 Markdown
- 使用 DuckDB 的列式引擎高效处理大文件

## 工作流程

### 步骤一：理解需求

当用户上传数据文件并请求分析时，识别：

- **文件位置**：上传的 Excel/CSV 文件路径
- **分析目标**：用户想要什么洞察（摘要、过滤、聚合、比较等）
- **输出格式**：结果应如何呈现（表格、CSV 导出、JSON 等）

### 步骤二：检查文件结构

首先检查上传的文件以了解其模式：

```bash
python /workspace/scripts/data-analysis/analyze.py \
  --files /workspace/uploads/data.xlsx \
  --action inspect
```

这将返回：
- 工作表名称（Excel）或文件名（CSV）
- 列名、数据类型和非空计数
- 每个工作表/文件的行数
- 示例数据（前 5 行）

### 步骤三：执行分析

根据模式构建 SQL 查询来回答用户的问题。

#### 运行 SQL 查询

```bash
python /workspace/scripts/data-analysis/analyze.py \
  --files /workspace/uploads/data.xlsx \
  --action query \
  --sql "SELECT category, COUNT(*) as count, AVG(amount) as avg_amount FROM Sheet1 GROUP BY category ORDER BY count DESC"
```

#### 生成统计摘要

```bash
python /workspace/scripts/data-analysis/analyze.py \
  --files /workspace/uploads/data.xlsx \
  --action summary \
  --table Sheet1
```

返回每列：计数、均值、标准差、最小值、25%、50%、75%、最大值、空值计数。

#### 导出结果

```bash
python /workspace/scripts/data-analysis/analyze.py \
  --files /workspace/uploads/data.xlsx \
  --action query \
  --sql "SELECT * FROM Sheet1 WHERE amount > 1000" \
  --output-file /workspace/outputs/filtered-results.csv
```

支持的输出格式（根据扩展名自动检测）：
- `.csv` — 逗号分隔值
- `.json` — JSON 记录数组
- `.md` — Markdown 表格

## 表命名规则

- **Excel 文件**：每个工作表成为以工作表命名的表（如 `Sheet1`、`Sales`、`Revenue`）
- **CSV 文件**：表名是不带扩展名的文件名（如 `data.csv` → `data`）
- **多个文件**：所有文件的所有表都在同一查询上下文中可用，支持跨文件连接
- **特殊字符**：带空格或特殊字符的工作表/文件名会自动清理（空格 → 下划线）

## 分析模式

### 基础探索
```sql
-- 行计数
SELECT COUNT(*) FROM Sheet1

-- 列中的不同值
SELECT DISTINCT category FROM Sheet1

-- 值分布
SELECT category, COUNT(*) as cnt FROM Sheet1 GROUP BY category ORDER BY cnt DESC

-- 日期范围
SELECT MIN(date_col), MAX(date_col) FROM Sheet1
```

### 聚合与分组
```sql
-- 按类别和月份的收入
SELECT category, DATE_TRUNC('month', order_date) as month,
       SUM(revenue) as total_revenue
FROM Sales
GROUP BY category, month
ORDER BY month, total_revenue DESC

-- 前10名客户消费
SELECT customer_name, SUM(amount) as total_spend
FROM Orders GROUP BY customer_name
ORDER BY total_spend DESC LIMIT 10
```

### 跨文件连接
```sql
-- 连接销售和客户信息
SELECT s.order_id, s.amount, c.customer_name, c.region
FROM sales s
JOIN customers c ON s.customer_id = c.id
WHERE s.amount > 500
```

### 窗口函数
```sql
-- 累计总和和排名
SELECT order_date, amount,
       SUM(amount) OVER (ORDER BY order_date) as running_total,
       RANK() OVER (ORDER BY amount DESC) as amount_rank
FROM Sales
```

## 输出处理

分析后：

- 在对话中直接呈现查询结果为格式化表格
- 对于大结果集，导出到文件
- 始终用通俗语言解释发现，附带关键要点
- 当模式有趣时建议后续分析
- 如果用户想保留结果，主动提出导出

## 注意事项

- DuckDB 支持完整 SQL，包括窗口函数、CTE、子查询和高级聚合
- Excel 日期列会自动解析；使用 DuckDB 日期函数
- 对于大文件（100MB+），DuckDB 能高效处理而不全部加载到内存
- 带空格的列名可使用双引号访问：`"Column Name"`