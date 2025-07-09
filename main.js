const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const axios = require('axios');
const https = require('https');
const crypto = require('crypto');
const Store = require('electron-store');
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const FormData = require('form-data');
const { Readable } = require('stream');

// --- Gerekli Değişkenler ve Ayarlar ---
const appVersion = require('./package.json').version;
const store = new Store();
let mainWindow;

// --- Auto Updater Ayarları ---
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false;

// --- Şifreleme Ayarları ---
let secretKey = store.get('secretKey');
if (!secretKey) {
    secretKey = crypto.randomBytes(32).toString('hex');
    store.set('secretKey', secretKey);
}
const key = Buffer.from(secretKey, 'hex');
const algorithm = 'aes-256-gcm';

// --- Yardımcı Fonksiyonlar ---
function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(hash) {
    try {
        const [ivHex, authTagHex, encryptedHex] = hash.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const encrypted = Buffer.from(encryptedHex, 'hex');
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
    } catch (error) {
        log.error("Şifre çözme hatası:", error);
        return null;
    }
}

function toPosixPath(p) {
    return p.replace(/\\/g, '/');
}

const getHttpsAgent = () => new https.Agent({
    rejectUnauthorized: store.get('cpanel-editor-settings', { rejectUnauthorized: false }).rejectUnauthorized
});

// --- Ana Pencereyi Oluşturma ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false,
        icon: path.join(__dirname, 'build/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'src/preload.js')
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'src/index.html'));

    mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized-status', true));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized-status', false));
}

// --- Uygulama Yaşam Döngüsü Olayları ---
app.whenReady().then(() => {
    createWindow();
    log.info('Uygulama başlatıldı, güncellemeler kontrol ediliyor.');
    autoUpdater.checkForUpdates();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- Auto Updater Olayları ---
autoUpdater.on('update-available', (info) => {
    log.info(`Güncelleme bulundu: ${info.version}`);
    dialog.showMessageBox({
        type: 'info', title: 'Güncelleme Mevcut',
        message: `Cortex IDE'nin yeni bir sürümü (${info.version}) mevcut.`,
        detail: 'Güncellemeyi şimdi indirip kurmak ister misiniz?',
        buttons: ['Evet, İndir', 'Hayır, Sonra']
    }).then(({ response }) => {
        if (response === 0) autoUpdater.downloadUpdate();
    });
});
autoUpdater.on('update-not-available', (info) => log.info('Güncelleme bulunamadı, uygulama güncel.'));
autoUpdater.on('update-downloaded', (info) => {
    log.info(`Güncelleme indirildi: ${info.version}`);
    dialog.showMessageBox({
        type: 'info', title: 'Güncelleme Hazır',
        message: `Yeni sürüm (${info.version}) indirildi. Uygulama yeniden başlatılacak.`,
        buttons: ['Yeniden Başlat ve Güncelle']
    }).then(() => autoUpdater.quitAndInstall());
});
autoUpdater.on('error', (err) => log.error('Otomatik güncelleme hatası: ', err));

// ===================================
//      IPC OLAYLARI (ANA MANTIK)
// ===================================

// --- Genel ---
ipcMain.handle('get-app-version', () => appVersion);
ipcMain.handle('encrypt-string', (event, text) => encrypt(text));
ipcMain.handle('decrypt-string', (event, hash) => decrypt(hash));
ipcMain.on('setting-changed', (event, settings) => {
    store.set('cpanel-editor-settings', settings);
    BrowserWindow.getAllWindows().forEach(win => {
        if (win.webContents !== event.sender) {
            win.webContents.send('settings-updated', settings);
        }
    });
});

// --- Pencere Kontrolleri ---
ipcMain.on('minimize-app', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.on('maximize-app', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('close-app', (event) => BrowserWindow.fromWebContents(event.sender)?.close());

// --- SAĞ TIK MENÜSÜ ---
ipcMain.handle('show-context-menu', (event, filePath) => {
    const template = [
        {
            label: 'Yeniden Adlandır',
            click: () => event.sender.send('context-menu-action', { action: 'rename-file', path: filePath })
        },
        {
            label: 'Sil',
            click: () => event.sender.send('context-menu-action', { action: 'delete-file', path: filePath })
        }
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
});

// --- cPanel API İşlemleri ---
ipcMain.on('list-files', async (event, { dirPath, credentials }) => {
    try {
        const posixPath = toPosixPath(dirPath);
        const authHeader = `cpanel ${credentials.username}:${credentials.token}`;
        const response = await axios.get(`${credentials.domain}/execute/Fileman/list_files`, {
            params: { dir: posixPath, 'show-dot-files': 1 },
            headers: { 'Authorization': authHeader },
            httpsAgent: getHttpsAgent()
        });
        if (response.data?.status === 1) {
            event.reply('files-listed', { success: true, files: response.data.data, currentDir: posixPath });
        } else {
            event.reply('files-listed', { success: false, error: response.data?.errors[0] || 'API Hatası', currentDir: posixPath });
        }
    } catch (error) {
        event.reply('files-listed', { success: false, error: error.message, currentDir: dirPath });
    }
});

ipcMain.on('get-file-content', async (event, { filePath, credentials }) => {
    try {
        const posixPath = toPosixPath(filePath);
        const authHeader = `cpanel ${credentials.username}:${credentials.token}`;
        const response = await axios.get(`${credentials.domain}/execute/Fileman/get_file_content`, {
            params: { dir: path.posix.dirname(posixPath), file: path.posix.basename(posixPath) },
            headers: { 'Authorization': authHeader },
            httpsAgent: getHttpsAgent()
        });
        if (response.data?.status === 1) {
            event.reply('file-content-loaded', { success: true, content: response.data.data.content || '', filePath: posixPath, charset: response.data.data.from_charset });
        } else {
            event.reply('file-content-loaded', { success: false, error: response.data?.errors[0], filePath: posixPath });
        }
    } catch (error) {
        event.reply('file-content-loaded', { success: false, error: error.message, filePath });
    }
});

ipcMain.on('save-file-content', async (event, { filePath, content, charset, credentials }) => {
    try {
        const posixPath = toPosixPath(filePath);
        const authHeader = `cpanel ${credentials.username}:${credentials.token}`;
        await axios.post(`${credentials.domain}/execute/Fileman/save_file_content`, null, {
            params: { dir: path.posix.dirname(posixPath), file: path.posix.basename(posixPath), content, from_charset: charset, to_charset: charset },
            headers: { 'Authorization': authHeader },
            httpsAgent: getHttpsAgent()
        });
        event.reply('file-saved', { success: true, filePath: posixPath });
    } catch (error) {
        event.reply('file-saved', { success: false, error: error.message, filePath });
    }
});

ipcMain.on('create-item', async (event, { type, dir, name, credentials }) => {
    try {
        const CpanelApi2Endpoint = `${credentials.domain}/json-api/cpanel`;
        const authHeader = `cpanel ${credentials.username}:${credentials.token}`;
        const params = {
            cpanel_jsonapi_apiversion: 2, cpanel_jsonapi_module: 'Fileman',
            cpanel_jsonapi_func: type === 'file' ? 'mkfile' : 'mkdir',
            path: toPosixPath(dir), name
        };
        const response = await axios.get(CpanelApi2Endpoint, { params, headers: { 'Authorization': authHeader }, httpsAgent: getHttpsAgent() });
        if (response.data?.cpanelresult?.event?.result === 1) {
            event.reply('item-created', { success: true, dir: toPosixPath(dir) });
        } else {
            event.reply('item-created', { success: false, error: response.data?.cpanelresult?.error, dir: toPosixPath(dir) });
        }
    } catch (error) {
        event.reply('item-created', { success: false, error: error.message, dir });
    }
});

ipcMain.handle('file-operation', async (event, { op, source, dest, metadata, credentials }) => {
    const CpanelApi2Endpoint = `${credentials.domain}/json-api/cpanel`;
    const authHeader = `cpanel ${credentials.username}:${credentials.token}`;
    const params = {
        cpanel_jsonapi_apiversion: 2, cpanel_jsonapi_module: 'Fileman',
        cpanel_jsonapi_func: 'fileop', op, sourcefiles: toPosixPath(source), doubledecode: 1
    };
    if (dest) params.destfiles = toPosixPath(dest);
    if (metadata) params.metadata = metadata;

    try {
        const response = await axios.get(CpanelApi2Endpoint, { params, headers: { 'Authorization': authHeader }, httpsAgent: getHttpsAgent() });
        if (response.data?.cpanelresult?.event?.result === 1) {
            return { success: true, data: response.data.cpanelresult.data };
        }
        return { success: false, error: response.data?.cpanelresult?.error || 'Bilinmeyen cPanel hatası.' };
    } catch (error) {
        return { success: false, error: error.response?.data?.cpanelresult?.error || error.message };
    }
});

ipcMain.handle('upload-file', async (event, { fileBuffer, fileName, targetDir, credentials }) => {
    const posixDir = toPosixPath(targetDir);
    const authHeader = `cpanel ${credentials.username}:${credentials.token}`;
    const formData = new FormData();
    const bufferStream = new Readable();
    bufferStream.push(fileBuffer);
    bufferStream.push(null);
    formData.append('file-1', bufferStream, { filename: fileName, knownLength: fileBuffer.length });

    try {
        const response = await axios.post(`${credentials.domain}/execute/Fileman/upload_files`, formData, {
            params: { dir: posixDir },
            headers: { ...formData.getHeaders(), 'Authorization': authHeader },
            httpsAgent: getHttpsAgent()
        });
        if (response.data?.status === 1) {
            return { success: true, fileName, targetDir: posixDir };
        }
        return { success: false, error: response.data?.errors?.[0] || 'Bilinmeyen yükleme hatası.', fileName };
    } catch (error) {
        return { success: false, error: error.response?.data?.errors?.[0] || error.message, fileName };
    }
});