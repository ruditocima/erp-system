import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.14.8/+esm';
import warehouseApp from './components/warehouseApp.js';

window.Alpine = Alpine;
Alpine.data('warehouseApp', warehouseApp);
Alpine.start();

document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});