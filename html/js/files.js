import { apiRequest } from './api.js';
import { getFileIcon } from './ui.js';
import { initStoragePage } from './charts.js';

let allFiles = []; 
let selectedFiles = new Set(); 
let sortConfig = { key: 'created_at', direction: 'desc' };
let editingFileId = null; 
let currentFolderId = null; 

// Змінні для переміщення
let moveTargetId = null;
let itemsToMove = { files: [], folders: [] };

// --- 1. Завантаження списку (Файли + Папки) ---
export async function loadFiles(folderId = null) {
    try {
        currentFolderId = folderId; 
        
        const url = folderId ? `/my-files?folder_id=${folderId}` : '/my-files';
        
        const res = await apiRequest(url);
        if (res && res.ok) {
            const data = await res.json();
            
            allFiles = data.items; 
            
            // Передаємо весь об'єкт data, бо там є path (шлях)
            updateBreadcrumbs(data); 
            
            selectedFiles.clear();
            applySorting(); 
            renderFilesTable(allFiles);
        }
    } catch (e) {
        console.error("Error loading files", e);
    }
}

// --- 2. Навігація ("Хлібні крихти") ---
function updateBreadcrumbs(data) {
    const title = document.getElementById('breadcrumbs-title'); 
    if (!title) return;

    // Якщо бекенд ще не оновлено і немає шляху
    if (!data.path) {
        title.innerHTML = "Ваші документи";
        return;
    }

    // Генеруємо HTML шляху
    const htmlPath = data.path.map((item, index) => {
        const isLast = index === data.path.length - 1;
        
        if (isLast) {
            // Останній елемент (поточна папка) - просто текст
            return `<span class="text-gray-200 font-bold flex items-center gap-2 truncate">
                        ${item.id === null ? '🏠' : '📁'} ${item.name}
                    </span>`;
        }
        
        // Проміжні папки - посилання
        return `<span onclick="window.loadFiles(${item.id})" class="text-gray-500 hover:text-blue-400 cursor-pointer transition-colors flex items-center gap-1 whitespace-nowrap">
                    ${item.id === null ? '🏠' : '📁'} ${item.name}
                </span>
                <span class="text-gray-600">/</span>`;
    }).join(' ');

    title.innerHTML = `<div class="flex flex-wrap items-center gap-2 text-lg leading-none">${htmlPath}</div>`;
}

// --- 3. Створення папки ---
export async function createFolder() {
    const name = prompt("Введіть назву нової папки:");
    if (!name) return;

    try {
        await apiRequest('/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: name,
                parent_id: currentFolderId 
            })
        });
        loadFiles(currentFolderId);
    } catch (e) {
        alert("Не вдалося створити папку");
    }
}

// --- 4. Логіка Сортування ---
export function handleSort(key) {
    if (sortConfig.key === key) {
        sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortConfig.key = key;
        sortConfig.direction = 'asc';
    }
    applySorting();
    renderFilesTable(allFiles);
}

function applySorting() {
    allFiles.sort((a, b) => {
        // Папки завжди зверху
        if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
        }

        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (sortConfig.key === 'created_at') {
            valA = new Date(a.created_at).getTime();
            valB = new Date(b.created_at).getTime();
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
}

function getSortArrow(key) {
    if (sortConfig.key !== key) return '';
    return sortConfig.direction === 'asc' 
        ? `<svg class="w-4 h-4 inline ml-1 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>` 
        : `<svg class="w-4 h-4 inline ml-1 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>`;
}

// --- 5. Рендеринг таблиці (З ВИПРАВЛЕНИМ ПОРОЖНІМ СТАНОМ) ---
function renderFilesTable(files) {
    const tbody = document.getElementById('files-table-body');
    const emptyState = document.getElementById('empty-state');
    const tableContainer = document.getElementById('files-table-container');

    updateBulkActionsUI();
    setupContextMenuGlobalListeners();

    if (!tbody) return;
    tbody.innerHTML = '';

    // Завжди показуємо таблицю, щоб кнопки "Назад" і "Додати" були доступні
    if (tableContainer) tableContainer.classList.remove('hidden');
    // Завжди ховаємо старий блок empty-state (якщо він є)
    if (emptyState) emptyState.classList.add('hidden');

    // Якщо папка порожня - показуємо спеціальний рядок
    if (!files || files.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                    <div class="flex flex-col items-center justify-center select-none">
                        <svg class="h-16 w-16 text-gray-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                        </svg>
                        <p class="text-base font-medium text-gray-400">Ця папка порожня</p>
                        <p class="text-xs text-gray-600 mt-1">Використовуйте кнопки зверху, щоб додати вміст</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const checkboxStyle = `appearance-none h-5 w-5 border border-gray-500 rounded-md bg-gray-800 checked:bg-blue-600 checked:border-blue-600 focus:ring-2 focus:ring-offset-gray-900 focus:ring-blue-500 transition-all cursor-pointer relative before:content-[''] before:block before:w-1.5 before:h-2.5 before:border-r-2 before:border-b-2 before:border-white before:absolute before:top-[2px] before:left-[6px] before:rotate-45 before:opacity-0 checked:before:opacity-100`;

    // Заголовок таблиці
    const isAllSelected = files.length > 0 && files.every(f => selectedFiles.has(f.id));
    const theadRow = document.querySelector('thead tr');
    if (theadRow) {
        theadRow.innerHTML = `
            <th class="w-12 px-4 py-3 text-left checkbox-col">
                <input type="checkbox" onclick="window.toggleSelectAll(this)" class="${checkboxStyle}" ${isAllSelected ? 'checked' : ''}>
            </th>
            <th onclick="window.handleSort('filename')" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white group select-none">
                Назва ${getSortArrow('filename')}
            </th>
            <th onclick="window.handleSort('created_at')" class="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white group select-none">
                Дата ${getSortArrow('created_at')}
            </th>
            <th onclick="window.handleSort('size')" class="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white group select-none">
                Розмір ${getSortArrow('size')}
            </th>
            <th class="relative px-6 py-3"><span class="sr-only">Дії</span></th>
        `;
    }

    // Рядки таблиці
    files.forEach(item => {
        const isFolder = (item.type === 'folder');
        const date = new Date(item.created_at).toLocaleString('uk-UA');
        const size = isFolder ? '-' : (item.size.toFixed(2) + ' MB');
        const isChecked = selectedFiles.has(item.id) ? 'checked' : '';
        const isEditing = (editingFileId === item.id);

        let nameHtml = '';
        if (isEditing) {
            nameHtml = `
            <div class="flex flex-col sm:flex-row gap-2 items-start sm:items-center w-full z-10 relative">
                <input type="text" id="rename-input-${item.id}" value="${item.filename}" 
                    class="bg-gray-700 text-white text-base rounded px-3 py-2 w-full sm:w-auto border border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                    onkeydown="if(event.key === 'Enter' || event.keyCode === 13) window.saveRename(${item.id})"
                >
                <div class="flex gap-2 mt-2 sm:mt-0">
                    <button type="button" onclick="event.stopPropagation(); window.saveRename(${item.id})" class="p-2 bg-green-600 hover:bg-green-500 text-white rounded-lg shadow-lg" title="Зберегти">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                    </button>
                    <button type="button" onclick="event.stopPropagation(); window.cancelRename()" class="p-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg shadow-lg" title="Скасувати">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>`;
        } else {
            const iconHtml = isFolder 
                ? `<svg class="w-6 h-6 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15ZM1.5 10.146V6a3 3 0 0 1 3-3h5.379a2.25 2.25 0 0 1 1.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 0 1 3 3v1.146A4.483 4.483 0 0 0 19.5 9h-15a4.483 4.483 0 0 0-3 1.146Z"/></svg>`
                : `<span class="text-gray-400 group-hover:text-blue-400 transition-colors flex-shrink-0">${getFileIcon(item.content_type)}</span>`;
            
            const clickAction = isFolder 
                ? `onclick="window.loadFiles(${item.id})"` 
                : `onclick="window.viewFile(${item.id}, '${item.filename}', '${item.content_type}')"`;

            nameHtml = `
               <div class="flex items-center gap-3 w-full max-w-[150px] md:max-w-md lg:max-w-lg cursor-pointer group" ${clickAction}>
                 ${iconHtml}
                 <span class="text-gray-200 font-medium truncate group-hover:text-blue-400 group-hover:underline transition-colors select-none" title="${item.filename}">${item.filename}</span>
               </div>`;
        }

        const downloadBtnHtml = isFolder ? '' : 
            `<button onclick="window.downloadFile(${item.id}, '${item.filename}')" class="flex w-full items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700">
                <svg class="mr-3 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Скачати
            </button>`;

        const menuHtml = `
            <div class="relative inline-block text-left dropdown-container">
                <button onclick="window.toggleDropdown(event, ${item.id})" class="p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-700 transition-colors">
                    <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" /></svg>
                </button>
                <div id="dropdown-${item.id}" class="hidden absolute right-0 w-48 bg-gray-800 rounded-md shadow-xl z-50 border border-gray-600">
                    <div class="py-1">
                        <button onclick="window.startRename(${item.id})" class="flex w-full items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700">
                            <svg class="mr-3 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            Перейменувати
                        </button>
                        
                        <button onclick="window.startMove(${item.id}, '${item.type}')" class="flex w-full items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700">
                             <svg class="mr-3 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                             Перемістити
                        </button>

                        ${downloadBtnHtml}
                        <div class="border-t border-gray-700 my-1"></div>
                        <button onclick="window.deleteFile(${item.id}, '${item.type}')" class="flex w-full items-center px-4 py-2 text-sm text-red-400 hover:bg-gray-700">
                            <svg class="mr-3 h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> Видалити
                        </button>
                    </div>
                </div>
            </div>`;
        
        tbody.innerHTML += `
            <tr class="hover:bg-gray-800/50 border-b border-gray-700/50 transition-colors ${isChecked ? 'bg-blue-900/10' : ''}"
                oncontextmenu="window.handleContextMenu(event, ${item.id}, '${item.content_type}', '${item.filename}', '${item.type}')">
                <td class="px-4 py-4 whitespace-nowrap">
                    <input type="checkbox" onclick="event.stopPropagation(); window.toggleFileSelection(${item.id})" ${isChecked} class="${checkboxStyle}">
                </td>
                <td class="px-6 py-4">${nameHtml}</td>
                <td class="hidden md:table-cell px-6 py-4 text-sm text-gray-400 whitespace-nowrap">${date}</td>
                <td class="hidden md:table-cell px-6 py-4 text-sm text-gray-400 whitespace-nowrap">${size}</td>
                <td class="px-6 py-4 text-right whitespace-nowrap" onclick="event.stopPropagation()">${menuHtml}</td>
            </tr>`;
    });
}

// --- 6. Контекстне меню ---
function setupContextMenuGlobalListeners() {
    if (window.ctxListenersAdded) return;
    
    document.addEventListener('click', () => {
        const ctxMenu = document.getElementById('context-menu');
        if (ctxMenu) ctxMenu.classList.add('hidden');
    });

    const ctxMenu = document.getElementById('context-menu');
    if (ctxMenu) {
        ctxMenu.oncontextmenu = (e) => e.preventDefault();
    }
    window.ctxListenersAdded = true;
}

export function handleContextMenu(e, id, contentType, filename, type) {
    e.preventDefault(); 

    const menu = document.getElementById('context-menu');
    const viewBtn = document.getElementById('ctx-view');
    const downloadBtn = document.getElementById('ctx-download');
    const renameBtn = document.getElementById('ctx-rename');
    const moveBtn = document.getElementById('ctx-move');
    const deleteBtn = document.getElementById('ctx-delete');

    if (!menu) return;

    let x = e.pageX;
    let y = e.pageY;
    if (x + 230 > window.innerWidth) x = window.innerWidth - 230;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.remove('hidden');

    const isViewable = type === 'file' && (contentType.startsWith('image/') || contentType === 'application/pdf');
    if (isViewable) {
        viewBtn.classList.remove('hidden');
        viewBtn.classList.add('flex');
        viewBtn.onclick = () => { viewFile(id, filename, contentType); menu.classList.add('hidden'); };
    } else {
        viewBtn.classList.add('hidden');
        viewBtn.classList.remove('flex');
    }

    if (type === 'file') {
        downloadBtn.classList.remove('hidden');
        downloadBtn.classList.add('flex');
        downloadBtn.onclick = () => { downloadFile(id, filename); menu.classList.add('hidden'); };
    } else {
        downloadBtn.classList.add('hidden');
        downloadBtn.classList.remove('flex');
    }

    if (moveBtn) {
        moveBtn.onclick = () => { startMove(id, type); menu.classList.add('hidden'); };
    }

    renameBtn.onclick = () => { startRename(id); menu.classList.add('hidden'); };
    deleteBtn.onclick = () => { deleteFile(id, type); menu.classList.add('hidden'); };
}

// --- 7. Перейменування ---
export function startRename(id) {
    editingFileId = id;
    renderFilesTable(allFiles);
    
    setTimeout(() => {
        const input = document.getElementById(`rename-input-${id}`);
        if(input) {
            input.focus();
            const value = input.value;
            const lastDotIndex = value.lastIndexOf('.');
            if (lastDotIndex > 0) {
                input.setSelectionRange(0, lastDotIndex);
            } else {
                input.select();
            }
        }
    }, 50);
}

export function cancelRename() {
    editingFileId = null;
    renderFilesTable(allFiles);
}

export async function saveRename(id) {
    const input = document.getElementById(`rename-input-${id}`);
    if (!input) return;

    const newName = input.value.trim(); 
    if (!newName) {
        alert("Ім'я не може бути порожнім");
        return;
    }

    const item = allFiles.find(f => f.id === id);
    if (!item) return;

    input.disabled = true;

    try {
        let endpoint = `/files/${id}`;
        let payload = { filename: newName };

        // Якщо це папка, використовуємо інший ендпоінт
        if (item.type === 'folder') {
            endpoint = `/folders/${id}`;
            payload = { name: newName }; 
        }
        
        const res = await apiRequest(endpoint, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            let errorText = "Server Error";
            try {
                const errJson = await res.json();
                errorText = errJson.detail || JSON.stringify(errJson);
            } catch(e) { errorText = `Status: ${res.status}`; }
            throw new Error(errorText);
        }

        const data = await res.json();
        // Сервер повертає { filename: "..." } для сумісності
        item.filename = data.filename || newName; 
        
        editingFileId = null;
        renderFilesTable(allFiles);

    } catch (e) {
        alert(`Помилка: ${e.message}`);
        input.disabled = false;
        input.focus();
    }
}

// --- 8. Завантаження (Upload) ---
export async function uploadFile(inputData) {
    let files = [];
    if (inputData.tagName === 'INPUT') { files = Array.from(inputData.files); inputData.value = ''; } 
    else { files = Array.from(inputData); }
    if (files.length === 0) return;

    const progressContainer = document.getElementById('progress-container');
    if (progressContainer) progressContainer.classList.remove('hidden');

    for (let i = 0; i < files.length; i++) {
        await uploadSingleFile(files[i], i + 1, files.length);
    }

    const progressBar = document.getElementById('progress-bar');
    const progressTime = document.getElementById('progress-time');
    if (progressTime) progressTime.innerText = "Всі файли завантажено!";
    if (progressBar) progressBar.classList.add('bg-green-500');

    setTimeout(() => {
        if (progressContainer) progressContainer.classList.add('hidden');
        if (progressBar) progressBar.classList.remove('bg-green-500');
        loadFiles(currentFolderId); 
    }, 1500);
}

function uploadSingleFile(file, currentIndex, totalFiles) {
    return new Promise((resolve) => {
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
        
        if (currentFolderId) {
            formData.append('folder_id', currentFolderId);
        }

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
            if (xhr.status !== 200) alert(`Помилка завантаження файлу ${file.name}`);
            resolve();
        };
        xhr.onerror = function() { alert(`Помилка мережі при завантаженні ${file.name}`); resolve(); };
        xhr.open('POST', '/api/upload', true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.send(formData);
    });
}

// --- 9. Дії з файлами (ВИДАЛЕННЯ З ПЕРЕВІРКОЮ) ---
export async function deleteFile(id, type = 'file', force = false) {
    // Якщо force=false (перший клік), питаємо підтвердження
    if (!force && !confirm('Видалити цей елемент?')) return;

    try {
        // Додаємо ?force=true, якщо це повторний виклик після помилки 409
        const url = `/delete/${id}?type=${type}&force=${force}`;
        const res = await apiRequest(url, { method: 'DELETE' });

        if (res.status === 409) {
            // Сервер каже, що папка не пуста
            if (confirm("Ця папка містить файли або інші папки.\nВи впевнені, що хочете видалити її разом із вмістом?")) {
                // Викликаємо самі себе з force=true
                await deleteFile(id, type, true); 
            }
            return;
        }

        if (!res.ok) {
            throw new Error("Не вдалося видалити");
        }

        loadFiles(currentFolderId);
    } catch (e) {
        alert("Помилка видалення: " + e.message);
    }
}

export async function downloadFile(id, filename) {
    const res = await apiRequest(`/download/${id}`);
    if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 1000);
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
        if (contentType.startsWith('image/')) modalContent.innerHTML = `<img src="${url}" class="max-w-full max-h-full object-contain" alt="${filename}">`;
        else if (contentType === 'application/pdf') modalContent.innerHTML = `<iframe src="${url}" class="w-full h-full border-0 rounded"></iframe>`;
        else modalContent.innerHTML = `<p class="text-gray-400">Попередній перегляд недоступний.</p>`;
    } catch (e) { modalContent.innerHTML = `<div class="text-red-500">Помилка завантаження</div>`; }
}

export function closeModal() {
    const modal = document.getElementById('preview-modal');
    if (modal) modal.classList.add('hidden');
    document.getElementById('modal-content').innerHTML = '';
}

// --- 10. Масові дії ---
export function toggleFileSelection(id) {
    if (selectedFiles.has(id)) selectedFiles.delete(id);
    else selectedFiles.add(id);
    updateBulkActionsUI();
    renderFilesTable(allFiles); 
}

export function toggleSelectAll(checkbox) {
    if (checkbox.checked) allFiles.forEach(file => selectedFiles.add(file.id));
    else selectedFiles.clear();
    renderFilesTable(allFiles);
}

function updateBulkActionsUI() {
    const bulkActions = document.getElementById('bulk-actions');
    const selectedCountBadge = document.getElementById('selected-count-badge');
    if (!bulkActions) return;
    if (selectedFiles.size > 0) {
        bulkActions.classList.remove('hidden');
        if (selectedCountBadge) selectedCountBadge.innerText = selectedFiles.size;
    } else { bulkActions.classList.add('hidden'); }
}

export async function deleteSelectedFiles() {
    if (selectedFiles.size === 0) return;
    if (!confirm(`Видалити ${selectedFiles.size} елементів?`)) return;
    
    for (const id of selectedFiles) {
        const item = allFiles.find(f => f.id === id);
        if (item) {
            try { 
                await deleteFile(id, item.type, false); // Використовуємо нашу розумну функцію
            } catch (e) {}
        }
    }
    selectedFiles.clear();
    loadFiles(currentFolderId);
}

export async function downloadSelectedFiles() {
    if (selectedFiles.size === 0) return;
    
    const filesToDownload = allFiles.filter(f => selectedFiles.has(f.id) && f.type === 'file');
    
    for (const file of filesToDownload) {
        downloadFile(file.id, file.filename);
        await new Promise(r => setTimeout(r, 800)); 
    }
    
    selectedFiles.clear();
    renderFilesTable(allFiles); 
}

// --- 11. Пошук ---
export function handleSearch(query) {
    const resultsContainer = document.getElementById('search-results-dropdown');
    if (!resultsContainer) return;
    if (!query) { resultsContainer.classList.add('hidden'); renderFilesTable(allFiles); return; }

    const lowerQuery = query.toLowerCase();
    const filteredFiles = allFiles.filter(item => item.filename.toLowerCase().includes(lowerQuery));

    resultsContainer.innerHTML = '';
    if (filteredFiles.length > 0) {
        resultsContainer.classList.remove('hidden');
        filteredFiles.slice(0, 5).forEach(item => {
            const div = document.createElement('div');
            div.className = "px-4 py-2 hover:bg-gray-700 cursor-pointer flex items-center gap-2 text-gray-200 text-sm";
            const icon = item.type === 'folder' 
                ? `<svg class="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15ZM1.5 10.146V6a3 3 0 0 1 3-3h5.379a2.25 2.25 0 0 1 1.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 0 1 3 3v1.146A4.483 4.483 0 0 0 19.5 9h-15a4.483 4.483 0 0 0-3 1.146Z"/></svg>`
                : getFileIcon(item.content_type);
                
            div.innerHTML = `${icon} <span>${item.filename}</span>`;
            div.onclick = () => { 
                if (item.type === 'folder') loadFiles(item.id);
                else renderFilesTable([item]); 
                resultsContainer.classList.add('hidden'); 
            };
            resultsContainer.appendChild(div);
        });
    } else { resultsContainer.classList.add('hidden'); }
    renderFilesTable(filteredFiles);
}

// --- 12. Переміщення (Move) ---
export function startMove(id, type) {
    itemsToMove = { files: [], folders: [] };
    
    if (id) {
        if (type === 'folder') itemsToMove.folders.push(id);
        else itemsToMove.files.push(id);
    } else {
        if (selectedFiles.size === 0) return;
        selectedFiles.forEach(selId => {
            const item = allFiles.find(f => f.id === selId);
            if (item) {
                if (item.type === 'folder') itemsToMove.folders.push(selId);
                else itemsToMove.files.push(selId);
            }
        });
    }

    const modal = document.getElementById('move-modal');
    if (modal) modal.classList.remove('hidden');
    
    loadMoveFolders(null); 
}

// ЕКСПОРТУЄМО цю функцію, щоб main.js її бачив
export async function loadMoveFolders(folderId) {
    moveTargetId = folderId; 
    const listContainer = document.getElementById('move-list');
    const breadcrumbs = document.getElementById('move-breadcrumbs');
    
    if (listContainer) listContainer.innerHTML = '<div class="text-center text-gray-500 py-4">Завантаження...</div>';

    try {
        const url = folderId ? `/my-files?folder_id=${folderId}` : '/my-files';
        const res = await apiRequest(url);
        const data = await res.json();

        // Оновлюємо шлях у модалці (використовуємо path з бекенду)
        if (breadcrumbs && data.path) {
            breadcrumbs.innerHTML = data.path.map((item, index) => {
                const isLast = index === data.path.length - 1;
                if (isLast) {
                    return `<span class="text-blue-400 font-semibold flex items-center gap-1 select-none">
                                ${item.id === null ? '🏠' : '📁'} ${item.name}
                            </span>`;
                }
                return `<span onclick="window.loadMoveFolders(${item.id})" class="text-gray-400 hover:text-white cursor-pointer flex items-center gap-1 whitespace-nowrap">
                            ${item.id === null ? '🏠' : ''} ${item.name}
                        </span>
                        <span class="text-gray-600 mx-1">/</span>`;
            }).join('');
        } else if (breadcrumbs) {
            // Фолбек для старого бекенду
             if (!data.current_folder.id) {
                breadcrumbs.innerHTML = `<span class="font-bold text-blue-400">🏠 Головна</span>`;
            } else {
                breadcrumbs.innerHTML = `
                    <button onclick="window.loadMoveFolders(${data.current_folder.parent_id})" class="text-gray-400 hover:text-white mr-1">⬅ Назад</button>
                    <span class="text-gray-600">/</span>
                    <span class="text-blue-400 font-semibold ml-1 truncate">📁 ${data.current_folder.name}</span>
                `;
            }
        }

        if (listContainer) {
            listContainer.innerHTML = '';
            const foldersOnly = data.items.filter(i => i.type === 'folder');

            if (foldersOnly.length === 0) {
                listContainer.innerHTML = '<div class="text-center text-gray-500 py-8 italic">Папок немає</div>';
            } else {
                foldersOnly.forEach(folder => {
                    // Не показуємо папку, яку переміщаємо
                    if (itemsToMove.folders.includes(folder.id)) return;

                    const div = document.createElement('div');
                    div.className = "flex items-center gap-3 p-3 hover:bg-gray-700 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-gray-600";
                    div.onclick = () => loadMoveFolders(folder.id); 
                    div.innerHTML = `
                        <svg class="w-6 h-6 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15ZM1.5 10.146V6a3 3 0 0 1 3-3h5.379a2.25 2.25 0 0 1 1.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 0 1 3 3v1.146A4.483 4.483 0 0 0 19.5 9h-15a4.483 4.483 0 0 0-3 1.146Z"/></svg>
                        <span class="text-gray-200 font-medium truncate">${folder.filename}</span>
                    `;
                    listContainer.appendChild(div);
                });
            }
        }

    } catch (e) {
        console.error(e);
        if(listContainer) listContainer.innerHTML = '<div class="text-red-400 text-center">Помилка завантаження</div>';
    }
}

export async function submitMove() {
    const btn = document.querySelector('#move-modal button.bg-blue-600');
    if(btn) btn.innerText = "Переміщення...";
    
    try {
        const res = await apiRequest('/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_ids: itemsToMove.files,
                folder_ids: itemsToMove.folders,
                target_folder_id: moveTargetId
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Помилка");
        }

        document.getElementById('move-modal').classList.add('hidden');
        selectedFiles.clear(); 
        loadFiles(currentFolderId); 

    } catch (e) {
        alert("Помилка: " + e.message);
    } finally {
        if(btn) btn.innerText = "Перемістити сюди";
    }
}

// --- 13. Створення папки всередині модального вікна ---
export async function createFolderInModal() {
    const name = prompt("Назва нової папки:");
    if (!name) return;

    try {
        await apiRequest('/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: name,
                parent_id: moveTargetId 
            })
        });
        
        loadMoveFolders(moveTargetId);
    } catch (e) {
        alert("Не вдалося створити папку");
    }
}
