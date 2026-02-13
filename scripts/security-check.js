#!/usr/bin/env node

/**
 * 安全自检脚本
 * 运行: node scripts/security-check.js
 */

const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let issues = [];
let warnings = [];

console.log('🔒 安全自检开始...\n');

// 1. 检查 .env 文件
console.log('📁 检查环境变量文件...');
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  
  // 检查是否包含真实密钥模式
  const sensitivePatterns = [
    { pattern: /sk-[a-zA-Z0-9]{20,}/, name: 'Clerk Secret Key' },
    { pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]{20,}/, name: 'JWT Token (Supabase)' },
    { pattern: /postgresql:\/\/postgres\.[^:]+:[^@]+@/, name: '数据库密码' },
  ];
  
  let foundSecrets = false;
  sensitivePatterns.forEach(({ pattern, name }) => {
    if (pattern.test(envContent)) {
      foundSecrets = true;
    }
  });
  
  if (foundSecrets) {
    issues.push('.env 文件包含真实密钥，请确保它不会被提交到 Git');
  }
}

// 2. 检查 .gitignore
console.log('📁 检查 .gitignore...');
const gitignorePath = path.join(__dirname, '..', '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  
  if (!gitignoreContent.includes('.env')) {
    issues.push('.gitignore 未排除 .env 文件');
  }
  
  if (!gitignoreContent.includes('.clerk')) {
    warnings.push('.gitignore 未排除 .clerk 目录');
  }
} else {
  issues.push('缺少 .gitignore 文件');
}

// 3. 检查源代码中的硬编码密钥
console.log('📁 扫描源代码...');
const srcDir = path.join(__dirname, '..', 'src');

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        scanDirectory(filePath);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // 检查硬编码密钥模式
      if (/sk-[a-zA-Z0-9]{20,}/.test(content) && !content.includes('process.env')) {
        issues.push(`文件 ${filePath} 可能包含硬编码 Clerk Secret Key`);
      }
      
      if (/pk\.[a-zA-Z0-9]{20,}/.test(content) && !content.includes('process.env')) {
        issues.push(`文件 ${filePath} 可能包含硬编码 Mapbox Token`);
      }
      
      // 检查 console.log 中是否有可能泄露敏感信息（排除已添加环境判断的）
      if (/console\.log.*userId|console\.log.*email|console\.log.*token/i.test(content)) {
        // 检查是否已经添加了开发环境判断
        if (!content.includes('process.env.NODE_ENV') && !content.includes("process.env.NODE_ENV === 'development'")) {
          warnings.push(`文件 ${filePath} 包含可能泄露敏感信息的日志`);
        }
      }
    }
  }
}

scanDirectory(srcDir);

// 4. 输出结果
console.log('\n' + '='.repeat(50));
console.log('📊 检查结果');
console.log('='.repeat(50) + '\n');

if (issues.length === 0 && warnings.length === 0) {
  console.log(GREEN + '✅ 未发现安全问题！' + RESET);
} else {
  if (issues.length > 0) {
    console.log(RED + `❌ 发现 ${issues.length} 个严重问题：` + RESET);
    issues.forEach(issue => console.log(RED + `   • ${issue}` + RESET));
    console.log();
  }
  
  if (warnings.length > 0) {
    console.log(YELLOW + `⚠️  发现 ${warnings.length} 个警告：` + RESET);
    warnings.forEach(warning => console.log(YELLOW + `   • ${warning}` + RESET));
  }
}

console.log('\n💡 建议：');
console.log('   1. 定期轮换 API 密钥');
console.log('   2. 启用 Supabase RLS (Row Level Security)');
console.log('   3. 使用 Sentry 监控生产环境错误');
console.log('   4. 定期运行此检查: node scripts/security-check.js\n');

process.exit(issues.length > 0 ? 1 : 0);
