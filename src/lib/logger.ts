// 安全日志工具 - 生产环境自动禁用敏感日志

const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  log: (...args: any[]) => {
    if (isDev) console.log(...args);
  },
  
  warn: (...args: any[]) => {
    if (isDev) console.warn(...args);
  },
  
  error: (...args: any[]) => {
    // 错误日志保留，但过滤敏感信息
    const filtered = args.map(arg => {
      if (typeof arg === 'string') {
        return arg
          .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED]')
          .replace(/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g, '[REDACTED]')
          .replace(/postgresql:\/\/[^\s]+/g, '[REDACTED]');
      }
      return arg;
    });
    console.error(...filtered);
  },
  
  debug: (...args: any[]) => {
    // Debug 仅开发环境
    if (isDev) console.log('[DEBUG]', ...args);
  }
};
