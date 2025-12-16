// js/files.js
import { apiRequest } from './api.js';
import { getFileIcon } from './ui.js';
import { initStoragePage } from './charts.js';

let allFiles = []; // Зберігаємо стан файлів локально для пошуку

// --- 1. Завантаження списку ---
export async function loadFiles() {
    try {
        const res = await apiRequest('/my-files');
        if (res && res.ok) {
            allFiles = await res.json();
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
        
        // HTML для імені файлу (з можливістю кліку)
        const nameHtml = isViewable 
            ? `<span onclick="window.viewFile(${file.id}, '${file.filename}', '${file.content_type}')" class="cursor-pointer text-gray-200 hover:text-blue-400 font-medium hover:underline flex gap-2 items-center">${getFileIcon(file.content_type)} ${file.filename}</span>`
            : `<span class="text-gray-200 font-medium flex gap-2 items-center">${getFileIcon(file.content_type)} ${file.filename}</span>`;

        // HTML для меню
        const menuHtml = `
            <div class="relative inline-block text-left dropdown-container">
                <button onclick="window.toggleDropdown(event, ${file.id})" class="p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-700 transition-colors">
                    <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" /></svg>
                </button>
                <div id="dropdown-${file.id}" class="hidden absolute right-0 w-48 bg-gray-800 rounded-md shadow-xl z-50 border border-gray-600">
                    <div class="py-1">
                        <button onclick="window.downloadFile(${file.id}, '${file.filename}')" class="flex w-full items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700">
                           <svg class="mr-3 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Скачати
                        </button>
                        ${isViewable ? `<button onclick="window.viewFile(${file.id}, '${file.filename}', '${file.content_type}')" class="flex w-full items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"><svg class="mr-3 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> Переглянути</button>` : ''}
                        <div class="border-t border-gray-700 my-1"></div>
                        <button onclick="window.deleteFile(${file.id})" class="flex w-full items-center px-4 py-2 text-sm text-red-400 hover:bg-gray-700">
                            <svg class="mr-3 h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> Видалити
                        </button>
                    </div>
                </div>
            </div>`;
        
        tbody.innerHTML += `
            <tr class="hover:bg-gray-750/50 border-b border-gray-700/50">
                <td class="px-6 py-4 whitespace-nowrap">${nameHtml}</td>
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

// --- 4. Завантаження (Upload) ---
export function uploadFile(input) {
    const file = input.files[0];
    if (!file) return;

    const token = localStorage.getItem('token'); // Беремо токен для XHR
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressPercent = document.getElementById('progress-percent');
    const progressTime = document.getElementById('progress-time');
    const progressFilename = document.getElementById('progress-filename');

    if (progressContainer) {
        progressContainer.classList.remove('hidden');
        progressFilename.innerText = file.name.length > 20 ? file.name.substring(0, 20) + '...' : file.name;
        progressBar.style.width = '0%';
        progressPercent.innerText = '0%';
    }

    const formData = new FormData();
    formData.append('file', file);
    const xhr = new XMLHttpRequest();
    const startTime = new Date().getTime();

    xhr.upload.onprogress = function(event) {
        if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            if (progressBar) progressBar.style.width = percentComplete + '%';
            if (progressPercent) progressPercent.innerText = Math.round(percentComplete) + '%';
            
            // Розрахунок часу
            const timeElapsed = (new Date().getTime() - startTime) / 1000;
            const uploadSpeed = event.loaded / timeElapsed; 
            const secondsRemaining = (event.total - event.loaded) / uploadSpeed;
            
            if (progressTime) progressTime.innerText = `Залишилось: ${secondsRemaining > 60 ? Math.floor(secondsRemaining / 60) + ' хв' : Math.round(secondsRemaining) + ' с'}`;
        }
    };

    xhr.onload = function() {
        if (xhr.status === 200) {
            if (progressPercent) progressPercent.innerText = "100%";
            if (progressTime) progressTime.innerText = "Готово!";
            if (progressBar) progressBar.classList.add('bg-green-500');
            setTimeout(() => {
                if (progressContainer) progressContainer.classList.add('hidden');
                if (progressBar) progressBar.classList.remove('bg-green-500');
                loadFiles(); // Перезавантажуємо список
            }, 1000);
        } else {
            alert('Помилка завантаження');
            if (progressContainer) progressContainer.classList.add('hidden');
        }
        input.value = '';
    };

    xhr.onerror = function() {
        alert('Помилка мережі');
        if (progressContainer) progressContainer.classList.add('hidden');
        input.value = '';
    };

    xhr.open('POST', '/api/upload', true);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.send(formData);
}

// --- 5. Дії (Delete, Download, View) ---
export async function deleteFile(id) {
    if(!confirm('Видалити?')) return;
    await apiRequest(`/delete/${id}`, { method: 'DELETE' });
    loadFiles();
}

export async function downloadFile(id, filename) {
    // Перевірка на вбудовані браузери
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