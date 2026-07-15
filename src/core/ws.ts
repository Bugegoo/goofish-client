import WebSocket from 'ws';
import { logger } from '../utils/logger';
import type {
  WsClientConfig,
  WsMessage,
  WsResponse,
  WsReadyState,
  WsEventMap,
  PendingRequest,
  WsConnectOptions,
} from '../types/common/ws';
import { IM_CONFIG, IM_ENDPOINTS } from '../constants';

/**
 * WebSocket 客户端
 * 提供 WebSocket 连接管理、消息发送接收、事件处理等核心功能
 */
export class WsClient {
  private ws: WebSocket | undefined;
  private config: Required<WsClientConfig>;
  private url: string = '';
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private pendingRequests: Map<string, PendingRequest<unknown>> = new Map();
  private messageQueue: WsMessage[] = [];
  private eventHandlers: Map<
    keyof WsEventMap,
    Set<WsEventMap[keyof WsEventMap]>
  > = new Map();
  private isManualClose: boolean = false;

  constructor(config: WsClientConfig = {}) {
    this.config = {
      wsUrl: config.wsUrl ?? IM_CONFIG.WS_URL,
      autoReconnect: config.autoReconnect ?? true,
      reconnectInterval:
        config.reconnectInterval ?? IM_CONFIG.RECONNECT_INTERVAL,
      maxReconnectAttempts:
        config.maxReconnectAttempts ?? IM_CONFIG.MAX_RECONNECT_ATTEMPTS,
      heartbeatInterval:
        config.heartbeatInterval ?? IM_CONFIG.HEARTBEAT_INTERVAL,
      requestTimeout: config.requestTimeout ?? IM_CONFIG.REQUEST_TIMEOUT,
      headers: config.headers ?? {},
    };
  }

  /**
   * 连接 WebSocket
   */
  async connect(url?: string, options?: WsConnectOptions): Promise<void> {
    if (this.ws && this.connected) {
      logger.warn('WebSocket 已连接，无需重复连接');
      return;
    }

    // 合并配置
    if (options) {
      Object.assign(this.config, options);
    }

    this.url = url ?? this.config.wsUrl;
    this.isManualClose = false;

    return new Promise((resolve, reject) => {
      try {
        // 创建 WebSocket 实例
        const wsOptions = {
          headers: this.config.headers,
        };

        this.ws = new WebSocket(this.url, wsOptions);

        // 标记 Promise 是否已经 settled
        let settled = false;

        // 设置一次性事件处理（用于连接阶段）
        this.ws.once('open', (): void => {
          settled = true;
          logger.info('✅ WebSocket 连接成功:', this.url);
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.flushMessageQueue();
          this.emit('open');
          resolve();
        });

        this.ws.once('error', (error: Error): void => {
          logger.error('❌ WebSocket 连接错误:', error);
          if (!settled) {
            settled = true;
            reject(error);
          }
          this.emit('error', error);
        });

        // 设置持久事件处理（连接后的事件）
        this.ws.on('close', (code: number, reason: Buffer): void => {
          logger.info('WebSocket 连接关闭:', {
            code,
            reason: reason.toString(),
          });
          this.stopHeartbeat();
          this.emit('close', { code, reason: reason.toString() });

          // 自动重连
          if (this.config.autoReconnect && !this.isManualClose) {
            this.scheduleReconnect();
          }
        });

        this.ws.on('message', (data: Buffer | string): void => {
          this.handleMessage(data);
        });

        // 连接成功后，继续监听后续的错误事件
        this.ws.on('error', (error: Error): void => {
          if (settled) {
            logger.error('❌ WebSocket 运行时错误:', error);
            this.emit('error', error);
          }
        });
      } catch (error) {
        logger.error('创建 WebSocket 连接失败:', error);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.isManualClose = true;
    this.stopHeartbeat();
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    // 清理待处理请求
    this.pendingRequests.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error('WebSocket 连接已关闭'));
    });
    this.pendingRequests.clear();
  }

  /**
   * 发送消息并等待响应
   */
  async send<T = unknown>(message: WsMessage): Promise<WsResponse<T>> {
    if (!this.connected) {
      // 连接断开时，将消息加入队列
      this.messageQueue.push(message);
      throw new Error('WebSocket 未连接，消息已加入队列');
    }

    // 生成消息 ID（如果没有）
    const mid = (message.headers?.mid as string) || this.generateMessageId();
    message.headers = { ...message.headers, mid };

    return new Promise<WsResponse<T>>((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(mid);
        reject(new Error(`请求超时: ${message.lwp}`));
      }, this.config.requestTimeout);

      // 存储待处理请求
      this.pendingRequests.set(mid, {
        resolve: resolve as (value: WsResponse<unknown>) => void,
        reject,
        timeout,
      });

      // 发送消息
      try {
        const data = JSON.stringify(message);
        if (this.ws) {
          this.ws.send(data);
        }
        logger.debug('📤 发送消息:', message);
      } catch (error) {
        this.pendingRequests.delete(mid);
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * 直接发送消息（不等待响应）
   */
  sendRaw(message: WsMessage): void {
    if (!this.connected) {
      this.messageQueue.push(message);
      logger.warn('WebSocket 未连接，消息已加入队列');
      return;
    }

    try {
      const data = JSON.stringify(message);
      if (this.ws) {
        this.ws.send(data);
      }
      logger.debug('📤 发送原始消息:', message);
    } catch (error) {
      logger.error('发送消息失败:', error);
    }
  }

  /**
   * 处理接收到的消息（总入口，进行消息分发）
   */
  private handleMessage(data: Buffer | string): void {
    try {
      const message: WsResponse =
        typeof data === 'string'
          ? JSON.parse(data)
          : JSON.parse(data.toString());

      logger.debug('📥 收到消息:', message);

      // 底层消息事件（所有消息都会触发）
      this.emit('message', message);

      // 检查是否是待处理请求的响应
      const mid = message.headers?.mid as string;
      if (mid && this.pendingRequests.has(mid)) {
        const pending = this.pendingRequests.get(mid)!;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(mid);

        if (message.code === 200) {
          pending.resolve(message);
        } else {
          pending.reject(
            new Error(`请求失败: ${message.code} - ${JSON.stringify(message)}`)
          );
        }
        return;
      }

      // 协议层：自动处理同步推送消息的 ACK
      if (message.lwp === IM_ENDPOINTS.PUSH.SYNC) {
        logger.debug('🔄 自动 ACK 同步推送消息');
        const ackMessage: WsMessage = {
          code: 200,
          headers: message.headers,
        };
        this.sendRaw(ackMessage);
      }
    } catch (error) {
      logger.error('解析消息失败:', error);
      this.emit('error', error as Error);
    }
  }

  /**
   * 生成消息 ID
   */
  private generateMessageId(): string {
    const random = Math.floor(1e3 * Math.random());
    const time = new Date().getTime();
    return `${random}${time} 0`;
  }

  /**
   * 刷新消息队列
   */
  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) {
      return;
    }

    logger.info(`📨 发送队列中的 ${this.messageQueue.length} 条消息`);
    const queue = [...this.messageQueue];
    this.messageQueue = [];

    queue.forEach((message) => {
      this.sendRaw(message);
    });
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    if (this.config.heartbeatInterval <= 0) {
      return;
    }

    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) {
        // 发送心跳消息
        this.sendRaw({
          lwp: IM_ENDPOINTS.AUTH.HEARTBEAT,
          headers: { mid: this.generateMessageId() },
        });
        this.emit('heartbeat');
        logger.debug('💓 发送心跳');
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * 计划重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error('❌ 达到最大重连次数，放弃重连');
      this.emit('reconnect-failed');
      return;
    }

    this.reconnectAttempts++;
    logger.info(
      `🔄 ${this.config.reconnectInterval}ms 后尝试第 ${this.reconnectAttempts} 次重连...`
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect(this.url)
        .then(() => {
          logger.info('✅ 重连成功');
          this.emit('reconnect', this.reconnectAttempts);
        })
        .catch((error) => {
          logger.error('重连失败:', error);
        });
    }, this.config.reconnectInterval);
  }

  /**
   * 清除重连定时器
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /**
   * 事件监听
   */
  on<K extends keyof WsEventMap>(event: K, handler: WsEventMap[K]): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.add(handler);
    }
  }

  /**
   * 移除事件监听
   */
  off<K extends keyof WsEventMap>(event: K, handler: WsEventMap[K]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * 单次事件监听
   */
  once<K extends keyof WsEventMap>(event: K, handler: WsEventMap[K]): void {
    const wrappedHandler = ((...args: unknown[]) => {
      (handler as (...a: unknown[]) => void)(...args);
      this.off(event, wrappedHandler);
    }) as WsEventMap[K];

    this.on(event, wrappedHandler);
  }

  /**
   * 触发事件
   */
  private emit<K extends keyof WsEventMap>(
    event: K,
    ...args: Parameters<WsEventMap[K]>
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          (handler as (...a: unknown[]) => void)(...args);
        } catch (error) {
          logger.error(`事件处理器错误 [${event}]:`, error);
        }
      });
    }
  }

  /**
   * 获取连接状态
   */
  get readyState(): WsReadyState {
    if (!this.ws) {
      return WebSocket.CLOSED;
    }
    return this.ws.readyState;
  }

  /**
   * 是否已连接
   */
  get connected(): boolean {
    if (!this.ws) {
      return false;
    }
    return this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * 获取原生 WebSocket 实例（用于高级场景）
   */
  getWebSocket(): WebSocket | undefined {
    return this.ws;
  }

  /**
   * 获取配置
   */
  getConfig(): Readonly<Required<WsClientConfig>> {
    return { ...this.config };
  }

  /**
   * 获取待处理请求数量
   */
  get pendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * 获取消息队列长度
   */
  get queueLength(): number {
    return this.messageQueue.length;
  }
}
