import Alpine from 'alpinejs';
import { warehouseStore } from './store/warehouseStore.js';
import '../css/main.css';

// Inisialisasi Store
Alpine.data('warehouseApp', warehouseStore);

// Jalankan Alpine
window.Alpine = Alpine;
Alpine.start();