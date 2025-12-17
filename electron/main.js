const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// 你的 Vercel 部署地址（上线后替换成真实的）
const PROD_URL = 'https://your-project-name.vercel.app';
const DEV_URL = 'http://localhost:3001';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "My AI Notes",
    // 隐藏默认菜单栏（可选）
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false, // 安全设置：禁止在渲染进程直接使用 Node API
      contextIsolation: true, // 安全设置
      preload: path.join(__dirname, 'preload.js'), // 预留预加载脚本
    },
  });

  // 根据环境加载不同的 URL
  const isDev = !app.isPackaged;
  const startUrl = isDev ? DEV_URL : PROD_URL;

  console.log(`Loading: ${startUrl}`);
  mainWindow.loadURL(startUrl);

  // 处理加载失败的情况
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.log(`Failed to load ${validatedURL}: ${errorCode} - ${errorDescription}`);

    // 如果是在生产环境下加载失败，显示离线页面
    if (!isDev && validatedURL.startsWith(PROD_URL)) {
      const offlinePath = path.join(__dirname, 'offline.html');
      mainWindow.loadFile(offlinePath);
    }
  });

  // 开发模式下自动打开开发者工具
  if (isDev) {
    // mainWindow.webContents.openDevTools();
  }

  // 拦截外部链接，使用系统默认浏览器打开（而不是在 Electron 内部跳转）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
