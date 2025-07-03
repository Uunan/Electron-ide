// settings.js (Düzeltilmiş ve Çalışan Tam Kod)

document.addEventListener('DOMContentLoaded', () => {
    // --- Hatalı Satır Kaldırıldı ---
    // const { ipcRenderer } = require('electron'); // BU SATIR KALDIRILDI!

    // Tüm ayar input elemanlarını seç
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
        // JSON.parse'dan null gelme ihtimaline karşı kontrol ekleyelim
        const parsedSettings = savedSettings ? JSON.parse(savedSettings) : {};
        return { ...defaultSettings, ...parsedSettings };
    }

    // GÜNCELLENDİ: saveSettings fonksiyonu artık doğru IPC yöntemini kullanacak
    function saveSettings(settings) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        console.log('Ayarlar kaydedildi ve ana sürece gönderiliyor:', settings);

        // --- DOĞRU YÖNTEM ---
        // 'window.electronAPI' preload script'i üzerinden ana sürece bildir.
        // Bu, `renderer.js` dosyanızdaki yöntemle aynıdır.
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
            if (inputElement && currentSettings.hasOwnProperty(key)) { // Ekstra güvenlik kontrolü
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
        
        // Gelen değerin sayısal olması gereken alanlar için parseInt kullanılıyor
        if (event.target.type === 'number' || key === 'autoSaveInterval') {
            currentSettings[key] = parseInt(value, 10);
        } else {
            currentSettings[key] = value;
        }
        
        saveSettings(currentSettings);
    }

    // Tüm inputlara 'change' olay dinleyicisi ekle
    for (const key in inputs) {
        if (inputs[key]) {
            inputs[key].addEventListener('change', handleInputChange);
        }
    }
    
    // Sayfa içi sekmeler arası geçiş mantığı (bu kısım doğruydu)
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

    // Başlangıçta arayüzü doldur
    populateUI();
});