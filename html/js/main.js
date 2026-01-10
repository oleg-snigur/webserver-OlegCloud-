import { isLoggedIn, logout } from './api.js';
import { 
    loadFiles, uploadFile, deleteFile, downloadFile, viewFile, closeModal, handleSearch,
    toggleFileSelection, toggleSelectAll, deleteSelectedFiles, downloadSelectedFiles,
    handleSort, startRename, saveRename, cancelRename, handleContextMenu,
    startMove, submitMove, createFolder, createFolderInModal,
    toggleDropdown, // <--- ТЕПЕР ІМПОРТУЄМО З files.js
    resetInterfaceState // <--- ІМПОРТУЄМО ДЛЯ ГЛОБАЛЬНОГО КЛІКУ
} from './files.js';
import { renderUserAvatar, toggleSidebar } from './ui.js';
import { getCurrentUser } from './auth.js';
import { initStoragePage } from './charts.js';

// Експорт функцій у глобальну область
window.logout = logout;
window.toggleSidebar = toggleSidebar;
window.toggleDropdown = toggleDropdown; // <--- Використовуємо нашу нову, розумну функцію
window.closeModal = closeModal;

window.loadFiles = loadFiles;
window.uploadFile = uploadFile;
window.deleteFile = deleteFile;
window.downloadFile = downloadFile;
window.viewFile = viewFile;
window.createFolder = createFolder;
window.createFolderInModal = createFolderInModal;

window.handleSearch = handleSearch;
window.toggleFileSelection = toggleFileSelection;
window.toggleSelectAll = toggleSelectAll;
window.deleteSelectedFiles = deleteSelectedFiles;
window.downloadSelectedFiles = downloadSelectedFiles;

window.handleSort = handleSort;
window.startRename = startRename;
window.saveRename = saveRename;
window.cancelRename = cancelRename;
window.handleContextMenu = handleContextMenu;

window.startMove = startMove;
window.submitMove = submitMove;

// Глобальний слухач кліків для закриття меню
// Додаємо це, щоб клік по будь-якому місцю сторінки закривав меню
document.addEventListener('click', (e) => {
    // Якщо клік не по кнопці dropdown і не по самому dropdown
    if (!e.target.closest('.dropdown-container')) {
        resetInterfaceState();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    if (!isLoggedIn()) {
        window.location.href = '/login.html';
        return;
    }

    // initDropdownListeners(); // <-- ЦЕ МОЖНА ВИДАЛИТИ, ми тепер керуємо цим самі через resetInterfaceState
    
    const user = getCurrentUser();
    if (user && user.sub) renderUserAvatar(user.sub);

    const isDashboard = document.getElementById('files-table-body');
    const isStorage = document.getElementById('storageChartPage');

    if (isDashboard) {
        loadFiles();
        
        // Закриття пошуку
        document.addEventListener('click', (e) => {
            const searchContainer = document.querySelector('.search-container');
            const dropdown = document.getElementById('search-results-dropdown');
            if (searchContainer && dropdown && !searchContainer.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
        
        initDragAndDrop();
    } 
    
    if (isStorage) {
        initStoragePage();
    }
});

function initDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    let dragCounter = 0;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, (e) => {
            e.preventDefault(); e.stopPropagation();
        }, false);
    });

    document.body.addEventListener('dragenter', () => {
        dragCounter++;
        if (dropZone) dropZone.classList.remove('hidden');
    });

    document.body.addEventListener('dragleave', () => {
        dragCounter--;
        if (dragCounter === 0 && dropZone) dropZone.classList.add('hidden');
    });

    document.body.addEventListener('drop', (e) => {
        dragCounter = 0;
        if (dropZone) dropZone.classList.add('hidden');
        const dt = e.dataTransfer;
        if (dt.files && dt.files.length > 0) uploadFile(dt.files);
    });
}
