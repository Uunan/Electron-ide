document.addEventListener('DOMContentLoaded', () => {
    // --- SABİTLER ve DEĞİŞKENLER ---
    const SETTINGS_KEY = 'cpanel-editor-settings';
    const ACCOUNTS_KEY = 'cpanel-accounts';
    const defaultSettings = { fontSize: 14, tabSize: 4, lineNumbers: true, wordWrap: false, autoCloseTags: true, initialDir: '/home/ugurhancolak', rejectUnauthorized: false, autoSaveInterval: 0 };
    
    const openFiles = new Map();
    let currentSettings = {};
    let activeFilePath = null;
    let currentDirectory = '/';
    let autoSaveTimer = null;
    let currentModalCallback = null;

    // --- DOM ELEMENTLERİ ---
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
    const searchStatusElement = document.getElementById('search-status');
    const feedbackBtn = document.getElementById('feedback-btn');
    const feedbackModalOverlay = document.getElementById('feedback-modal-overlay');
    const feedbackForm = document.getElementById('feedback-form');
    const feedbackCancelBtn = document.getElementById('feedback-cancel-btn');
    const feedbackSubmitBtn = document.getElementById('feedback-submit-btn');

    // --- YARDIMCI FONKSİYONLAR ---
    function getBasename(filePath) { return filePath.substring(filePath.lastIndexOf('/') + 1); }

    async function getActiveCredentials() {
        const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
        const activeAccount = accounts.find(acc => acc.isActive);
        if (!activeAccount) { window.location.href = 'accounts.html'; return null; }
        if (!activeAccount.token) { alert('Aktif hesap için token bulunamadı.'); return null; }
        const decryptedToken = await window.electronAPI.decryptString(activeAccount.token);
        if (!decryptedToken) { alert('API token şifresi çözülemedi. Lütfen hesabı silip yeniden ekleyin.'); return null; }
        return { domain: activeAccount.domain, username: activeAccount.username, token: decryptedToken };
    }

    // --- AYAR YÖNETİMİ ---
    function loadSettings() {
        const savedSettings = localStorage.getItem(SETTINGS_KEY);
        return { ...defaultSettings, ...(savedSettings ? JSON.parse(savedSettings) : {}) };
    }

    function saveSettings(settings) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        window.electronAPI.send('setting-changed', settings);
    }

    function applySettings() {
        currentSettings = loadSettings();
        autoSaveToggle.checked = currentSettings.autoSaveInterval > 0;
        clearTimeout(autoSaveTimer);
        openFiles.forEach(fileInfo => {
            const editor = fileInfo.codeMirrorInstance;
            if (editor) {
                editor.setOption('lineNumbers', currentSettings.lineNumbers);
                editor.setOption('tabSize', currentSettings.tabSize);
                editor.setOption('lineWrapping', currentSettings.wordWrap);
                editor.setOption('autoCloseTags', currentSettings.autoCloseTags);
                editor.refresh();
            }
        });
    }

    // --- DOSYA YÖNETİMİ FONKSİYONLARI ---
    async function refreshFileList(dirPath = currentDirectory) {
        const credentials = await getActiveCredentials();
        if (credentials) {
            window.electronAPI.send('list-files', { dirPath, credentials });
        }
    }

    async function saveActiveFile(force = false) {
        const credentials = await getActiveCredentials();
        if (!credentials || !activeFilePath || !openFiles.has(activeFilePath)) return;
        const fileInfo = openFiles.get(activeFilePath);
        const tabLabel = fileInfo.tabElement.querySelector('.tab-label');
        if (!force && tabLabel.style.fontStyle !== 'italic') return;
        const content = fileInfo.codeMirrorInstance.getValue();
        const charset = fileInfo.currentCharset;
        window.electronAPI.send('save-file-content', { filePath: activeFilePath, content, charset, credentials });
    }

    async function performFileOperation({ op, source, dest, metadata }) {
        const credentials = await getActiveCredentials();
        if (!credentials) {
            alert("İşlem yapılamadı: Aktif kullanıcı kimlik bilgileri alınamadı.");
            return;
        }
        
        console.log('Performing operation with:', { op, source, dest, metadata });
        const result = await window.electronAPI.fileOperation({ op, source, dest, metadata, credentials });
        
        if (result.success) {
            console.log('Operation successful:', result);
            refreshFileList();
        } else {
            console.error('Operation failed:', result);
            alert(`İşlem başarısız: ${result.error}`);
        }
    }

    // --- KOD EDİTÖRÜ (CodeMirror) VE TAB YÖNETİMİ ---
    function clearSearch(editor) {
        if (editor) {
            editor.execCommand("clearSearch");
            searchStatusElement.style.display = 'none';
        }
    }

    CodeMirror.defineInitHook(function(cm) {
        cm.on("keydown", function(cm, e) {
            if (e.key === 'Escape' && !document.querySelector('.CodeMirror-dialog')) {
                clearSearch(cm);
            }
        });
    });

    function createCodeMirrorInstance(container, filePath, content = '') {
        const editor = CodeMirror(container, {
            value: content, theme: "dracula", mode: "htmlmixed",
            lineNumbers: currentSettings.lineNumbers, tabSize: currentSettings.tabSize,
            lineWrapping: currentSettings.wordWrap, autoCloseTags: currentSettings.autoCloseTags,
            matchBrackets: true, foldGutter: true, gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
            scrollbarStyle: "simple",
            highlightSelectionMatches: { showToken: /\w/, annotateScrollbar: true },
            extraKeys: { "Ctrl-F": "findPersistent", "Cmd-F": "findPersistent", "F3": "findNext", "Cmd-G": "findNext", "Shift-F3": "findPrev", "Shift-Cmd-G": "findPrev", "Ctrl-H": "replace", "Cmd-Alt-F": "replace" }
        });
        setEditorMode(editor, filePath);
        return editor;
    }

    function setEditorMode(editor, filePath) {
        const extension = filePath.split('.').pop().toLowerCase();
        let mode = 'null';
        switch (extension) {
            case 'html': mode = 'htmlmixed'; break;
            case 'css': mode = 'css'; break;
            case 'js': mode = 'javascript'; break;
            case 'json': mode = { name: "javascript", json: true }; break;
            case 'php': mode = 'php'; break;
        }
        editor.setOption("mode", mode);
    }

    function activateTab(filePath) {
        tabBarElement.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        editorContainerWrapperElement.querySelectorAll('.editor-instance').forEach(editorDiv => editorDiv.style.display = 'none');
        if (filePath && openFiles.has(filePath)) {
            const fileInfo = openFiles.get(filePath);
            fileInfo.tabElement.classList.add('active');
            fileInfo.editorContainerElement.style.display = 'block';
            setTimeout(() => fileInfo.codeMirrorInstance.refresh(), 1);
            activeFilePath = filePath;
            noFileMessageElement.style.display = 'none';
            editorToolbar.style.display = 'flex';
            encodingSelector.value = fileInfo.currentCharset;
            clearSearch(fileInfo.codeMirrorInstance);
        } else {
            activeFilePath = null;
            noFileMessageElement.style.display = 'block';
            editorToolbar.style.display = 'none';
        }
    }

    function closeTab(filePath) {
        const fileInfo = openFiles.get(filePath);
        if (!fileInfo) return;
        if (fileInfo.tabElement.querySelector('.tab-label').style.fontStyle === 'italic') {
            if (!confirm("Kaydedilmemiş değişiklikler var. Kapatmak istediğinizden emin misiniz?")) {
                return;
            }
        }
        clearSearch(fileInfo.codeMirrorInstance);
        fileInfo.tabElement.remove();
        fileInfo.editorContainerElement.remove();
        openFiles.delete(filePath);
        if (activeFilePath === filePath) {
            const remainingFiles = Array.from(openFiles.keys());
            activateTab(remainingFiles.length > 0 ? remainingFiles[0] : null);
        }
    }

    // --- IPC OLAY DİNLEYİCİLERİ (MAIN -> RENDERER) ---
    window.electronAPI.on('files-listed', ({ success, files, error, currentDir }) => {
        fileListElement.innerHTML = '';
        currentDirectoryElement.textContent = currentDir;
        if (!success) { fileListElement.innerHTML = `<li>Hata: ${error}</li>`; return; }
        currentDirectory = currentDir;
        const rootDir = currentSettings.initialDir;
        if (currentDir !== rootDir && currentDir.length >= rootDir.length) {
            const parentDir = currentDir.substring(0, currentDir.lastIndexOf('/')) || rootDir;
            if (parentDir.length >= rootDir.length) {
                const backItem = document.createElement('li');
                backItem.innerHTML = `<i class="fas fa-level-up-alt"></i> ..`;
                backItem.classList.add('directory');
                backItem.dataset.path = parentDir;
                fileListElement.appendChild(backItem);
            }
        }
        files.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return a.file.localeCompare(b.file, undefined, { numeric: true, sensitivity: 'base' });
        }).forEach(item => {
            const li = document.createElement('li');
            li.dataset.path = item.fullpath;
            li.innerHTML = `<i class="far ${item.type === 'dir' ? 'fa-folder' : 'fa-file-alt'}"></i> ${item.file}`;
            li.classList.add(item.type === 'dir' ? 'directory' : 'file');
            fileListElement.appendChild(li);
        });
    });

    window.electronAPI.on('file-content-loaded', ({ success, content, error, filePath, charset }) => {
        if (!success) { alert(`Dosya içeriği yüklenemedi: ${error}`); return; }
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.dataset.path = filePath;
        tab.innerHTML = `<i class="far fa-file-alt"></i> <span class="tab-label">${getBasename(filePath)}</span> <i class="close-tab">×</i>`;
        const editorDiv = document.createElement('div');
        editorDiv.className = 'editor-instance';
        editorDiv.style.display = 'none';
        tabBarElement.appendChild(tab);
        editorContainerWrapperElement.appendChild(editorDiv);
        const editor = createCodeMirrorInstance(editorDiv, filePath, content);
        editor.on('change', () => {
            const info = openFiles.get(filePath);
            if (info) {
                info.tabElement.querySelector('.tab-label').style.fontStyle = 'italic';
                if (currentSettings.autoSaveInterval > 0) {
                    clearTimeout(autoSaveTimer);
                    autoSaveTimer = setTimeout(() => { if (activeFilePath === filePath) saveActiveFile(); }, currentSettings.autoSaveInterval * 1000);
                }
            }
        });
        openFiles.set(filePath, { tabElement: tab, editorContainerElement: editorDiv, codeMirrorInstance: editor, currentCharset: charset });
        activateTab(filePath);
    });

    window.electronAPI.on('file-saved', ({ success, filePath }) => {
        if (success && openFiles.has(filePath)) {
            openFiles.get(filePath).tabElement.querySelector('.tab-label').style.fontStyle = 'normal';
        }
    });

    window.electronAPI.on('item-created', ({ success, error, dir }) => {
        if (success) {
            refreshFileList(dir);
        } else {
            alert(`Öğe oluşturulamadı: ${error}`);
        }
    });

    window.electronAPI.onWindowMaximizedStatus((isMaximized) => {
        maximizeBtn.querySelector('i').className = isMaximized ? 'far fa-window-restore' : 'far fa-window-maximize';
    });

    window.electronAPI.on('context-menu-action', async ({ action, path: filePath }) => {
        const fileName = getBasename(filePath);
        switch (action) {
            case 'rename-file': {
                showPromptModal(`'${fileName}' için yeni isim`, async (newName) => {
                    if (newName && newName.trim() !== '' && newName !== fileName) {
                        const dirPath = filePath.substring(0, filePath.lastIndexOf('/') + 1);
                        const destPath = dirPath + newName.trim();
                        await performFileOperation({ op: 'rename', source: filePath, dest: destPath });
                    }
                });
                document.getElementById('modal-input').value = fileName;
                break;
            }
            case 'delete-file': {
                if (confirm(`'${fileName}' dosyasını silmek istediğinizden emin misiniz? Bu işlem, dosyayı çöp kutusuna taşıyacaktır.`)) {
                    await performFileOperation({ op: 'trash', source: filePath });
                }
                break;
            }
        }
    });

    // --- UI OLAY DİNLEYİCİLERİ ---
    fileListElement.addEventListener('click', async (event) => {
        const target = event.target.closest('li');
        if (!target || !target.dataset.path) return;
        const credentials = await getActiveCredentials();
        if (!credentials) return;
        const filePath = target.dataset.path;
        if (target.classList.contains('directory')) {
            window.electronAPI.send('list-files', { dirPath: filePath, credentials });
        } else {
            if (openFiles.has(filePath)) activateTab(filePath);
            else window.electronAPI.send('get-file-content', { filePath, credentials });
        }
    });

    fileListElement.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        const target = event.target.closest('li');
        if (target && target.dataset.path) {
            window.electronAPI.showContextMenu(target.dataset.path);
        }
    });

    tabBarElement.addEventListener('click', (event) => {
        const tab = event.target.closest('.tab');
        if (!tab) return;
        const filePath = tab.dataset.path;
        if (event.target.classList.contains('close-tab')) {
            closeTab(filePath);
        } else if (!tab.classList.contains('active')) {
            activateTab(filePath);
        }
    });

    tabBarElement.addEventListener('mousedown', (event) => {
        if (event.button === 1) { // Orta tuş
            const tab = event.target.closest('.tab');
            if (tab) {
                event.preventDefault();
                closeTab(tab.dataset.path);
            }
        }
    });

    window.addEventListener('keydown', async (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            await saveActiveFile(true);
        }
    });

    fileUploadBtn.addEventListener('click', () => fileUploadInput.click());
    fileUploadInput.addEventListener('change', async (event) => {
        const credentials = await getActiveCredentials();
        if (!credentials) return;
        
        const uploadPromises = Array.from(event.target.files).map(file => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const result = await window.electronAPI.uploadFile({
                        fileBuffer: new Uint8Array(e.target.result), fileName: file.name,
                        targetDir: currentDirectory, credentials
                    });
                    resolve(result);
                };
                reader.readAsArrayBuffer(file);
            });
        });

        const results = await Promise.all(uploadPromises);
        const failedUploads = results.filter(r => !r.success);
        if (failedUploads.length > 0) {
            const errorMessages = failedUploads.map(r => `${r.fileName}: ${r.error}`).join('\n');
            alert(`Bazı dosyalar yüklenemedi:\n${errorMessages}`);
        }
        
        refreshFileList();
        event.target.value = '';
    });
    
    function showPromptModal(title, callback) {
        modalTitle.textContent = title;
        modalInput.value = '';
        currentModalCallback = callback;
        modalOverlay.style.display = 'flex';
        modalInput.focus();
    }
    
    function hidePromptModal() {
        modalOverlay.style.display = 'none';
        currentModalCallback = null;
    }

    newFileBtn.addEventListener('click', () => showPromptModal('Yeni Dosya Adı', async (name) => {
        if (name) {
            const creds = await getActiveCredentials();
            if(creds) window.electronAPI.send('create-item', { type: 'file', dir: currentDirectory, name, credentials: creds });
        }
    }));
    
    newFolderBtn.addEventListener('click', () => showPromptModal('Yeni Klasör Adı', async (name) => {
        if (name) {
            const creds = await getActiveCredentials();
            if(creds) window.electronAPI.send('create-item', { type: 'dir', dir: currentDirectory, name, credentials: creds });
        }
    }));

    modalOkBtn.addEventListener('click', () => {
        if (currentModalCallback) {
            currentModalCallback(modalInput.value.trim());
        }
        hidePromptModal();
    });
    
    modalCancelBtn.addEventListener('click', hidePromptModal);
    
    minimizeBtn.addEventListener('click', () => window.electronAPI.send('minimize-app'));
    maximizeBtn.addEventListener('click', () => window.electronAPI.send('maximize-app'));
    closeBtn.addEventListener('click', () => window.electronAPI.send('close-app'));
    
    encodingSelector.addEventListener('change', () => saveActiveFile(true));
    
    autoSaveToggle.addEventListener('change', (event) => {
        const s = loadSettings();
        s.autoSaveInterval = event.target.checked ? (s.autoSaveInterval === 0 ? 5 : s.autoSaveInterval) : 0;
        saveSettings(s);
        applySettings();
    });
    
    feedbackBtn.addEventListener('click', () => { feedbackModalOverlay.style.display = 'flex'; });
    feedbackCancelBtn.addEventListener('click', () => { feedbackModalOverlay.style.display = 'none'; });
    
    feedbackForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const feedbackType = document.getElementById('feedback-type').value;
        const message = document.getElementById('feedback-message').value;
        const email = document.getElementById('feedback-email').value;
        const appVersion = await window.electronAPI.getAppVersion();
        const appName = 'Cortex IDE';
        
        feedbackSubmitBtn.disabled = true;
        feedbackSubmitBtn.textContent = 'Gönderiliyor...';
        try {
            const response = await fetch('https://unanstudio.com/api/submit_feedback.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedback_type: feedbackType, message, contact_email: email, app_version: appVersion, app_name: appName })
            });
            const result = await response.json();
            if (!response.ok || result.status !== 'success') throw new Error(result.message || 'Bilinmeyen sunucu hatası.');
            alert('Geri bildiriminiz için teşekkür ederiz!');
            feedbackForm.reset();
            feedbackModalOverlay.style.display = 'none';
        } catch (error) {
            alert(`Geri bildirim gönderilemedi: ${error.message}`);
        } finally {
            feedbackSubmitBtn.disabled = false;
            feedbackSubmitBtn.textContent = 'Gönder';
        }
    });

    // --- BAŞLATMA ---
    async function initializeApp() {
        noFileMessageElement.style.display = 'block';
        applySettings();
        await refreshFileList(currentSettings.initialDir);
    }

    initializeApp();
});