import type {
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import type { CookieStore } from '../utils/cookie';
import { logger } from '../utils/logger';

// ===== 类型定义 =====
interface RequestConfigWithMetadata extends InternalAxiosRequestConfig {
  metadata?: {
    startTime: number;
    requestId?: string;
  };
}

// 日志拦截器
export interface LogInterceptor {
  request: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
  response: (response: AxiosResponse) => AxiosResponse;
  error: (error: AxiosError) => never;
}

// Cookie 拦截器
export interface CookieInterceptor {
  request: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
  response: (response: AxiosResponse) => AxiosResponse;
}

// ===== Cookie 拦截器工厂 =====
export function createCookieInterceptor(
  cookieStore: CookieStore
): CookieInterceptor {
  return {
    request: (
      config: InternalAxiosRequestConfig
    ): InternalAxiosRequestConfig => {
      const cookieHeader = cookieStore.getCookieHeader();
      if (cookieHeader) {
        config.headers.Cookie = cookieHeader;
      }
      return config;
    },
    response: (response: AxiosResponse): AxiosResponse => {
      const setCookieHeaders = response.headers['set-cookie'];
      if (setCookieHeaders) {
        cookieStore.setFromHeaders(setCookieHeaders);

        // 记录日志
        logger.debug('🍪 Cookies updated:', cookieStore.getAll());
      }
      return response;
    },
  };
}

// ===== 日志拦截器工厂 =====
export function createLogInterceptor(): LogInterceptor {
  return {
    request: (
      config: InternalAxiosRequestConfig
    ): InternalAxiosRequestConfig => {
      // 记录开始时间和请求ID
      (config as RequestConfigWithMetadata).metadata = {
        startTime: Date.now(),
      };

      // 记录请求
      logger.request({
        method: config.method || '',
        url: config.url || '',
        data: config.data,
        headers: config.headers,
        params: config.params as Record<string, unknown>,
        cookie: config.headers?.Cookie || config.headers?.cookie,
      });

      return config;
    },

    response: (response: AxiosResponse): AxiosResponse => {
      const config = response.config as RequestConfigWithMetadata;
      const duration = config.metadata?.startTime
        ? Date.now() - config.metadata.startTime
        : undefined;

      logger.response({
        method: response.config.method || '',
        url: response.config.url || '',
        status: response.status,
        data: response.data,
        duration: duration || 0,
        setCookie: response.headers['set-cookie'],
      });

      return response;
    },

    error: (error: AxiosError): never => {
      if (error.response) {
        const config = error.config as RequestConfigWithMetadata;
        const duration = config?.metadata?.startTime
          ? Date.now() - config.metadata.startTime
          : undefined;

        logger.response({
          method: error.config?.method || '',
          url: error.config?.url || '',
          status: error.response.status,
          data: error.response.data,
          duration: duration || 0,
          setCookie: error.response.headers['set-cookie'],
        });
      } else if (error.request) {
        logger.error('请求失败，无响应', {
          method: error.config?.method || '',
          url: error.config?.url || '',
          message: error.message,
          setCookie: error.config?.headers?.Cookie || '',
        });
      } else {
        logger.error('请求配置错误', error.message);
      }

      throw error;
    },
  };
}
