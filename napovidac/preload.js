const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('get-state'),
  setState: patch => ipcRenderer.send('set-state', patch),
  onState: fn => ipcRenderer.on('state', (_e, s) => fn(s)),
  cmd: (type, extra) => ipcRenderer.send('cmd', { type, ...(extra || {}) }),
  onCmd: fn => ipcRenderer.on('cmd', (_e, c) => fn(c)),
  sendStatus: st => ipcRenderer.send('status', st),
  onStatus: fn => ipcRenderer.on('status', (_e, s) => fn(s)),
  resizeTo: (w, h) => ipcRenderer.send('resize-to', { w, h }),
  ignoreMouse: v => ipcRenderer.send('ignore-mouse', v),
  remoteInfo: () => ipcRenderer.invoke('remote-info'),
  onRemoteInfo: fn => ipcRenderer.on('remote-info', (_e, r) => fn(r)),
});
