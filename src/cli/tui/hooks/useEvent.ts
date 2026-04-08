/**
 * 事件订阅 Hook
 * 
 * 封装事件总线的订阅逻辑，自动清理
 */
import { useEffect, useCallback, useRef } from 'react';
import { 
  onEvent, 
  EventType,
  type AgentMessageEvent,
  type UIMessageEvent,
  type UIStreamEvent,
  type UICodeEvent,
  type UIShellEvent,
  type WorkflowEvent,
} from '../../core/event-bus.js';

/**
 * 订阅 Agent 消息事件
 */
export function useAgentMessage(
  callback: (event: AgentMessageEvent) => void
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return onEvent(EventType.AGENT_MESSAGE, (data) => {
      callbackRef.current(data as AgentMessageEvent);
    });
  }, []);
}

/**
 * 订阅 UI 消息事件
 */
export function useUIMessage(
  callback: (event: UIMessageEvent) => void
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return onEvent(EventType.UI_MESSAGE_ADD, (data) => {
      callbackRef.current(data as UIMessageEvent);
    });
  }, []);
}

/**
 * 订阅流式事件
 */
export function useUIStream(
  onStream: (event: UIStreamEvent) => void,
  onEnd?: () => void
) {
  const onStreamRef = useRef(onStream);
  const onEndRef = useRef(onEnd);
  onStreamRef.current = onStream;
  onEndRef.current = onEnd;

  useEffect(() => {
    const unsubStream = onEvent(EventType.UI_MESSAGE_STREAM, (data) => {
      onStreamRef.current(data as UIStreamEvent);
    });

    const unsubEnd = onEvent(EventType.UI_STREAM_END, () => {
      onEndRef.current?.();
    });

    return () => {
      unsubStream();
      unsubEnd();
    };
  }, []);
}

/**
 * 订阅代码编辑事件
 */
export function useUICode(
  callback: (event: UICodeEvent) => void
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return onEvent(EventType.UI_CODE_START, (data) => {
      callbackRef.current(data as UICodeEvent);
    });
  }, []);
}

/**
 * 订阅 Shell 输出事件
 */
export function useUIShell(
  onOutput: (event: UIShellEvent) => void,
  onEnd?: (exitCode: number | null) => void
) {
  const onOutputRef = useRef(onOutput);
  const onEndRef = useRef(onEnd);
  onOutputRef.current = onOutput;
  onEndRef.current = onEnd;

  useEffect(() => {
    const unsubOutput = onEvent(EventType.UI_SHELL_OUTPUT, (data) => {
      onOutputRef.current(data as UIShellEvent);
    });

    const unsubEnd = onEvent(EventType.UI_SHELL_END, (data) => {
      const event = data as UIShellEvent;
      onEndRef.current?.(event.exitCode ?? null);
    });

    return () => {
      unsubOutput();
      unsubEnd();
    };
  }, []);
}

/**
 * 订阅工作流事件
 */
export function useWorkflow(
  onStart?: (event: WorkflowEvent) => void,
  onNodeStart?: (event: WorkflowEvent) => void,
  onNodeEnd?: (event: WorkflowEvent) => void,
  onEnd?: (event: WorkflowEvent) => void,
  onError?: (event: WorkflowEvent) => void
) {
  const handlers = useRef({ onStart, onNodeStart, onNodeEnd, onEnd, onError });
  handlers.current = { onStart, onNodeStart, onNodeEnd, onEnd, onError };

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    if (handlers.current.onStart) {
      unsubs.push(onEvent(EventType.WORKFLOW_START, (data) => {
        handlers.current.onStart?.(data as WorkflowEvent);
      }));
    }

    if (handlers.current.onNodeStart) {
      unsubs.push(onEvent(EventType.WORKFLOW_NODE_START, (data) => {
        handlers.current.onNodeStart?.(data as WorkflowEvent);
      }));
    }

    if (handlers.current.onNodeEnd) {
      unsubs.push(onEvent(EventType.WORKFLOW_NODE_END, (data) => {
        handlers.current.onNodeEnd?.(data as WorkflowEvent);
      }));
    }

    if (handlers.current.onEnd) {
      unsubs.push(onEvent(EventType.WORKFLOW_END, (data) => {
        handlers.current.onEnd?.(data as WorkflowEvent);
      }));
    }

    if (handlers.current.onError) {
      unsubs.push(onEvent(EventType.WORKFLOW_ERROR, (data) => {
        handlers.current.onError?.(data as WorkflowEvent);
      }));
    }

    return () => unsubs.forEach((unsub) => unsub());
  }, []);
}

/**
 * 通用事件订阅 Hook
 */
export function useEvent<T = unknown>(
  eventType: EventType,
  callback: (data: T) => void
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return onEvent(eventType, (data) => {
      callbackRef.current(data as T);
    });
  }, [eventType]);
}