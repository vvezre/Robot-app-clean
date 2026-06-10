const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '../dist');

function fixPublicPath(filePath) {
  if (!fs.existsSync(filePath)) return false;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // 替换 __webpack_require__.p 的赋值
  const patterns = [
    // 匹配各种 publicPath 设置方式
    [/__webpack_require__\.p\s*=\s*["']https?:\/\/[^"']+["']/g, '__webpack_require__.p = "./"'],
    [/__webpack_require__\.p\s*=\s*["']\/[^"']*["']/g, '__webpack_require__.p = "./"'],
    [/__webpack_require__\.p\s*=\s*["']https?:\/\/localhost[^"']*["']/g, '__webpack_require__.p = "./"'],
    
    // 替换 chunk 加载路径中的 localhost
    [/https?:\/\/localhost\/chunk\//g, './chunk/'],
    [/https?:\/\/[^/]+\/chunk\//g, './chunk/'],
    [/https?:\/\/localhost\/js\//g, './js/'],
    [/https?:\/\/[^/]+\/js\//g, './js/'],
    
    // 替换 webpack 的 chunk 加载函数中的路径
    [/["']https?:\/\/localhost\/chunk\/([^"']+)["']/g, '"./chunk/$1"'],
    [/["']https?:\/\/[^/]+\/chunk\/([^"']+)["']/g, '"./chunk/$1"'],
  ];
  
  patterns.forEach(([pattern, replacement]) => {
    if (pattern.test(content)) {
      content = content.replace(pattern, replacement);
      modified = true;
    }
  });
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  
  return false;
}

// 修复所有 JS 文件
function walkDir(dir) {
  let fixedCount = 0;
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      fixedCount += walkDir(filePath);
    } else if (file.endsWith('.js') && !file.endsWith('.map') && !file.endsWith('.LICENSE.txt')) {
      if (fixPublicPath(filePath)) {
        fixedCount++;
        console.log(`✓ 已修复: ${path.relative(distDir, filePath)}`);
      }
    }
  });
  
  return fixedCount;
}

if (!fs.existsSync(distDir)) {
  console.log('✗ dist 目录不存在，请先运行 npm run build:h5');
  process.exit(1);
}

console.log('开始修复 publicPath...');
const fixedCount = walkDir(distDir);

if (fixedCount > 0) {
  console.log(`\n✓ 共修复 ${fixedCount} 个文件`);
} else {
  console.log('\n✓ 未发现需要修复的文件（可能已经正确）');
}

