// ==========================================
// 1. АВТОРИЗАЦІЯ ТА ІНІЦІАЛІЗАЦІЯ
// ==========================================
const token = localStorage.getItem('token');
if (!token) window.location.href = '/login.html';

let allFiles = []; // Глобальна змінна для файлів

// --- Допоміжні функції ---
function parseJwt(token) { 
    try { return JSON.parse(atob(token.split('.')[1])); } catch (e) { return null; } 
}

function stringToColorClass(str) {
    const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-green-600', 'bg-blue-600', 'bg-indigo-500', 'bg-purple-600'];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash += str.charCodeAt(i);
    return colors[hash % colors.length];
}

function getFileIcon(type) { 
    if (type.includes('pdf')) return `<svg class="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd" /></svg>`; 
    if (type.includes('image')) return `<svg class="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd" /></svg>`; 
    return `<svg class="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" /></svg>`; 
}

// --- Профіль користувача ---
const userData = parseJwt(token);
if (userData && userData.sub) {
    const emailDisplay = document.getElementById('user-email-display');
    if (emailDisplay) emailDisplay.innerText = userData.sub;
    
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) {
        avatarEl.innerText = userData.sub.charAt(0).toUpperCase();
        avatarEl.classList.add(stringToColorClass(userData.sub));
    }
}

function logout() {
    localStorage.removeItem('token');
    window.location.href = '/login.html';
}

// ==========================================
// 2. МАРШРУТИЗАЦІЯ (Яка сторінка?)
// ==========================================
const isDashboard = document.getElementById('files-table-body') !== null;
const isStoragePage = document.getElementById('storageChartPage') !== null;

if (isDashboard) {
    loadFiles();
    // Закриття пошуку при кліку поза ним
    document.addEventListener('click', (e) => {
        const searchContainer = document.querySelector('.search-container');
        const dropdown = document.getElementById('search-results-dropdown');
        if (searchContainer && dropdown && !searchContainer.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });
} 

if (isStoragePage) {
    initStoragePage();
}

// ==========================================
// 3. ОСНОВНІ ФУНКЦІЇ (Завантаження списку)
// ==========================================
async function loadFiles() {
    try {
        const res = await fetch('/api/my-files', { 
            headers: { 'Authorization': 'Bearer ' + token } 
        });
        
        if (res.status === 401) { logout(); return; }
        
        if (res.ok) {
            allFiles = await res.json();
            renderFiles(allFiles);
        }
    } catch (e) { 
        console.error("Error loading files", e); 
    }
}

function renderFiles(files) {
    const emptyState = document.getElementById('empty-state');
    const tableContainer = document.getElementById('files-table-container');
    const tbody = document.getElementById('files-table-body');
    
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!files || files.length === 0) {
        if(emptyState) emptyState.classList.remove('hidden');
        if(tableContainer) tableContainer.classList.add('hidden');
        return;
    }
    
    if(emptyState) emptyState.classList.add('hidden');
    if(tableContainer) tableContainer.classList.remove('hidden');

    files.forEach(file => {
        const date = new Date(file.created_at).toLocaleString('uk-UA');
        const size = file.size.toFixed(2) + ' MB';
        const isViewable = file.content_type.startsWith('image/') || file.content_type === 'application/pdf';
        
        const nameHtml = isViewable 
            ? `<span onclick="viewFile(${file.id}, '${file.filename}', '${file.content_type}')" class="cursor-pointer text-gray-200 hover:text-blue-400 font-medium hover:underline flex gap-2 items-center">${getFileIcon(file.content_type)} ${file.filename}</span>`
            : `<span class="text-gray-200 font-medium flex gap-2 items-center">${getFileIcon(file.content_type)} ${file.filename}</span>`;

        const menuHtml = `
            <div class="relative inline-block text-left dropdown-container">
                <button onclick="toggleDropdown(event, ${file.id})" class="p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-700 transition-colors">
                    <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" /></svg>
                </button>
                <div id="dropdown-${file.id}" class="hidden absolute right-0 w-48 bg-gray-800 rounded-md shadow-xl z-50 border border-gray-600">
                    <div class="py-1">
                        <button onclick="downloadFile(${file.id}, '${file.filename}')" class="flex w-full items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700">
                           <svg class="mr-3 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Скачати
                        </button>
                        ${isViewable ? `<button onclick="viewFile(${file.id}, '${file.filename}', '${file.content_type}')" class="flex w-full items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"><svg class="mr-3 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> Переглянути</button>` : ''}
                        <div class="border-t border-gray-700 my-1"></div>
                        <button onclick="deleteFile(${file.id})" class="flex w-full items-center px-4 py-2 text-sm text-red-400 hover:bg-gray-700">
                            <svg class="mr-3 h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> Видалити
                        </button>
                    </div>
                </div>
            </div>`;
        
        tbody.innerHTML += `<tr class="hover:bg-gray-750/50 border-b border-gray-700/50"><td class="px-6 py-4 whitespace-nowrap">${nameHtml}</td><td class="hidden md:table-cell px-6 py-4 text-sm text-gray-400 whitespace-nowrap">${date}</td><td class="hidden md:table-cell px-6 py-4 text-sm text-gray-400 whitespace-nowrap">${size}</td><td class="px-6 py-4 text-right whitespace-nowrap">${menuHtml}</td></tr>`;
    });
}

// ==========================================
// 4. ЗАВАНТАЖЕННЯ ФАЙЛІВ (ВИПРАВЛЕНО)
// ==========================================

function uploadFile(input) {
    const file = input.files[0];
    if (!file) return;

    // Елементи інтерфейсу
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressPercent = document.getElementById('progress-percent');
    const progressTime = document.getElementById('progress-time');
    const progressFilename = document.getElementById('progress-filename');

    // Показуємо меню прогресу
    if (progressContainer) {
        progressContainer.classList.remove('hidden');
        progressFilename.innerText = file.name.length > 20 ? file.name.substring(0, 20) + '...' : file.name;
        progressBar.style.width = '0%';
        progressPercent.innerText = '0%';
    }

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    const startTime = new Date().getTime(); // Запам'ятовуємо час початку

    // 1. СЛІДКУЄМО ЗА ПРОГРЕСОМ
    xhr.upload.onprogress = function(event) {
        if (event.lengthComputable) {
            // Відсотки
            const percentComplete = (event.loaded / event.total) * 100;
            
            // Оновлюємо смужку
            if (progressBar) progressBar.style.width = percentComplete + '%';
            if (progressPercent) progressPercent.innerText = Math.round(percentComplete) + '%';

            // Розрахунок часу
            const timeNow = new Date().getTime();
            const timeElapsed = (timeNow - startTime) / 1000; // пройшло секунд
            
            // Швидкість (байт на секунду)
            const uploadSpeed = event.loaded / timeElapsed; 
            
            // Скільки залишилось байт
            const bytesRemaining = event.total - event.loaded;
            
            // Час, що залишився (секунд)
            const secondsRemaining = bytesRemaining / uploadSpeed;

            // Форматуємо час
            let timeText = "";
            if (secondsRemaining > 60) {
                timeText = `${Math.floor(secondsRemaining / 60)} хв ${Math.round(secondsRemaining % 60)} с`;
            } else {
                timeText = `${Math.round(secondsRemaining)} с`;
            }

            if (progressTime) progressTime.innerText = `Залишилось: ${timeText}`;
        }
    };

    // 2. ЗАВЕРШЕННЯ ЗАВАНТАЖЕННЯ
    xhr.onload = function() {
        if (xhr.status === 200) {
            if (progressPercent) progressPercent.innerText = "100%";
            if (progressTime) progressTime.innerText = "Готово!";
            if (progressBar) progressBar.classList.add('bg-green-500'); // Зелений колір при успіху
            
            // Перезавантажуємо список через 1 секунду і ховаємо панель
            setTimeout(() => {
                if (progressContainer) progressContainer.classList.add('hidden');
                if (progressBar) progressBar.classList.remove('bg-green-500'); // Повертаємо синій
                loadFiles();
                if (typeof initStoragePage === 'function' && isStoragePage) initStoragePage();
            }, 1000);
        } else {
            // Помилка від сервера (наприклад 400 або 500)
            try {
                const errorData = JSON.parse(xhr.responseText);
                alert('Помилка: ' + (errorData.detail || 'Невідома помилка'));
            } catch (e) {
                alert('Помилка завантаження (код ' + xhr.status + ')');
            }
            if (progressContainer) progressContainer.classList.add('hidden');
        }
        input.value = ''; // Очистити інпут
    };

    // 3. ПОМИЛКА МЕРЕЖІ
    xhr.onerror = function() {
        alert('Помилка мережі (Інтернет зник?)');
        if (progressContainer) progressContainer.classList.add('hidden');
        input.value = '';
    };

    // 4. ВІДПРАВКА
    xhr.open('POST', '/api/upload', true);
    // Додаємо токен авторизації
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.send(formData);
}


// ==========================================
// 5. ДІЇ З ФАЙЛАМИ (Видалити, Скачати, Пошук)
// ==========================================
async function deleteFile(id) {
    if(!confirm('Ви впевнені, що хочете видалити цей файл?')) return;
    try {
        const res = await fetch(`/api/delete/${id}`, { 
            method: 'DELETE', 
            headers: {'Authorization': 'Bearer '+token}
        });
        if(res.ok) {
            loadFiles();
            if (typeof initStoragePage === 'function' && isStoragePage) initStoragePage();
        } else {
            alert("Помилка видалення");
        }
    } catch(e) { console.error(e); }
}

async function downloadFile(id, filename) {
    // --- 1. ПЕРЕВІРКА НА TELEGRAM / INSTAGRAM ---
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    // Шукаємо маркери вбудованих браузерів
    const isInApp = (ua.indexOf("FBAN") > -1) || (ua.indexOf("FBAV") > -1) || (ua.indexOf("Instagram") > -1) || (ua.indexOf("Telegram") > -1);

    if (isInApp) {
        alert("⚠️ Увага!\n\nВбудований браузер Telegram блокує скачування файлів.\n\nЩоб скачати файл:\n1. Натисніть на три крапки (⋮ або ⋯) у верхньому кутку.\n2. Виберіть 'Відкрити в браузері' (Open in Chrome/Safari).");
        return; // Зупиняємо функцію, далі не йдемо
    }

    // --- 2. СТАНДАРТНЕ СКАЧУВАННЯ ---
    try {
        const loadingMsg = document.getElementById('upload-status');
        if (loadingMsg) {
            loadingMsg.innerText = "Завантаження файлу...";
            loadingMsg.classList.remove('hidden');
        }

        const res = await fetch(`/api/download/${id}`, { 
            headers: { 'Authorization': 'Bearer ' + token } 
        });

        if(res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            
            document.body.appendChild(a);
            a.click();

            // Тайм-аут для мобільних браузерів
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                if (loadingMsg) loadingMsg.classList.add('hidden');
            }, 2000); 

        } else {
            alert("Не вдалося скачати файл. Можливо, сесія закінчилась.");
            if (loadingMsg) loadingMsg.classList.add('hidden');
        }
    } catch(e) { 
        console.error(e); 
        alert("Помилка мережі при скачуванні");
        if (loadingMsg) document.getElementById('upload-status').classList.add('hidden');
    }
}

function handleSearch(query) {
    const resultsContainer = document.getElementById('search-results-dropdown');
    if (!resultsContainer) return;

    if (!query) {
        resultsContainer.classList.add('hidden');
        renderFiles(allFiles); // Повертаємо всі файли
        return;
    }

    const lowerQuery = query.toLowerCase();
    const filteredFiles = allFiles.filter(file => 
        file.filename.toLowerCase().includes(lowerQuery)
    );

    // Відображаємо у випадаючому списку (швидкий пошук)
    resultsContainer.innerHTML = '';
    if (filteredFiles.length > 0) {
        resultsContainer.classList.remove('hidden');
        filteredFiles.slice(0, 5).forEach(file => {
            const div = document.createElement('div');
            div.className = "px-4 py-2 hover:bg-gray-700 cursor-pointer flex items-center gap-2 text-gray-200 text-sm";
            div.innerHTML = `${getFileIcon(file.content_type)} <span>${file.filename}</span>`;
            div.onclick = () => {
                // При кліку фільтруємо таблицю тільки по цьому файлу
                renderFiles([file]);
                resultsContainer.classList.add('hidden');
            };
            resultsContainer.appendChild(div);
        });
    } else {
        resultsContainer.classList.add('hidden');
    }

    // Також оновлюємо основну таблицю
    renderFiles(filteredFiles);
}

// ==========================================
// 6. МОДАЛЬНЕ ВІКНО (Перегляд)
// ==========================================
async function viewFile(id, filename, contentType) {
    const modal = document.getElementById('preview-modal');
    const modalContent = document.getElementById('modal-content');
    const modalTitle = document.getElementById('modal-filename');
    const downloadLink = document.getElementById('download-link');

    if (!modal) return;

    modal.classList.remove('hidden');
    modalTitle.innerText = filename;
    modalContent.innerHTML = '<span class="text-gray-500 animate-pulse">Завантаження попереднього перегляду...</span>';
    
    // Налаштування кнопки скачування в модалці
    downloadLink.onclick = (e) => {
        e.preventDefault();
        downloadFile(id, filename);
    };

    try {
        // Отримуємо файл як blob для перегляду
        const res = await fetch(`/api/download/${id}`, { 
            headers: { 'Authorization': 'Bearer ' + token } 
        });
        
        if (!res.ok) throw new Error("Load failed");
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);

        if (contentType.startsWith('image/')) {
            modalContent.innerHTML = `<img src="${url}" class="max-w-full max-h-full object-contain rounded shadow-lg" alt="${filename}">`;
        } else if (contentType === 'application/pdf') {
            modalContent.innerHTML = `<iframe src="${url}" class="w-full h-full border-0 rounded"></iframe>`;
        } else {
            modalContent.innerHTML = `<div class="text-center"><p class="text-gray-400 mb-4">Попередній перегляд недоступний для цього типу файлів.</p></div>`;
        }
    } catch (e) {
        modalContent.innerHTML = `<div class="text-red-500">Помилка завантаження файлу</div>`;
    }
}

function closeModal() {
    const modal = document.getElementById('preview-modal');
    if (modal) modal.classList.add('hidden');
    // Очищаємо контент, щоб зупинити відео/аудіо або звільнити пам'ять
    document.getElementById('modal-content').innerHTML = '';
}

// ==========================================
// 7. СТОРІНКА АНАЛІТИКИ (storage.html)
// ==========================================
async function initStoragePage() {
    try {
        const res = await fetch('/api/storage-info', { headers: { 'Authorization': 'Bearer ' + token } });
        if (res.ok) {
            const data = await res.json();
            
            // Картки
            document.getElementById('stat-used').innerText = data.total_used_mb.toFixed(2) + ' MB';
            document.getElementById('stat-total').innerText = data.total_limit_mb + ' MB';
            document.getElementById('stat-free').innerText = (data.total_limit_mb - data.total_used_mb).toFixed(2) + ' MB';
            
            // Прогрес бар
            const percent = data.percent_used;
            document.getElementById('stat-percent').innerText = percent + '%';
            const bar = document.getElementById('stat-bar');
            bar.style.width = `${percent}%`;
            bar.className = `h-4 rounded-full transition-all duration-1000 ${percent > 90 ? 'bg-red-500' : (percent > 70 ? 'bg-yellow-500' : 'bg-blue-600')}`;

            // Діаграма
            const ctx = document.getElementById('storageChartPage');
            if (ctx) {
                // Видаляємо стару діаграму, якщо є, щоб не накладались
                const chartStatus = Chart.getChart("storageChartPage"); 
                if (chartStatus != undefined) chartStatus.destroy();

                const labels = Object.keys(data.usage_by_type);
                const values = Object.values(data.usage_by_type);
                if (labels.length === 0) { labels.push("Вільно"); values.push(100); }

                new Chart(ctx.getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: labels,
                        datasets: [{
                            data: values,
                            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af' } } }
                    }
                });
            }

            // Список деталей
            const list = document.getElementById('stat-details-list');
            if (list) {
                list.innerHTML = '';
                for (const [type, size] of Object.entries(data.usage_by_type)) {
                    list.innerHTML += `
                        <li class="flex justify-between items-center border-b border-gray-700 pb-2 last:border-0">
                            <span class="text-gray-300 font-medium">${type}</span>
                            <span class="text-blue-400 font-bold">${size.toFixed(2)} MB</span>
                        </li>
                    `;
                }
            }
        }
    } catch (e) { console.error(e); }
}

// ==========================================
// 8. UI (Сайдбар, Меню)
// ==========================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar.classList.contains('-translate-x-full')) {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
    } else {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
}

let openDropdownId = null;

function toggleDropdown(event, id) {
    event.stopPropagation();
    
    if (openDropdownId !== null && openDropdownId !== id) {
        const prevMenu = document.getElementById(`dropdown-${openDropdownId}`);
        if (prevMenu) prevMenu.classList.add('hidden');
    }

    const menu = document.getElementById(`dropdown-${id}`);
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();

    if (menu.classList.contains('hidden')) {
        menu.classList.remove('hidden');
        menu.style.position = 'fixed';
        menu.style.zIndex = '100';
        menu.style.width = '12rem';

        let leftPos = rect.right - 192;
        if (leftPos < 10) leftPos = 10; 
        menu.style.left = `${leftPos}px`;

        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < 150) { 
            menu.style.top = 'auto'; 
            menu.style.bottom = `${window.innerHeight - rect.top + 5}px`;
            menu.classList.remove('origin-top-right');
            menu.classList.add('origin-bottom-right');
        } else {
            menu.style.bottom = 'auto';
            menu.style.top = `${rect.bottom + 5}px`;
            menu.classList.remove('origin-bottom-right');
            menu.classList.add('origin-top-right');
        }

        openDropdownId = id;
    } else {
        menu.classList.add('hidden');
        openDropdownId = null;
    }
}

// Закриття меню при скролі та кліку
window.addEventListener('click', () => {
    if (openDropdownId !== null) {
        const menu = document.getElementById(`dropdown-${openDropdownId}`);
        if (menu) menu.classList.add('hidden');
        openDropdownId = null;
    }
});

window.addEventListener('scroll', () => {
    if (openDropdownId !== null) {
        const menu = document.getElementById(`dropdown-${openDropdownId}`);
        if (menu) menu.classList.add('hidden');
        openDropdownId = null;
    }
}, true);