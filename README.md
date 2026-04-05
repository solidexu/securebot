# 股票复杂规划算法系统
# Stock Complex Planning Algorithm System

一个完整的股票分析、优化和回测系统，包含技术分析、风险管理、投资组合优化和策略回测功能。

## 系统架构

```
stock_planning_system/
├── __init__.py          # 模块初始化
├── data_fetcher.py      # 数据获取模块
├── technical_analysis.py # 技术分析模块
├── risk_manager.py      # 风险管理模块
├── portfolio_optimizer.py # 投资组合优化模块
├── backtester.py        # 回测模块
├── visualizer.py        # 可视化模块
└── main.py              # 主程序
```

## 功能特性

### 1. 数据获取 (Data Fetcher)
- ✅ 支持真实股票数据获取 (yfinance)
- ✅ 模拟数据生成 (几何布朗运动)
- ✅ 数据缓存机制
- ✅ 批量数据下载

### 2. 技术分析 (Technical Analysis)
- ✅ 移动平均线 (SMA, EMA)
- ✅ 相对强弱指标 (RSI)
- ✅ MACD 指标
- ✅ 布林带 (Bollinger Bands)
- ✅ 平均真实波幅 (ATR)
- ✅ 随机指标 (Stochastic)
- ✅ 成交量加权平均价 (VWAP)
- ✅ 多策略信号生成

### 3. 风险管理 (Risk Management)
- ✅ 在险价值 (VaR)
- ✅ 条件在险价值 (CVaR)
- ✅ 最大回撤 (Max Drawdown)
- ✅ 夏普比率 (Sharpe Ratio)
- ✅ 索提诺比率 (Sortino Ratio)
- ✅ 卡尔玛比率 (Calmar Ratio)
- ✅ 贝塔系数 (Beta)
- ✅ 仓位大小计算
- ✅ 分散化分析

### 4. 投资组合优化 (Portfolio Optimization)
- ✅ 最大化夏普比率
- ✅ 最小化波动率
- ✅ 风险平价 (Risk Parity)
- ✅ 最小化最大回撤
- ✅ 均值方差优化
- ✅ 有效前沿计算

### 5. 策略回测 (Backtesting)
- ✅ 完整回测引擎
- ✅ 交易成本模拟
- ✅ 滑点模拟
- ✅ 性能指标计算
- ✅ 滚动窗口分析
- ✅ 参数敏感性分析

### 6. 可视化 (Visualization)
- ✅ 价格图表
- ✅ 权益曲线
- ✅ 回撤分析
- ✅ 交易分布
- ✅ 有效前沿
- ✅ 相关性热力图
- ✅ 性能指标仪表板

## 安装

### 环境要求
- Python 3.8+
- pip

### 安装依赖
```bash
pip install -r requirements.txt
```

### 可选依赖
```bash
# 测试
pip install pytest pytest-cov

# 开发
pip install black flake8 mypy
```

## 快速开始

### 1. 基本使用

```python
from stock_planning_system import StockPlanningAlgorithm

# 创建算法实例
algorithm = StockPlanningAlgorithm(
    initial_capital=100000,
    risk_free_rate=0.02,
    commission=0.001,
    slippage=0.001
)

# 运行综合分析
tickers = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA"]
summary = algorithm.run_comprehensive_analysis(
    tickers=tickers,
    start_date="2020-01-01",
    end_date="2023-12-31",
    use_simulated=False  # 使用真实数据
)

# 生成策略报告
algorithm.generate_strategy_report("strategy_report.md")
```

### 2. 技术分析

```python
from stock_planning_system import TechnicalAnalyzer
import pandas as pd

# 创建分析器
analyzer = TechnicalAnalyzer()

# 计算所有技术指标
df = analyzer.calculate_all_indicators(price_data)

# 生成交易信号
signals = analyzer.generate_signals(df)
```

### 3. 风险管理

```python
from stock_planning_system import RiskManager

# 创建风险管理器
risk_manager = RiskManager(risk_free_rate=0.02)

# 计算风险指标
metrics = risk_manager.calculate_risk_metrics(prices)

# 计算仓位大小
sizing = risk_manager.calculate_position_sizing(
    account_value=100000,
    risk_per_trade=0.02,
    stop_loss_pct=0.05
)
```

### 4. 投资组合优化

```python
from stock_planning_system import PortfolioOptimizer

# 创建优化器
optimizer = PortfolioOptimizer(risk_free_rate=0.02)

# 最大化夏普比率
result = optimizer.optimize_portfolio(prices_dict, method='max_sharpe')

# 计算有效前沿
frontier = optimizer.efficient_frontier(prices_dict, n_points=50)
```

### 5. 策略回测

```python
from stock_planning_system import Backtester

# 创建回测器
backtester = Backtester(initial_capital=100000)

# 运行回测
result = backtester.run_backtest(df, signal)

# 滚动窗口分析
results = backtester.walk_forward_analysis(df, signal)

# 参数敏感性分析
sensitivity = backtester.parameter_sensitivity(df, signal_generator, param_ranges)
```

### 6. 可视化

```python
from stock_planning_system import Visualizer

# 创建可视化器
viz = Visualizer()

# 生成图表
viz.plot_price_chart(df, "Price Chart", "output.png")
viz.plot_equity_curve(equity, "Equity Curve", "equity.png")
viz.plot_drawdown_chart(equity, "Drawdown", "drawdown.png")

# 生成综合报告
viz.create_comprehensive_report(df, result, "reports", "analysis")
```

## 运行测试

```bash
# 运行所有测试
pytest tests/ -v

# 运行特定测试
pytest tests/test_stock_planning.py::TestTechnicalAnalyzer -v

# 运行带覆盖率测试
pytest tests/ --cov=stock_planning_system --cov-report=html
```

## 运行主程序

```bash
# 运行完整分析
python stock_planning_system/main.py
```

## 示例输出

### 回测结果
```
=== 回测结果 ===
初始资金: $100,000.00
最终资金: $125,432.15
总收益: 25.43%
年化收益: 6.12%
波动率: 15.23%
夏普比率: 0.38
索提诺比率: 0.52
最大回撤: -12.45%
最大回撤持续时间: 180 天
胜率: 58.33%
盈亏因子: 1.45
总交易次数: 120
盈利交易: 70
亏损交易: 50
平均盈利: 2.34%
平均亏损: -1.61%
最大盈利: 15.67%
最大亏损: -8.23%
```

### 投资组合优化结果
```
最大化夏普比率优化:
  预期收益: 0.1234
  波动率: 0.1567
  夏普比率: 0.6543
  权重:
    - AAPL: 25.00%
    - GOOGL: 20.00%
    - MSFT: 25.00%
    - AMZN: 15.00%
    - TSLA: 15.00%
```

## 配置文件

创建 `config.yaml` 文件进行自定义配置：

```yaml
# 系统配置
system:
  initial_capital: 100000
  risk_free_rate: 0.02
  commission: 0.001
  slippage: 0.001

# 技术指标配置
technical:
  sma_periods: [20, 50]
  rsi_period: 14
  macd_fast: 12
  macd_slow: 26
  macd_signal: 9
  bollinger_std: 2
  atr_period: 14

# 风险管理配置
risk:
  var_confidence: 0.95
  max_position_size: 0.2
  max_drawdown_limit: 0.15
  stop_loss_pct: 0.05
  take_profit_pct: 0.10

# 回测配置
backtest:
  initial_capital: 100000
  commission: 0.001
  slippage: 0.001
  walk_forward_train_ratio: 0.7
  walk_forward_step_size: 60
```

## 性能优化

- 使用数据缓存减少重复请求
- 并行计算优化回测速度
- 向量化计算提高性能
- 内存管理优化大数据集处理

## 最佳实践

1. **数据质量**: 确保输入数据完整且准确
2. **参数调优**: 使用滚动窗口分析避免过拟合
3. **风险管理**: 始终设置止损和仓位限制
4. **回测验证**: 使用样本外数据进行验证
5. **可视化**: 定期生成图表监控策略表现

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request!

## 联系方式

- Email: example@email.com
- GitHub: https://github.com/yourusername/stock_planning_system

---

**注意**: 本系统仅供教育和研究使用，不构成投资建议。投资有风险，入市需谨慎。
