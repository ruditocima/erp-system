import { db } from './core/db.js';
import { generateDocNumber, exportTableToCSV, loadLocal, saveLocal } from './core/utils.js';
import { IDLE_TIMEOUT, IDLE_COUNTDOWN } from './core/config.js';

export function createWmsApp() {
    return {
        // === CORE STATE ===
        isLoggedIn: false,
        username: '',
        role: 'Requester',
        activeTab: 'dashboard',
        tabs: [
            { id: 'dashboard', name: 'Dashboard', icon: 'layout-dashboard' },
            { id: 'master_barang', name: 'Master Barang', icon: 'package' },
            { id: 'master_gudang', name: 'Master Gudang', icon: 'warehouse' },
            { id: 'master_project', name: 'Master Project', icon: 'briefcase' },
            { id: 'input_transaksi', name: 'Input Transaksi', icon: 'file-plus' },
            { id: 'approval_transaksi', name: 'Approval Transaksi', icon: 'check-square' },
            { id: 'stok_gudang', name: 'Stok Gudang', icon: 'layers' },
            { id: 'stok_project', name: 'Material Usage', icon: 'bar-chart-2' },
            { id: 'data_transaksi', name: 'Data Transaksi', icon: 'database' },
            { id: 'stock_opname', name: 'Stock Opname', icon: 'clipboard-check' },
            { id: 'backup_restore', name: 'Backup & Restore', icon: 'save' },
            { id: 'supabase_setup', name: 'Setup Supabase', icon: 'server' }
        ],
        toasts: [],
        toastId: 0,

        // === DATA ===
        barangList: [],
        gudangList: [],
        projectList: [],
        transactionList: [],
        stokGudangList: [],
        opnameHistory: [],

        // === IDLE TIMER ===
        idleWarning: false,
        idleCountdown: 300,
        idleTimer: null,
        idleCountdownTimer: null,

        // === MODAL STATE ===
        isModalOpen: false,
        modalType: '',
        modalTitle: '',
        isEditMode: false,
        isEditGudangMode: false,
        isEditProjectMode: false,
        modalBarang: { kode: '', nama: '', kategori: '', jenis: '', satuan: '', stokMin: 0 },
        modalGudang: { kode: '', nama: '', tipe: 'Perusahaan Sendiri', lokasi: '', pic: '' },
        modalProject: { kodeProject: '', periode: '', type: '', region: '', noPrPo: '', poPlan: '', poFinal: '', statusPo: 'Approved', permit: '', statusSnd: '', statusProject: '', statusDoc: '' },
        modalTransaction: { noDocument: '', keterangan: '', diketahui: '' },

        // === CONFIRM MODAL ===
        confirmModal: { show: false, title: '', message: '', type: 'warning', confirmText: 'Ya', onConfirm: () => {}, onCancel: () => {} },

        // === PRINT ===
        printableTrx: { noDocument: '', tanggal: '', noTodo: '', tipe: '', gudangAsal: '', gudangTujuan: '', kodeProject: '', petugas: '', diketahui: '', keterangan: '', items: [] },

        // === BACKUP/RESTORE ===
        importDataTemp: null,
        importPreview: '',

        // === INIT ===
        async init() {
            let localUser = localStorage.getItem('wms_user');
            let localRole = localStorage.getItem('wms_role');
            if (localUser && localRole) {
                this.username = localUser;
                this.role = localRole;
                this.isLoggedIn = true;
                await this.loadAllData();
                this.startIdleTimer();
            }
            ['mousedown','keydown','touchstart','scroll'].forEach(evt => {
                document.addEventListener(evt, () => this.resetIdleTimer());
            });
            this.$watch('activeTab', value => {
                this.$nextTick(() => {
                    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
                });
            });
            window.addEventListener('beforeunload', (e) => {
                if (this.printableTrx.items.length > 0) { e.preventDefault(); e.returnValue = ''; }
            });
        },

        async loadAllData() {
            const data = await db.loadAll();
            this.barangList = data.barangList || [];
            this.gudangList = data.gudangList || [];
            this.projectList = data.projectList || [];
            this.transactionList = data.transactionList || [];
            this.stokGudangList = data.stokList || [];
            this.opnameHistory = data.opnameList || [];
        },

        startIdleTimer() {
            clearTimeout(this.idleTimer);
            this.idleTimer = setTimeout(() => {
                this.idleWarning = true;
                this.idleCountdown = IDLE_COUNTDOWN;
                this.idleCountdownTimer = setInterval(() => {
                    this.idleCountdown--;
                    if (this.idleCountdown <= 0) { clearInterval(this.idleCountdownTimer); this.logout(); }
                }, 1000);
            }, IDLE_TIMEOUT);
        },
        resetIdleTimer() {
            if (this.idleWarning) { this.idleWarning = false; clearInterval(this.idleCountdownTimer); }
            this.startIdleTimer();
        },

        login() {
            if (this.username.trim() === '') return;
            localStorage.setItem('wms_user', this.username);
            localStorage.setItem('wms_role', this.role);
            this.isLoggedIn = true;
            this.loadAllData();
            this.startIdleTimer();
            this.showToast('Login berhasil', 'success');
            this.activeTab = 'dashboard';
            this.$nextTick(() => { if (window.lucide && window.lucide.createIcons) window.lucide.createIcons(); });
        },
        logout() {
            localStorage.removeItem('wms_user');
            localStorage.removeItem('wms_role');
            this.isLoggedIn = false;
            this.idleWarning = false;
            clearTimeout(this.idleTimer);
            clearInterval(this.idleCountdownTimer);
            location.reload();
        },

        showToast(message, type = 'info') {
            const id = this.toastId++;
            this.toasts.push({ id, message, type });
            setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id); }, 3000);
        },

        confirm(title, message, onConfirm, options = {}) {
            this.confirmModal = { show: true, title, message, type: options.type || 'warning', confirmText: options.confirmText || 'Ya', onConfirm: () => { if (onConfirm) onConfirm(); }, onCancel: () => { if (options.onCancel) options.onCancel(); } };
        },
        confirmDelete(type, id) {
            let names = { barang: 'Barang', gudang: 'Gudang', project: 'Project', transaction: 'Transaksi', opname: 'Riwayat Opname' };
            this.confirm(`Hapus ${names[type]}?`, `Data ${names[type]} dengan ID "${id}" akan dihapus permanen.`, () => {
                if (type === 'barang') this.deleteBarang(id);
                else if (type === 'gudang') this.deleteGudang(id);
                else if (type === 'project') this.deleteProject(id);
                else if (type === 'transaction') this.deleteTransaction(id);
                else if (type === 'opname') this.deleteOpname(id);
            }, { type: 'danger', confirmText: 'Hapus' });
        },

        switchTab(tabId) {
            this.activeTab = tabId;
            this.$nextTick(() => { if (window.lucide && window.lucide.createIcons) window.lucide.createIcons(); });
        },

        openModal(type) {
            this.modalType = type; this.isModalOpen = true;
            if (type === 'barang') { this.isEditMode = false; this.modalTitle = 'Tambah Master Barang Baru'; this.modalBarang = { kode: '', nama: '', kategori: '', jenis: '', satuan: '', stokMin: 0 }; }
            else if (type === 'gudang') { this.isEditGudangMode = false; this.modalTitle = 'Tambah Master Gudang Baru'; this.modalGudang = { kode: '', nama: '', tipe: 'Perusahaan Sendiri', lokasi: '', pic: '' }; }
            else if (type === 'project') { this.isEditProjectMode = false; this.modalTitle = 'Tambah Master Project Baru'; this.modalProject = { kodeProject: '', periode: '', type: '', region: '', noPrPo: '', poPlan: '', poFinal: '', statusPo: 'Approved', permit: '', statusSnd: '', statusProject: '', statusDoc: '' }; }
        },
        closeModal() { this.isModalOpen = false; },

        saveBarang() {
            if (this.isEditMode) {
                const idx = this.barangList.findIndex(b => b.kode === this.modalBarang.kode);
                if (idx !== -1) { this.barangList[idx] = { ...this.modalBarang }; db.set('barang', this.barangList); this.showToast('Barang berhasil diupdate', 'success'); }
            } else {
                if (this.barangList.find(b => b.kode === this.modalBarang.kode)) { this.showToast('Kode Barang sudah ada!', 'error'); return; }
                this.barangList.unshift({ ...this.modalBarang }); db.set('barang', this.barangList); this.showToast('Barang baru ditambahkan', 'success');
            }
            this.closeModal();
        },
        deleteBarang(kode) { this.barangList = this.barangList.filter(b => b.kode !== kode); db.set('barang', this.barangList); this.showToast('Barang dihapus', 'success'); },

        saveGudang() {
            if (this.isEditGudangMode) {
                const idx = this.gudangList.findIndex(g => g.kode === this.modalGudang.kode);
                if (idx !== -1) { this.gudangList[idx] = { ...this.modalGudang }; db.set('gudang', this.gudangList); this.showToast('Gudang berhasil diupdate', 'success'); }
            } else {
                if (this.gudangList.find(g => g.kode === this.modalGudang.kode)) { this.showToast('Kode Gudang sudah ada!', 'error'); return; }
                this.gudangList.unshift({ ...this.modalGudang }); db.set('gudang', this.gudangList); this.showToast('Gudang baru ditambahkan', 'success');
            }
            this.closeModal();
        },
        deleteGudang(kode) { this.gudangList = this.gudangList.filter(g => g.kode !== kode); db.set('gudang', this.gudangList); this.showToast('Gudang dihapus', 'success'); },

        saveProject() {
            if (this.isEditProjectMode) {
                const idx = this.projectList.findIndex(p => p.kodeProject === this.modalProject.kodeProject);
                if (idx !== -1) { this.projectList[idx] = { ...this.modalProject }; db.set('project', this.projectList); this.showToast('Project berhasil diupdate', 'success'); }
            } else {
                if (this.projectList.find(p => p.kodeProject === this.modalProject.kodeProject)) { this.showToast('Kode Project sudah ada!', 'error'); return; }
                this.projectList.unshift({ ...this.modalProject }); db.set('project', this.projectList); this.showToast('Project baru ditambahkan', 'success');
            }
            this.closeModal();
        },
        deleteProject(kode) { this.projectList = this.projectList.filter(p => p.kodeProject !== kode); db.set('project', this.projectList); this.showToast('Project dihapus', 'success'); },

        editTransaction(trx) {
            this.modalTransaction = { noDocument: trx.noDocument, keterangan: trx.keterangan || '', diketahui: trx.diketahui || '' };
            this.modalTitle = 'Edit Detail Transaksi'; this.modalType = 'transaction'; this.isModalOpen = true;
        },
        saveTransaction() {
            const idx = this.transactionList.findIndex(t => t.noDocument === this.modalTransaction.noDocument);
            if (idx !== -1) { this.transactionList[idx].keterangan = this.modalTransaction.keterangan; this.transactionList[idx].diketahui = this.modalTransaction.diketahui; db.set('transaction', this.transactionList); this.showToast('Detail Transaksi diupdate', 'success'); }
            this.closeModal();
        },
        deleteTransaction(noDoc) {
            if (this.role !== 'Admin') { this.showToast('Hanya Admin yang dapat menghapus transaksi', 'error'); return; }
            this.transactionList = this.transactionList.filter(t => t.noDocument !== noDoc); db.set('transaction', this.transactionList); this.showToast('Riwayat transaksi dihapus', 'success');
        },

        getStokSaatIni(namaGudang, kodeBarang) {
            if (namaGudang === '-') return Infinity;
            let stok = this.stokGudangList.find(s => s.gudang === namaGudang && s.kodeBarang === kodeBarang);
            return stok ? stok.qty : 0;
        },
        approveTransaction(trx) {
            if (this.role === 'Requester') { this.showToast('Hanya Approver/Admin yang dapat melakukan persetujuan', 'error'); return; }
            if (!Array.isArray(trx.items)) { this.showToast('Data transaksi tidak valid', 'error'); return; }
            if (trx.tipe !== 'Masuk') {
                for (let item of trx.items) {
                    if (!item) continue;
                    let stokTersedia = this.getStokSaatIni(trx.gudangAsal, item.kode);
                    if (stokTersedia < item.qty) { this.showToast(`Stok tidak mencukupi untuk ${item.nama || item.kode}! Tersedia: ${stokTersedia}, Diminta: ${item.qty}`, 'error'); return; }
                }
            }
            const idx = this.transactionList.findIndex(t => t.noDocument === trx.noDocument);
            if (idx !== -1) {
                this.transactionList[idx].status = 'Approved'; this.transactionList[idx].disetujui = this.username;
                for (let item of trx.items) {
                    if (!item) continue;
                    if (trx.tipe === 'Masuk' && trx.gudangTujuan !== '-') this.upsertStok(trx.gudangTujuan, item.kode, item.nama, item.qty, trx.tipe, false);
                    if (trx.tipe === 'Keluar' && trx.gudangAsal !== '-') this.upsertStok(trx.gudangAsal, item.kode, item.nama, -item.qty, trx.tipe, true);
                    if (trx.tipe === 'Transfer') {
                        if (trx.gudangTujuan !== '-') this.upsertStok(trx.gudangTujuan, item.kode, item.nama, item.qty, trx.tipe, false);
                        if (trx.gudangAsal !== '-') this.upsertStok(trx.gudangAsal, item.kode, item.nama, -item.qty, trx.tipe, true);
                    }
                }
                db.set('transaction', this.transactionList); this.showToast('Transaksi Disetujui! Stok terupdate.', 'success');
            }
        },
        rejectTransaction(trx) {
            if (this.role === 'Requester') return;
            const reason = prompt('Alasan penolakan?');
            if (reason !== null) {
                const idx = this.transactionList.findIndex(t => t.noDocument === trx.noDocument);
                if (idx !== -1) { this.transactionList[idx].status = 'Rejected'; this.transactionList[idx].disetujui = this.username; this.transactionList[idx].keterangan += ` [Ditolak: ${reason}]`; db.set('transaction', this.transactionList); this.showToast('Transaksi Ditolak', 'info'); }
            }
        },
        upsertStok(namaGudang, kodeBarang, namaBarang, qtyChange, tipeTransaksi, isSource) {
            let fieldToIncrement = ''; let absQty = Math.abs(qtyChange);
            if (tipeTransaksi === 'Masuk') fieldToIncrement = 'masuk';
            else if (tipeTransaksi === 'Keluar') fieldToIncrement = 'keluar';
            else if (tipeTransaksi === 'Transfer' && isSource) fieldToIncrement = 't_keluar';
            else if (tipeTransaksi === 'Transfer' && !isSource) fieldToIncrement = 't_masuk';
            let existing = this.stokGudangList.find(s => s.gudang === namaGudang && s.kodeBarang === kodeBarang);
            if (existing) { existing.qty += qtyChange; if (fieldToIncrement) existing[fieldToIncrement] = (existing[fieldToIncrement] || 0) + absQty; }
            else { let newItem = { gudang: namaGudang, kodeBarang, namaBarang, qty: qtyChange, masuk: 0, keluar: 0, t_masuk: 0, t_keluar: 0 }; if (fieldToIncrement) newItem[fieldToIncrement] = absQty; this.stokGudangList.push(newItem); }
            db.set('stok', this.stokGudangList);
        },

        exportToExcel(tableId, filename) { exportTableToCSV(tableId, filename); this.showToast('Export CSV berhasil', 'success'); },
        exportDatabase() {
            const payload = { version: '2.0', exportedAt: new Date().toISOString(), exportedBy: this.username, data: { wms_barang: this.barangList, wms_gudang: this.gudangList, wms_project: this.projectList, wms_transaction: this.transactionList, wms_stok_gudang: this.stokGudangList, wms_opname_history: this.opnameHistory } };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `WMS_Backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); this.showToast('Backup berhasil di-download', 'success');
        },
        handleImportFile(event) {
            const file = event.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const payload = JSON.parse(e.target.result);
                    if (!payload.data || !payload.version) { this.showToast('File JSON tidak valid!', 'error'); return; }
                    this.importDataTemp = payload;
                    const counts = [];
                    if (payload.data.wms_barang) counts.push(`${payload.data.wms_barang.length} barang`);
                    if (payload.data.wms_gudang) counts.push(`${payload.data.wms_gudang.length} gudang`);
                    if (payload.data.wms_project) counts.push(`${payload.data.wms_project.length} project`);
                    if (payload.data.wms_transaction) counts.push(`${payload.data.wms_transaction.length} transaksi`);
                    if (payload.data.wms_stok_gudang) counts.push(`${payload.data.wms_stok_gudang.length} stok`);
                    if (payload.data.wms_opname_history) counts.push(`${payload.data.wms_opname_history.length} opname`);
                    this.importPreview = `File valid. Berisi: ${counts.join(', ')}. Export oleh ${payload.exportedBy || 'unknown'}.`;
                    this.showToast('File siap di-import. Tekan tombol Konfirmasi.', 'success');
                } catch (err) { this.showToast('Gagal membaca file: ' + err.message, 'error'); }
            }; reader.readAsText(file);
        },
        confirmImport() {
            if (!this.importDataTemp) return;
            this.confirm('Konfirmasi Import Data', 'Semua data saat ini akan DITIMPA oleh data dari file backup.', () => {
                const d = this.importDataTemp.data;
                if (d.wms_barang) { this.barangList = d.wms_barang; db.set('barang', d.wms_barang); }
                if (d.wms_gudang) { this.gudangList = d.wms_gudang; db.set('gudang', d.wms_gudang); }
                if (d.wms_project) { this.projectList = d.wms_project; db.set('project', d.wms_project); }
                if (d.wms_transaction) { this.transactionList = d.wms_transaction; db.set('transaction', d.wms_transaction); }
                if (d.wms_stok_gudang) { this.stokGudangList = d.wms_stok_gudang; db.set('stok', d.wms_stok_gudang); }
                if (d.wms_opname_history) { this.opnameHistory = d.wms_opname_history; db.set('opname', d.wms_opname_history); }
                this.importDataTemp = null; this.importPreview = '';
                document.getElementById('importFileInput').value = '';
                this.showToast('Import data berhasil!', 'success');
            }, { type: 'danger', confirmText: 'Timpa Data' });
        },

        deleteOpname(id) { this.opnameHistory = this.opnameHistory.filter(o => o.id !== id); db.set('opname', this.opnameHistory); this.showToast('Riwayat opname dihapus', 'success'); },

        get pendingCount() { return this.transactionList.filter(t => t.status === 'Pending').length; },
        get totalStokGlobal() { return this.stokGudangList.reduce((sum, s) => sum + (s.qty || 0), 0); },
        get stokMenipisList() {
            let result = [];
            this.stokGudangList.forEach(stok => {
                let barang = this.barangList.find(b => b.kode === stok.kodeBarang);
                let stokMin = barang ? (barang.stokMin || 0) : 0;
                if (stokMin > 0 && stok.qty < stokMin) result.push({ ...stok, stokMin });
            });
            return result;
        },
        getStokStatusClass(stok) {
            if (!stok || typeof stok !== 'object') return 'bg-slate-100 text-slate-700 border border-slate-200';
            let barang = this.barangList.find(b => b.kode === stok.kodeBarang);
            let stokMin = barang ? (barang.stokMin || 0) : 0;
            if ((stok.qty || 0) <= 0) return 'bg-red-100 text-red-700 border border-red-200';
            if (stokMin > 0 && (stok.qty || 0) < stokMin) return 'bg-amber-100 text-amber-700 border border-amber-200';
            return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
        },
        getStokStatusText(stok) {
            if (!stok || typeof stok !== 'object') return '-';
            let barang = this.barangList.find(b => b.kode === stok.kodeBarang);
            let stokMin = barang ? (barang.stokMin || 0) : 0;
            if ((stok.qty || 0) <= 0) return 'HABIS';
            if (stokMin > 0 && (stok.qty || 0) < stokMin) return 'MENIPIS';
            return 'AMAN';
        },
    };
}
