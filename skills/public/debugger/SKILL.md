---
name: debugger
description: Use this skill when you need to debug code, troubleshoot errors, analyze stack traces, or investigate runtime issues. Triggers on debugging requests, error analysis, or bug investigation tasks.
version: "1.0.0"
license: MIT
keywords:
  - debugging
  - troubleshooting
  - error-analysis
  - bug-fixing
  - stack-trace
tools:
  - read
  - exec
---

# Debugger

## Purpose

Systematically identify and resolve bugs, errors, and unexpected behavior in code.

## When to Use

- Analyzing error messages and stack traces
- Debugging failing tests
- Investigating runtime issues
- Troubleshooting production incidents
- Memory leak detection

## Debugging Process

### 1. Reproduce the Issue
- Identify the exact steps to reproduce
- Note the expected vs actual behavior
- Gather relevant logs and error messages

### 2. Isolate the Problem
- Use binary search to narrow down the code
- Check recent changes (git diff/blame)
- Review related configuration

### 3. Analyze Root Cause
- Read the stack trace carefully
- Check variable states at breakpoints
- Review error handling logic

### 4. Fix and Verify
- Implement the fix
- Add test cases
- Verify no regressions

## Common Debugging Techniques

- **Logging**: Add strategic log statements
- **Print Debugging**: Quick variable inspection
- **Breakpoints**: Step through code execution
- **Assertions**: Validate assumptions
- **Rubber Duck**: Explain the problem out loud

## Output Format

```
Issue: [problem description]
Root Cause: [analysis]
Solution: [fix with code]
Prevention: [how to avoid in future]
```