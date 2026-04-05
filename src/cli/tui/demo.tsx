#!/usr/bin/env node
/**
 * SecureBot TUI Demo (Ink 版本)
 * 
 * 运行方式: npx tsx src/cli/tui/demo.tsx
 */

import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

async function main() {
  console.log('Starting SecureBot TUI (Ink)...');
  console.log('');
  
  const { waitUntilExit } = render(
    <App 
      defaultAgent="dev"
      commands={['/help', '/exit', '/clear', '/agents', '/skills', '/status']}
      agents={['dev', 'support', 'analyst']}
      onMessage={async (message) => {
        console.log('Received message:', message);
      }}
    />
  );

  await waitUntilExit();
  console.log('TUI closed.');
}

main().catch(console.error);