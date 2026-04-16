/**
 * Tool Schema 测试
 */

import { describe, it, expect } from 'vitest';
import { generateToolSchema, generateToolSchemas } from './schema.js';
import { readTool } from './fs.js';

describe('Tool Schema', () => {
  it('should generate correct OpenAI schema', () => {
    const schema = generateToolSchema(readTool);

    expect(schema.type).toBe('function');
    expect(schema.function.name).toBe('read');
    expect(schema.function.description).toBeDefined();
    expect(schema.function.parameters).toBeDefined();
  });

  it('should generate schemas for multiple tools', () => {
    const schemas = generateToolSchemas([readTool]);

    expect(schemas.length).toBe(1);
    expect(schemas[0].function.name).toBe('read');
  });

  it('should preserve parameter structure', () => {
    const schema = generateToolSchema(readTool);

    expect(schema.function.parameters.type).toBe('object');
    expect(schema.function.parameters.properties).toBeDefined();
  });
});
