// core/types.js
/**
 * 統一的適配器初始化參數類型
 * 解決參數傳遞不一致的問題
 */
export class AdapterInit {
  constructor({
    id,
    config = {},
    logger = console,
    telemetry = null,
    clock = () => new Date(),
    connection = null,
    deps = {}
  }) {
    this.id = id;
    this.config = config;
    this.logger = logger;
    this.telemetry = telemetry;
    this.clock = clock;
    this.connection = connection;
    this.deps = deps;
  }
}
