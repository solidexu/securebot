/**
 * Markdown 渲染器
 * 
 * 将 Markdown 文本转换为 Ink 可渲染的格式
 */

import React from 'react';
import { Text } from 'ink';

interface RenderResult {
  elements: React.ReactNode[];
  plainText: string;
}

export class MarkdownRenderer {
  render(content: string): RenderResult {
    const elements: React.ReactNode[] = [];
    const lines = content.split('\n');
    let inCodeBlock = false;
    let codeLang = '';
    let codeContent: string[] = [];
    let key = 0;

    for (const line of lines) {
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLang = line.slice(3).trim();
          codeContent = [];
        } else {
          inCodeBlock = false;
          elements.push(
            <Text key={key++} color="cyan" dimColor>
              {'─'.repeat(40)}
            </Text>
          );
          for (const codeLine of codeContent) {
            elements.push(
              <Text key={key++} color="gray">
                {'  ' + codeLine}
              </Text>
            );
          }
          elements.push(
            <Text key={key++} color="cyan" dimColor>
              {'─'.repeat(40)}
            </Text>
          );
          codeContent = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }

      if (line.startsWith('### ')) {
        elements.push(
          <Text key={key++} color="cyan" bold>
            {line.slice(4)}
          </Text>
        );
        continue;
      }

      if (line.startsWith('## ')) {
        elements.push(
          <Text key={key++} color="yellow" bold>
            {line.slice(3)}
          </Text>
        );
        continue;
      }

      if (line.startsWith('# ')) {
        elements.push(
          <Text key={key++} color="green" bold>
            {line.slice(2)}
          </Text>
        );
        continue;
      }

      if (line.startsWith('- ') || line.startsWith('* ')) {
        const rendered = this.renderInline(line.slice(2));
        elements.push(
          <Text key={key++}>
            <Text color="gray">• </Text>
            {rendered}
          </Text>
        );
        continue;
      }

      if (line.startsWith('> ')) {
        const rendered = this.renderInline(line.slice(2));
        elements.push(
          <Text key={key++} color="gray" italic>
            {'│ '}{rendered}
          </Text>
        );
        continue;
      }

      if (line.match(/^-{3,}$/) || line.match(/^\*{3,}$/)) {
        elements.push(
          <Text key={key++} color="gray" dimColor>
            {'─'.repeat(40)}
          </Text>
        );
        continue;
      }

      const rendered = this.renderInline(line);
      elements.push(<Text key={key++}>{rendered}</Text>);
    }

    return {
      elements,
      plainText: content,
    };
  }

  private renderInline(text: string): React.ReactNode {
    let result = text;

    result = result.replace(/\*\*(.+?)\*\*/g, '{$1}');
    result = result.replace(/\*(.+?)\*/g, '{{$1}}');
    result = result.replace(/`(.+?)`/g, '[[[$1]]]');

    const parts: React.ReactNode[] = [];
    let key = 0;

    let processed = result;
    processed = processed.replace(/\{(.+?)\}/g, (_, p1) => {
      return `\x00BOLD\x00${p1}\x00/BOLD\x00`;
    });
    processed = processed.replace(/\{\{(.+?)\}\}/g, (_, p1) => {
      return `\x00ITALIC\x00${p1}\x00/ITALIC\x00`;
    });
    processed = processed.replace(/\[\[\[(.+?)\]\]\]/g, (_, p1) => {
      return `\x00CODE\x00${p1}\x00/CODE\x00`;
    });

    const tokens = processed.split(/\x00/);
    for (const token of tokens) {
      if (token.startsWith('BOLD')) {
        const content = token.replace('BOLD', '').replace('/BOLD', '');
        parts.push(
          <Text key={key++} bold>
            {content}
          </Text>
        );
      } else if (token.startsWith('ITALIC')) {
        const content = token.replace('ITALIC', '').replace('/ITALIC', '');
        parts.push(
          <Text key={key++} italic>
            {content}
          </Text>
        );
      } else if (token.startsWith('CODE')) {
        const content = token.replace('CODE', '').replace('/CODE', '');
        parts.push(
          <Text key={key++} color="cyan" backgroundColor="gray">
            {' ' + content + ' '}
          </Text>
        );
      } else if (token) {
        parts.push(<Text key={key++}>{token}</Text>);
      }
    }

    return parts.length > 0 ? <>{parts}</> : text;
  }
}

export const markdownRenderer = new MarkdownRenderer();