// js/ui.js

// --- 1. Допоміжні UI функції ---
export function stringToColorClass(str) {
    const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-green-600', 'bg-blue-600', 'bg-indigo-500', 'bg-purple-600'];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash += str.charCodeAt(i);
    return colors[hash % colors.length];
}

export function getFileIcon(type) { 
    if (type.includes('pdf')) return `<svg class="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd" /></svg>`; 
    if (type.includes('image')) return `<svg class="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd" /></svg>`; 
    return `<svg class="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" /></svg>`; 
}

export function renderUserAvatar(username) {
    const avatarEl = document.getElementById('user-avatar');
    const emailDisplay = document.getElementById('user-email-display');
    
    if (avatarEl && username) {
        avatarEl.innerText = username.charAt(0).toUpperCase();
        avatarEl.className = `h-8 w-8 rounded-full flex items-center justify-center text-white font-bold transition-colors ${stringToColorClass(username)}`;
        emailDisplay.innerText = username;
    }
}

export function toggleSidebar() {
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

// --- 2. Логіка випадаючих меню (Dropdowns) ---
let openDropdownId = null;

export function toggleDropdown(event, id) {
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

        // Розрахунок позиції, щоб меню не вилізло за екран
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

// Закриття меню при кліку будь-де
export function initDropdownListeners() {
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
}