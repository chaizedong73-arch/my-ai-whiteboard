// 暂时留空，或者通过 contextBridge 暴露安全的 API
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('electron', {});
