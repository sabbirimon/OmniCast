'use strict';

const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('omni', {
  state: () => ipcRenderer.invoke('state'),
  start: (key, kind, options) => ipcRenderer.invoke('start', key, kind, options),
  stop: (key, kind) => ipcRenderer.invoke('stop', key, kind),
  control: (key, kind, action) => ipcRenderer.invoke('control', key, kind, action),
  info: (key, kind) => ipcRenderer.invoke('info', key, kind),
  photo: (key, useCatalog) => ipcRenderer.invoke('photo', key, useCatalog),
  pair: (address, code) => ipcRenderer.invoke('pair', address, code),
  connect: (address) => ipcRenderer.invoke('connect', address),
  save: (key, name, auto) => ipcRenderer.invoke('save', key, name, auto),
  forget: (key) => ipcRenderer.invoke('forget', key),
  reveal: () => ipcRenderer.invoke('reveal'),
  onState: (callback) => ipcRenderer.on('state', (_event, data) => callback(data)),
  onNotice: (callback) => ipcRenderer.on('notice', (_event, data) => callback(data)),
});
