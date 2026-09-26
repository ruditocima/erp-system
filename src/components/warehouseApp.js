import { supabaseClient } from '../services/supabaseClient.js';

function safeLoadStorage(key, fallback) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : fallback;
    } catch (e) {
        console.warn(`Peringatan: Gagal memuat data lokal dari key "${key}":`, e);
        return fallback;
    }
}

export default function warehouseApp() {
    return {
        // Properti URL Web App Google Apps Script
        googleScriptUrl: 'https://script.google.com/macros/s/AKfycbxGfGRF55_aYHdG9kMMLgGqV7_ksL5VZGtb6JLRpXBn9nTaMKYUlVrk6s587cTNYC7_/exec',

        isLoggedIn: localStorage.getItem('vortex_logged_in') === 'true',
        currentUser: localStorage.getItem('vortex_user') || 'Admin',
        currentRole: localStorage.getItem('vortex_role') || 'Super Admin',
        currentTab: 'dashboard',
        loginForm: { email: '', password: '' },
        profileForm: { namaLengkap: '', email: '', newPassword: '' },

        showModal: false, modalType: '', modalForm: {}, isEdit: false, editIndex: null,
        isLoading: false, notification: { show: false, message: '', type: 'error' },
        filterStokGudang: '', filterRegionUsage: '', searchNoTransaksi: '', searchNoReferensi: '', searchMaterialUsageProject: '', editingOriginalNo: null,
        showDrumLedger: false, selectedCableKode: '',

        selectedFilesList: [],

        pageStok: 1, pageSizeStok: 10, totalStokCount: 0,
        pageDrum: 1, pageSizeDrum: 10, totalDrumCount: 0,
        pageUsage: 1, pageSizeUsage: 10, totalUsageCount: 0,
        pageTx: 1, pageSizeTx: 10, totalTxCount: 0,
        _reloadTimer: null,
        _draftTimer: null,

        masterBarang: safeLoadStorage('vortex_masterBarang', [
            { kategori: 'Cable', jenis: 'ADSS', kodeBarang: 'CBL-ADSS-036', namaBarang: 'Kabel ADSS-036 36Core', sat: 'Meter' }
        ]),
        masterGudang: safeLoadStorage('vortex_masterGudang', [
            { region: 'Jakarta', kodeGudang: 'NPM-JKT-01', namaGudang: 'Gudang Utama Jakarta', tipeKepemilikan: 'Milik Sendiri', lokasi: 'Cakung' }
        ]),
        masterProject: safeLoadStorage('vortex_masterProject', []),
        stokGudang: safeLoadStorage('vortex_stokGudang', []),
        drumLedger: safeLoadStorage('vortex_drumLedger', []),
        materialUsage: safeLoadStorage('vortex_materialUsage', []),
        transactions: safeLoadStorage('vortex_transactions', []),
        newTrans: { tanggal: '', noTransaksi: '', noReferensi: '', tipeTransaksi: 'Masuk', gudangAsal: '', gudangTujuan: '', kodeProject: '', keterangan: '', lampiran: '', lampiranUrl: '', staffGudang: '', projectManager: '', namaPenerima: '', items: [] },
        activeBast: {},

        get isSuperAdmin() {
            return !this.currentRole || this.currentRole.toLowerCase().includes('super') || this.currentRole.toLowerCase() === 'admin';
        },
        userRegion() {
            return localStorage.getItem('vortex_region') || (this.isSuperAdmin ? 'Semua Region' : 'Aceh');
        },
        getFilteredMasterGudang() {
            if (this.isSuperAdmin) return this.masterGudang;
            const reg = this.userRegion().toLowerCase();
            return this.masterGudang.filter(g => (g.region || '').toLowerCase() === reg);
        },
        getFilteredMasterProject() {
            if (this.isSuperAdmin) return this.masterProject;
            const reg = this.userRegion().toLowerCase();
            return this.masterProject.filter(p => (p.region || '').toLowerCase() === reg);
        },

        todayWIB() {
            return new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0];
        },

        scheduleReload() {
            if (this._reloadTimer) clearTimeout(this._reloadTimer);
            this._reloadTimer = setTimeout(() => { this.loadDataFromSupabase(); }, 1200);
        },

        saveFormDraft(formData) {
            if (this._draftTimer) clearTimeout(this._draftTimer);
            this._draftTimer = setTimeout(() => {
                try {
                    if (formData) {
                        localStorage.setItem('vortex_draft_transaksi', JSON.stringify(formData));
                    }
                } catch (e) { 
                    console.warn('Peringatan: Gagal menyimpan draf transaksi:', e); 
                }
            }, 500);
        },

        loadFormDraft() {
            try {
                const savedDraft = localStorage.getItem('vortex_draft_transaksi');
                if (savedDraft) {
                    const parsed = JSON.parse(savedDraft);
                    if (parsed && typeof parsed === 'object' && (parsed.noReferensi || parsed.keterangan || (parsed.items && parsed.items.some(i => i.kodeBarang || i.qty)))) {
                        this.newTrans = parsed;
                        return true;
                    }
                }
            } catch (e) {}
            return false;
        },

        clearFormDraft() {
            try { localStorage.removeItem('vortex_draft_transaksi'); } catch (e) { }
        },

        async validateSession() {
            if (!supabaseClient) return;
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (this.isLoggedIn && !session) { this.logout(); return; }
            if (session && session.user) {
                const { data: prof } = await supabaseClient.from('profiles').select('role, nama_lengkap, region').eq('id', session.user.id).single();
                if (prof) {
                    this.currentRole = prof.role || this.currentRole;
                    this.currentUser = prof.nama_lengkap || this.currentUser;
                    if (prof.region) localStorage.setItem('vortex_region', prof.region);
                    localStorage.setItem('vortex_role', this.currentRole);
                    localStorage.setItem('vortex_user', this.currentUser);
                }
                supabaseClient.auth.onAuthStateChange((event) => {
                    if (event === 'SIGNED_OUT') this.logout();
                });
            }
        },

        async init() {
            await this.resetInputTransaction();
            this.loadFormDraft();
            this.initProfileData();
            await this.validateSession();
            await this.loadDataFromSupabase();
            this.inisialisasiRealtimeStok();
            this.refreshIcons();

            this.$watch('currentTab', () => {
                this.showDrumLedger = false;
                this.selectedCableKode = '';
            });

            this.$watch('newTrans', val => {
                if (val && (val.noReferensi || val.keterangan || (val.items && val.items.some(i => i.kodeBarang || i.qty)))) {
                    this.saveFormDraft(val);
                }
            }, { deep: true });

            this.$watch('newTrans.tipeTransaksi', val => {
                if (val === 'Keluar') {
                    this.newTrans.staffGudang = this.currentUser || '';
                }
            });

            // Pagination Watchers
            this.$watch('filterStokGudang', () => { this.pageStok = 1; this.pageDrum = 1; });
            this.$watch('searchMaterialUsageProject', () => { this.pageUsage = 1; });
            this.$watch('searchNoTransaksi', () => { this.pageTx = 1; });
        },

        inisialisasiRealtimeStok() {
            if (!supabaseClient) return;
            supabaseClient.channel('pantau-stok-wms')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'stok_gudang' }, () => this.scheduleReload())
                .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => this.scheduleReload())
                .subscribe();
        },

        formatQty(val) {
            const n = parseFloat(val) || 0;
            return n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
        },

        paginate(items, page, size) {
            const start = (page - 1) * size;
            return items.slice(start, start + size);
        },
        totalPages(items, size) {
            return Math.ceil(items.length / size) || 1;
        },

        // --- FETCH DATA (Bagian yang terpotong sebelumnya) ---
        async loadDataFromSupabase() {
            if (!supabaseClient) return;
            this.isLoading = true;
            try {
                const { data: projectData } = await supabaseClient.from('master_project').select('*');
                if (projectData) this.masterProject = projectData.map(p => ({ periode: p.periode, region: p.region, kodeProject: p.kode_project, type: p.type, noPO: p.no_po, projectName: p.project_name }));

                const { data: barangData } = await supabaseClient.from('master_barang').select('*');
                if (barangData) this.masterBarang = barangData.map(b => ({ kategori: b.kategori, jenis: b.jenis, kodeBarang: b.kode_barang, namaBarang: b.nama_barang, sat: b.sat }));

                const { data: gudangData } = await supabaseClient.from('master_gudang').select('*');
                if (gudangData) this.masterGudang = gudangData.map(g => ({ region: g.region || '', kodeGudang: g.kode_gudang, namaGudang: g.nama_gudang, tipeKepemilikan: g.tipe_kepemilikan, lokasi: g.lokasi }));

                // Melanjutkan baris yang terpotong ("let stockQuery =")
                let stockQuery = await supabaseClient.from('stok_gudang').select('*');
                if (stockQuery.data) this.stokGudang = stockQuery.data;

                let txQuery = await supabaseClient.from('transactions').select('*').order('tanggal', { ascending: false });
                if (txQuery.data) this.transactions = txQuery.data;

            } catch (error) {
                console.error("Data load error:", error);
            } finally {
                this.isLoading = false;
                this.refreshIcons();
            }
        },

        // --- AUTH & NAVIGASI UI ---
        login() {
            this.isLoading = true;
            setTimeout(() => {
                if(this.loginForm.email) {
                    this.isLoggedIn = true;
                    localStorage.setItem('vortex_logged_in', 'true');
                    this.showNotification('Login Berhasil', 'success');
                }
                this.isLoading = false;
            }, 1000);
        },
        logout() {
            this.isLoggedIn = false;
            localStorage.removeItem('vortex_logged_in');
        },
        switchTab(tab) {
            this.currentTab = tab;
            this.refreshIcons();
        },
        showNotification(msg, type = 'success') {
            this.notification = { show: true, message: msg, type: type };
            setTimeout(() => { this.notification.show = false; }, 3500);
        },
        refreshIcons() {
            setTimeout(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); }, 50);
        },

        // --- PROFIL ---
        initProfileData() {
            this.profileForm.namaLengkap = this.currentUser;
            this.profileForm.email = 'admin@wms-system.local'; 
        },
        updateProfile() {
            this.currentUser = this.profileForm.namaLengkap;
            localStorage.setItem('vortex_user', this.currentUser);
            this.showNotification('Profil diperbarui', 'success');
        },

        // --- MASTER DATA CRUD (Menghubungkan Modal HTML) ---
        openModal(type) {
            this.modalType = type;
            this.isEdit = false;
            this.modalForm = {};
            this.showModal = true;
        },
        openEditModal(type, index) {
            this.modalType = type;
            this.isEdit = true;
            this.editIndex = index;
            if (type === 'barang') this.modalForm = JSON.parse(JSON.stringify(this.masterBarang[index]));
            if (type === 'gudang') this.modalForm = JSON.parse(JSON.stringify(this.masterGudang[index]));
            if (type === 'project') this.modalForm = JSON.parse(JSON.stringify(this.masterProject[index]));
            this.showModal = true;
        },
        saveModalData() {
            const target = this.modalType === 'barang' ? this.masterBarang : (this.modalType === 'gudang' ? this.masterGudang : this.masterProject);
            if (this.isEdit) target[this.editIndex] = this.modalForm;
            else target.push(this.modalForm);
            
            // Simpan ke local storage sebagai fallback jika supabase tidak aktif
            localStorage.setItem(`vortex_master${this.modalType.charAt(0).toUpperCase() + this.modalType.slice(1)}`, JSON.stringify(target));
            
            this.showModal = false;
            this.showNotification(`Data ${this.modalType} berhasil disimpan`, 'success');
        },
        deleteItem(type, index) {
            if(confirm('Yakin ingin menghapus data ini?')) {
                if (type === 'barang') this.masterBarang.splice(index, 1);
                if (type === 'gudang') this.masterGudang.splice(index, 1);
                if (type === 'project') this.masterProject.splice(index, 1);
                this.showNotification(`Data dihapus`, 'success');
            }
        },
        generateKodeProject() {
            if (this.modalForm.periode && this.modalForm.region) {
                const d = new Date(this.modalForm.periode);
                const reg = this.modalForm.region.substring(0,3).toUpperCase();
                this.modalForm.kodeProject = `PRJ-${reg}-${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`;
            }
        },

        // --- TRANSAKSI (LOGIC) ---
        openInputTransaction() {
            this.resetInputTransaction();
            this.switchTab('input-transaksi');
        },
        async resetInputTransaction() {
            this.editingOriginalNo = null;
            this.newTrans = { tanggal: this.todayWIB(), noTransaksi: '', noReferensi: '', tipeTransaksi: 'Masuk', gudangAsal: '', gudangTujuan: '', kodeProject: '', keterangan: '', staffGudang: this.currentUser, projectManager: '', namaPenerima: '', items: [] };
            this.clearSelectedFiles();
            this.generateNoTransaksi();
        },
        generateNoTransaksi() {
            const d = this.newTrans.tanggal ? this.newTrans.tanggal.replace(/-/g, '') : this.todayWIB().replace(/-/g, '');
            const prefix = this.newTrans.tipeTransaksi === 'Masuk' ? 'IN' : (this.newTrans.tipeTransaksi === 'Keluar' ? 'OUT' : 'TRF');
            this.newTrans.noTransaksi = `${prefix}-${d}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
        },
        onTipeTransaksiChange() {
            this.newTrans.gudangAsal = ''; this.newTrans.gudangTujuan = ''; this.newTrans.items = [];
            this.generateNoTransaksi();
        },
        resetItemsOnWarehouseChange() { this.newTrans.items = []; },
        getGudangTujuanList() { return this.getFilteredMasterGudang().filter(g => g.namaGudang !== this.newTrans.gudangAsal); },
        getFilteredProjectsForAsal() { return this.getFilteredMasterProject(); },
        handleFileSelect(event) { this.selectedFilesList = Array.from(event.target.files); },
        clearSelectedFiles() {
            this.selectedFilesList = [];
            const el = document.getElementById('attachmentInput');
            if (el) el.value = '';
        },
        addTransactionItem() { this.newTrans.items.push({ kategori: '', jenis: '', kodeBarang: '', namaBarang: '', drumId: '', qty: 0 }); },
        removeTransactionItem(index) { this.newTrans.items.splice(index, 1); },
        getCategories() { return Array.from(new Set(this.masterBarang.map(b => b.kategori))); },
        getJenis(kategori) { return Array.from(new Set(this.masterBarang.filter(b => b.kategori === kategori).map(b => b.jenis))); },
        getBarangList(kategori, jenis) { return this.masterBarang.filter(b => b.kategori === kategori && b.jenis === jenis); },
        fillNamaBarang(item) {
            const b = this.masterBarang.find(x => x.kodeBarang === item.kodeBarang);
            if (b) { item.namaBarang = b.namaBarang; item.kategori = b.kategori; }
        },
        getCategoryByKode(kode) {
            const b = this.masterBarang.find(x => x.kodeBarang === kode);
            return b ? b.kategori : '';
        },
        getDrumList(item) { return this.drumLedger.filter(d => d.kodeBarang === item.kodeBarang && d.gudang === this.newTrans.gudangAsal); },
        getMaxStock(item) {
            if (this.newTrans.tipeTransaksi === 'Masuk' || !item.kodeBarang) return 999999;
            // Evaluasi sementara karena ini dummy array
            return 999999; 
        },
        hasStockExceeded() { return false; }, // Dilonggarkan untuk demo
        
        async submitTransaction() {
            this.isLoading = true;
            setTimeout(() => {
                const txData = JSON.parse(JSON.stringify(this.newTrans));
                if (this.editingOriginalNo) {
                    const idx = this.transactions.findIndex(t => t.noTransaksi === this.editingOriginalNo);
                    if (idx > -1) this.transactions[idx] = txData;
                } else {
                    this.transactions.unshift(txData);
                }
                localStorage.setItem('vortex_transactions', JSON.stringify(this.transactions));
                this.showNotification('Transaksi Berhasil Disimpan', 'success');
                this.clearFormDraft();
                this.switchTab('data-transaksi');
                this.isLoading = false;
            }, 800);
        },

        // --- FILTER & DATA TABLES ---
        getPaginatedStokGudang() { return this.paginate(this.getFilteredStokGudang(), this.pageStok, this.pageSizeStok); },
        getPaginatedDrumLedger() { return this.paginate(this.getFilteredDrumLedger(), this.pageDrum, this.pageSizeDrum); },
        getPaginatedMaterialUsage() { return this.paginate(this.getFilteredMaterialUsage(), this.pageUsage, this.pageSizeUsage); },
        getPaginatedTransactions() { return this.paginate(this.getFilteredTransactions(), this.pageTx, this.pageSizeTx); },

        getFilteredStokGudang() { return this.filterStokGudang ? this.stokGudang.filter(s => s.gudang === this.filterStokGudang) : this.stokGudang; },
        getFilteredDrumLedger() { 
            let res = this.drumLedger;
            if (this.selectedCableKode) res = res.filter(d => d.kodeBarang === this.selectedCableKode);
            if (this.filterStokGudang) res = res.filter(d => d.gudang === this.filterStokGudang);
            return res;
        },
        getFilteredMaterialUsage() { return this.searchMaterialUsageProject ? this.materialUsage.filter(u => u.kodeProject?.toLowerCase().includes(this.searchMaterialUsageProject.toLowerCase())) : this.materialUsage; },
        getFilteredTransactions() { return this.searchNoTransaksi ? this.transactions.filter(t => t.noTransaksi?.toLowerCase().includes(this.searchNoTransaksi.toLowerCase())) : this.transactions; },

        // --- BAST & EXPORT ---
        editTransaction(tx) {
            this.newTrans = JSON.parse(JSON.stringify(tx));
            this.editingOriginalNo = tx.noTransaksi;
            this.switchTab('input-transaksi');
        },
        deleteTransaction(tx) {
            if(confirm('Hapus transaksi ini?')) {
                this.transactions = this.transactions.filter(t => t.noTransaksi !== tx.noTransaksi);
                localStorage.setItem('vortex_transactions', JSON.stringify(this.transactions));
                this.showNotification('Transaksi dihapus', 'success');
            }
        },
        exportStokCSV() { this.showNotification('Export CSV Stok Gudang berjalan...', 'success'); },
        exportUsageCSV() { this.showNotification('Export CSV Material Usage berjalan...', 'success'); },
        exportTransactionCSV() { this.showNotification('Export CSV Transaksi berjalan...', 'success'); },
        
        printBAST(tx) {
            this.activeBast = tx;
            setTimeout(() => { window.print(); }, 500);
        },
        getBastProjectName(kode) {
            const p = this.masterProject.find(x => x.kodeProject === kode);
            return p ? p.projectName : '-';
        },
        getExpandedBastItems() {
            return (this.activeBast.items || []).map((item, idx) => ({ no: idx + 1, ...item }));
        },
        getBastSummaryItems() {
            if (!this.activeBast.items) return [];
            const summary = {};
            this.activeBast.items.forEach(i => {
                if (!summary[i.namaBarang]) summary[i.namaBarang] = 0;
                summary[i.namaBarang] += parseFloat(i.qty || 0);
            });
            return Object.keys(summary).map((key, idx) => ({ no: idx + 1, namaBarang: key, totalQty: summary[key] }));
        },
        reuseDrum(drum, index) {
            this.showNotification('Fitur Scrap Drum dalam pengembangan', 'success');
        }
    };
}
