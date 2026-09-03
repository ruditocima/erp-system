import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/module.esm.js';

import { createWmsApp } from './app.js';
import { dashboardTab } from './tabs/dashboard.js';
import { masterBarangTab } from './tabs/masterBarang.js';
import { masterGudangTab } from './tabs/masterGudang.js';
import { masterProjectTab } from './tabs/masterProject.js';
import { transaksiInputTab } from './tabs/transaksiInput.js';
import { transaksiApprovalTab } from './tabs/transaksiApproval.js';
import { dataTransaksiTab } from './tabs/dataTransaksi.js';
import { stokGudangTab } from './tabs/stokGudang.js';
import { materialUsageTab } from './tabs/materialUsage.js';
import { stockOpnameTab } from './tabs/stockOpname.js';
import { backupRestoreTab } from './tabs/backupRestore.js';

// Register all Alpine data components BEFORE starting
document.addEventListener('alpine:init', () => {
    Alpine.data('wmsApp', createWmsApp);
    Alpine.data('dashboardTab', dashboardTab);
    Alpine.data('masterBarangTab', masterBarangTab);
    Alpine.data('masterGudangTab', masterGudangTab);
    Alpine.data('masterProjectTab', masterProjectTab);
    Alpine.data('transaksiInputTab', transaksiInputTab);
    Alpine.data('transaksiApprovalTab', transaksiApprovalTab);
    Alpine.data('dataTransaksiTab', dataTransaksiTab);
    Alpine.data('stokGudangTab', stokGudangTab);
    Alpine.data('materialUsageTab', materialUsageTab);
    Alpine.data('stockOpnameTab', stockOpnameTab);
    Alpine.data('backupRestoreTab', backupRestoreTab);
});

// Expose Alpine globally for debugging
window.Alpine = Alpine;

// Manually start Alpine after all imports and registrations are done
Alpine.start();

// Initialize Lucide icons after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
});
