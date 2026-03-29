#!/usr/bin/env python3
"""
Code analysis script for code review skill.
"""

import sys
import os

def analyze_file(filepath: str) -> dict:
    """Analyze a single file for common issues."""
    results = {
        "file": filepath,
        "issues": [],
        "stats": {}
    }
    
    if not os.path.exists(filepath):
        results["issues"].append({
            "severity": "error",
            "message": f"File not found: {filepath}"
        })
        return results
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        lines = content.split('\n')
        
        results["stats"]["lines"] = len(lines)
        results["stats"]["characters"] = len(content)
        
        # Check for long lines
        for i, line in enumerate(lines, 1):
            if len(line) > 120:
                results["issues"].append({
                    "line": i,
                    "severity": "warning",
                    "message": f"Line too long ({len(line)} chars)"
                })
    
    return results

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python analyze.py <file>")
        sys.exit(1)
    
    result = analyze_file(sys.argv[1])
    print(f"Analyzed {result['stats']['lines']} lines")
    print(f"Found {len(result['issues'])} issues")