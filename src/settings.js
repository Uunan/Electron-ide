
document.addEventListener('DOMContentLoaded', () => {
  
    const inputs = {
        fontSize: document.getElementById('fontSize'),
        tabSize: document.getElementById('tabSize'),
        lineNumbers: document.getElementById('lineNumbers'),
        wordWrap: document.getElementById('wordWrap'),
        autoCloseTags: document.getElementById('autoCloseTags'),
        initialDir: document.getElementById('initialDir'),
        rejectUnauthorized: document.getElementById('rejectUnauthorized'),
        autoSaveInterval: document.getElementById('autoSaveInterval'),
    };

    const SETTINGS_KEY = 'cpanel-editor-settings';

    const defaultSettings = {
        fontSize: 14, tabSize: 4, lineNumbers: true, wordWrap: false,
        autoCloseTags: true, initialDir: '/home/ugurhancolak',
        rejectUnauthorized: false, autoSaveInterval: 0,
    };

    function loadSettings() {
        const savedSettings = localStorage.getItem(SETTINGS_KEY);
        const parsedSettings = savedSettings ? JSON.parse(savedSettings) : {};
        return { ...defaultSettings, ...parsedSettings };
    }

    function saveSettings(settings) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        console.log('Ayarlar kaydedildi ve ana sürece gönderiliyor:', settings);


        if (window.electronAPI) {
            window.electronAPI.send('setting-changed', settings);
        } else {
            console.error('Hata: Electron API köprüsü (preload script) bulunamadı!');
        }
    }

    let currentSettings = loadSettings();

    function populateUI() {
        for (const key in inputs) {
            const inputElement = inputs[key];
            if (inputElement && currentSettings.hasOwnProperty(key)) { 
                if (inputElement.type === 'checkbox') {
                    inputElement.checked = currentSettings[key];
                } else {
                    inputElement.value = currentSettings[key];
                }
            }
        }
    }

    function handleInputChange(event) {
        const key = event.target.id;
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        
        if (event.target.type === 'number' || key === 'autoSaveInterval') {
            currentSettings[key] = parseInt(value, 10);
        } else {
            currentSettings[key] = value;
        }
        
        saveSettings(currentSettings);
    }

    for (const key in inputs) {
        if (inputs[key]) {
            inputs[key].addEventListener('change', handleInputChange);
        }
    }
    
    const navItems = document.querySelectorAll('.settings-nav li');
    const pages = document.querySelectorAll('.settings-page');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(nav => nav.classList.remove('active'));
            pages.forEach(page => page.classList.remove('active'));
            item.classList.add('active');
            document.getElementById(item.dataset.target).classList.add('active');
        });
    });

    populateUI();
});