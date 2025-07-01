// main.js (ŞİFRELEME ÖZELLİKLİ TAM KOD)

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');
const https = require('https');
const FormData = require('form-data');
const { Readable } = require('stream');

// --- YENİ EKLENENLER (ŞİFRELEME İÇİN) ---
const crypto = require('crypto');
const Store = require('electron-store').default; // Güvenli veri saklama için .default'u ekleyin
// Store'u başlat
const store = new Store();

// --- ŞİFRELEME FONKSİYONLARI ---
let secretKey = store.get('secretKey');
if (!secretKey) {
  secretKey = crypto.randomBytes(32).toString('hex');
  store.set('secretKey', secretKey);
}
const key = Buffer.from(secretKey, 'hex');
const algorithm = 'aes-256-gcm';

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
    console.error("Şifre çözme hatası:", error);
    return null;
  }
}
// --- ŞİFRELEME KODU SONU ---


const httpsAgent = new https.Agent({ rejectUnauthorized: false });
function toPosixPath(p) { return p.replace(/\\/g, '/'); }

function createWindow() {
    const win = new BrowserWindow({
        width: 1200, height: 800,
        frame: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    win.loadFile('index.html');
    win.on('maximize', () => win.webContents.send('window-maximized-status', true));
    win.on('unmaximize', () => win.webContents.send('window-maximized-status', false));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// PENCERE KONTROLLERİ
// DİKKAT: ipcMain.on yerine ipcMain.handle kullanmak daha modern olabilir,
// ancak mevcut yapıyı bozmamak için on ile devam ediyoruz.
ipcMain.on('minimize-app', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.on('maximize-app', (event) => { const win = BrowserWindow.fromWebContents(event.sender); if (win) { win.isMaximized() ? win.unmaximize() : win.maximize(); } });
ipcMain.on('close-app', (event) => BrowserWindow.fromWebContents(event.sender)?.close());


// --- YENİ IPC KANALLARI (ŞİFRELEME İÇİN) ---
// Not: invoke/handle çifti, asenkron ve değer döndüren işlemler için daha uygundur.
ipcMain.handle('encrypt-string', (event, text) => {
  return encrypt(text);
});

ipcMain.handle('decrypt-string', (event, hash) => {
  return decrypt(hash);
});
// --- YENİ IPC KANALLARI SONU ---


// API IPC HANDLERS (Bu kısımda değişiklik yok)
ipcMain.on('list-files', async (event, { dirPath, credentials }) => { try { if (!credentials) throw new Error('Kimlik bilgileri eksik.'); const authHeader = `cpanel ${credentials.username}:${credentials.token}`; const posixPath = toPosixPath(dirPath); const response = await axios.get(`${credentials.domain}/execute/Fileman/list_files`, { params: { dir: posixPath }, headers: { Authorization: authHeader }, httpsAgent }); if (response.data?.status === 1) { event.reply('files-listed', { success: true, files: response.data.data, currentDir: posixPath }); } else { event.reply('files-listed', { success: false, error: 'API Error', currentDir: posixPath }); } } catch (error) { event.reply('files-listed', { success: false, error: error.message, currentDir: dirPath }); }});
ipcMain.on('get-file-content', async (event, { filePath, credentials }) => { try { if (!credentials) throw new Error('Kimlik bilgileri eksik.'); const authHeader = `cpanel ${credentials.username}:${credentials.token}`; const posixPath = toPosixPath(filePath); const dir = path.posix.dirname(posixPath); const file = path.posix.basename(posixPath); const response = await axios.get(`${credentials.domain}/execute/Fileman/get_file_content`, { params: { file, dir }, headers: { Authorization: authHeader }, httpsAgent }); if (response.data?.data && (typeof response.data.data.content === 'string' || response.data.data.content === null)) { event.reply('file-content-loaded', { success: true, content: response.data.data.content || '', filePath: posixPath, charset: response.data.data.from_charset }); } else { event.reply('file-content-loaded', { success: false, error: response.data, filePath: posixPath }); } } catch (error) { event.reply('file-content-loaded', { success: false, error: error.response?.data || error.message, filePath }); }});
ipcMain.on('save-file-content', async (event, { filePath, content, charset, credentials }) => { try { if (!credentials) throw new Error('Kimlik bilgileri eksik.'); const authHeader = `cpanel ${credentials.username}:${credentials.token}`; const posixPath = toPosixPath(filePath); const dir = path.posix.dirname(posixPath); const file = path.posix.basename(posixPath); await axios.post(`${credentials.domain}/execute/Fileman/save_file_content`, null, { params: { file, dir, content, charset }, headers: { Authorization: authHeader }, httpsAgent }); event.reply('file-saved', { success: true, filePath: posixPath }); } catch (error) { event.reply('file-saved', { success: false, error: error.message, filePath }); }});
ipcMain.on('create-item', async (event, { type, dir, name, credentials }) => { try { if (!credentials) throw new Error('Kimlik bilgileri eksik.'); const authHeader = `cpanel ${credentials.username}:${credentials.token}`; const posixDir = toPosixPath(dir); const CpanelApi2Endpoint = `${credentials.domain}/json-api/cpanel`; const baseParams = { cpanel_jsonapi_apiversion: 2, cpanel_jsonapi_module: 'Fileman' }; let functionParams = type === 'file' ? { cpanel_jsonapi_func: 'mkfile', path: posixDir, name } : { cpanel_jsonapi_func: 'mkdir', path: posixDir, name }; const response = await axios.get(CpanelApi2Endpoint, { params: { ...baseParams, ...functionParams }, headers: { Authorization: authHeader }, httpsAgent }); if (response.data?.cpanelresult?.event?.result === 1) { event.reply('item-created', { success: true, dir: posixDir }); } else { event.reply('item-created', { success: false, error: response.data?.cpanelresult?.error, dir: posixDir }); } } catch (error) { event.reply('item-created', { success: false, error: error.message, dir }); }});
ipcMain.on('upload-file', async (event, { fileBuffer, fileName, targetDir, credentials }) => { try { if (!credentials) throw new Error('Kimlik bilgileri eksik.'); const authHeader = `cpanel ${credentials.username}:${credentials.token}`; const posixDir = toPosixPath(targetDir); const formData = new FormData(); const bufferStream = new Readable(); bufferStream.push(fileBuffer); bufferStream.push(null); formData.append('file-1', bufferStream, { filename: fileName, knownLength: fileBuffer.length }); const response = await axios.post(`${credentials.domain}/execute/Fileman/upload_files`, formData, { params: { dir: posixDir }, headers: { ...formData.getHeaders(), 'Authorization': authHeader, }, httpsAgent }); if (response.data?.status === 1) { event.reply('file-uploaded', { success: true, fileName, targetDir: posixDir }); } else { const errorMessage = response.data?.errors?.[0] || 'Bilinmeyen bir yükleme hatası oluştu.'; event.reply('file-uploaded', { success: false, error: errorMessage, fileName, targetDir: posixDir }); } } catch (error) { const errorMessage = error.response?.data?.errors?.[0] || error.message; event.reply('file-uploaded', { success: false, error: errorMessage, fileName, targetDir }); }});
ipcMain.on('setting-changed', (event, settings) => { BrowserWindow.getAllWindows().forEach(win => { if (win.webContents !== event.sender) { win.webContents.send('settings-updated', settings); } }); });