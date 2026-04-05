#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

export interface TuiOptions {
  defaultAgent?: string;
  model?: string;
}

export async function startTuiRepl(options: TuiOptions = {}): Promise<void> {
  const { waitUntilExit } = render(
    <App 
      defaultAgent={options.defaultAgent || 'dev'}
      commands={['/help', '/exit', '/clear', '/agents', '/skills', '/status']}
      agents={['dev', 'support', 'analyst']}
    />
  );

  await waitUntilExit();
}

export { App } from './App.js';
export * from './types/index.js';
export * from './context/index.js';
export * from './components/index.js';
export * from './services/index.js';