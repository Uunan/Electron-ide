// accounts.js (Başlık Çubuğu İşlevselliği Eklenmiş Versiyon)

document.addEventListener('DOMContentLoaded', () => {

    // --- YENİ EKLENDİ: Başlık Çubuğu Butonlarının İşlevselliği ---
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');

    // "Alta Al" butonu
    minimizeBtn.addEventListener('click', () => {
        // preload.js'de tanımlanan 'minimize' fonksiyonunu çağır
        window.electronAPI.minimize();
    });

    // "Büyüt/Küçült" butonu
    maximizeBtn.addEventListener('click', () => {
        // preload.js'de tanımlanan 'maximize' fonksiyonunu çağır
        window.electronAPI.maximize();
    });

    // "Kapat" butonu
    closeBtn.addEventListener('click', () => {
        // preload.js'de tanımlanan 'close' fonksiyonunu çağır
        window.electronAPI.close();
    });

    // Pencere durumu değiştiğinde (büyütüldü/küçültüldü) ikonu güncellemek için
    window.electronAPI.onWindowMaximizedStatus((isMaximized) => {
        const maximizeIcon = maximizeBtn.querySelector('i');
        if (isMaximized) {
            // Pencere tam ekran ise, "küçült" (restore) ikonunu göster
            maximizeIcon.classList.remove('fa-window-maximize');
            maximizeIcon.classList.add('fa-window-restore');
            maximizeBtn.title = 'Küçült';
        } else {
            // Pencere normal boyutta ise, "büyüt" (maximize) ikonunu göster
            maximizeIcon.classList.remove('fa-window-restore');
            maximizeIcon.classList.add('fa-window-maximize');
            maximizeBtn.title = 'Büyüt';
        }
    });
    // --- YENİ EKLENEN KOD BİTTİ ---



    // --- MEVCUT HESAP YÖNETİMİ KODUNUZ (DEĞİŞİKLİK YOK) ---
    const ACCOUNTS_KEY = 'cpanel-accounts';

    // DOM Elementleri
    const accountsList = document.getElementById('accounts-list');
    const addAccountBtn = document.getElementById('add-account-btn');
    const modalOverlay = document.getElementById('modal-overlay');
    const modalSaveBtn = document.getElementById('modal-save-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const domainInput = document.getElementById('domain');
    const usernameInput = document.getElementById('username');
    const tokenInput = document.getElementById('token');

    // Veri Fonksiyonları
    const loadAccounts = () => JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || [];
    const saveAccounts = (accounts) => localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));

    // Arayüzü Yenileme Fonksiyonu
    function renderAccounts() {
        accountsList.innerHTML = '';
        const accounts = loadAccounts();

        if (accounts.length === 0) {
            accountsList.innerHTML = '<p class="empty-message">Kayıtlı cPanel hesabı bulunamadı. Eklemek için sağ üstteki + butonuna tıklayın.</p>';
            return;
        }

        accounts.forEach((account) => {
            const card = document.createElement('div');
            card.className = `account-card ${account.isActive ? 'active' : ''}`;
            card.dataset.id = account.id;

            card.innerHTML = `
                <div>
                    <div class="account-card-header">${account.domain}</div>
                    <div class="account-card-user">${account.username}</div>
                </div>
                <div class="account-card-actions">
                    <button class="remove-btn">Kaldır</button>
                    ${!account.isActive 
                        ? `<button class="select-btn">Seç</button>` 
                        : `<span class="active-badge">Aktif</span>`
                    }
                </div>
            `;
            accountsList.appendChild(card);
        });
    }

    // Olay Dinleyicileri
    accountsList.addEventListener('click', (e) => {
        const card = e.target.closest('.account-card');
        if (!card) return;

        const accountId = card.dataset.id;
        let accounts = loadAccounts();

        if (e.target.classList.contains('remove-btn')) {
            const accountToRemove = accounts.find(acc => acc.id == accountId);
            if (confirm(`'${accountToRemove.domain}' hesabını silmek istediğinizden emin misiniz?`)) {
                accounts = accounts.filter(acc => acc.id != accountId);
                if (accountToRemove.isActive && accounts.length > 0) {
                    accounts[0].isActive = true;
                }
                saveAccounts(accounts);
                renderAccounts();
            }
        }

        if (e.target.classList.contains('select-btn')) {
            accounts = accounts.map(acc => ({ ...acc, isActive: acc.id == accountId }));
            saveAccounts(accounts);
            renderAccounts();
        }
    });

    addAccountBtn.addEventListener('click', () => {
        domainInput.value = '';
        usernameInput.value = '';
        tokenInput.value = '';
        modalOverlay.style.display = 'flex';
        domainInput.focus();
    });

    modalCancelBtn.addEventListener('click', () => {
        modalOverlay.style.display = 'none';
    });

    modalSaveBtn.addEventListener('click', async () => {
        const domain = domainInput.value.trim();
        const username = usernameInput.value.trim();
        const token = tokenInput.value.trim();

        if (!domain || !username || !token) {
            alert('Lütfen tüm alanları doldurun.');
            return;
        }

        const encryptedToken = await window.electronAPI.encryptString(token);
        if (!encryptedToken) {
            alert('Token şifrelenirken bir hata oluştu.');
            return;
        }
        
        const accounts = loadAccounts();
        const newAccount = { 
            id: Date.now().toString(),
            domain, 
            username, 
            token: encryptedToken,
            isActive: accounts.length === 0
        };
        
        accounts.push(newAccount);
        saveAccounts(accounts);
        renderAccounts();
        modalOverlay.style.display = 'none';
    });

    // İlk Yükleme
    renderAccounts();
});