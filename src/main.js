import './style.css';
import Alpine from 'alpinejs';
import { createIcons, icons } from 'lucide';
import warehouseApp from './components/warehouseApp.js';

// Setup Lucide Icons ke global window
window.lucide = {
  createIcons: () => createIcons({ icons })
};

// Inisialisasi Alpine
window.Alpine = Alpine;
Alpine.data('warehouseApp', warehouseApp);
Alpine.start();

document.addEventListener('DOMContentLoaded', () => {
  window.lucide.createIcons();
});