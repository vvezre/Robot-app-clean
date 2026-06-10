const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '../dist');
const indexPath = path.join(distDir, 'index.html');

// 检查 dist 目录下的文件
const files = fs.existsSync(distDir) ? fs.readdirSync(distDir, { recursive: true }) : [];

// 查找 JS 和 CSS 文件
const jsFiles = [];
const cssFiles = [];

function findFiles(dir, baseDir = '') {
  const fullPath = path.join(dir, baseDir);
  if (!fs.existsSync(fullPath)) return;
  
  const items = fs.readdirSync(fullPath);
  items.forEach(item => {
    const itemPath = path.join(fullPath, item);
    const relativePath = path.join(baseDir, item).replace(/\\/g, '/');
    const stat = fs.statSync(itemPath);
    
    if (stat.isDirectory()) {
      findFiles(dir, relativePath);
    } else {
      if (item.endsWith('.js') && !item.endsWith('.map')) {
        jsFiles.push('./' + relativePath);
      } else if (item.endsWith('.css')) {
        cssFiles.push('./' + relativePath);
      }
    }
  });
}

findFiles(distDir);

// 生成 index.html
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-touch-fullscreen" content="yes">
  <meta name="format-detection" content="telephone=no,address=no">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
  <title>中拓智能</title>
${cssFiles.map(css => `  <link rel="stylesheet" href="${css}">`).join('\n')}
</head>
<body>
  <div id="app"></div>
${jsFiles.map(js => `  <script src="${js}"></script>`).join('\n')}
</body>
</html>
`;

// 确保 dist 目录存在
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 写入 index.html
fs.writeFileSync(indexPath, html, 'utf8');
console.log('✓ 已创建 dist/index.html');

