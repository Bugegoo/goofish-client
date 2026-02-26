import { HttpClient } from '../core/http';
import { WsClient } from '../core/ws';
import {
  createCookieInterceptor,
  createLogInterceptor,
} from '../core/interceptor';
import { SearchService } from '../services/mtop/search.service';
import { UserService } from '../services/mtop/user.service';
import { ItemService } from '../services/mtop/item.service';
import { FavorService } from '../services/mtop/favor.service';
import { OrderService } from '../services/mtop/order.service';
import { ImService } from '../services/mtop/im.service';
import { ConversationService } from '../services/im/conversation.service';
import { MessageService } from '../services/im/message.service';
import {
  API_CONFIG,
  MTOP_CONFIG,
  PASSPORT_CONFIG,
  IM_CONFIG,
} from '../constants';
import { LogLevel } from '../utils/logger';
import { logger } from '../utils/logger';
import { CookieStore, CookieUtils } from '../utils/cookie';
import type { GoofishConfig } from '../types';
import { QrService } from '../services/passport/qr.service';
import { LoginService } from '../services/passport/login.service';
import { HomeService } from '../services/mtop';
import { generateUUID, generateSecureRandomString } from '../utils';
import { AuthService } from '../services/im';


export class Goofish {
  // Mtop HTTP 客户端
  private readonly httpMtop: HttpClient;
  // Passport HTTP 客户端
  private readonly httpPassport: HttpClient;
  // IM WebSocket 客户端
  private readonly wsIm: WsClient;

  // Mtop Cookie 存储
  private readonly cookieStoreMtop: CookieStore;
  // Passport Cookie 存储
  private readonly cookieStorePassport: CookieStore;

  // 服务实例
  public readonly api: {
    // Mtop 服务
    mtop: {
      // 搜索服务
      search: SearchService;
      // 用户服务
      user: UserService;
      // 首页服务
      home: HomeService;
      // 商品服务
      item: ItemService;
      // 收藏服务
      favor: FavorService;
      // 订单服务
      order: OrderService;
      // IM 服务
      im: ImService;
    };
    // Passport 服务
    passport: {
      // 二维码服务
      qr: QrService;
      // 登录服务
      login: LoginService;
    };
    // IM 服务
    im: {
      // 认证服务
      auth: AuthService;
      // 会话服务
      conversation: ConversationService;
      // 消息服务
      message: MessageService;
    };
  };

  // 配置
  public readonly config: GoofishConfig;

  constructor(config: Partial<GoofishConfig> = {}) {
    // 初始化日志管理器
    logger.setLevel(config.level || LogLevel.WARN);

    this.config = {
      level: config.level || LogLevel.INFO,
      cookie: config.cookie || `cna=${generateSecureRandomString(24)}`,
      agent: config.agent,

      // Mtop 配置
      mtop: {
        baseURL: config.mtop?.baseURL || MTOP_CONFIG.BASE_URL,
        apiPrefix: config.mtop?.apiPrefix || MTOP_CONFIG.API_PREFIX,
        appKey: config.mtop?.appKey || MTOP_CONFIG.APP_KEY,
        jsv: config.mtop?.jsv || MTOP_CONFIG.JSV,
        timeout: config.mtop?.timeout || MTOP_CONFIG.TIMEOUT,
        dataType: config.mtop?.dataType || MTOP_CONFIG.DATA_TYPE,
        type: config.mtop?.type || MTOP_CONFIG.TYPE,
        sessionOption: config.mtop?.sessionOption || MTOP_CONFIG.SESSION_OPTION,
        v: config.mtop?.v || MTOP_CONFIG.V,
        accountSite: config.mtop?.accountSite || MTOP_CONFIG.ACCOUNT_SITE,
        spmCnt: config.mtop?.spmCnt || MTOP_CONFIG.SPM_CNT,
        spmPre: config.mtop?.spmPre || MTOP_CONFIG.SPM_PRE,
        logId: config.mtop?.logId || MTOP_CONFIG.LOG_ID,
      },
      // Passport 配置
      passport: {
        baseURL: config.passport?.baseURL || PASSPORT_CONFIG.BASE_URL,
        appName: config.passport?.appName || PASSPORT_CONFIG.APP_NAME,
        fromSite: config.passport?.fromSite || PASSPORT_CONFIG.FROM_SITE,
      },
      // IM 配置
      im: {
        wsUrl: config.im?.wsUrl || IM_CONFIG.WS_URL,
        // secondaryWsUrl: config.im?.secondaryWsUrl || IM_CONFIG.SECONDARY_WS_URL,
        appKey: config.im?.appKey || IM_CONFIG.APP_KEY,
        deviceId: config.im?.deviceId || `${generateUUID()}-${Date.now()}`,
        autoReconnect: config.im?.autoReconnect ?? true,
        heartbeatInterval:
          config.im?.heartbeatInterval || IM_CONFIG.HEARTBEAT_INTERVAL,
        reconnectInterval:
          config.im?.reconnectInterval || IM_CONFIG.RECONNECT_INTERVAL,
        maxReconnectAttempts:
          config.im?.maxReconnectAttempts || IM_CONFIG.MAX_RECONNECT_ATTEMPTS,
        requestTimeout: config.im?.requestTimeout || IM_CONFIG.REQUEST_TIMEOUT,
      },

      // 请求头配置
      headers: {
        origin: config.headers?.origin || API_CONFIG.ORIGIN,
        referer: config.headers?.referer || API_CONFIG.REFERER,
        contentType: config.headers?.contentType || API_CONFIG.CONTENT_TYPE,
        userAgent: config.headers?.userAgent || API_CONFIG.USER_AGENT,
      },
    };
    const agent = this.config.agent;

    // 创建 HTTP 客户端
    this.httpMtop = new HttpClient({
      baseURL: this.config.mtop.baseURL,
      axiosConfig: {
        withCredentials: true,
        httpAgent: agent,
        httpsAgent: agent,
      },
    });

    this.httpPassport = new HttpClient({
      baseURL: this.config.passport.baseURL,
      axiosConfig: {
        withCredentials: true,
        httpAgent: agent,
        httpsAgent: agent,
      },
    });

    // 创建 WebSocket 客户端
    this.wsIm = new WsClient({
      wsUrl: this.config.im?.wsUrl,
      autoReconnect: this.config.im?.autoReconnect,
      reconnectInterval: this.config.im?.reconnectInterval,
      maxReconnectAttempts: this.config.im?.maxReconnectAttempts,
      heartbeatInterval: this.config.im?.heartbeatInterval,
      requestTimeout: this.config.im?.requestTimeout,
    });

    // 创建 Cookie 存储
    this.cookieStoreMtop = new CookieStore();
    this.cookieStorePassport = new CookieStore();

    // 设置初始 cookie
    this.updateCookieMtop(this.config.cookie);
    this.updateCookiePassport(this.config.cookie);

    // 初始化服务
    this.api = {
      mtop: {
        search: new SearchService(this.httpMtop, this.config),
        user: new UserService(this.httpMtop, this.config),
        home: new HomeService(this.httpMtop, this.config),
        item: new ItemService(this.httpMtop, this.config),
        favor: new FavorService(this.httpMtop, this.config),
        order: new OrderService(this.httpMtop, this.config),
        im: new ImService(this.httpMtop, this.config),
      },
      passport: {
        qr: new QrService(this.httpPassport, this.config),
        login: new LoginService(this.httpPassport, this.config),
      },
      im: {
        auth: new AuthService(this.wsIm, this.httpMtop, this.config),
        conversation: new ConversationService(
          this.wsIm,
          this.httpMtop,
          this.config
        ),
        message: new MessageService(this.wsIm, this.httpMtop, this.config),
      },
    };

    // 设置拦截器
    this.setupInterceptors();

    // 打印日志
    logger.debug('Goofish 初始化完成', {
      config: this.config,
    });
  }

  /**
   * 获取当前配置
   */
  getConfig(): Readonly<GoofishConfig> {
    return { ...this.config };
  }

  /**
   * 设置拦截器
   */
  private setupInterceptors(): void {
    const axiosMtop = this.httpMtop.getAxios();
    const axiosPassport = this.httpPassport.getAxios();
    // 日志拦截器
    const logInterceptor = createLogInterceptor();
    // Mtop Cookie 拦截器
    const cookieInterceptorMtop = createCookieInterceptor(this.cookieStoreMtop);
    // Passport Cookie 拦截器
    const cookieInterceptorPassport = createCookieInterceptor(
      this.cookieStorePassport
    );
    axiosMtop.interceptors.request.use(logInterceptor.request);
    axiosMtop.interceptors.response.use(
      logInterceptor.response,
      logInterceptor.error
    );
    axiosMtop.interceptors.request.use(cookieInterceptorMtop.request);
    axiosMtop.interceptors.response.use(cookieInterceptorMtop.response);

    axiosPassport.interceptors.request.use(logInterceptor.request);
    axiosPassport.interceptors.response.use(
      logInterceptor.response,
      logInterceptor.error
    );
    axiosPassport.interceptors.request.use(cookieInterceptorPassport.request);
    axiosPassport.interceptors.response.use(cookieInterceptorPassport.response);
  }

  /**
   * 更新 Cookie mtop
   */
  updateCookieMtop(cookie: string): void {
    const cookies = CookieUtils.parseCookieHeader(cookie);
    logger.debug('🔄 更新 cookie mtop', cookies);
    Object.entries(cookies).forEach(([name, value]) => {
      this.cookieStoreMtop.set(name, value);
    });
  }

  /**
   * 更新 Cookie passport
   */
  updateCookiePassport(cookie: string): void {
    const cookies = CookieUtils.parseCookieHeader(cookie);
    logger.debug('🔄 更新 cookie passport', cookies);
    Object.entries(cookies).forEach(([name, value]) => {
      this.cookieStorePassport.set(name, value);
    });
  }

  /**
   * 获取 Cookie mtop
   */
  getCookieMtop(): string {
    return this.cookieStoreMtop.getCookieHeader();
  }

  /**
   * 获取 Cookie passport
   */
  getCookiePassport(): string {
    return this.cookieStorePassport.getCookieHeader();
  }

  /**
   * 直接访问 HTTP 客户端 mtop
   */
  get httpClientMtop(): HttpClient {
    return this.httpMtop;
  }

  /**
   * 直接访问 HTTP 客户端 passport
   */
  get httpClientPassport(): HttpClient {
    return this.httpPassport;
  }

  /**
   * 直接访问 WebSocket 客户端 IM
   */
  get wsClientIm(): WsClient {
    return this.wsIm;
  }
}
