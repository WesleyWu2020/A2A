'use client';

import { useEffect, useRef, useCallback } from 'react';
import { getWebSocketClient, resetWebSocketClient, WebSocketClient } from '@/lib/api';
import { AgentStageMessage } from '@/types';

interface UseWebSocketOptions {
  onAgentStage?: (data: AgentStageMessage) => void;
  onNegotiationUpdate?: (data: unknown) => void;
  onChatMessage?: (data: unknown) => void;
  onError?: (data: { message: string }) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useWebSocket(
  sessionId: string | null,
  options: UseWebSocketOptions = {}
) {
  const wsClientRef = useRef<WebSocketClient | null>(null);
  const unsubscribersRef = useRef<(() => void)[]>([]);
  const optionsRef = useRef(options);

  // 更新 options ref
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // 初始化 WebSocket 连接
  useEffect(() => {
    if (!sessionId) return;

    const wsClient = getWebSocketClient(sessionId);
    wsClientRef.current = wsClient;

    // 连接 WebSocket
    wsClient.connect(sessionId)
      .then(() => {
        console.log('WebSocket connected for session:', sessionId);
        optionsRef.current.onConnect?.();
      })
      .catch((error) => {
        console.error('WebSocket connection failed:', error);
      });

    // 注册事件处理器
    const unsubscribers: (() => void)[] = [];

    if (optionsRef.current.onAgentStage) {
      unsubscribers.push(
        wsClient.onAgentStage((data) => {
          optionsRef.current.onAgentStage?.(data);
        })
      );
    }

    if (optionsRef.current.onNegotiationUpdate) {
      unsubscribers.push(
        wsClient.onNegotiationUpdate((data) => {
          optionsRef.current.onNegotiationUpdate?.(data);
        })
      );
    }

    if (optionsRef.current.onChatMessage) {
      unsubscribers.push(
        wsClient.onChatMessage((data) => {
          optionsRef.current.onChatMessage?.(data);
        })
      );
    }

    if (optionsRef.current.onError) {
      unsubscribers.push(
        wsClient.onError((data) => {
          optionsRef.current.onError?.(data);
        })
      );
    }

    unsubscribersRef.current = unsubscribers;

    // 清理函数
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [sessionId]);

  // 断开连接
  const disconnect = useCallback(() => {
    unsubscribersRef.current.forEach((unsubscribe) => unsubscribe());
    unsubscribersRef.current = [];
    resetWebSocketClient();
    wsClientRef.current = null;
  }, []);

  // 发送消息
  const sendMessage = useCallback((message: unknown) => {
    wsClientRef.current?.send(message);
  }, []);

  // 检查连接状态
  const isConnected = useCallback(() => {
    return wsClientRef.current?.isConnected() ?? false;
  }, []);

  return {
    disconnect,
    sendMessage,
    isConnected,
  };
}
