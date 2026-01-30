// app.js - Банковская версия
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// ==================== КОНСТАНТЫ ====================
const BANK_CARD = '5592 6800 7024 4506'; // ← ЗАМЕНИТЕ НА РЕАЛЬНЫЙ!
const ADMIN_ID = 1128350068; // ← ЗАМЕНИТЕ НА ADMIN ID!
const API_URL = window.location.origin;

// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
let userData = null;
let currentSlide = 0;
let selectedFile = null;
let selectedChatImage = null;
let tickets = [];
let currentTicket = null;
let statsInterval = null;
let ticketsInterval = null;
let assistants = []; // Список помощников

// Настройки (БЕЗ темы)
let settings = {
    sound: true,
    vibration: true,
    animations: true,
    autoUpdate: true
};

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
window.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Приложение запускается...');
    console.log('📍 API_URL:', API_URL);
    console.log('💳 BANK_CARD:', BANK_CARD);
    console.log('👑 ADMIN_ID:', ADMIN_ID);
    loadSettings();
    setTimeout(init, 200);
});

async function init() {
    const user = tg.initDataUnsafe?.user;
    
    if (user) {
        // Обновляем имя на загрузочном экране
        const loadingUserName = document.getElementById('loadingUserName');
        if (loadingUserName) {
            loadingUserName.textContent = user.first_name;
        }
        
        userData = {
            id: user.id,
            firstName: user.first_name,
            lastName: user.last_name || '',
            username: user.username || null,
            isAdmin: user.id === ADMIN_ID,
            isAssistant: false
        };
        
        // Регистрируем/обновляем пользователя в БД
        const userResponse = await apiRequest('/api/users', 'POST', {
            userId: userData.id,
            firstName: userData.firstName,
            lastName: userData.lastName,
            username: userData.username,
            isAdmin: userData.isAdmin
        });
        
        // Проверяем является ли помощником
        if (userResponse.user && userResponse.user.isAssistant) {
            userData.isAssistant = true;
        }
        
        // ПРОВЕРЯЕМ БАН
        if (userResponse.user && userResponse.user.isBanned) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('blocked').classList.add('active');
            return;
        }
        
        // Загружаем аватар из Telegram
        loadUserPhoto(user);
        
        const initials = (user.first_name[0] || '?') + (user.last_name?.[0] || '');
        document.getElementById('avatarFallback').textContent = initials.toUpperCase();
        document.getElementById('profileAvatar').textContent = initials.toUpperCase();
        document.getElementById('userName').textContent = user.first_name + (user.last_name ? ' ' + user.last_name : '');
        document.getElementById('profileName').textContent = user.first_name + (user.last_name ? ' ' + user.last_name : '');
        document.getElementById('profileId').textContent = 'ID: ' + user.id;
        document.getElementById('heroGreeting').textContent = `Мы рады видеть вас, ${user.first_name}!`;
    } else {
        // Демо режим
        userData = {id: 0, firstName: 'Демо', lastName: '', username: null, isAdmin: false};
        document.getElementById('heroGreeting').textContent = 'Мы рады видеть вас!';
        document.getElementById('avatar').style.display = 'none';
        document.getElementById('avatarFallback').style.display = 'flex';
    }
    
    initDots();
    document.getElementById('bankCard').textContent = BANK_CARD;
    
    // Обновление времени
    updateTime();
    setInterval(updateTime, 1000);
    
    // Показываем кнопку админа/помощника
    if (userData.isAdmin || userData.isAssistant) {
        document.getElementById('adminMenuBtn').style.display = 'flex';
        if (userData.isAssistant && !userData.isAdmin) {
            document.getElementById('adminMenuBtn').textContent = '🛡️';
        }
        
        // Показываем вкладку помощников только для админа
        if (userData.isAdmin) {
            const assistantsTab = document.getElementById('assistantsTab');
            if (assistantsTab) {
                assistantsTab.style.display = 'block';
            }
        }
    }
    
    // Загружаем данные с сервера
    await loadUserData();
    
    // Периодическая проверка бана каждые 5 секунд
    setInterval(async () => {
        const data = await apiRequest('/api/users', 'GET', {userId: userData.id});
        if (data.user && data.user.isBanned) {
            console.log('🚫 Обнаружен бан - блокируем приложение');
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.getElementById('blocked').classList.add('active');
            if (statsInterval) clearInterval(statsInterval);
            if (ticketsInterval) clearInterval(ticketsInterval);
        }
    }, 5000);
    
    if (settings.autoUpdate) {
        startStatsUpdates();
    }
    updateOnlineStatus();
    
    document.getElementById('loading').style.display = 'none';
    
    const agreed = localStorage.getItem(`agreed_${userData.id}`);
    if (agreed === 'true') {
        document.getElementById('app').classList.add('active');
        if (settings.autoUpdate) {
            startTicketsPolling();
        }
    } else {
        document.getElementById('agreement').classList.add('active');
    }
    
    console.log('✅ Приложение инициализировано', userData.isAdmin ? '(ADMIN)' : '');
}

// ==================== НАСТРОЙКИ ====================
function loadSettings() {
    const saved = localStorage.getItem('app_settings');
    if (saved) {
        settings = {...settings, ...JSON.parse(saved)};
    }
    
    // Применяем настройки анимаций
    if (!settings.animations) {
        document.documentElement.style.setProperty('--transition-speed', '0s');
    }
    
    // Обновляем UI настроек
    updateSettingsUI();
}

function saveSettings() {
    localStorage.setItem('app_settings', JSON.stringify(settings));
}

function updateSettingsUI() {
    // Обновляем чекбоксы
    document.getElementById('soundNotif').checked = settings.sound;
    document.getElementById('vibrationNotif').checked = settings.vibration;
    document.getElementById('animationsToggle').checked = settings.animations;
    document.getElementById('autoUpdate').checked = settings.autoUpdate;
}

function openSettings() {
    document.getElementById('settingsModal').classList.add('active');
    hapticFeedback('light');
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('active');
    hapticFeedback('light');
}

// ==================== ВРЕМЯ ====================
function updateTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('currentTime').textContent = `${hours}:${minutes}`;
}

// Загрузка фото пользователя из Telegram
async function loadUserPhoto(user) {
    try {
        console.log('📸 Загрузка фото пользователя...');
        
        // Получаем фото через Telegram Bot API
        // Telegram WebApp предоставляет photo_url если доступно
        if (user.photo_url) {
            console.log('✅ Фото найдено:', user.photo_url);
            
            // Аватар в хедере
            const avatar = document.getElementById('avatar');
            avatar.src = user.photo_url;
            avatar.style.display = 'block';
            document.getElementById('avatarFallback').style.display = 'none';
            
            // Аватар в профиле
            const profileAvatarImg = document.getElementById('profileAvatarImg');
            if (profileAvatarImg) {
                profileAvatarImg.src = user.photo_url;
                profileAvatarImg.style.display = 'block';
                document.getElementById('profileAvatar').style.display = 'none';
            }
        } else {
            console.log('ℹ️ Фото пользователя недоступно, используем инициалы');
            document.getElementById('avatar').style.display = 'none';
            document.getElementById('avatarFallback').style.display = 'flex';
            
            // В профиле тоже показываем инициалы
            const profileAvatarImg = document.getElementById('profileAvatarImg');
            if (profileAvatarImg) {
                profileAvatarImg.style.display = 'none';
                document.getElementById('profileAvatar').style.display = 'flex';
            }
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки фото:', error);
        document.getElementById('avatar').style.display = 'none';
        document.getElementById('avatarFallback').style.display = 'flex';
        
        const profileAvatarImg = document.getElementById('profileAvatarImg');
        if (profileAvatarImg) {
            profileAvatarImg.style.display = 'none';
            document.getElementById('profileAvatar').style.display = 'flex';
        }
    }
}

// ==================== АДМИН МЕНЮ ====================
function openAdminMenu() {
    document.getElementById('adminModal').classList.add('active');
    
    // Меняем заголовок для помощника
    const modalTitle = document.querySelector('#adminModal .modal-header h3');
    if (userData.isAssistant && !userData.isAdmin) {
        modalTitle.textContent = '🛡️ Панель помощника';
        // Скрываем табы настроек и помощников для помощника
        document.getElementById('assistantsTabBtn').style.display = 'none';
        document.querySelectorAll('.admin-tab-modern').forEach(tab => {
            if (tab.textContent.includes('Настройки')) {
                tab.style.display = 'none';
            }
        });
    } else {
        modalTitle.textContent = '👑 Панель управления';
        document.getElementById('assistantsTabBtn').style.display = 'flex';
    }
    
    loadAdminStats();
    loadDashboardData();
    showAdminTab('dashboard');
    hapticFeedback('medium');
}

function closeAdminMenu() {
    document.getElementById('adminModal').classList.remove('active');
    hapticFeedback('light');
}

// ==================== ПОЛЬЗОВАТЕЛЬСКОЕ СОГЛАШЕНИЕ ====================
function showAgreementModal() {
    document.getElementById('agreementModal').classList.add('active');
    updateAgreementDate();
    hapticFeedback('light');
}

function showFullAgreement() {
    document.getElementById('agreementModal').classList.add('active');
    // Показываем блок с датой принятия только если соглашение уже принято
    const agreed = localStorage.getItem(`agreed_${userData.id}`);
    const acceptedInfo = document.getElementById('agreementAcceptedInfo');
    if (agreed === 'true' && acceptedInfo) {
        acceptedInfo.style.display = 'block';
        updateAgreementDate();
    } else if (acceptedInfo) {
        acceptedInfo.style.display = 'none';
    }
    hapticFeedback('light');
}

function closeAgreementModal() {
    document.getElementById('agreementModal').classList.remove('active');
    hapticFeedback('light');
}

function updateAgreementDate() {
    const agreedDate = localStorage.getItem(`agreed_date_${userData.id}`);
    if (agreedDate) {
        const formatted = formatTime(parseInt(agreedDate));
        document.getElementById('agreementDate').textContent = `Дата: ${formatted}`;
        document.getElementById('agreementDateModal').textContent = `Дата принятия: ${formatted}`;
    } else {
        // Устанавливаем текущую дату при первом входе
        const now = Date.now();
        localStorage.setItem(`agreed_date_${userData.id}`, now.toString());
        const formatted = formatTime(now);
        document.getElementById('agreementDate').textContent = `Дата: ${formatted}`;
        document.getElementById('agreementDateModal').textContent = `Дата принятия: ${formatted}`;
    }
}

function toggleSetting(setting) {
    settings[setting] = !settings[setting];
    
    if (setting === 'animations') {
        if (settings.animations) {
            document.documentElement.style.setProperty('--transition-speed', '0.3s');
        } else {
            document.documentElement.style.setProperty('--transition-speed', '0s');
        }
    }
    
    if (setting === 'autoUpdate') {
        if (settings.autoUpdate) {
            startStatsUpdates();
            startTicketsPolling();
        } else {
            if (statsInterval) clearInterval(statsInterval);
            if (ticketsInterval) clearInterval(ticketsInterval);
        }
    }
    
    saveSettings();
    hapticFeedback('light');
}

// ==================== HAPTIC FEEDBACK ====================
function hapticFeedback(type = 'light') {
    if (!settings.vibration) return;
    
    try {
        if (type === 'success') {
            tg.HapticFeedback.notificationOccurred('success');
        } else if (type === 'error') {
            tg.HapticFeedback.notificationOccurred('error');
        } else if (type === 'warning') {
            tg.HapticFeedback.notificationOccurred('warning');
        } else {
            tg.HapticFeedback.impactOccurred(type);
        }
    } catch (e) {
        console.log('Haptic feedback not supported');
    }
}

// ==================== NOTIFICATION ====================
function showNotification(text, duration = 3000) {
    const notif = document.getElementById('notification');
    notif.textContent = text;
    notif.classList.add('show');
    
    if (settings.sound) {
        hapticFeedback('light');
    }
    
    setTimeout(() => {
        notif.classList.remove('show');
    }, duration);
}

// ==================== AGREEMENT ====================
function acceptAgreement() {
    const now = Date.now();
    localStorage.setItem(`agreed_${userData.id}`, 'true');
    localStorage.setItem(`agreed_date_${userData.id}`, now.toString());
    
    // Скрываем экран соглашения
    document.getElementById('agreement').classList.remove('active');
    
    // Показываем основное приложение
    document.getElementById('app').classList.add('active');
    
    // Запускаем автообновление если включено
    if (settings.autoUpdate) {
        startTicketsPolling();
    }
    
    hapticFeedback('success');
    showNotification('✅ Добро пожаловать!');
}

// ==================== NAVIGATION ====================
function showTab(tabName) {
    // Скрываем все view
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');
    
    // Обновляем nav-tabs
    document.querySelectorAll('.nav-tab').forEach((tab, index) => {
        const tabs = ['home', 'bonus', 'receipt', 'support', 'profile'];
        tab.classList.toggle('active', tabs[index] === tabName);
    });
    
    hapticFeedback('light');
    
    // Загружаем данные при переходе
    if (tabName === 'support') {
        loadTickets();
    }
    
    // Обновляем дату соглашения при открытии профиля
    if (tabName === 'profile') {
        updateAgreementDate();
    }
}

// ==================== SLIDER ====================
function initDots() {
    const slides = document.querySelectorAll('.slide');
    const dotsContainer = document.getElementById('dots');
    dotsContainer.innerHTML = '';
    
    slides.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = 'dot';
        if (i === 0) dot.classList.add('active');
        dot.onclick = () => goToSlide(i);
        dotsContainer.appendChild(dot);
    });
}

function updateSlide() {
    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.dot');
    
    slides.forEach((slide, i) => {
        slide.classList.toggle('active', i === currentSlide);
    });
    
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSlide);
    });
    
    document.getElementById('prev').disabled = currentSlide === 0;
    document.getElementById('next').disabled = currentSlide === slides.length - 1;
}

function nextSlide() {
    const slides = document.querySelectorAll('.slide');
    if (currentSlide < slides.length - 1) {
        currentSlide++;
        updateSlide();
        hapticFeedback('light');
    }
}

function prevSlide() {
    if (currentSlide > 0) {
        currentSlide--;
        updateSlide();
        hapticFeedback('light');
    }
}

function goToSlide(index) {
    currentSlide = index;
    updateSlide();
    hapticFeedback('light');
}

// ==================== COPY CARD ====================
function copyCard() {
    navigator.clipboard.writeText(BANK_CARD).then(() => {
        showNotification('✅ Номер карты скопирован');
        hapticFeedback('success');
    }).catch(() => {
        showNotification('❌ Ошибка копирования');
        hapticFeedback('error');
    });
}

// ==================== RECEIPT UPLOAD ====================
document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showNotification('❌ Выберите изображение');
        hapticFeedback('error');
        return;
    }
    
    selectedFile = file;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('previewImg').src = e.target.result;
        document.getElementById('uploadZone').style.display = 'none';
        document.getElementById('previewBox').classList.remove('hidden');
        hapticFeedback('success');
    };
    reader.readAsDataURL(file);
});

function removeFile() {
    selectedFile = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('uploadZone').style.display = 'block';
    document.getElementById('previewBox').classList.add('hidden');
    hapticFeedback('light');
}

async function submitReceipt() {
    if (!selectedFile) {
        showNotification('❌ Выберите файл');
        hapticFeedback('error');
        return;
    }
    
    console.log('📤 Отправка чека...', {
        userId: userData.id,
        fileName: selectedFile.name,
        fileSize: selectedFile.size
    });
    
    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const imageData = e.target.result;
            
            console.log('📷 Изображение загружено, отправка на сервер...');
            
            const response = await apiRequest('/api/receipts', 'POST', {
                userId: userData.id,
                imageData
            });
            
            console.log('✅ Ответ от сервера:', response);
            
            showNotification('✅ Чек отправлен на проверку');
            hapticFeedback('success');
            
            removeFile();
            await loadUserData();
        };
        reader.readAsDataURL(selectedFile);
        
    } catch (error) {
        console.error('❌ Ошибка отправки чека:', error);
        showNotification('❌ Ошибка отправки');
        hapticFeedback('error');
    }
}

// ==================== SUPPORT ====================
async function loadTickets() {
    try {
        const data = await apiRequest('/api/tickets', 'GET', {userId: userData.id});
        tickets = data.tickets || [];
        
        updateTicketsList();
    } catch (error) {
        console.error('Ошибка загрузки тикетов:', error);
    }
}

function updateTicketsList() {
    const container = document.getElementById('ticketsList');
    
    if (tickets.length === 0) {
        container.innerHTML = `
            <div class="empty">
                <div class="empty-icon">💬</div>
                <h3>Нет обращений</h3>
                <p>Создайте новое обращение</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = tickets.map(ticket => `
        <div class="ticket-item" onclick="openTicket(${ticket.id})">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="font-weight: 600; color: var(--text-primary);">Обращение #${ticket.id}</div>
                <div class="ticket-badge ${ticket.status}">${ticket.status === 'open' ? 'Открыто' : 'Закрыто'}</div>
            </div>
            <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 4px;">
                ${escapeHtml(ticket.messages[0]?.text || 'Нет сообщений')}
            </div>
            <div style="font-size: 12px; color: var(--text-secondary);">
                ${formatTime(ticket.createdAt)} • Сообщений: ${ticket.messages.length}
            </div>
            ${ticket.unreadByUser ? '<div style="color: var(--accent-orange); font-weight: 600; margin-top: 4px;">📬 Новое сообщение</div>' : ''}
        </div>
    `).join('');
}

async function createNewTicket() {
    const message = prompt('Опишите ваш вопрос:');
    if (!message || !message.trim()) return;
    
    try {
        await apiRequest('/api/tickets', 'POST', {
            userId: userData.id,
            message: message.trim()
        });
        
        showNotification('✅ Обращение создано');
        hapticFeedback('success');
        await loadTickets();
        
    } catch (error) {
        showNotification('❌ Ошибка создания');
        hapticFeedback('error');
    }
}

async function openTicket(ticketId) {
    try {
        const data = await apiRequest('/api/tickets', 'GET', {ticketId});
        currentTicket = data.ticket;
        
        if (!currentTicket) return;
        
        // Отмечаем как прочитанное
        await apiRequest('/api/tickets', 'PUT', {
            ticketId,
            markRead: 'user'
        });
        
        document.getElementById('supportList').style.display = 'none';
        document.getElementById('supportChat').classList.remove('hidden');
        
        document.getElementById('chatTitle').textContent = `Обращение #${ticketId}`;
        document.getElementById('chatStatus').textContent = currentTicket.status === 'open' ? 'Открыто' : 'Закрыто';
        document.getElementById('chatBadge').textContent = currentTicket.status === 'open' ? 'Открыто' : 'Закрыто';
        document.getElementById('chatBadge').className = `ticket-badge ${currentTicket.status}`;
        
        updateChatMessages();
        
        if (currentTicket.status === 'closed') {
            document.getElementById('chatInput').disabled = true;
            document.getElementById('chatSendBtn').disabled = true;
        } else {
            document.getElementById('chatInput').disabled = false;
            document.getElementById('chatSendBtn').disabled = false;
        }
        
        hapticFeedback('medium');
        
    } catch (error) {
        showNotification('❌ Ошибка загрузки');
        hapticFeedback('error');
    }
}

function updateChatMessages() {
    const container = document.getElementById('chatMessages');
    
    if (!currentTicket || !currentTicket.messages) {
        container.innerHTML = '<div class="empty"><div class="empty-icon">💬</div><p>Нет сообщений</p></div>';
        return;
    }
    
    container.innerHTML = currentTicket.messages.map(msg => `
        <div class="chat-msg ${msg.from}">
            <div>${escapeHtml(msg.text)}</div>
            ${msg.imageData ? `<img src="${msg.imageData}" class="chat-image" alt="Фото">` : ''}
            <div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">${formatTime(msg.time)}</div>
        </div>
    `).join('');
    
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    
    if (!text && !selectedChatImage) return;
    if (!currentTicket) return;
    
    try {
        let imageData = null;
        
        if (selectedChatImage) {
            imageData = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(selectedChatImage);
            });
        }
        
        await apiRequest('/api/tickets', 'POST', {
            ticketId: currentTicket.id,
            userId: userData.id,
            message: text || '📷 Фото',
            imageData
        });
        
        input.value = '';
        removeChatImage();
        
        // Перезагружаем тикет
        const data = await apiRequest('/api/tickets', 'GET', {ticketId: currentTicket.id});
        currentTicket = data.ticket;
        updateChatMessages();
        
        hapticFeedback('success');
        
    } catch (error) {
        showNotification('❌ Ошибка отправки');
        hapticFeedback('error');
    }
}

function backToTickets() {
    document.getElementById('supportList').style.display = 'block';
    document.getElementById('supportChat').classList.add('hidden');
    currentTicket = null;
    loadTickets();
    hapticFeedback('light');
}

// ==================== ФОТО В ЧАТЕ ====================
document.addEventListener('DOMContentLoaded', () => {
    const chatFileInput = document.getElementById('chatFileInput');
    if (chatFileInput) {
        chatFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            if (!file.type.startsWith('image/')) {
                showNotification('❌ Выберите изображение');
                hapticFeedback('error');
                return;
            }
            
            selectedChatImage = file;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('chatPreviewImg').src = e.target.result;
                document.getElementById('chatImagePreview').style.display = 'block';
                hapticFeedback('success');
            };
            reader.readAsDataURL(file);
        });
    }
});

function removeChatImage() {
    selectedChatImage = null;
    document.getElementById('chatFileInput').value = '';
    document.getElementById('chatImagePreview').style.display = 'none';
    hapticFeedback('light');
}

// ==================== USER DATA ====================
async function loadUserData() {
    try {
        console.log('📊 Загрузка данных пользователя:', userData.id);
        const data = await apiRequest('/api/users', 'GET', {userId: userData.id});
        
        console.log('📥 Получены данные:', data);
        
        if (data.user) {
            // ПРОВЕРКА БАНА В РЕАЛЬНОМ ВРЕМЕНИ
            if (data.user.isBanned) {
                console.log('🚫 Пользователь забанен!');
                // Скрываем все экраны
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                // Показываем экран блокировки
                document.getElementById('blocked').classList.add('active');
                // Останавливаем все интервалы
                if (statsInterval) clearInterval(statsInterval);
                if (ticketsInterval) clearInterval(ticketsInterval);
                return;
            }
            
            // Загружаем чек отдельно
            const receiptData = await apiRequest('/api/receipts', 'GET', {userId: userData.id});
            console.log('📋 Данные чека:', receiptData);
            
            // Обновляем статус чека
            if (receiptData.receipt) {
                console.log('📋 Найден чек:', receiptData.receipt);
                const statusMap = {
                    pending: {
                        icon: '⏳', 
                        text: 'На проверке', 
                        color: '#FFA500',
                        description: 'Ваш чек находится на проверке. Мы свяжемся с вами в течение 10 банковских дней.'
                    },
                    approved: {
                        icon: '✅', 
                        text: 'Одобрен', 
                        color: '#28A745',
                        description: `Поздравляем! Ваш бонус ${data.user.balance || 25} BYN одобрен и будет зачислен в ближайшее время.`
                    },
                    rejected: {
                        icon: '❌', 
                        text: 'Отклонён', 
                        color: '#DC3545',
                        description: receiptData.receipt.comment || 'Ваш чек был отклонён. Обратитесь в поддержку для уточнения деталей.'
                    }
                };
                
                const status = statusMap[receiptData.receipt.status] || statusMap.pending;
                
                // Показываем статус на главной странице
                document.getElementById('receiptStatusCard').style.display = 'block';
                document.getElementById('receiptStatusInfo').innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                        <div style="font-size: 36px;">${status.icon}</div>
                        <div>
                            <div style="font-size: 18px; font-weight: 700; color: ${status.color};">${status.text}</div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                                ${formatTime(receiptData.receipt.uploadedAt)}
                            </div>
                        </div>
                    </div>
                    <p style="color: var(--text-secondary); margin: 0;">${status.description}</p>
                `;
                
                // Обновляем статус чека на странице загрузки
                const receiptStatusBox = document.getElementById('receiptStatus');
                receiptStatusBox.innerHTML = `
                    <div class="status-icon">
                        <img src="https://i.postimg.cc/cvS10Dv1/Picsart-26-01-23-21-32-48-214.png" alt="Чек" style="width: 48px; height: 48px;">
                    </div>
                    <div>
                        <h3 style="color: ${status.color}">${status.text}</h3>
                        <p>${status.description}</p>
                    </div>
                `;
                
                // Блокируем загрузку нового чека
                const uploadZone = document.getElementById('uploadZone');
                if (uploadZone) {
                    uploadZone.style.display = 'none';
                }
                
                // Обновляем статус в профиле
                document.getElementById('profileReceiptCard').style.display = 'block';
                document.getElementById('profileReceiptStatus').innerHTML = `
                    <div style="display: flex; align-items: center; gap: 16px; padding: 16px; background: ${status.color}10; border-radius: 12px; border: 2px solid ${status.color};">
                        <div style="font-size: 48px;">${status.icon}</div>
                        <div style="flex: 1;">
                            <div style="font-size: 18px; font-weight: 700; color: ${status.color}; margin-bottom: 8px;">${status.text}</div>
                            <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;">
                                Дата отправки: ${formatTime(receiptData.receipt.uploadedAt)}
                            </div>
                            <div style="font-size: 14px; color: var(--text-primary);">
                                ${status.description}
                            </div>
                        </div>
                    </div>
                `;
                
                // Показываем сообщение о том, что нужно обратиться в поддержку
                const receiptView = document.getElementById('receipt');
                const existingNote = receiptView.querySelector('.support-note');
                if (!existingNote) {
                    const note = document.createElement('div');
                    note.className = 'support-note';
                    note.style.cssText = 'background: var(--accent-orange-light); border: 1px solid var(--accent-orange); border-radius: 12px; padding: 16px; margin-top: 16px;';
                    note.innerHTML = `
                        <div style="font-weight: 600; color: var(--accent-orange); margin-bottom: 8px;">
                            💡 Нужно переотправить чек?
                        </div>
                        <div style="color: var(--text-secondary); font-size: 14px; margin-bottom: 12px;">
                            Чек можно отправить только один раз. Для повторной отправки обратитесь в службу поддержки.
                        </div>
                        <button class="btn btn-primary" onclick="showTab('support')">
                            Написать в поддержку
                        </button>
                    `;
                    receiptStatusBox.parentElement.appendChild(note);
                }
            } else {
                console.log('📋 Чек не найден, показываем форму загрузки');
                document.getElementById('receiptStatusCard').style.display = 'none';
                document.getElementById('profileReceiptCard').style.display = 'none';
                
                // Убеждаемся что зона загрузки видна
                const uploadZone = document.getElementById('uploadZone');
                if (uploadZone) {
                    uploadZone.style.display = 'block';
                    console.log('✅ Зона загрузки отображена');
                }
            }
            
            // Обновляем количество тикетов
            const ticketsCount = data.user.ticketsCount || 0;
            document.getElementById('profileTickets').textContent = ticketsCount;
        }
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
    }
}

// ==================== ADMIN PANEL ====================
async function loadAdminStats() {
    try {
        console.log('👑 Админ: загрузка статистики...');
        const data = await apiRequest('/api/stats', 'GET');
        console.log('👑 Статистика:', data);
        
        if (data.stats) {
            // Общая статистика
            const totalUsers = data.stats.totalUsers || 0;
            const totalReceipts = data.stats.receiptsToday || 0;
            const pendingReceipts = data.stats.pendingReceipts || 0;
            const approvedReceipts = data.stats.approvedReceipts || 0;
            const rejectedReceipts = data.stats.rejectedReceipts || 0;
            const totalTickets = data.stats.totalTickets || 0;
            const openTickets = data.stats.openTickets || 0;
            const closedTickets = data.stats.closedTickets || 0;
            
            // Обновляем основные карточки статистики
            document.getElementById('totalUsers').textContent = totalUsers;
            document.getElementById('totalReceipts').textContent = totalReceipts;
            document.getElementById('pendingReceipts').textContent = pendingReceipts;
            document.getElementById('totalTickets').textContent = totalTickets;
            
            // Добавляем подробную статистику под карточками
            const statsContainer = document.getElementById('adminStats');
            
            // Проверяем, есть ли уже детальная статистика
            let detailedStats = document.getElementById('detailedStats');
            if (!detailedStats) {
                detailedStats = document.createElement('div');
                detailedStats.id = 'detailedStats';
                statsContainer.parentElement.insertBefore(detailedStats, statsContainer.nextSibling);
            }
            
            detailedStats.innerHTML = `
                <div style="
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 16px;
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 2px solid var(--border-color);
                ">
                    <div style="
                        background: linear-gradient(135deg, #FFF5F2, #FFE8E0);
                        border: 2px solid var(--accent-orange);
                        border-radius: 12px;
                        padding: 16px;
                    ">
                        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; font-weight: 600;">
                            📸 ЧЕКИ
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 14px; color: var(--text-primary);">⏳ Ожидают проверки</span>
                                <span style="font-weight: 700; font-size: 16px; color: #FFA726;">${pendingReceipts}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 14px; color: var(--text-primary);">✅ Одобрено</span>
                                <span style="font-weight: 700; font-size: 16px; color: #66BB6A;">${approvedReceipts}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 14px; color: var(--text-primary);">❌ Отклонено</span>
                                <span style="font-weight: 700; font-size: 16px; color: #EF5350;">${rejectedReceipts}</span>
                            </div>
                            <div style="
                                margin-top: 8px;
                                padding-top: 8px;
                                border-top: 1px solid rgba(255, 107, 53, 0.3);
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                            ">
                                <span style="font-size: 14px; color: var(--text-primary); font-weight: 600;">Всего</span>
                                <span style="font-weight: 700; font-size: 18px; color: var(--accent-orange);">${totalReceipts}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div style="
                        background: linear-gradient(135deg, #E3F2FD, #BBDEFB);
                        border: 2px solid #2196F3;
                        border-radius: 12px;
                        padding: 16px;
                    ">
                        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; font-weight: 600;">
                            💬 ОБРАЩЕНИЯ
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 14px; color: var(--text-primary);">🟢 Открытые</span>
                                <span style="font-weight: 700; font-size: 16px; color: #FFA726;">${openTickets}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 14px; color: var(--text-primary);">⚪ Закрытые</span>
                                <span style="font-weight: 700; font-size: 16px; color: #9E9E9E;">${closedTickets}</span>
                            </div>
                            <div style="
                                margin-top: 8px;
                                padding-top: 8px;
                                border-top: 1px solid rgba(33, 150, 243, 0.3);
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                            ">
                                <span style="font-size: 14px; color: var(--text-primary); font-weight: 600;">Всего</span>
                                <span style="font-weight: 700; font-size: 18px; color: #2196F3;">${totalTickets}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div style="
                        background: linear-gradient(135deg, #F3E5F5, #E1BEE7);
                        border: 2px solid #9C27B0;
                        border-radius: 12px;
                        padding: 16px;
                    ">
                        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; font-weight: 600;">
                            👥 ПОЛЬЗОВАТЕЛИ
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 14px; color: var(--text-primary);">🟢 Активные</span>
                                <span style="font-weight: 700; font-size: 16px; color: #66BB6A;">${totalUsers}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 14px; color: var(--text-primary);">🛡️ Помощники</span>
                                <span style="font-weight: 700; font-size: 16px; color: #2196F3;">${assistants.length}</span>
                            </div>
                            <div style="
                                margin-top: 8px;
                                padding-top: 8px;
                                border-top: 1px solid rgba(156, 39, 176, 0.3);
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                            ">
                                <span style="font-size: 14px; color: var(--text-primary); font-weight: 600;">Всего</span>
                                <span style="font-weight: 700; font-size: 18px; color: #9C27B0;">${totalUsers}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки статистики:', error);
    }
}

function startStatsUpdates() {
    if (!userData.isAdmin) return;
    
    if (statsInterval) clearInterval(statsInterval);
    statsInterval = setInterval(() => {
        loadAdminStats();
    }, 10000);
}

function showAdminTab(tab) {
    // Проверка: вкладка помощников только для админа
    if (tab === 'assistants' && !userData.isAdmin) {
        showNotification('❌ Доступ запрещен');
        hapticFeedback('error');
        return;
    }
    
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-view').forEach(v => v.style.display = 'none');
    
    event.target.classList.add('active');
    
    if (tab === 'users') {
        document.getElementById('adminUsers').style.display = 'block';
        loadAdminUsers();
    } else if (tab === 'receipts') {
        document.getElementById('adminReceipts').style.display = 'block';
        loadAdminReceipts();
    } else if (tab === 'tickets') {
        document.getElementById('adminTickets').style.display = 'block';
        loadAdminTickets();
    } else if (tab === 'assistants') {
        document.getElementById('adminAssistants').style.display = 'block';
        loadAssistants();
    }
    
    hapticFeedback('light');
}

async function loadAdminUsers() {
    console.log('👑 Админ: загрузка пользователей...');
    const data = await apiRequest('/api/users', 'GET', {action: 'all'});
    console.log('👑 Получено пользователей:', data.users?.length || 0, data);
    const users = data.users || [];
    
    const container = document.getElementById('adminUsers');
    
    if (users.length === 0) {
        container.innerHTML = '<div class="empty"><div class="empty-icon">👤</div><h3>Нет пользователей</h3></div>';
        return;
    }
    
    container.innerHTML = `
        <div style="margin-bottom: 16px;">
            <input 
                type="text" 
                id="userSearchInput" 
                placeholder="🔍 Поиск по имени или ID..." 
                style="
                    width: 100%;
                    padding: 12px 16px;
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    font-size: 15px;
                    box-sizing: border-box;
                "
                oninput="filterUsers()"
            >
        </div>
        <div id="usersListContainer">
            ${users.map(user => `
                <div class="user-card" data-user-id="${user.id}" data-user-name="${escapeHtml(user.firstName)} ${escapeHtml(user.lastName || '')}" style="
                    background: white;
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 12px;
                    transition: all 0.2s;
                ">
                    <div style="display: flex; align-items: flex-start; gap: 12px;">
                        <div style="
                            width: 48px;
                            height: 48px;
                            border-radius: 50%;
                            background: linear-gradient(135deg, var(--accent-orange), var(--accent-orange-dark));
                            color: white;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-weight: 600;
                            font-size: 18px;
                            flex-shrink: 0;
                        ">
                            ${(user.firstName[0] || '?').toUpperCase()}${(user.lastName?.[0] || '').toUpperCase()}
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                <div style="font-weight: 600; font-size: 15px; color: var(--text-primary);">
                                    ${escapeHtml(user.firstName)} ${escapeHtml(user.lastName || '')}
                                </div>
                                ${user.isAdmin ? '<span style="background: var(--accent-orange-light); color: var(--accent-orange); padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 600;">👑 АДМИН</span>' : ''}
                                ${user.isAssistant && !user.isAdmin ? '<span style="background: #E3F2FD; color: #1976D2; padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 600;">🛡️ ПОМОЩНИК</span>' : ''}
                                ${user.isBanned ? '<span style="background: #FFEBEE; color: #C62828; padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 600;">🚫 ЗАБЛОКИРОВАН</span>' : ''}
                            </div>
                            <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;">
                                ${user.username ? '@' + escapeHtml(user.username) : 'Без username'} • ID: ${user.id}
                            </div>
                            <div style="font-size: 12px; color: var(--text-secondary);">
                                📅 Регистрация: ${formatTime(user.registeredAt)}
                            </div>
                            ${!user.isAdmin ? `
                                <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
                                    ${!user.isBanned ? 
                                        `<button onclick="banUser(${user.id})" style="
                                            background: #FFEBEE;
                                            color: #C62828;
                                            border: 1px solid #FFCDD2;
                                            padding: 8px 16px;
                                            border-radius: 8px;
                                            font-size: 13px;
                                            font-weight: 600;
                                            cursor: pointer;
                                            transition: all 0.2s;
                                        ">🚫 Заблокировать</button>` :
                                        `<button onclick="unbanUser(${user.id})" style="
                                            background: #E8F5E9;
                                            color: #2E7D32;
                                            border: 1px solid #C8E6C9;
                                            padding: 8px 16px;
                                            border-radius: 8px;
                                            font-size: 13px;
                                            font-weight: 600;
                                            cursor: pointer;
                                            transition: all 0.2s;
                                        ">✅ Разблокировать</button>`
                                    }
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function filterUsers() {
    const searchInput = document.getElementById('userSearchInput');
    const filter = searchInput.value.toLowerCase();
    const userCards = document.querySelectorAll('.user-card');
    
    userCards.forEach(card => {
        const name = card.getAttribute('data-user-name').toLowerCase();
        const id = card.getAttribute('data-user-id');
        
        if (name.includes(filter) || id.includes(filter)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

async function banUser(userId) {
    // Проверка: только админ может банить
    if (!userData.isAdmin) {
        showNotification('❌ Только админ может блокировать пользователей');
        hapticFeedback('error');
        return;
    }
    
    if (!confirm('Заблокировать пользователя?')) return;
    
    try {
        await apiRequest('/api/users', 'PUT', {
            userId,
            isBanned: true,
            adminId: userData.id
        });
        
        showNotification('✅ Пользователь заблокирован');
        hapticFeedback('success');
        await loadAdminUsers();
        await loadAdminStats();
        
    } catch (error) {
        showNotification('❌ Ошибка');
        hapticFeedback('error');
    }
}

async function unbanUser(userId) {
    // Проверка: только админ может разбанивать
    if (!userData.isAdmin) {
        showNotification('❌ Только админ может разблокировать пользователей');
        hapticFeedback('error');
        return;
    }
    
    if (!confirm('Разблокировать пользователя?')) return;
    
    try {
        await apiRequest('/api/users', 'PUT', {
            userId,
            isBanned: false,
            adminId: userData.id
        });
        
        showNotification('✅ Пользователь разблокирован');
        hapticFeedback('success');
        await loadAdminUsers();
        await loadAdminStats();
        
    } catch (error) {
        showNotification('❌ Ошибка');
        hapticFeedback('error');
    }
}

async function loadAdminReceipts() {
    console.log('👑 Админ: загрузка чеков...');
    const data = await apiRequest('/api/receipts', 'GET', {action: 'all'});
    console.log('👑 Получено чеков:', data.receipts?.length || 0, data);
    const receipts = data.receipts || [];
    
    const container = document.getElementById('adminReceipts');
    
    if (receipts.length === 0) {
        container.innerHTML = '<div class="empty"><div class="empty-icon">📸</div><h3>Нет чеков</h3></div>';
        return;
    }
    
    container.innerHTML = receipts.map(receipt => `
        <div class="card" style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div style="font-weight: 600;">User ID: ${receipt.userId}</div>
                <div class="ticket-badge ${receipt.status}">
                    ${receipt.status === 'pending' ? '⏳ Ожидает' : receipt.status === 'approved' ? '✅ Одобрен' : '❌ Отклонён'}
                </div>
            </div>
            
            <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">
                ${formatTime(receipt.createdAt)}
                ${receipt.comment ? `<br>Комментарий: ${escapeHtml(receipt.comment)}` : ''}
            </div>
            
            <img src="${receipt.imageData}" style="width: 100%; max-width: 400px; border-radius: 12px; margin-bottom: 12px; border: 1px solid var(--border-color);" alt="Чек">
            
            ${receipt.status === 'pending' ? `
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-primary" style="flex: 1; padding: 12px;" onclick="approveReceipt(${receipt.userId})">✅ Одобрить</button>
                    <button class="btn btn-secondary" style="flex: 1; padding: 12px;" onclick="rejectReceipt(${receipt.userId})">❌ Отклонить</button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

async function approveReceipt(userId) {
    if (!confirm('Одобрить чек?')) return;
    
    try {
        await apiRequest('/api/receipts', 'PUT', {
            userId,
            status: 'approved',
            adminId: userData.id
        });
        
        showNotification('✅ Чек одобрен');
        hapticFeedback('success');
        await loadAdminReceipts();
        await loadAdminStats();
        
    } catch (error) {
        showNotification('❌ Ошибка');
        hapticFeedback('error');
    }
}

async function rejectReceipt(userId) {
    const comment = prompt('Укажите причину отклонения:');
    if (!comment) return;
    
    try {
        await apiRequest('/api/receipts', 'PUT', {
            userId,
            status: 'rejected',
            adminId: userData.id,
            comment
        });
        
        showNotification('❌ Чек отклонен');
        hapticFeedback('success');
        await loadAdminReceipts();
        await loadAdminStats();
        
    } catch (error) {
        showNotification('❌ Ошибка');
        hapticFeedback('error');
    }
}

async function loadAdminTickets() {
    const data = await apiRequest('/api/tickets?action=all', 'GET');
    const tickets = data.tickets || [];
    
    const container = document.getElementById('adminTickets');
    
    if (tickets.length === 0) {
        container.innerHTML = '<div class="empty"><div class="empty-icon">💬</div><h3>Нет тикетов</h3></div>';
        return;
    }
    
    container.innerHTML = tickets.map(ticket => `
        <div class="card" style="margin-bottom: 12px; cursor: pointer;" onclick="openAdminTicket(${ticket.id})">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="font-weight: 600;">Обращение #${ticket.id} от User #${ticket.userId}</div>
                <div class="ticket-badge ${ticket.status}">${ticket.status === 'open' ? 'Открыто' : 'Закрыто'}</div>
            </div>
            <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 4px;">
                ${escapeHtml(ticket.messages[0]?.text || 'Нет сообщений')}
            </div>
            <div style="font-size: 12px; color: var(--text-secondary);">
                Создано: ${formatTime(ticket.createdAt)} • Сообщений: ${ticket.messages.length}
            </div>
            ${ticket.unreadByAdmin ? '<div style="color: var(--accent-orange); font-weight: 600; margin-top: 4px;">📬 Новое сообщение</div>' : ''}
        </div>
    `).join('');
}

async function openAdminTicket(ticketId) {
    try {
        const data = await apiRequest('/api/tickets', 'GET', {ticketId});
        currentTicket = data.ticket;
        
        if (!currentTicket) return;
        
        await apiRequest('/api/tickets', 'PUT', {
            ticketId,
            markRead: 'admin'
        });
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.id = 'adminTicketModal';
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h3>Обращение #${ticketId}</h3>
                    <button class="close-modal" onclick="document.getElementById('adminTicketModal').remove()">×</button>
                </div>
                <div style="font-size: 13px; color: var(--text-secondary); padding: 0 20px; margin-bottom: 12px;">
                    User ID: ${currentTicket.userId} • Статус: ${currentTicket.status === 'open' ? 'Открыто' : 'Закрыто'}
                </div>
                
                <div id="adminChatMessages" style="max-height: 400px; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; background: var(--bg-secondary);">
                    ${currentTicket.messages.map(m => `
                        <div class="chat-msg ${m.from}" style="max-width: 75%;">
                            <div>${escapeHtml(m.text)}</div>
                            <div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">${formatTime(m.time)}</div>
                        </div>
                    `).join('')}
                </div>
                
                ${currentTicket.status === 'open' ? `
                    <div class="modal-body">
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: var(--text-primary);">Ваш ответ:</label>
                            <textarea 
                                id="adminChatInput" 
                                placeholder="Введите ваше сообщение... (Ctrl+Enter для отправки)" 
                                rows="4"
                                style="
                                    width: 100%;
                                    padding: 12px;
                                    border: 1px solid var(--border-color);
                                    border-radius: 12px;
                                    font-family: inherit;
                                    font-size: 15px;
                                    resize: vertical;
                                    background: white;
                                    color: var(--text-primary);
                                    box-sizing: border-box;
                                "
                                onkeydown="if(event.ctrlKey && event.key === 'Enter') sendAdminMessage(${ticketId})"
                            ></textarea>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <button onclick="sendAdminMessage(${ticketId})" class="btn btn-primary" style="width: 100%;">
                                ✉️ Отправить
                            </button>
                            <button onclick="closeTicketAdmin(${ticketId})" class="btn btn-secondary" style="width: 100%;">
                                ✓ Закрыть обращение
                            </button>
                        </div>
                    </div>
                ` : `
                    <div class="modal-body" style="text-align: center; padding: 40px;">
                        <div style="font-size: 48px; margin-bottom: 16px;">✓</div>
                        <div style="color: var(--text-secondary); font-size: 16px;">
                            Обращение закрыто
                        </div>
                    </div>
                `}
            </div>
        `;
        
        document.body.appendChild(modal);
        hapticFeedback('medium');
        
        setTimeout(() => {
            const messages = document.getElementById('adminChatMessages');
            if (messages) {
                messages.scrollTop = messages.scrollHeight;
            }
            
            // Фокус на textarea
            const input = document.getElementById('adminChatInput');
            if (input) {
                input.focus();
            }
        }, 100);
        
    } catch (error) {
        console.error('❌ Ошибка загрузки тикета:', error);
        showNotification('❌ Ошибка загрузки');
        hapticFeedback('error');
    }
}

async function sendAdminMessage(ticketId) {
    const input = document.getElementById('adminChatInput');
    if (!input) {
        console.error('❌ Не найден input');
        return;
    }
    
    const text = input.value.trim();
    
    if (!text) {
        showNotification('⚠️ Введите сообщение');
        input.focus();
        return;
    }
    
    console.log('📤 Отправка сообщения админа:', {ticketId, text});
    
    try {
        // Блокируем кнопку
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '⏳ Отправка...';
        
        await apiRequest('/api/tickets', 'POST', {
            ticketId,
            userId: userData.id,
            message: text,
            isAdmin: true
        });
        
        console.log('✅ Сообщение отправлено');
        
        input.value = '';
        showNotification('✅ Отправлено');
        hapticFeedback('success');
        
        // Закрываем и открываем заново
        const modal = document.getElementById('adminTicketModal');
        if (modal) modal.remove();
        
        setTimeout(() => {
            openAdminTicket(ticketId);
        }, 300);
        
    } catch (error) {
        console.error('❌ Ошибка отправки:', error);
        showNotification('❌ Ошибка отправки');
        hapticFeedback('error');
        
        // Разблокируем кнопку
        const btn = event.target;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '✉️ Отправить';
        }
    }
}

async function closeTicketAdmin(ticketId) {
    if (!confirm('Закрыть обращение?')) return;
    
    try {
        await apiRequest('/api/tickets', 'PUT', {
            ticketId,
            status: 'closed'
        });
        
        showNotification('✅ Обращение закрыто');
        hapticFeedback('success');
        
        const modal = document.getElementById('adminTicketModal');
        if (modal) modal.remove();
        
        await loadAdminTickets();
        
    } catch (error) {
        console.error('❌ Ошибка закрытия тикета:', error);
        showNotification('❌ Ошибка');
        hapticFeedback('error');
    }
}

function startTicketsPolling() {
    if (ticketsInterval) clearInterval(ticketsInterval);
    
    ticketsInterval = setInterval(async () => {
        if (document.getElementById('support').classList.contains('active')) {
            await loadTickets();
        }
        
        if ((userData.isAdmin || userData.isAssistant) && document.getElementById('adminModal').classList.contains('active')) {
            await loadAdminTickets();
        }
    }, 5000);
}

// ==================== RESET ====================
function resetApp() {
    if (!confirm('Сбросить все данные приложения?')) return;
    
    localStorage.clear();
    location.reload();
}

// ==================== API ====================
async function apiRequest(endpoint, method = 'GET', body = null) {
    try {
        console.log(`🌐 API Request: ${method} ${endpoint}`, body);
        
        const options = {
            method,
            headers: {'Content-Type': 'application/json'}
        };
        
        let url = API_URL + endpoint;
        
        if (method === 'GET' && body) {
            const params = new URLSearchParams(body);
            url += '?' + params.toString();
        } else if (body) {
            options.body = JSON.stringify(body);
        }
        
        console.log(`🔗 URL: ${url}`);
        
        const response = await fetch(url, options);
        
        console.log(`📡 Response status: ${response.status}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ HTTP Error ${response.status}:`, errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        console.log(`✅ Response data:`, data);
        
        return data;
        
    } catch (error) {
        console.error('❌ API Error:', error);
        throw error;
    }
}

// ==================== UTILS ====================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'только что';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' мин назад';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' ч назад';
    
    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function updateOnlineStatus() {
    window.addEventListener('online', () => {
        showNotification('🟢 Соединение восстановлено');
    });
    
    window.addEventListener('offline', () => {
        showNotification('🔴 Нет соединения');
    });
}

// ==================== ASSISTANTS MANAGEMENT ====================
async function loadAssistants() {
    try {
        const data = await apiRequest('/api/assistants', 'GET');
        assistants = data.assistants || [];
        
        const container = document.getElementById('adminAssistants');
        
        container.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #E3F2FD, #BBDEFB);
                border-radius: 16px;
                padding: 20px;
                margin-bottom: 24px;
                border: 2px solid #2196F3;
            ">
                <h4 style="color: #1976D2; margin-bottom: 16px; font-size: 18px;">
                    ➕ Добавить помощника
                </h4>
                <p style="color: #424242; font-size: 14px; margin-bottom: 16px; line-height: 1.6;">
                    Помощники могут просматривать пользователей, чеки и обращения, но не могут блокировать пользователей.
                </p>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <input 
                        type="number" 
                        id="assistantIdInput" 
                        placeholder="Введите Telegram ID пользователя" 
                        style="
                            width: 100%;
                            padding: 14px 16px;
                            border: 2px solid #2196F3;
                            border-radius: 12px;
                            font-size: 15px;
                            box-sizing: border-box;
                        "
                    >
                    <button onclick="addAssistant()" style="
                        background: #2196F3;
                        color: white;
                        border: none;
                        padding: 14px 28px;
                        border-radius: 12px;
                        font-size: 15px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        width: 100%;
                    ">
                        ➕ Назначить помощником
                    </button>
                </div>
            </div>
            
            <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
            ">
                <h4 style="color: var(--text-primary); font-size: 18px;">
                    👥 Список помощников
                </h4>
                <div style="
                    background: #E3F2FD;
                    color: #1976D2;
                    padding: 6px 14px;
                    border-radius: 20px;
                    font-size: 14px;
                    font-weight: 600;
                ">
                    ${assistants.length}
                </div>
            </div>
            
            ${assistants.length === 0 ? `
                <div style="
                    text-align: center;
                    padding: 60px 20px;
                    background: var(--bg-secondary);
                    border-radius: 16px;
                    border: 2px dashed var(--border-color);
                ">
                    <div style="font-size: 64px; margin-bottom: 16px; opacity: 0.5;">🛡️</div>
                    <h3 style="color: var(--text-primary); font-size: 18px; margin-bottom: 8px;">
                        Нет помощников
                    </h3>
                    <p style="color: var(--text-secondary); font-size: 14px;">
                        Введите Telegram ID выше и назначьте первого помощника
                    </p>
                </div>
            ` : `
                <div style="margin-bottom: 16px;">
                    <input 
                        type="text" 
                        id="assistantSearchInput" 
                        placeholder="🔍 Поиск по имени или ID..." 
                        style="
                            width: 100%;
                            padding: 12px 16px;
                            border: 1px solid var(--border-color);
                            border-radius: 12px;
                            font-size: 15px;
                            box-sizing: border-box;
                        "
                        oninput="filterAssistants()"
                    >
                </div>
                <div id="assistantsListContainer" style="display: grid; gap: 12px;">
                    ${assistants.map(assistant => `
                        <div class="assistant-card" data-assistant-id="${assistant.id}" data-assistant-name="${escapeHtml(assistant.firstName)} ${escapeHtml(assistant.lastName || '')}" style="
                            background: white;
                            border: 2px solid #E3F2FD;
                            border-radius: 12px;
                            padding: 16px;
                            transition: all 0.2s;
                        ">
                            <div style="display: flex; align-items: flex-start; gap: 12px;">
                                <div style="
                                    width: 48px;
                                    height: 48px;
                                    border-radius: 50%;
                                    background: linear-gradient(135deg, #2196F3, #1976D2);
                                    color: white;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    font-weight: 600;
                                    font-size: 18px;
                                    flex-shrink: 0;
                                ">
                                    ${(assistant.firstName[0] || '?').toUpperCase()}${(assistant.lastName?.[0] || '').toUpperCase()}
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                        <div style="font-weight: 600; font-size: 15px; color: var(--text-primary);">
                                            🛡️ ${escapeHtml(assistant.firstName)} ${escapeHtml(assistant.lastName || '')}
                                        </div>
                                        <span style="
                                            background: #E3F2FD;
                                            color: #1976D2;
                                            padding: 2px 8px;
                                            border-radius: 8px;
                                            font-size: 11px;
                                            font-weight: 600;
                                        ">ПОМОЩНИК</span>
                                    </div>
                                    <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;">
                                        ${assistant.username ? '@' + escapeHtml(assistant.username) : 'Без username'} • ID: ${assistant.id}
                                    </div>
                                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
                                        📅 Назначен: ${formatTime(assistant.assignedAt)}
                                    </div>
                                    <button onclick="removeAssistant(${assistant.id})" style="
                                        background: #FFEBEE;
                                        color: #C62828;
                                        border: 1px solid #FFCDD2;
                                        padding: 8px 16px;
                                        border-radius: 8px;
                                        font-size: 13px;
                                        font-weight: 600;
                                        cursor: pointer;
                                        transition: all 0.2s;
                                    ">
                                        🗑️ Удалить из помощников
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `}
        `;
        
    } catch (error) {
        console.error('❌ Ошибка загрузки помощников:', error);
        // Показываем форму даже при ошибке
        const container = document.getElementById('adminAssistants');
        container.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #E3F2FD, #BBDEFB);
                border-radius: 16px;
                padding: 20px;
                margin-bottom: 24px;
                border: 2px solid #2196F3;
            ">
                <h4 style="color: #1976D2; margin-bottom: 16px; font-size: 18px;">
                    ➕ Добавить помощника
                </h4>
                <p style="color: #424242; font-size: 14px; margin-bottom: 16px; line-height: 1.6;">
                    Помощники могут просматривать пользователей, чеки и обращения, но не могут блокировать пользователей.
                </p>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <input 
                        type="number" 
                        id="assistantIdInput" 
                        placeholder="Введите Telegram ID пользователя" 
                        style="
                            width: 100%;
                            padding: 14px 16px;
                            border: 2px solid #2196F3;
                            border-radius: 12px;
                            font-size: 15px;
                            box-sizing: border-box;
                        "
                    >
                    <button onclick="addAssistant()" style="
                        background: #2196F3;
                        color: white;
                        border: none;
                        padding: 14px 28px;
                        border-radius: 12px;
                        font-size: 15px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        width: 100%;
                    ">
                        ➕ Назначить помощником
                    </button>
                </div>
            </div>
            
            <div style="
                text-align: center;
                padding: 40px 20px;
                background: #FFEBEE;
                border-radius: 16px;
                border: 2px solid #EF5350;
            ">
                <div style="font-size: 48px; margin-bottom: 12px;">❌</div>
                <h3 style="color: var(--text-primary); font-size: 16px; margin-bottom: 8px;">
                    Ошибка загрузки помощников
                </h3>
                <p style="color: var(--text-secondary); font-size: 14px;">
                    ${error.message || 'Проверьте подключение к серверу'}
                </p>
            </div>
        `;
    }
}

function filterAssistants() {
    const searchInput = document.getElementById('assistantSearchInput');
    const filter = searchInput.value.toLowerCase();
    const assistantCards = document.querySelectorAll('.assistant-card');
    
    assistantCards.forEach(card => {
        const name = card.getAttribute('data-assistant-name').toLowerCase();
        const id = card.getAttribute('data-assistant-id');
        
        if (name.includes(filter) || id.includes(filter)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

async function addAssistant() {
    const input = document.getElementById('assistantIdInput');
    const userId = parseInt(input.value);
    
    if (!userId || userId <= 0) {
        showNotification('❌ Введите корректный ID');
        hapticFeedback('error');
        return;
    }
    
    if (userId === ADMIN_ID) {
        showNotification('❌ Нельзя назначить админа помощником');
        hapticFeedback('error');
        return;
    }
    
    try {
        await apiRequest('/api/assistants', 'POST', {
            userId,
            adminId: userData.id
        });
        
        showNotification('✅ Помощник добавлен');
        hapticFeedback('success');
        input.value = '';
        await loadAssistants();
        await loadAdminStats(); // Обновляем статистику
        
    } catch (error) {
        showNotification('❌ Ошибка добавления');
        hapticFeedback('error');
    }
}

async function removeAssistant(userId) {
    if (!confirm('Удалить пользователя из помощников?')) return;
    
    try {
        await apiRequest('/api/assistants', 'DELETE', {
            userId,
            adminId: userData.id
        });
        
        showNotification('✅ Помощник удален');
        hapticFeedback('success');
        await loadAssistants();
        await loadAdminStats(); // Обновляем статистику
        
    } catch (error) {
        showNotification('❌ Ошибка удаления');
        hapticFeedback('error');
    }
}

// ==================== CLEANUP ====================
window.addEventListener('beforeunload', () => {
    if (statsInterval) clearInterval(statsInterval);
    if (ticketsInterval) clearInterval(ticketsInterval);
});

// ==================== НОВЫЕ ФУНКЦИИ АДМИН-ПАНЕЛИ ====================

// Обновить все данные
async function refreshAdminData() {
    console.log('🔄 Обновление данных админ-панели...');
    showNotification('🔄 Обновление данных...');
    
    try {
        await loadAdminStats();
        await loadDashboardData();
        
        const currentTab = document.querySelector('.admin-tab-modern.active');
        if (currentTab) {
            const tab = currentTab.textContent.trim();
            if (tab.includes('Пользователи')) await loadAdminUsers();
            if (tab.includes('Чеки')) await loadAdminReceipts();
            if (tab.includes('Обращения')) await loadAdminTickets();
            if (tab.includes('Помощники')) await loadAssistants();
        }
        
        showNotification('✅ Данные обновлены');
        hapticFeedback('success');
    } catch (error) {
        console.error('❌ Ошибка обновления:', error);
        showNotification('❌ Ошибка обновления');
        hapticFeedback('error');
    }
}

// Очистить все чеки
async function clearAllReceipts() {
    const confirm = window.confirm('⚠️ Вы уверены что хотите удалить ВСЕ чеки?\n\nЭто действие нельзя отменить!');
    if (!confirm) return;
    
    const doubleConfirm = window.confirm('❗ ВНИМАНИЕ! Это удалит все чеки из базы данных.\n\nВы точно уверены?');
    if (!doubleConfirm) return;
    
    console.log('🗑️ Очистка всех чеков...');
    
    try {
        const response = await fetch(API_URL + '/api/receipts/clear', {
            method: 'DELETE',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                adminId: userData.id
            })
        });
        
        if (!response.ok) {
            throw new Error('Ошибка сервера');
        }
        
        showNotification('✅ Все чеки удалены');
        hapticFeedback('success');
        
        await refreshAdminData();
        
    } catch (error) {
        console.error('❌ Ошибка удаления чеков:', error);
        showNotification('❌ Ошибка удаления');
        hapticFeedback('error');
    }
}

// Очистить все обращения
async function clearAllTickets() {
    const confirm = window.confirm('⚠️ Вы уверены что хотите удалить ВСЕ обращения?\n\nЭто действие нельзя отменить!');
    if (!confirm) return;
    
    const doubleConfirm = window.confirm('❗ ВНИМАНИЕ! Это удалит все обращения из базы данных.\n\nВы точно уверены?');
    if (!doubleConfirm) return;
    
    console.log('🗑️ Очистка всех обращений...');
    
    try {
        const response = await fetch(API_URL + '/api/tickets/clear', {
            method: 'DELETE',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                adminId: userData.id
            })
        });
        
        if (!response.ok) {
            throw new Error('Ошибка сервера');
        }
        
        showNotification('✅ Все обращения удалены');
        hapticFeedback('success');
        
        await refreshAdminData();
        
    } catch (error) {
        console.error('❌ Ошибка удаления обращений:', error);
        showNotification('❌ Ошибка удаления');
        hapticFeedback('error');
    }
}

// Экспорт данных
async function exportData() {
    console.log('📊 Экспорт данных...');
    showNotification('📊 Подготовка данных...');
    
    try {
        // Получаем все данные
        const users = await apiRequest('/api/users', 'GET', {action: 'all'});
        const receipts = await apiRequest('/api/receipts', 'GET', {action: 'all'});
        const tickets = await apiRequest('/api/tickets', 'GET', {action: 'all'});
        
        const exportData = {
            exportDate: new Date().toISOString(),
            users: users.users || [],
            receipts: receipts.receipts || [],
            tickets: tickets.tickets || [],
            stats: {
                totalUsers: users.users?.length || 0,
                totalReceipts: receipts.receipts?.length || 0,
                totalTickets: tickets.tickets?.length || 0
            }
        };
        
        // Создаем файл для скачивания
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `bnb-bank-export-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showNotification('✅ Данные экспортированы');
        hapticFeedback('success');
        
    } catch (error) {
        console.error('❌ Ошибка экспорта:', error);
        showNotification('❌ Ошибка экспорта');
        hapticFeedback('error');
    }
}

// Загрузка данных для дашборда
async function loadDashboardData() {
    try {
        console.log('📊 Загрузка данных дашборда...');
        
        // Получаем все данные
        const users = await apiRequest('/api/users', 'GET', {action: 'all'});
        const receipts = await apiRequest('/api/receipts', 'GET', {action: 'all'});
        const tickets = await apiRequest('/api/tickets', 'GET', {action: 'all'});
        
        const allUsers = users.users || [];
        const allReceipts = receipts.receipts || [];
        const allTickets = tickets.tickets || [];
        
        // Подсчитываем статистику
        const fiveMinAgo = Date.now() - (5 * 60 * 1000);
        const onlineUsers = allUsers.filter(u => u.lastSeen > fiveMinAgo).length;
        const bannedUsers = allUsers.filter(u => u.isBanned).length;
        
        const pendingReceipts = allReceipts.filter(r => r.status === 'pending').length;
        const approvedReceipts = allReceipts.filter(r => r.status === 'approved').length;
        const rejectedReceipts = allReceipts.filter(r => r.status === 'rejected').length;
        
        const openTickets = allTickets.filter(t => t.status === 'open').length;
        const closedTickets = allTickets.filter(t => t.status === 'closed').length;
        
        // Обновляем интерфейс
        document.getElementById('dashTotalUsers').textContent = allUsers.length;
        document.getElementById('dashOnlineUsers').textContent = onlineUsers;
        document.getElementById('dashBannedUsers').textContent = bannedUsers;
        
        document.getElementById('dashTotalReceiptsAll').textContent = allReceipts.length;
        document.getElementById('dashPendingReceipts').textContent = pendingReceipts;
        document.getElementById('dashApprovedReceipts').textContent = approvedReceipts;
        document.getElementById('dashRejectedReceipts').textContent = rejectedReceipts;
        
        document.getElementById('dashTotalTicketsAll').textContent = allTickets.length;
        document.getElementById('dashOpenTickets').textContent = openTickets;
        document.getElementById('dashClosedTickets').textContent = closedTickets;
        
        // Последняя активность
        loadRecentActivity(allUsers, allReceipts, allTickets);
        
    } catch (error) {
        console.error('❌ Ошибка загрузки дашборда:', error);
    }
}

// Последняя активность
function loadRecentActivity(users, receipts, tickets) {
    const activities = [];
    
    // Добавляем последние чеки
    receipts.slice(0, 5).forEach(receipt => {
        const user = users.find(u => u.id === receipt.userId);
        activities.push({
            type: 'receipt',
            icon: '📸',
            text: `${user?.firstName || 'Пользователь'} отправил чек`,
            time: receipt.uploadedAt,
            status: receipt.status
        });
    });
    
    // Добавляем последние обращения
    tickets.slice(0, 5).forEach(ticket => {
        const user = users.find(u => u.id === ticket.userId);
        activities.push({
            type: 'ticket',
            icon: '💬',
            text: `${user?.firstName || 'Пользователь'} создал обращение`,
            time: ticket.createdAt,
            status: ticket.status
        });
    });
    
    // Сортируем по времени
    activities.sort((a, b) => b.time - a.time);
    
    const container = document.getElementById('recentActivity');
    
    if (activities.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">Нет активности</div>';
        return;
    }
    
    container.innerHTML = activities.slice(0, 10).map(activity => `
        <div class="activity-item">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="font-size: 24px;">${activity.icon}</div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; color: var(--text-primary);">${activity.text}</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                        ${formatTime(activity.time)}
                    </div>
                </div>
                <div class="ticket-badge ${activity.status}">
                    ${activity.status === 'pending' || activity.status === 'open' ? 'Активно' : activity.status === 'approved' ? 'Одобрено' : 'Закрыто'}
                </div>
            </div>
        </div>
    `).join('');
}

// Обновленная функция showAdminTab
function showAdminTab(tab) {
    console.log('📑 Переключение таба:', tab);
    
    // Убираем active у всех табов
    document.querySelectorAll('.admin-tab-modern').forEach(t => t.classList.remove('active'));
    
    // Скрываем все view
    document.querySelectorAll('.admin-view-modern').forEach(v => v.style.display = 'none');
    
    // Активируем нужный таб
    const tabs = document.querySelectorAll('.admin-tab-modern');
    tabs.forEach(t => {
        if ((tab === 'dashboard' && t.textContent.includes('Обзор')) ||
            (tab === 'users' && t.textContent.includes('Пользователи')) ||
            (tab === 'receipts' && t.textContent.includes('Чеки')) ||
            (tab === 'tickets' && t.textContent.includes('Обращения')) ||
            (tab === 'assistants' && t.textContent.includes('Помощники')) ||
            (tab === 'settings' && t.textContent.includes('Настройки'))) {
            t.classList.add('active');
        }
    });
    
    // Показываем нужный view и загружаем данные
    if (tab === 'dashboard') {
        document.getElementById('adminDashboard').style.display = 'block';
        loadDashboardData();
    } else if (tab === 'users') {
        document.getElementById('adminUsers').style.display = 'block';
        loadAdminUsers();
    } else if (tab === 'receipts') {
        document.getElementById('adminReceipts').style.display = 'block';
        loadAdminReceipts();
    } else if (tab === 'tickets') {
        document.getElementById('adminTickets').style.display = 'block';
        loadAdminTickets();
    } else if (tab === 'assistants') {
        document.getElementById('adminAssistants').style.display = 'block';
        loadAssistants();
    } else if (tab === 'settings') {
        document.getElementById('adminSettings').style.display = 'block';
        updateServerStatus();
    }
    
    hapticFeedback('light');
}

// Проверка статуса сервера
async function updateServerStatus() {
    try {
        const start = Date.now();
        await apiRequest('/api/stats', 'GET');
        const ping = Date.now() - start;
        
        document.getElementById('serverStatus').textContent = `Онлайн (${ping}ms)`;
        document.getElementById('serverStatus').style.color = '#4CAF50';
    } catch (error) {
        document.getElementById('serverStatus').textContent = 'Офлайн';
        document.getElementById('serverStatus').style.color = '#DC3545';
    }
    
    document.getElementById('lastUpdate').textContent = formatTime(Date.now());
}

// ==================== СКРЫТИЕ НАВИГАЦИИ ПРИ СКРОЛЛЕ ====================
let lastScrollTop = 0;
let scrollTimeout = null;

window.addEventListener('scroll', () => {
    const navTabs = document.querySelector('.nav-tabs');
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    // Очищаем предыдущий таймаут
    if (scrollTimeout) {
        clearTimeout(scrollTimeout);
    }
    
    // Скрываем при скролле вниз, показываем при скролле вверх
    if (scrollTop > lastScrollTop && scrollTop > 100) {
        // Скролл вниз
        navTabs.classList.add('hidden');
    } else {
        // Скролл вверх
        navTabs.classList.remove('hidden');
    }
    
    lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
    
    // Показываем навигацию через 1 секунду после остановки скролла
    scrollTimeout = setTimeout(() => {
        navTabs.classList.remove('hidden');
    }, 2000);
}, false);

console.log('✅ app.js загружен');
