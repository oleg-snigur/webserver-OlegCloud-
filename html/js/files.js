// js/files.js
import { apiRequest } from './api.js';
import { getFileIcon } from './ui.js';
import { initStoragePage } from './charts.js';

let allFiles = []; 
let selectedFiles = new Set(); 
let sortConfig = { key: 'created_at', direction: 'desc' };
let editingFileId = null; 

// --- 1. Завантаження списку ---
export async function loadFiles() {
    try {
        const res = await apiRequest('/my-files');
        if (res && res.ok) {
            allFiles = await res.json();
            selectedFiles.clear();
            applySorting(); 
            renderFilesTable(allFiles);
        }
    } catch (e) {
        console.error("Error loading files", e);
    }
}

// --- 2. Логіка Сортування ---
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

// --- 3. Рендеринг таблиці (Оновлено для Context Menu) ---
function renderFilesTable(files) {
    const tbody = document.getElementById('files-table-body');
    const emptyState = document.getElementById('empty-state');
    const tableContainer = document.getElementById('files-table-container');

    updateBulkActionsUI();

    // Глобальний слухач кліків, щоб закривати контекстне меню
    document.addEventListener('click', () => {
        const ctxMenu = document.getElementById('context-menu');
        if (ctxMenu) ctxMenu.classList.add('hidden');
    });

    // Запобігаємо стандартному меню при кліку на саме контекстне меню
    const ctxMenu = document.getElementById('context-menu');
    if (ctxMenu) ctxMenu.oncontextmenu = (e) => e.preventDefault();

    if (!tbody) return;
    tbody.innerHTML = '';

    if (!files || files.length === 0) {
        if(emptyState) emptyState.classList.remove('hidden');
        if(tableContainer) tableContainer.classList.add('hidden');
        return;
    }

    if(emptyState) emptyState.classList.add('hidden');
    if(tableContainer) tableContainer.classList.remove('hidden');

    const checkboxStyle = `appearance-none h-5 w-5 border border-gray-500 rounded-md bg-gray-800 checked:bg-blue-600 checked:border-blue-600 focus:ring-2 focus:ring-offset-gray-900 focus:ring-blue-500 transition-all cursor-pointer relative before:content-[''] before:block before:w-1.5 before:h-2.5 before:border-r-2 before:border-b-2 before:border-white before:absolute before:top-[2px] before:left-[6px] before:rotate-45 before:opacity-0 checked:before:opacity-100`;

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

    files.forEach(file => {
        const date = new Date(file.created_at).toLocaleString('uk-UA');
        const size = file.size.toFixed(2) + ' MB';
        const isViewable = file.content_type.startsWith('image/') || file.content_type === 'application/pdf';
        const isChecked = selectedFiles.has(file.id) ? 'checked' : '';
        const isEditing = (editingFileId === file.id);

        let nameHtml = '';
        if (isEditing) {
            nameHtml = `
            <div class="flex flex-col sm:flex-row gap-2 items-start sm:items-center w-full z-10 relative">
                <input type="text" id="rename-input-${file.id}" value="${file.filename}" 
                    class="bg-gray-700 text-white text-base rounded px-3 py-2 w-full sm:w-auto border border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                    onkeydown="if(event.key === 'Enter' || event.keyCode === 13) window.saveRename(${file.id})"
                >
                <div class="flex gap-2 mt-2 sm:mt-0">
                    <button type="button" onclick="event.stopPropagation(); window.saveRename(${file.id})" class="p-2 bg-green-600 hover:bg-green-500 text-white rounded-lg shadow-lg active:scale-95 transition-transform" title="Зберегти">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                    </button>
                    <button type="button" onclick="event.stopPropagation(); window.cancelRename()" class="p-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg shadow-lg active:scale-95 transition-transform" title="Скасувати">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>`;
        } else {
            nameHtml = isViewable 
            ? `<div class="flex items-center gap-3 w-full max-w-[150px] md:max-w-md lg:max-w-lg cursor-pointer group" onclick="window.viewFile(${file.id}, '${file.filename}', '${file.content_type}')">
                 <span class="text-gray-400 group-hover:text-blue-400 transition-colors">${getFileIcon(file.content_type)}</span>
                 <span class="text-gray-200 font-medium truncate group-hover:text-blue-400 group-hover:underline transition-colors" title="${file.filename}">${file.filename}</span>
               </div>`
            : `<div class="flex items-center gap-3 w-full max-w-[150px] md:max-w-md lg:max-w-lg">
                 <span class="text-gray-400">${getFileIcon(file.content_type)}</span>
                 <span class="text-gray-200 font-medium truncate" title="${file.filename}">${file.filename}</span>
               </div>`;
        }

        const menuHtml = `
            <div class="relative inline-block text-left dropdown-container">
                <button onclick="window.toggleDropdown(event, ${file.id})" class="p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-700 transition-colors">
                    <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" /></svg>
                </button>
                <div id="dropdown-${file.id}" class="hidden absolute right-0 w-48 bg-gray-800 rounded-md shadow-xl z-50 border border-gray-600">
                    <div class="py-1">
                        <button onclick="window.startRename(${file.id})" class="flex w-full items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700">Перейменувати</button>
                        <button onclick="window.downloadFile(${file.id}, '${file.filename}')" class="flex w-full items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700">Скачати</button>
                        <div class="border-t border-gray-700 my-1"></div>
                        <button onclick="window.deleteFile(${file.id})" class="flex w-full items-center px-4 py-2 text-sm text-red-400 hover:bg-gray-700">Видалити</button>
                    </div>
                </div>
            </div>`;
        
        // ДОДАНО: oncontextmenu в <tr>
        tbody.innerHTML += `
            <tr class="hover:bg-gray-800/50 border-b border-gray-700/50 transition-colors ${isChecked ? 'bg-blue-900/10' : ''}" 
                oncontextmenu="window.handleContextMenu(event, ${file.id}, '${file.content_type}', '${file.filename}')">
                <td class="px-4 py-4 whitespace-nowrap">
                    <input type="checkbox" onclick="event.stopPropagation(); window.toggleFileSelection(${file.id})" ${isChecked} class="${checkboxStyle}">
                </td>
                <td class="px-6 py-4">${nameHtml}</td>
                <td class="hidden md:table-cell px-6 py-4 text-sm text-gray-400 whitespace-nowrap">${date}</td>
                <td class="hidden md:table-cell px-6 py-4 text-sm text-gray-400 whitespace-nowrap">${size}</td>
                <td class="px-6 py-4 text-right whitespace-nowrap" onclick="event.stopPropagation()">${menuHtml}</td>
            </tr>`;
    });
}

// --- NEW: Обробка правого кліку ---
export function handleContextMenu(e, id, contentType, filename) {
    e.preventDefault(); // Забороняємо стандартне меню браузера

    const menu = document.getElementById('context-menu');
    const viewBtn = document.getElementById('ctx-view');
    const downloadBtn = document.getElementById('ctx-download');
    const renameBtn = document.getElementById('ctx-rename');
    const deleteBtn = document.getElementById('ctx-delete');

    if (!menu) return;

    // 1. Позиціонування (щоб не вилазило за екран)
    let x = e.pageX;
    let y = e.pageY;
    
    // Перевірка ширини/висоти вікна
    if (x + 230 > window.innerWidth) x = window.innerWidth - 230;
    
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.remove('hidden');

    // 2. Логіка кнопки "Перегляд"
    const isViewable = contentType.startsWith('image/') || contentType === 'application/pdf';
    
    if (isViewable) {
        viewBtn.classList.remove('hidden');
        viewBtn.classList.add('flex'); // Повертаємо display: flex
        viewBtn.onclick = () => {
            viewFile(id, filename, contentType);
            menu.classList.add('hidden');
        };
    } else {
        viewBtn.classList.add('hidden');
        viewBtn.classList.remove('flex');
    }

    // 3. Інші кнопки
    downloadBtn.onclick = () => { downloadFile(id, filename); menu.classList.add('hidden'); };
    renameBtn.onclick = () => { startRename(id); menu.classList.add('hidden'); };
    deleteBtn.onclick = () => { deleteFile(id); menu.classList.add('hidden'); };
}

// --- Інші функції залишаються без змін ---

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

    const file = allFiles.find(f => f.id === id);
    if (!file) return;

    input.disabled = true;

    try {
        const res = await apiRequest(`/files/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: newName })
        });

        if (!res.ok) {
            let errorText = "Server Error";
            try {
                const errJson = await res.json();
                errorText = errJson.detail || JSON.stringify(errJson);
            } catch(jsonErr) {
                errorText = `Status: ${res.status}`;
            }
            throw new Error(errorText);
        }

        const data = await res.json();
        file.filename = data.filename;
        editingFileId = null;
        renderFilesTable(allFiles);

    } catch (e) {
        alert(`Помилка: ${e.message}`);
        input.disabled = false;
        input.focus();
    }
}

export function handleSearch(query) {
    const resultsContainer = document.getElementById('search-results-dropdown');
    if (!resultsContainer) return;
    if (!query) { resultsContainer.classList.add('hidden'); renderFilesTable(allFiles); return; }

    const lowerQuery = query.toLowerCase();
    const filteredFiles = allFiles.filter(file => file.filename.toLowerCase().includes(lowerQuery));

    resultsContainer.innerHTML = '';
    if (filteredFiles.length > 0) {
        resultsContainer.classList.remove('hidden');
        filteredFiles.slice(0, 5).forEach(file => {
            const div = document.createElement('div');
            div.className = "px-4 py-2 hover:bg-gray-700 cursor-pointer flex items-center gap-2 text-gray-200 text-sm";
            div.innerHTML = `${getFileIcon(file.content_type)} <span>${file.filename}</span>`;
            div.onclick = () => { renderFilesTable([file]); resultsContainer.classList.add('hidden'); };
            resultsContainer.appendChild(div);
        });
    } else { resultsContainer.classList.add('hidden'); }
    renderFilesTable(filteredFiles);
}

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
        loadFiles();
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

export async function deleteFile(id) {
    if(!confirm('Видалити?')) return;
    await apiRequest(`/delete/${id}`, { method: 'DELETE' });
    loadFiles();
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
    if (!confirm(`Видалити ${selectedFiles.size} файлів?`)) return;
    for (const id of selectedFiles) {
        try { await apiRequest(`/delete/${id}`, { method: 'DELETE' }); } catch (e) {}
    }
    selectedFiles.clear();
    loadFiles();
}

export async function downloadSelectedFiles() {
    if (selectedFiles.size === 0) return;
    const filesToDownload = allFiles.filter(f => selectedFiles.has(f.id));
    for (const file of filesToDownload) {
        downloadFile(file.id, file.filename);
        await new Promise(r => setTimeout(r, 800)); 
    }
    selectedFiles.clear();
    renderFilesTable(allFiles); 
}
