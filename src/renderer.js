// renderer.js (ŞİFRELEME DESTEKLİ TAM KOD)

document.addEventListener('DOMContentLoaded', () => {
    // --- Paylaşılan Ayar ve Hesap Yapılandırması ---
    const SETTINGS_KEY = 'cpanel-editor-settings';
    const ACCOUNTS_KEY = 'cpanel-accounts';
    const defaultSettings = { fontSize: 14, tabSize: 4, lineNumbers: true, wordWrap: false, autoCloseTags: true, initialDir: '/home/ugurhancolak', rejectUnauthorized: false, autoSaveInterval: 0 };

    // --- State (Durum) Değişkenleri ---
    const openFiles = new Map();
    let currentSettings = {};
    let activeFilePath = null;
    let currentDirectory = '/';
    let autoSaveTimer = null;

    // --- DOM Referansları ---
    const fileListElement = document.getElementById('file-list');
    const currentDirectoryElement = document.getElementById('current-directory');
    const newFileBtn = document.getElementById('new-file-btn');
    const newFolderBtn = document.getElementById('new-folder-btn');
    const fileUploadBtn = document.getElementById('file-upload-btn');
    const fileUploadInput = document.getElementById('file-upload-input');
    const tabBarElement = document.getElementById('tab-bar');
    const editorContainerWrapperElement = document.getElementById('editor-container');
    const editorToolbar = document.getElementById('editor-toolbar');
    const encodingSelector = document.getElementById('encoding-selector');
    const noFileMessageElement = document.getElementById('no-file-message');
    const autoSaveToggle = document.getElementById('auto-save-toggle');
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalInput = document.getElementById('modal-input');
    const modalOkBtn = document.getElementById('modal-ok-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');
    let currentModalCallback = null;

    function getBasename(filePath) { return filePath.substring(filePath.lastIndexOf('/') + 1); }

    // --- YARDIMCI FONKSİYONLAR ---

    // GÜNCELLENDİ: Artık asenkron ve şifre çözüyor
    async function getActiveCredentials() {
        const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
        const activeAccount = accounts.find(acc => acc.isActive);

        if (!activeAccount) {
            
            window.location.href = 'accounts.html';
            return null;
        }
        if (!activeAccount.token) {
            alert('Aktif hesabın API token bilgisi eksik. Lütfen hesabı kontrol edin.');
            return null;
        }

        const decryptedToken = await window.electronAPI.decryptString(activeAccount.token);

        if (!decryptedToken) {
            alert('API token şifresi çözülemedi. Lütfen hesabı silip yeniden ekleyin.');
            return null;
        }
        
        return { 
            domain: activeAccount.domain, 
            username: activeAccount.username, 
            token: decryptedToken
        };
    }

    function loadSettings() { 
        const savedSettings = localStorage.getItem(SETTINGS_KEY); 
        const parsedSettings = savedSettings ? JSON.parse(savedSettings) : {};
        return { ...defaultSettings, ...parsedSettings }; 
    }
    
    function saveSettings(settings) { 
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); 
        // Ayarlar değiştiğinde diğer pencereleri bilgilendir
        window.electronAPI.send('setting-changed', settings); 
    }

    function applySettings() { 
        currentSettings = loadSettings(); 
        const isAutoSaveEnabled = currentSettings.autoSaveInterval > 0; 
        autoSaveToggle.checked = isAutoSaveEnabled; 
        clearTimeout(autoSaveTimer); 
        openFiles.forEach(fileInfo => { 
            const editor = fileInfo.codeMirrorInstance; 
            editor.setOption('lineNumbers', currentSettings.lineNumbers); 
            editor.setOption('tabSize', currentSettings.tabSize); 
            editor.setOption('lineWrapping', currentSettings.wordWrap); 
            editor.setOption('autoCloseTags', currentSettings.autoCloseTags); 
            editor.refresh(); 
        }); 
    }

    // GÜNCELLENDİ: Artık asenkron
    async function saveActiveFile(force = false) {
        const credentials = await getActiveCredentials(); 
        if (!credentials || !activeFilePath || !openFiles.has(activeFilePath)) return; 
        
        const fileInfo = openFiles.get(activeFilePath); 
        const tabLabel = fileInfo.tabElement.querySelector('.tab-label'); 
        
        if (!force && (!tabLabel || tabLabel.style.fontStyle !== 'italic')) return; 
        
        const content = fileInfo.codeMirrorInstance.getValue(); 
        const charset = fileInfo.currentCharset; 
        window.electronAPI.send('save-file-content', { filePath: activeFilePath, content, charset, credentials }); 
    }

    function createCodeMirrorInstance(container, filePath, content = '') { 
        const editor = CodeMirror(container, { 
            value: content, 
            theme: "dracula", 
            mode: "htmlmixed", 
            lineNumbers: currentSettings.lineNumbers, 
            tabSize: currentSettings.tabSize, 
            lineWrapping: currentSettings.wordWrap, 
            autoCloseTags: currentSettings.autoCloseTags, 
            matchBrackets: true, 
            foldGutter: true, 
            gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
            scrollbarStyle: "simple"
        }); 
        setEditorMode(editor, filePath); 
        return editor; 
    }

    function setEditorMode(editor, filePath) { const extension = filePath.split('.').pop().toLowerCase(); let mode = 'null'; switch (extension) { case 'html': mode = 'htmlmixed'; break; case 'css': mode = 'css'; break; case 'js': mode = 'javascript'; break; case 'json': mode = { name: "javascript", json: true }; break; case 'php': mode = 'php'; break; } editor.setOption("mode", mode); }
    function showPromptModal(title, callback) { modalTitle.textContent = title; modalInput.value = ''; currentModalCallback = callback; modalOverlay.style.display = 'flex'; modalInput.focus(); }
    function hidePromptModal() { modalOverlay.style.display = 'none'; currentModalCallback = null; }
    function activateTab(filePath) { tabBarElement.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active')); editorContainerWrapperElement.querySelectorAll('.editor-instance').forEach(editorDiv => editorDiv.classList.remove('active')); const fileInfo = openFiles.get(filePath); if (fileInfo) { fileInfo.tabElement.classList.add('active'); fileInfo.editorContainerElement.classList.add('active'); setTimeout(() => fileInfo.codeMirrorInstance.refresh(), 50); activeFilePath = filePath; noFileMessageElement.style.display = 'none'; editorToolbar.style.display = 'flex'; encodingSelector.value = fileInfo.currentCharset; } else { activeFilePath = null; noFileMessageElement.style.display = 'block'; editorToolbar.style.display = 'none'; } }
    function closeTab(filePath) { const fileInfo = openFiles.get(filePath); if (fileInfo) { fileInfo.tabElement.remove(); fileInfo.editorContainerElement.remove(); openFiles.delete(filePath); if (activeFilePath === filePath) { const remainingFiles = Array.from(openFiles.keys()); activateTab(remainingFiles.length > 0 ? remainingFiles[0] : null); } } }

    // --- IPC CEVAPLARI ---
    window.electronAPI.on('settings-updated', (settings) => applySettings());
    window.electronAPI.on('files-listed', ({ success, files, error, currentDir }) => { fileListElement.innerHTML = ''; currentDirectoryElement.textContent = currentDir; if (!success) { fileListElement.innerHTML = `<li>Hata: ${error}</li>`; return; } currentDirectory = currentDir; const rootDir = currentSettings.initialDir; if (currentDir !== rootDir && currentDir.length >= rootDir.length) { const parentDir = currentDir.substring(0, currentDir.lastIndexOf('/')) || rootDir; if (parentDir.length >= rootDir.length) { const backItem = document.createElement('li'); backItem.innerHTML = `<i class="fas fa-level-up-alt"></i> ..`; backItem.classList.add('directory'); backItem.dataset.path = parentDir; fileListElement.appendChild(backItem); } } files.sort((a, b) => { if (a.type === b.type) return a.file.localeCompare(b.file); return a.type === 'dir' ? -1 : 1; }).forEach(item => { const li = document.createElement('li'); li.dataset.path = item.fullpath; if (item.type === 'dir') { li.innerHTML = `<i class="far fa-folder"></i> ${item.file}`; li.classList.add('directory'); } else { li.innerHTML = `<i class="far fa-file-alt"></i> ${item.file}`; li.classList.add('file'); } fileListElement.appendChild(li); }); });
    window.electronAPI.on('file-content-loaded', ({ success, content, error, filePath, charset }) => { const fileInfo = openFiles.get(filePath); if (!fileInfo) return; if (success) { fileInfo.codeMirrorInstance.setValue(content); fileInfo.currentCharset = charset; if (activeFilePath === filePath) encodingSelector.value = charset; } else { fileInfo.codeMirrorInstance.setValue(`-- HATA --\nDosya içeriği yüklenemedi: ${JSON.stringify(error)}`); }});
    window.electronAPI.on('file-saved', ({ success, error, filePath }) => { if (success && openFiles.has(filePath)) { openFiles.get(filePath).tabElement.querySelector('.tab-label').style.fontStyle = 'normal'; }});
    
    // GÜNCELLENDİ: Artık asenkron
    window.electronAPI.on('item-created', async ({ success, error, dir }) => { 
        if (success) { 
            const credentials = await getActiveCredentials(); 
            if(credentials) window.electronAPI.send('list-files', { dirPath: dir, credentials }); 
        } else { 
            alert(`Öğe oluşturulamadı: ${error}`); 
        }
    });
    
    // GÜNCELLENDİ: Artık asenkron
    window.electronAPI.on('file-uploaded', async ({ success, error, fileName, targetDir }) => { 
        if (success) { 
            if (targetDir === currentDirectory) { 
                const credentials = await getActiveCredentials(); 
                if(credentials) window.electronAPI.send('list-files', { dirPath: targetDir, credentials }); 
            } 
        } else { 
            alert(`${fileName} yüklenirken hata oluştu: ${error}`); 
        } 
    });

    window.electronAPI.onWindowMaximizedStatus((isMaximized) => {
        const icon = maximizeBtn.querySelector('i');
        if (isMaximized) { icon.classList.remove('fa-window-maximize'); icon.classList.add('fa-window-restore'); } 
        else { icon.classList.remove('fa-window-restore'); icon.classList.add('fa-window-maximize'); }
    });

    // --- OLAY DİNLEYİCİLERİ ---
    
    // GÜNCELLENDİ: Artık asenkron
    fileListElement.addEventListener('click', async (event) => {
        const target = event.target.closest('li');
        if (!target || !target.dataset.path) return;

        const credentials = await getActiveCredentials();
        if (!credentials) return;
        
        const filePath = target.dataset.path;
        if (target.classList.contains('directory')) {
            window.electronAPI.send('list-files', { dirPath: filePath, credentials });
        } else {
            if (openFiles.has(filePath)) {
                activateTab(filePath);
            } else {
                const tab = document.createElement('div'); tab.className = 'tab'; tab.dataset.path = filePath;
                let iconClass = 'fa-file-alt'; if (filePath.endsWith('.html')) iconClass = 'fa-html5'; else if (filePath.endsWith('.css')) iconClass = 'fa-css3-alt'; else if (filePath.endsWith('.js')) iconClass = 'fa-js-square'; else if (filePath.endsWith('.php')) iconClass = 'fa-php';
                tab.innerHTML = `<i class="far ${iconClass}"></i> <span class="tab-label">${getBasename(filePath)}</span> <i class="close-tab">×</i>`;
                const editorDiv = document.createElement('div'); editorDiv.className = 'editor-instance';
                tabBarElement.appendChild(tab); editorContainerWrapperElement.appendChild(editorDiv);
                const editor = createCodeMirrorInstance(editorDiv, filePath, "Yükleniyor...");
                editor.on('change', () => { 
                    openFiles.get(filePath).tabElement.querySelector('.tab-label').style.fontStyle = 'italic'; 
                    if (currentSettings.autoSaveInterval <= 0) return; 
                    clearTimeout(autoSaveTimer); 
                    autoSaveTimer = setTimeout(() => { if (activeFilePath === filePath) saveActiveFile(); }, currentSettings.autoSaveInterval * 1000); 
                });
                openFiles.set(filePath, { tabElement: tab, editorContainerElement: editorDiv, codeMirrorInstance: editor, currentCharset: 'utf-8' });
                activateTab(filePath);
                window.electronAPI.send('get-file-content', { filePath, credentials });
            }
        }
    });

    tabBarElement.addEventListener('click', (event) => { const tab = event.target.closest('.tab'); if (!tab) return; const filePath = tab.dataset.path; if (event.target.classList.contains('close-tab')) { closeTab(filePath); } else if (!tab.classList.contains('active')) { activateTab(filePath); }});
    window.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveActiveFile(true); }});
    encodingSelector.addEventListener('change', () => saveActiveFile(true));
    autoSaveToggle.addEventListener('change', (event) => { const newSettings = loadSettings(); if (event.target.checked) { if (newSettings.autoSaveInterval === 0) newSettings.autoSaveInterval = 5; } else { newSettings.autoSaveInterval = 0; } saveSettings(newSettings); applySettings(); });
    
    // GÜNCELLENDİ: Artık asenkron
    newFileBtn.addEventListener('click', () => showPromptModal('Yeni Dosya Oluştur', async (name) => { if (name) { const credentials = await getActiveCredentials(); if(credentials) window.electronAPI.send('create-item', { type: 'file', dir: currentDirectory, name, credentials }); }}));
    newFolderBtn.addEventListener('click', () => showPromptModal('Yeni Klasör Oluştur', async (name) => { if (name) { const credentials = await getActiveCredentials(); if(credentials) window.electronAPI.send('create-item', { type: 'dir', dir: currentDirectory, name, credentials }); }}));
    fileUploadBtn.addEventListener('click', () => fileUploadInput.click());
    
    // GÜNCELLENDİ: Artık asenkron
    fileUploadInput.addEventListener('change', async (event) => { 
        const credentials = await getActiveCredentials(); 
        if (!credentials) return; 
        const files = event.target.files; 
        if (files.length === 0) return; 
        for (const file of files) { 
            const reader = new FileReader(); 
            reader.onload = (e) => { 
                const fileBuffer = Buffer.from(e.target.result); 
                window.electronAPI.send('upload-file', { fileBuffer, fileName: file.name, targetDir: currentDirectory, credentials }); 
            }; 
            reader.onerror = (err) => { console.error('Dosya okuma hatası:', err); alert(`${file.name} okunurken bir hata oluştu.`); }; 
            reader.readAsArrayBuffer(file); 
        } 
        fileUploadInput.value = ''; 
    });

    modalOkBtn.addEventListener('click', () => { if (currentModalCallback) currentModalCallback(modalInput.value.trim()); hidePromptModal(); });
    modalCancelBtn.addEventListener('click', hidePromptModal);
    minimizeBtn.addEventListener('click', () => window.electronAPI.minimize());
    maximizeBtn.addEventListener('click', () => window.electronAPI.maximize());
    closeBtn.addEventListener('click', () => window.electronAPI.close());
    
    // --- BAŞLANGIÇ MANTIĞI ---
    async function initializeApp() {
        noFileMessageElement.style.display = 'block';
        applySettings();
        const credentials = await getActiveCredentials();
        if (credentials) {
            const startDir = currentSettings.initialDir || `/home/${credentials.username}`;
            window.electronAPI.send('list-files', { dirPath: startDir, credentials });
        }
    }

    initializeApp();
});