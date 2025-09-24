/**
 * 控制台遙測適配器
 * 用於開發和調試，將遙測數據輸出到控制台
 */

export class ConsoleTelemetryAdapter {
  constructor(options = {}) {
    this.options = {
      logLevel: options.logLevel || 'info',
      prefix: options.prefix || '[Telemetry]',
      enableColors: options.enableColors !== false,
      metricsInterval: options.metricsInterval || 60000, // 1分鐘
      ...options
    };
    
    this.metrics = {
      queries: {
        total: 0,
        byType: {},
        latencies: []
      },
      storage: {
        puts: 0,
        gets: 0,
        deletes: 0
      },
      cache: {
        hits: 0,
        misses: 0
      },
      errors: []
    };
    
    this.startTime = Date.now();
    
    // 定期輸出統計
    if (this.options.metricsInterval > 0) {
      this.startMetricsReporting();
    }
  }

  /**
   * 記錄查詢
   */
  recordQuery(data) {
    this.metrics.queries.total++;
    
    // 按類型統計
    const type = data.type || 'unknown';
    this.metrics.queries.byType[type] = (this.metrics.queries.byType[type] || 0) + 1;
    
    // 記錄延遲
    if (data.latency) {
      this.metrics.queries.latencies.push(data.latency);
      // 保持最近1000個延遲記錄
      if (this.metrics.queries.latencies.length > 1000) {
        this.metrics.queries.latencies.shift();
      }
    }
    
    this.log('debug', `查詢: ${type}, 延遲: ${data.latency}ms, 結果: ${data.resultCount}`);
  }

  /**
   * 記錄存儲操作
   */
  recordStorage(operation, data) {
    switch (operation) {
      case 'put':
        this.metrics.storage.puts++;
        break;
      case 'get':
        this.metrics.storage.gets++;
        break;
      case 'delete':
        this.metrics.storage.deletes++;
        break;
    }
    
    this.log('debug', `存儲操作: ${operation}`, data);
  }

  /**
   * 記錄緩存命中/未命中
   */
  recordCache(hit) {
    if (hit) {
      this.metrics.cache.hits++;
    } else {
      this.metrics.cache.misses++;
    }
    
    const hitRate = this.calculateCacheHitRate();
    this.log('debug', `緩存${hit ? '命中' : '未命中'}, 命中率: ${hitRate.toFixed(2)}%`);
  }

  /**
   * 記錄錯誤
   */
  recordError(error) {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };
    
    this.metrics.errors.push(errorInfo);
    
    // 保持最近100個錯誤
    if (this.metrics.errors.length > 100) {
      this.metrics.errors.shift();
    }
    
    this.log('error', `錯誤: ${error.message}`, error.stack);
  }

  /**
   * 記錄自定義事件
   */
  recordEvent(eventName, data) {
    this.log('info', `事件: ${eventName}`, data);
  }

  /**
   * 創建計時器
   */
  startTimer(name) {
    const startTime = Date.now();
    
    return {
      end: (metadata) => {
        const duration = Date.now() - startTime;
        this.log('debug', `計時器 ${name}: ${duration}ms`, metadata);
        return duration;
      }
    };
  }

  /**
   * 創建直方圖
   */
  histogram(name, value, tags = {}) {
    this.log('debug', `直方圖 ${name}: ${value}`, tags);
  }

  /**
   * 創建計數器
   */
  counter(name, value = 1, tags = {}) {
    this.log('debug', `計數器 ${name}: +${value}`, tags);
  }

  /**
   * 創建量表
   */
  gauge(name, value, tags = {}) {
    this.log('debug', `量表 ${name}: ${value}`, tags);
  }

  /**
   * 計算緩存命中率
   */
  calculateCacheHitRate() {
    const total = this.metrics.cache.hits + this.metrics.cache.misses;
    if (total === 0) return 0;
    return (this.metrics.cache.hits / total) * 100;
  }

  /**
   * 計算查詢延遲統計
   */
  calculateLatencyStats() {
    const latencies = this.metrics.queries.latencies;
    if (latencies.length === 0) {
      return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }
    
    const sorted = [...latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  /**
   * 獲取當前指標
   */
  getMetrics() {
    const uptime = Date.now() - this.startTime;
    const latencyStats = this.calculateLatencyStats();
    const cacheHitRate = this.calculateCacheHitRate();
    
    return {
      uptime,
      queries: {
        ...this.metrics.queries,
        latencyStats,
        qps: this.metrics.queries.total / (uptime / 1000)
      },
      storage: this.metrics.storage,
      cache: {
        ...this.metrics.cache,
        hitRate: cacheHitRate
      },
      errors: {
        count: this.metrics.errors.length,
        recent: this.metrics.errors.slice(-10)
      }
    };
  }

  /**
   * 開始定期報告
   */
  startMetricsReporting() {
    this.metricsInterval = setInterval(() => {
      this.reportMetrics();
    }, this.options.metricsInterval);
  }

  /**
   * 報告當前指標
   */
  reportMetrics() {
    const metrics = this.getMetrics();
    
    console.log('\n' + this.colorize('===== 遙測報告 =====', 'cyan'));
    console.log(this.colorize(`運行時間: ${this.formatUptime(metrics.uptime)}`, 'gray'));
    
    console.log(this.colorize('\n查詢統計:', 'yellow'));
    console.log(`  總數: ${metrics.queries.total}`);
    console.log(`  QPS: ${metrics.queries.qps.toFixed(2)}`);
    console.log(`  延遲: 平均 ${metrics.queries.latencyStats.avg.toFixed(2)}ms, P95 ${metrics.queries.latencyStats.p95}ms`);
    
    console.log(this.colorize('\n存儲統計:', 'yellow'));
    console.log(`  寫入: ${metrics.storage.puts}`);
    console.log(`  讀取: ${metrics.storage.gets}`);
    console.log(`  刪除: ${metrics.storage.deletes}`);
    
    console.log(this.colorize('\n緩存統計:', 'yellow'));
    console.log(`  命中: ${metrics.cache.hits}`);
    console.log(`  未命中: ${metrics.cache.misses}`);
    console.log(`  命中率: ${metrics.cache.hitRate.toFixed(2)}%`);
    
    if (metrics.errors.count > 0) {
      console.log(this.colorize(`\n錯誤: ${metrics.errors.count} 個`, 'red'));
    }
    
    console.log(this.colorize('===================\n', 'cyan'));
  }

  /**
   * 格式化運行時間
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * 日誌輸出
   */
  log(level, message, data) {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.options.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    if (messageLevelIndex >= currentLevelIndex) {
      const timestamp = new Date().toISOString();
      const formattedMessage = `${timestamp} ${this.options.prefix} [${level.toUpperCase()}] ${message}`;
      
      const coloredMessage = this.colorize(formattedMessage, this.getLevelColor(level));
      
      if (data) {
        console.log(coloredMessage, data);
      } else {
        console.log(coloredMessage);
      }
    }
  }

  /**
   * 獲取級別顏色
   */
  getLevelColor(level) {
    const colors = {
      debug: 'gray',
      info: 'blue',
      warn: 'yellow',
      error: 'red'
    };
    return colors[level] || 'white';
  }

  /**
   * 著色（如果啟用）
   */
  colorize(text, color) {
    if (!this.options.enableColors) {
      return text;
    }
    
    const colors = {
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m',
      gray: '\x1b[90m',
      reset: '\x1b[0m'
    };
    
    return `${colors[color] || ''}${text}${colors.reset}`;
  }

  /**
   * 關閉遙測
   */
  close() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    // 輸出最終報告
    console.log(this.colorize('\n===== 最終遙測報告 =====', 'green'));
    this.reportMetrics();
  }
}

// 導出為默認
export default ConsoleTelemetryAdapter;
