const { contextBridge, ipcRenderer } = require('electron');

// Güvenlik: Renderer sürecinin erişebileceği kanalları burada tanımla
const validOnChannels = [
    'window-maximized-status', 'files-listed', 'file-content-loaded',
    'file-saved', 'item-created', 'context-menu-action'
];

const validSendChannels = [
    'setting-changed', 'minimize-app', 'maximize-app', 'close-app',
    'list-files', 'get-file-content', 'save-file-content', 'create-item'
];

contextBridge.exposeInMainWorld('electronAPI', {
    send: (channel, data) => {
        if (validSendChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    on: (channel, func) => {
        if (validOnChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    },
    onWindowMaximizedStatus: (callback) => {
        ipcRenderer.on('window-maximized-status', (event, ...args) => callback(...args));
    },

    // Invoke Kanalları
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    encryptString: (text) => ipcRenderer.invoke('encrypt-string', text),
    decryptString: (hash) => ipcRenderer.invoke('decrypt-string', hash),
    showContextMenu: (filePath) => ipcRenderer.invoke('show-context-menu', filePath),
    fileOperation: (args) => ipcRenderer.invoke('file-operation', args),
    uploadFile: (args) => ipcRenderer.invoke('upload-file', args)
});