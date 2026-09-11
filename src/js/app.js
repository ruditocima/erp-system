import Alpine from 'alpinejs';
import { warehouseStore } from './store/warehouseStore.js';

// Inisialisasi Store
Alpine.data('warehouseApp', warehouseStore);

// Jalankan Alpine
window.Alpine = Alpine;
Alpine.start();