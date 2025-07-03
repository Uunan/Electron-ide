// preload.js (GÜNCELLENMİŞ TAM KOD)

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Pencere Kontrolleri
    minimize: () => ipcRenderer.send('minimize-app'),
    maximize: () => ipcRenderer.send('maximize-app'),
    close: () => ipcRenderer.send('close-app'),
    onWindowMaximizedStatus: (callback) => ipcRenderer.on('window-maximized-status', (event, ...args) => callback(...args)),

    // İki Yönlü IPC İletişimi için Köprü
    send: (channel, data) => {
        ipcRenderer.send(channel, data);
    },
    on: (channel, func) => {
        ipcRenderer.on(channel, (event, ...args) => func(...args));
    },

    // YENİ EKLENEN ŞİFRELEME FONKSİYONLARI
    encryptString: (text) => ipcRenderer.invoke('encrypt-string', text),
    decryptString: (hash) => ipcRenderer.invoke('decrypt-string', hash),
});


