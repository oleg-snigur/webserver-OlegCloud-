// js/files.js
import { apiRequest } from './api.js';
import { getFileIcon } from './ui.js';
import { initStoragePage } from './charts.js';

let allFiles = []; // Зберігаємо стан файлів локально для пошуку
let selectedFiles = new Set(); // Зберігаємо ID вибраних файлів

// --- 1. Завантаження списку ---
export async function loadFiles() {
    try {
        const res = await apiRequest('/my-files');
        if (res && res.ok) {
            allFiles = await res.json();
            // Скидаємо виділення при оновленні списку, щоб не видалити неіснуючі файли
            selectedFiles.clear(); 
            renderFilesTable(allFiles);
        }
    } catch (e) {
        console.error("Error loading files", e);
    }
}

// --- 2. Рендеринг таблиці ---
function renderFilesTable(files) {
    const tbody = document.getElementById('files-table-body');
    const emptyState = document.getElementById('empty-state');
    const tableContainer = document.getElementById('files-table-container');

    updateBulkActionsUI();

    if (!tbody) return;
    tbody.innerHTML = '';

    if (!files || files.length === 0) {
        if(emptyState) emptyState.classList.remove('hidden');
        if(tableContainer) tableContainer.classList.add('hidden');
        return;
    }

    if(emptyState) emptyState.classList.add('hidden');
    if(tableContainer) tableContainer.classList.remove('hidden');

    // Стиль для чекбоксів (перевикористовуємо)
    // appearance-none дозволяє повністю прибрати стандартний вигляд браузера
    const checkboxStyle = `
        appearance-none h-5 w-5 
        border border-gray-500 rounded-md bg-gray-800 
        checked:bg-blue-600 checked:border-blue-600 
        focus:ring-2 focus:ring-offset-gray-900 focus:ring-blue-500 
        transition-all cursor-pointer relative
        before:content-[''] before:block before:w-2 before:h-3.5 
        before:border-r-2 before:border-b-2 before:border-white 
        before:absolute before:top-[2px] before:left-[7px] 
        before:rotate-45 before:opacity-0 checked:before:opacity-100`;

    // Заголовок таблиці
    const thead = document.querySelector('thead tr');
    if (thead && !thead.querySelector('.checkbox-col')) {
        const th = document.createElement('th');
        th.className = "checkbox-col w-12 px-4 py-3 text-left"; // Фіксована ширина w-12
        th.innerHTML = `<input type="checkbox" onclick="window.toggleSelectAll(this)" class="${checkboxStyle}">`;
        thead.insertBefore(th, thead.firstChild);
    }

    files.forEach(file => {
        const date = new Date(file.created_at).toLocaleString('uk-UA');
        const size = file.size.toFixed(2) + ' MB';
        const isViewable = file.content_type.startsWith('image/') || file.content_type === 'application/pdf';
        
        const isChecked = selectedFiles.has(file.id) ? 'checked' : '';

        // Чекбокс з новим стилем
        const checkboxHtml = `
            <td class="px-4 py-4 whitespace-nowrap">
                <input type="checkbox" 
                    onclick="window.toggleFileSelection(${file.id})" 
                    ${isChecked}
                    class="${checkboxStyle}">
            </td>`;

        // Ім'я файлу: w-full, truncate (обрізає текст), max-w-xs (на мобільних) або max-w-md
        const nameHtml = isViewable 
            ? `<div class="flex items-center gap-3 w-full max-w-[150px] md:max-w-md lg:max-w-lg cursor-pointer group" onclick="window.viewFile(${file.id}, '${file.filename}', '${file.content_type}')">
                 <span class="text-gray-400 group-hover:text-blue-400 transition-colors">${getFileIcon(file.content_type)}</span>
                 <span class="text-gray-200 font-medium truncate group-hover:text-blue-400 group-hover:underline transition-colors" title="${file.filename}">${file.filename}</span>
               </div>`
            : `<div class="flex items-center gap-3 w-full max-w-[150px] md:max-w-md lg:max-w-lg">
                 <span class="text-gray-400">${getFileIcon(file.content_type)}</span>
                 <span class="text-gray-200 font-medium truncate" title="${file.filename}">${file.filename}</span>
               </div>`;

        // Меню (без змін, просто коротко)
        const menuHtml = `<div class="relative inline-block text-left dropdown-container">
                <button onclick="window.toggleDropdown(event, ${file.id})" class="p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-700 transition-colors">
                    <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" /></svg>
                </button>
                <div id="dropdown-${file.id}" class="hidden absolute right-0 w-48 bg-gray-800 rounded-md shadow-xl z-50 border border-gray-600">
                    <div class="py-1">
                        <button onclick="window.downloadFile(${file.id}, '${file.filename}')" class="flex w-full items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700">Скачати</button>
                        <button onclick="window.deleteFile(${file.id})" class="flex w-full items-center px-4 py-2 text-sm text-red-400 hover:bg-gray-700">Видалити</button>
                    </div>
                </div>
            </div>`;
        
        tbody.innerHTML += `
            <tr class="hover:bg-gray-800/50 border-b border-gray-700/50 transition-colors ${isChecked ? 'bg-blue-900/10' : ''}">
                ${checkboxHtml}
                <td class="px-6 py-4">${nameHtml}</td>
                <td class="hidden md:table-cell px-6 py-4 text-sm text-gray-400 whitespace-nowrap">${date}</td>
                <td class="hidden md:table-cell px-6 py-4 text-sm text-gray-400 whitespace-nowrap">${size}</td>
                <td class="px-6 py-4 text-right whitespace-nowrap">${menuHtml}</td>
            </tr>`;
    });
}

// --- 3. Пошук (Filtering) ---
export function handleSearch(query) {
    const resultsContainer = document.getElementById('search-results-dropdown');
    if (!resultsContainer) return;

    if (!query) {
        resultsContainer.classList.add('hidden');
        renderFilesTable(allFiles);
        return;
    }

    const lowerQuery = query.toLowerCase();
    const filteredFiles = allFiles.filter(file => 
        file.filename.toLowerCase().includes(lowerQuery)
    );

   // Dropdown з результатами
    resultsContainer.innerHTML = '';
    if (filteredFiles.length > 0) {
        resultsContainer.classList.remove('hidden');
        filteredFiles.slice(0, 5).forEach(file => {
            const div = document.createElement('div');
            div.className = "px-4 py-2 hover:bg-gray-700 cursor-pointer flex items-center gap-2 text-gray-200 text-sm";
            div.innerHTML = `${getFileIcon(file.content_type)} <span>${file.filename}</span>`;
            div.onclick = () => {
                renderFilesTable([file]);
                resultsContainer.classList.add('hidden');
            };
            resultsContainer.appendChild(div);
        });
    } else {
        resultsContainer.classList.add('hidden');
    }

    renderFilesTable(filteredFiles);
}

// --- 4. Завантаження ---
export async function uploadFile(incomingData) {
    let files = [];

    // Перевіряємо, що саме нам передали: кнопку (Input) чи список файлів (Drag-and-Drop)
    if (incomingData.tagName === 'INPUT') {
        // Це прийшло від <input type="file">
        files = Array.from(incomingData.files);
        incomingData.value = ''; // Очищаємо поле
    } else {
        // Це прийшло від Drag-and-Drop (це вже список файлів)
        files = Array.from(incomingData);
    }

    if (files.length === 0) return;

    const progressContainer = document.getElementById('progress-container');
    if (progressContainer) progressContainer.classList.remove('hidden');

    // Проходимо по черзі
    for (let i = 0; i < files.length; i++) {
        await uploadSingleFile(files[i], i + 1, files.length);
    }

    // Фінал
    const progressBar = document.getElementById('progress-bar');
    const progressTime = document.getElementById('progress-time');
    
    if (progressTime) progressTime.innerText = "Всі файли завантажено!";
    if (progressBar) progressBar.classList.add('bg-green-500');

    setTimeout(() => {
        if (progressContainer) progressContainer.classList.add('hidden');
        if (progressBar) progressBar.classList.remove('bg-green-500');
        loadFiles(); // Оновлюємо список
    }, 1500);
}
// Внутрішня функція для одного файлу
function uploadSingleFile(file, currentIndex, totalFiles) {
    return new Promise((resolve, reject) => {
        const token = localStorage.getItem('token');
        const progressBar = document.getElementById('progress-bar');
        const progressPercent = document.getElementById('progress-percent');
        const progressTime = document.getElementById('progress-time');
        const progressFilename = document.getElementById('progress-filename');

        if (progressFilename) {
            let displayName = file.name.length > 20 ? file.name.substring(0, 20) + '...' : file.name;
            progressFilename.innerText = `[${currentIndex}/${totalFiles}] ${displayName}`;
        }

        if (progressBar) progressBar.style.width = '0%';
        if (progressPercent) progressPercent.innerText = '0%';

        const formData = new FormData();
        formData.append('file', file);
        const xhr = new XMLHttpRequest();
        const startTime = new Date().getTime();

        xhr.upload.onprogress = function(event) {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100;
                if (progressBar) progressBar.style.width = percentComplete + '%';
                if (progressPercent) progressPercent.innerText = Math.round(percentComplete) + '%';
                
                const timeElapsed = (new Date().getTime() - startTime) / 1000;
                const uploadSpeed = event.loaded / timeElapsed; 
                const secondsRemaining = (event.total - event.loaded) / uploadSpeed;
                
                if (progressTime && isFinite(secondsRemaining)) {
                    progressTime.innerText = `Залишилось: ${secondsRemaining > 60 ? Math.floor(secondsRemaining / 60) + ' хв' : Math.round(secondsRemaining) + ' с'}`;
                }
            }
        };

        xhr.onload = function() {
            if (xhr.status === 200) {
                resolve();
            } else {
                alert(`Помилка завантаження файлу ${file.name}`);
                resolve(); // Продовжуємо чергу
            }
        };

        xhr.onerror = function() {
            alert(`Помилка мережі при завантаженні ${file.name}`);
            resolve();
        };

        xhr.open('POST', '/api/upload', true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.send(formData);
    });
}

// --- 5. Одиночні дії (Delete, Download, View) ---
export async function deleteFile(id) {
    if(!confirm('Видалити?')) return;
    await apiRequest(`/delete/${id}`, { method: 'DELETE' });
    loadFiles();
}

export async function downloadFile(id, filename) {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isInApp = (ua.indexOf("FBAN") > -1) || (ua.indexOf("FBAV") > -1) || (ua.indexOf("Instagram") > -1) || (ua.indexOf("Telegram") > -1);
    
    if (isInApp) {
        alert("Увага! Відкрийте сайт у Chrome або Safari для скачування.");
        return;
    }

    const res = await apiRequest(`/download/${id}`);
    if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 2000);
    }
}

export async function viewFile(id, filename, contentType) {
    const modal = document.getElementById('preview-modal');
    const modalContent = document.getElementById('modal-content');
    const modalTitle = document.getElementById('modal-filename');
    const downloadLink = document.getElementById('download-link');

    if (!modal) return;

    modal.classList.remove('hidden');
    modalTitle.innerText = filename;
    modalContent.innerHTML = '<span class="text-gray-500 animate-pulse">Завантаження...</span>';
    
    downloadLink.onclick = (e) => { e.preventDefault(); downloadFile(id, filename); };

    try {
        const res = await apiRequest(`/download/${id}`);
        if (!res.ok) throw new Error("Load failed");
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);

        if (contentType.startsWith('image/')) {
            modalContent.innerHTML = `<img src="${url}" class="max-w-full max-h-full object-contain" alt="${filename}">`;
        } else if (contentType === 'application/pdf') {
            modalContent.innerHTML = `<iframe src="${url}" class="w-full h-full border-0 rounded"></iframe>`;
        } else {
            modalContent.innerHTML = `<p class="text-gray-400">Попередній перегляд недоступний.</p>`;
        }
    } catch (e) {
        modalContent.innerHTML = `<div class="text-red-500">Помилка завантаження</div>`;
    }
}

export function closeModal() {
    const modal = document.getElementById('preview-modal');
    if (modal) modal.classList.add('hidden');
    document.getElementById('modal-content').innerHTML = '';
}

// --- 6. Масові дії (Bulk Actions) ---

// Клік по чекбоксу одного файлу
export function toggleFileSelection(id) {
    if (selectedFiles.has(id)) {
        selectedFiles.delete(id);
    } else {
        selectedFiles.add(id);
    }
    updateBulkActionsUI();
}

// Клік по "Вибрати все"
export function toggleSelectAll(checkbox) {
    if (checkbox.checked) {
        allFiles.forEach(file => selectedFiles.add(file.id));
    } else {
        selectedFiles.clear();
    }
    renderFilesTable(allFiles); // Перемальовуємо таблицю, щоб оновити всі галочки
}

// Оновлення UI (показати/сховати панель масових дій)
function updateBulkActionsUI() {
    const bulkActions = document.getElementById('bulk-actions');
    const selectedCountBadge = document.getElementById('selected-count-badge');
    
    if (!bulkActions) return;

    if (selectedFiles.size > 0) {
        bulkActions.classList.remove('hidden');
        if (selectedCountBadge) selectedCountBadge.innerText = selectedFiles.size;
    } else {
        bulkActions.classList.add('hidden');
    }
}

// Видалення вибраних файлів
export async function deleteSelectedFiles() {
    const count = selectedFiles.size;
    if (count === 0) return;

    if (!confirm(`Ви точно хочете видалити ${count} файлів? Цю дію неможливо скасувати.`)) return;

    // Показуємо стан видалення
    const bulkActions = document.getElementById('bulk-actions');
    if(bulkActions) bulkActions.innerHTML = '<span class="text-white animate-pulse">Видалення...</span>';

    // Видаляємо файли по одному (або можна адаптувати API для масиву ID)
    for (const id of selectedFiles) {
        try {
            await apiRequest(`/delete/${id}`, { method: 'DELETE' });
        } catch (e) {
            console.error(`Failed to delete ${id}`, e);
        }
    }

    selectedFiles.clear();
    // Повертаємо панель дій до нормального стану (хоча вона сховається після loadFiles)
    if(bulkActions) bulkActions.innerHTML = ''; 
    loadFiles();
}
