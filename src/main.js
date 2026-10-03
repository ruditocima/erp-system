import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.14.8/+esm';
import warehouseApp from './components/warehouseApp.js?v=2';

window.Alpine = Alpine;
Alpine.data('warehouseApp', warehouseApp);
Alpine.start();

// Perbaikan: Pastikan icon ter-render bahkan ketika Alpine menambahkan data dinamis
document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
        
        // Memantau perubahan DOM yang dilakukan oleh Alpine.js
        const observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            mutations.forEach(m => {
                if (m.addedNodes.length > 0) shouldUpdate = true;
            });
            if (shouldUpdate) lucide.createIcons();
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
    }
});
