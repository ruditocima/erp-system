import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/module.esm.js?v=2';

import { createWmsApp } from './app.js?v=2';
import { dashboardTab } from './tabs/dashboard.js?v=2';
import { masterBarangTab } from './tabs/masterBarang.js?v=2';
import { masterGudangTab } from './tabs/masterGudang.js?v=2';
import { masterProjectTab } from './tabs/masterProject.js?v=2';
import { transaksiInputTab } from './tabs/transaksiInput.js?v=2';
import { transaksiApprovalTab } from './tabs/transaksiApproval.js?v=2';
import { dataTransaksiTab } from './tabs/dataTransaksi.js?v=2';
import { stokGudangTab } from './tabs/stokGudang.js?v=2';
import { materialUsageTab } from './tabs/materialUsage.js?v=2';
import { stockOpnameTab } from './tabs/stockOpname.js?v=2';
import { backupRestoreTab } from './tabs/backupRestore.js?v=2';

document.addEventListener('alpine:init', () => {
    // Daftarkan wmsApp sebagai Alpine Store global
    const wmsStore = createWmsApp();
    Alpine.store('wms', wmsStore);

    Alpine.data('wmsApp', () => Alpine.store('wms'));
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

window.Alpine = Alpine;
Alpine.start();

document.addEventListener('DOMContentLoaded', () => {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
});
