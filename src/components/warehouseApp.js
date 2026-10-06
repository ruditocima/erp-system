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
        isLoggedIn: localStorage.getItem('vortex_logged_in') === 'true',
        currentUser: localStorage.getItem('vortex_user') || 'Admin',
        currentRole: localStorage.getItem('vortex_role') || 'Super Admin',
        currentTab: 'dashboard',
        loginForm: { email: '', password: '' },
        profileForm: { namaLengkap: '', email: '', newPassword: '' },

        showModal: false, modalType: '', modalForm: {}, isEdit: false, editIndex: null, editingOriginalKode: null,
        isLoading: false, notification: { show: false, message: '', type: 'error' },
        filterStokGudang: '', filterRegionUsage: '', searchNoTransaksi: '', searchNoReferensi: '', searchMaterialUsageProject: '', searchDrumQuery: '', editingOriginalNo: null, filterStatusTx: '',
        showDrumLedger: false, selectedCableKode: '',
        projectSearchText: '', // State untuk pencarian nama project

        selectedFilesList: [], // Menyimpan file mentah yang dipilih user sebelum disimpan

        pageStok: 1, pageSizeStok: 10, totalStokCount: 0,
        pageDrum: 1, pageSizeDrum: 10, totalDrumCount: 0,
        pageUsage: 1, pageSizeUsage: 10, totalUsageCount: 0,
        pageTx: 1, pageSizeTx: 10, totalTxCount: 0,
        _reloadTimer: null,
        _draftTimer: null,

        // cache dropdown drum per-index item (object), bukan satu array global.
        activeDropdownDrums: {}, // { [indexItem]: [{ drumId, remainingLength }] }
        stokCache: {},           // cache validasi stok: { 'kodeBarang|gudang': qty }
        drumCache: {},           // cache sisa panjang drum: { drumId: remainingLength }
        _stokPending: {},
        _drumPending: {},

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

        getFilteredProjectDropdownList() {
            const projects = this.getFilteredProjectsForAsal();
            if (!this.projectSearchText) return projects;
            const query = this.projectSearchText.toLowerCase();
            return projects.filter(p => (p.projectName || '').toLowerCase().includes(query));
        },

        todayWIB() {
            return new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0];
        },

        safeParseItems(items) {
            if (!items) return [];
            if (typeof items === 'string') {
                try {
                    const parsed = JSON.parse(items);
                    return Array.isArray(parsed) ? parsed : [];
                } catch (e) {
                    console.warn('Peringatan: Gagal parsing items transaksi:', e);
                    return [];
                }
            }
            return Array.isArray(items) ? items : [];
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
                    console.warn('Peringatan: Gagal menyimpan draf transaksi ke localStorage:', e); 
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
                        if (this.newTrans.items) {
                            this.newTrans.items.forEach((item, idx) => {
                                if (item.kodeBarang && this.getCategoryByKode(item.kodeBarang) === 'Cable') {
                                    this.fetchDrumsForDropdown(item.kodeBarang, this.newTrans.gudangAsal, idx);
                                }
                            });
                        }
                        return true;
                    }
                }
            } catch (e) { 
                console.warn('Peringatan: Gagal memuat draf transaksi dari localStorage:', e); 
            }
            return false;
        },

        clearFormDraft() {
            try {
                localStorage.removeItem('vortex_draft_transaksi');
            } catch (e) { 
                console.warn('Peringatan: Gagal membersihkan draf transaksi:', e); 
            }
        },

        buildRpcParams(tx) {
            return {
                p_no_transaksi: tx.noTransaksi,
                p_tanggal: tx.tanggal,
                p_no_referensi: tx.noReferensi || '',
                p_tipe_transaksi: tx.tipeTransaksi,
                p_gudang_asal: tx.gudangAsal || '',
                p_gudang_tujuan: tx.gudangTujuan || '',
                p_kode_project: tx.kodeProject || '',
                p_keterangan: tx.keterangan || '',
                p_staff_gudang: tx.staffGudang || '',
                p_project_manager: tx.projectManager || '',
                p_nama_penerima: tx.namaPenerima || '',
                p_lampiran_url: tx.lampiranUrl || '',
                p_items: (tx.items || []).map(item => ({
                    ...item,
                    kode_barang: item.kodeBarang,
                    nama_barang: item.namaBarang,
                    kategori: item.kategori || this.getCategoryByKode(item.kodeBarang) || '',
                    drum_id: item.drumId || '',
                    qty: parseFloat(item.qty) || 0
                }))
            };
        },

        async logAudit(action, details) {
            try {
                if (!supabaseClient) return;
                const { error } = await supabaseClient.from('audit_log').insert({
                    user_name: this.currentUser || 'unknown',
                    user_role: this.currentRole || '',
                    action: action,
                    details: JSON.stringify(details || {}),
                    created_at: new Date().toISOString()
                });
                if (error) {
                    console.error('Gagal mencatat audit log ke database:', error.message);
                }
            } catch (e) { 
                console.error('Terjadi kesalahan saat mencatat audit log:', e); 
            }
        },

        async validateSession() {
            if (!supabaseClient) return;
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (this.isLoggedIn && !session) { this.logout(); return; }
            if (session && session.user) {
                const { data: prof } = await supabaseClient.from('profiles')
                    .select('role, nama_lengkap, region').eq('id', session.user.id).single();
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

            this.$watch('selectedCableKode', () => { this.pageDrum = 1; if (supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('filterStokGudang', () => { this.pageStok = 1; this.pageDrum = 1; if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('searchMaterialUsageProject', () => { this.pageUsage = 1; if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('searchNoTransaksi', () => { this.pageTx = 1; if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('filterStatusTx', () => { this.pageTx = 1; if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('searchDrumQuery', () => { this.pageDrum = 1; if(supabaseClient) this.loadDataFromSupabase(); });

            this.$watch('pageStok', () => { if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('pageSizeStok', () => { this.pageStok = 1; if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('pageDrum', () => { if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('pageSizeDrum', () => { this.pageDrum = 1; if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('pageUsage', () => { if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('pageSizeUsage', () => { this.pageUsage = 1; if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('pageTx', () => { if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('pageSizeTx', () => { this.pageTx = 1; if(supabaseClient) this.loadDataFromSupabase(); });
        },

        inisialisasiRealtimeStok() {
            if (!supabaseClient) return;

            supabaseClient.channel('pantau-stok-wms-optimized')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'stok_gudang' }, () => {
                    this.scheduleReload();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
                    this.scheduleReload();
                })
                .subscribe();
        },

        async catatPenggunaanKabel(drumId, panjangDipakai) {
            if (!supabaseClient) {
                let drum = this.drumLedger.find(d => d.drumId === drumId);
                if (!drum) {
                    this.showNotification('Drum ID tidak ditemukan!', 'error');
                    return false;
                }
                if (drum.remainingLength < panjangDipakai) {
                    this.showNotification('Sisa panjang kabel tidak mencukupi!', 'error');
                    return false;
                }
                drum.remainingLength = Math.round((drum.remainingLength - panjangDipakai) * 100) / 100;
                return true;
            }

            try {
                const { data, error } = await supabaseClient.rpc('potong_stok_kabel', {
                    p_drum_id: drumId,
                    p_panjang_dipakai: parseFloat(panjangDipakai)
                });

                if (error) throw error;

                if (data && data.status === 'error') {
                    this.showNotification(`Gagal: ${data.message}`, 'error');
                    return false;
                }

                this.showNotification(`Transaksi berhasil. Sisa stok drum: ${data ? data.sisa_stok : '-'}m`, 'success');
                await this.loadDataFromSupabase();
                return true;
            } catch (err) {
                console.error('Gagal eksekusi RPC potong_stok_kabel:', err.message);
                this.showNotification('Gagal memotong stok: ' + (err.message || err), 'error');
                return false;
            }
        },

        formatQty(val) {
            const n = parseFloat(val) || 0;
            return n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
        },

        csvSafe(val) {
            let s = String(val == null ? '' : val).replace(/"/g, '""');
            if (/^[=+\-@]/.test(s)) s = "'" + s;
            return s;
        },

        paginate(items, page, size) {
            const start = (page - 1) * size;
            return items.slice(start, start + size);
        },
        totalPages(items, size) {
            return Math.ceil(items.length / size) || 1;
        },
        // ===================================================================
        // HELPER REGION & FUNGSI FILTER
        // ===================================================================

        isItemInUserRegion(regionName) {
            if (this.isSuperAdmin) return true;
            const uReg = this.userRegion().toLowerCase();
            const iReg = (regionName || '').toLowerCase();
            return uReg === 'semua region' || iReg === uReg;
        },

        // [PERBAIKAN] Mengembalikan daftar nama gudang milik region user.
        // Null = tidak dibatasi (Super Admin / Semua Region).
        getRegionalWarehouseNames() {
            if (this.isSuperAdmin) return null;
            const reg = this.userRegion().toLowerCase();
            if (reg === 'semua region') return null;
            return this.masterGudang
                .filter(g => (g.region || '').toLowerCase() === reg)
                .map(g => g.namaGudang);
        },

        // [PERBAIKAN] Mengembalikan daftar kode project milik region user (null = tidak dibatasi).
        getRegionalProjectCodes() {
            if (this.isSuperAdmin) return null;
            const reg = this.userRegion().toLowerCase();
            if (reg === 'semua region') return null;
            return this.masterProject
                .filter(p => (p.region || '').toLowerCase() === reg)
                .map(p => p.kodeProject);
        },

        // [PERBAIKAN] Membersihkan keyword pencarian agar aman dipakai di filter .or() PostgREST
        // (karakter , ( ) % bisa merusak sintaks filter atau menjadi wildcard injection).
        sanitizeOrKeyword(kw) {
            return String(kw || '').replace(/[(),%]/g, ' ').replace(/\s+/g, ' ').trim();
        },

        // ===================================================================
        // HELPER PENOMORAN DRUM ID (KATEGORI CABLE)
        // Ketentuan baru:
        //  - Masuk  : [KODE GUDANG TUJUAN tanpa strip]-[SKU mulai digit ke-6 tanpa strip]-D[seq]
        //             contoh: 'NPM01-024YOFC-D01'
        //  - Retur  : [DRUM ID ASAL YANG DIRETUR]-[nomor urut retur 01, 02, ...]
        //             contoh: retur 'NPM01-024YOFC-D01' -> 'NPM01-024YOFC-D01-01'
        // ===================================================================
        extractDrumSkuCode(kodeBarang) {
            if (!kodeBarang) return '';
            const kb = String(kodeBarang);
            // Ambil mulai dari digit ke-6 SKU, lalu buang semua tanda strip (-).
            // Contoh: 'ADSS-024-YOFC'  -> mulai digit ke-6 -> '024-YOFC' -> '024YOFC'
            //         'ADSS-024YOFC'   -> mulai digit ke-6 -> '024YOFC'
            const code = (kb.length > 5 ? kb.substring(5) : kb).replace(/-/g, '');
            return code || kb.replace(/-/g, '');
        },

        getFilteredStokGudang() {
            if (supabaseClient) {
                const dummy = new Array(this.totalStokCount || this.stokGudang.length);
                const start = (this.pageStok - 1) * this.pageSizeStok;
                for (let i = 0; i < this.stokGudang.length; i++) {
                    dummy[start + i] = this.stokGudang[i];
                }
                return dummy;
            }
            let list = this.stokGudang;
            if (!this.isSuperAdmin) {
                const reg = this.userRegion().toLowerCase();
                const regionalWhNames = this.masterGudang.filter(g => (g.region || '').toLowerCase() === reg).map(g => g.namaGudang);
                list = list.filter(s => regionalWhNames.includes(s.gudang));
            }
            if (this.filterStokGudang) {
                list = list.filter(s => s.gudang === this.filterStokGudang);
            }
            return list;
        },

        getFilteredDrumLedger() {
            if (supabaseClient) {
                const dummy = new Array(this.totalDrumCount || this.drumLedger.length);
                const start = (this.pageDrum - 1) * this.pageSizeDrum;
                for (let i = 0; i < this.drumLedger.length; i++) {
                    dummy[start + i] = this.drumLedger[i];
                }
                return dummy;
            }
            let list = this.drumLedger;
            if (!this.isSuperAdmin) {
                const reg = this.userRegion().toLowerCase();
                const regionalWhNames = this.masterGudang.filter(g => (g.region || '').toLowerCase() === reg).map(g => g.namaGudang);
                list = list.filter(d => regionalWhNames.includes(d.gudang));
            }
            if (this.filterStokGudang) list = list.filter(d => d.gudang === this.filterStokGudang);
            if (this.selectedCableKode) list = list.filter(d => d.kodeBarang === this.selectedCableKode);
            return list;
        },

        getFilteredMaterialUsage() {
            if (supabaseClient) {
                const dummy = new Array(this.totalUsageCount || this.materialUsage.length);
                const start = (this.pageUsage - 1) * this.pageSizeUsage;
                for (let i = 0; i < this.materialUsage.length; i++) {
                    dummy[start + i] = this.materialUsage[i];
                }
                return dummy;
            }
            let list = this.materialUsage;
            if (!this.isSuperAdmin) {
                const reg = (this.userRegion() || '').toLowerCase();
                const regionalProjectCodes = this.masterProject
                    .filter(p => (p.region || '').toLowerCase() === reg)
                    .map(p => p.kodeProject);
                list = list.filter(u => regionalProjectCodes.includes(u.kodeProject));
            }
            if (this.searchMaterialUsageProject) {
                const q = this.searchMaterialUsageProject.toLowerCase();
                list = list.filter(u => 
                    (u.kodeProject && u.kodeProject.toLowerCase().includes(q)) || 
                    (u.projectName && u.projectName.toLowerCase().includes(q)) ||
                    (u.noPO && u.noPO.toLowerCase().includes(q))
                );
            }
            return list;
        },

        getFilteredTransactions() {
            if (supabaseClient) {
                const dummy = new Array(this.totalTxCount || this.transactions.length);
                const start = (this.pageTx - 1) * this.pageSizeTx;
                for (let i = 0; i < this.transactions.length; i++) {
                    dummy[start + i] = this.transactions[i];
                }
                return dummy;
            }
            let list = this.transactions;
            if (!this.isSuperAdmin) {
                const reg = this.userRegion().toLowerCase();
                const regionalWhNames = this.masterGudang.filter(g => (g.region || '').toLowerCase() === reg).map(g => g.namaGudang);
                list = list.filter(t => regionalWhNames.includes(t.gudangAsal) || regionalWhNames.includes(t.gudangTujuan));
            }
            if (this.searchNoTransaksi) {
                const q = this.searchNoTransaksi.toLowerCase();
                list = list.filter(t => t.noTransaksi.toLowerCase().includes(q) || (t.noReferensi && t.noReferensi.toLowerCase().includes(q)));
            }
            if (this.filterStatusTx) {
                list = list.filter(t => (t.approvalStatus || 'Approved') === this.filterStatusTx);
            }
            return list;
        },
        getPaginatedStokGudang() {
            if (supabaseClient) return this.stokGudang;
            return this.paginate(this.getFilteredStokGudang(), this.pageStok, this.pageSizeStok);
        },
        getPaginatedDrumLedger() {
            if (supabaseClient) return this.drumLedger;
            return this.paginate(this.getFilteredDrumLedger(), this.pageDrum, this.pageSizeDrum);
        },
        getPaginatedMaterialUsage() {
            if (supabaseClient) return this.materialUsage;
            return this.paginate(this.getFilteredMaterialUsage(), this.pageUsage, this.pageSizeUsage);
        },
        getPaginatedTransactions() {
            if (supabaseClient) return this.transactions;
            return this.paginate(this.getFilteredTransactions(), this.pageTx, this.pageSizeTx);
        },

        async loadDataFromSupabase() {
            if (!supabaseClient) return;
            this.isLoading = true;
            let regionWhNames = null;
            let regionProjCodes = null;
            try {
                const { data: projectData } = await supabaseClient.from('master_project').select('*');
                if (projectData) {
                    this.masterProject = projectData.map(p => ({
                        periode: p.periode, region: p.region, kodeProject: p.kode_project,
                        type: p.type, noPO: p.no_po, projectName: p.project_name
                    }));
                }

                const { data: barangData } = await supabaseClient.from('master_barang').select('*');
                if (barangData) {
                    this.masterBarang = barangData.map(b => ({
                        kategori: b.kategori, jenis: b.jenis, kodeBarang: b.kode_barang,
                        namaBarang: b.nama_barang, sat: b.sat
                    }));
                }

                const { data: gudangData } = await supabaseClient.from('master_gudang').select('*');
                if (gudangData) {
                    this.masterGudang = gudangData.map(g => ({
                        region: g.region || '', kodeGudang: g.kode_gudang,
                        namaGudang: g.nama_gudang, tipeKepemilikan: g.tipe_kepemilikan, lokasi: g.lokasi
                    }));
                }

                // [PERBAIKAN] Batasi data hanya pada region user (non Super Admin).
                regionWhNames = this.getRegionalWarehouseNames();
                regionProjCodes = this.getRegionalProjectCodes();

                let stockQuery = supabaseClient.from('stok_gudang').select('*', { count: 'exact' });
                if (this.filterStokGudang) {
                    stockQuery = stockQuery.eq('gudang', this.filterStokGudang);
                } else if (regionWhNames) {
                    // 'Semua Gudang' tidak aktif untuk non Super Admin: tetap batasi ke region sendiri.
                    if (regionWhNames.length > 0) stockQuery = stockQuery.in('gudang', regionWhNames);
                    else stockQuery = stockQuery.eq('gudang', '__tidak_ada_gudang_region__');
                }
                const fromStok = (this.pageStok - 1) * this.pageSizeStok;
                const { data: stockData, count: countStok } = await stockQuery.order('kode_barang', { ascending: true }).range(fromStok, fromStok + this.pageSizeStok - 1);
                if (stockData) {
                    this.stokGudang = stockData.map(s => ({
                        kodeBarang: s.kode_barang, 
                        namaBarang: s.nama_barang,
                        kategori: s.kategori || this.masterBarang.find(b => b.kodeBarang === s.kode_barang)?.kategori || '', 
                        gudang: s.gudang, 
                        masuk: parseFloat(s.masuk) || 0,
                        keluar: parseFloat(s.keluar) || 0,
                        retur: parseFloat(s.retur) || 0,
                        tMasuk: parseFloat(s.t_masuk) || 0,
                        tKeluar: parseFloat(s.t_keluar) || 0,
                        qty: parseFloat(s.qty) || 0, 
                        sat: s.sat
                    }));
                    this.totalStokCount = countStok !== null ? countStok : stockData.length;
                }

                let drumQuery = supabaseClient.from('drum_ledger').select('*', { count: 'exact' });
                if (this.filterStokGudang) drumQuery = drumQuery.eq('gudang', this.filterStokGudang);
                else if (regionWhNames) {
                    if (regionWhNames.length > 0) drumQuery = drumQuery.in('gudang', regionWhNames);
                    else drumQuery = drumQuery.eq('gudang', '__tidak_ada_gudang_region__');
                }
                if (this.selectedCableKode) drumQuery = drumQuery.eq('kode_barang', this.selectedCableKode);
                const drumKw = this.sanitizeOrKeyword(this.searchDrumQuery);
                if (drumKw) {
                    drumQuery = drumQuery.or(`drum_id.ilike.%${drumKw}%,nama_barang.ilike.%${drumKw}%,gudang.ilike.%${drumKw}%`);
                }
                const fromDrum = (this.pageDrum - 1) * this.pageSizeDrum;
                const { data: drumData, count: countDrum } = await drumQuery.order('drum_id', { ascending: true }).range(fromDrum, fromDrum + this.pageSizeDrum - 1);
                if (drumData) {
                    this.drumLedger = drumData.map(d => ({
                        drumId: d.drum_id, kodeBarang: d.kode_barang, namaBarang: d.nama_barang,
                        gudang: d.gudang, initialLength: parseFloat(d.initial_length) || 0,
                        remainingLength: parseFloat(d.remaining_length) || 0
                    }));
                    this.totalDrumCount = countDrum !== null ? countDrum : drumData.length;
                }

                let usageQuery = supabaseClient.from('material_usage').select('*', { count: 'exact' });
                const usageKw = this.sanitizeOrKeyword(this.searchMaterialUsageProject);
                if (usageKw) {
                    usageQuery = usageQuery.or(`kode_project.ilike.%${usageKw}%,project_name.ilike.%${usageKw}%`);
                }
                if (regionProjCodes) {
                    if (regionProjCodes.length > 0) usageQuery = usageQuery.in('kode_project', regionProjCodes);
                    else usageQuery = usageQuery.eq('kode_project', '__tidak_ada_project_region__');
                }
                const fromUsage = (this.pageUsage - 1) * this.pageSizeUsage;
                const { data: usageData, count: countUsage } = await usageQuery
                    .order('id', { ascending: false })
                    .range(fromUsage, fromUsage + this.pageSizeUsage - 1);

                if (usageData) {
                    this.materialUsage = usageData.map(u => ({
                        id: u.id,
                        tanggal: u.tanggal,
                        kodeProject: u.kode_project,
                        projectName: u.project_name,
                        noPO: u.no_po,
                        kodeBarang: u.kode_barang,
                        namaBarang: u.nama_barang,
                        drumId: u.drum_id,
                        qty: parseFloat(u.qty) || 0
                    }));
                    this.totalUsageCount = countUsage !== null ? countUsage : usageData.length;
                }

                let txQuery = supabaseClient.from('transactions').select('*', { count: 'exact' });
                const txKw = this.sanitizeOrKeyword(this.searchNoTransaksi);
                if (txKw) txQuery = txQuery.or(`no_transaksi.ilike.%${txKw}%,no_referensi.ilike.%${txKw}%`);
                if (this.filterStatusTx) txQuery = txQuery.eq('approval_status', this.filterStatusTx);
                if (regionWhNames) {
                    // Data Transaksi hanya region sendiri (berdasarkan gudang asal atau tujuan).
                    if (regionWhNames.length > 0) {
                        const whList = regionWhNames.map(n => `"${String(n).replace(/"/g, '\\"')}"`).join(',');
                        txQuery = txQuery.or(`gudang_asal.in.(${whList}),gudang_tujuan.in.(${whList})`);
                    } else {
                        txQuery = txQuery.or('gudang_asal.eq.__tidak_ada_gudang_region__,gudang_tujuan.eq.__tidak_ada_gudang_region__');
                    }
                }
                const fromTx = (this.pageTx - 1) * this.pageSizeTx;
                const { data: txData, count: countTx } = await txQuery.order('tanggal', { ascending: false }).range(fromTx, fromTx + this.pageSizeTx - 1);
                if (txData) {
                    this.transactions = txData.map(t => ({
                        noTransaksi: t.no_transaksi, tanggal: t.tanggal, noReferensi: t.no_referensi,
                        tipeTransaksi: t.tipe_transaksi, gudangAsal: t.gudang_asal, gudangTujuan: t.gudang_tujuan,
                        kodeProject: t.kode_project, keterangan: t.keterangan, staffGudang: t.staff_gudang,
                        projectManager: t.project_manager, namaPenerima: t.nama_penerima, lampiranUrl: t.lampiran_url,
                        approvalStatus: t.approval_status || 'Approved',
                        approvedBy: t.approved_by || '',
                        approvedAt: t.approved_at || '',
                        rejectReason: t.reject_reason || '',
                        items: this.safeParseItems(t.items)
                    }));
                    this.totalTxCount = countTx !== null ? countTx : txData.length;
                }

            } catch (err) {
                console.error('Gagal memuat data dari Supabase:', err);
            } finally {
                this.stokCache = {};
                this.drumCache = {};
                const clampPage = (page, count, size) => Math.max(1, Math.min(page, Math.ceil((count || 0) / size) || 1));
                this.pageStok  = clampPage(this.pageStok,  this.totalStokCount,  this.pageSizeStok);
                this.pageDrum  = clampPage(this.pageDrum,  this.totalDrumCount,  this.pageSizeDrum);
                this.pageUsage = clampPage(this.pageUsage, this.totalUsageCount, this.pageSizeUsage);
                this.pageTx    = clampPage(this.pageTx,    this.totalTxCount,    this.pageSizeTx);

                // [PERBAIKAN] Untuk non Super Admin, 'Semua Gudang' tidak aktif:
                // otomatis arahkan filter ke gudang pertama region sendiri.
                if (!this.isSuperAdmin && regionWhNames) {
                    if (this.filterStokGudang && !regionWhNames.includes(this.filterStokGudang)) {
                        this.filterStokGudang = regionWhNames[0] || '';
                    } else if (!this.filterStokGudang && regionWhNames.length > 0) {
                        this.filterStokGudang = regionWhNames[0];
                    }
                }

                this.isLoading = false;
                this.refreshIcons();
            }
        },

        refreshIcons() {
            this.$nextTick(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); });
        },

        showNotification(msg, type = 'success') {
            this.notification = { show: true, message: msg, type: type };
            this.refreshIcons();
            setTimeout(() => { this.notification.show = false; }, 4000);
        },

        async login() {
            const demoMode = new URLSearchParams(window.location.search).get('demo') === '1';
            if (!supabaseClient && demoMode) {
                this.isLoggedIn = true;
                this.currentUser = 'Demo User';
                this.currentRole = 'Regional WH';
                localStorage.setItem('vortex_logged_in', 'true');
                localStorage.setItem('vortex_user', this.currentUser);
                localStorage.setItem('vortex_role', this.currentRole);
                this.showNotification('Masuk mode demo lokal.', 'success');
                return;
            }
            if (!supabaseClient) {
                this.showNotification('Koneksi database tidak tersedia.', 'error');
                return;
            }

            try {
                this.isLoading = true;
                const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
                    email: this.loginForm.email,
                    password: this.loginForm.password
                });
                if (authError) throw authError;

                const userId = authData.user.id;
                const { data: profileData, error: profileError } = await supabaseClient.from('profiles').select('role, nama_lengkap, region').eq('id', userId).single();

                if (profileError || !profileData) {
                    throw new Error('Data profil pengguna tidak ditemukan di database.');
                }

                this.isLoggedIn = true;
                this.currentUser = profileData.nama_lengkap || authData.user.email.split('@')[0];
                this.currentRole = profileData.role;
                if (profileData.region) {
                    localStorage.setItem('vortex_region', profileData.region);
                }

                localStorage.setItem('vortex_logged_in', 'true');
                localStorage.setItem('vortex_user', this.currentUser);
                localStorage.setItem('vortex_role', this.currentRole);
                this.initProfileData();
                this.logAudit('login', { user: this.currentUser, role: this.currentRole });
                this.showNotification('Berhasil masuk ke sistem!', 'success');
            } catch (err) {
                this.showNotification('Gagal Masuk: ' + (err.message || err), 'error');
            } finally {
                this.isLoading = false;
            }
        },

        async logout() {
            if (this.isLoading) return;
            this.isLoading = true;
            try {
                if (this._reloadTimer) clearTimeout(this._reloadTimer);
                if (this._draftTimer) clearTimeout(this._draftTimer);

                if (supabaseClient) {
                    await supabaseClient.removeAllChannels();
                    await supabaseClient.auth.signOut().catch(() => {});
                }
            } catch (e) {
                console.error('Kesalahan saat proses logout:', e);
            } finally {
                localStorage.removeItem('vortex_logged_in');
                localStorage.removeItem('vortex_user');
                localStorage.removeItem('vortex_role');
                localStorage.removeItem('vortex_region');
                this.isLoggedIn = false;
                this.isLoading = false;
                window.location.href = window.location.pathname + window.location.search;
            }
        },

        switchTab(tabName) {
            this.currentTab = tabName;
            this.showDrumLedger = false;
            this.selectedCableKode = '';
            this.refreshIcons();
        },

        initProfileData() {
            this.profileForm.namaLengkap = this.currentUser;
            this.profileForm.email = this.loginForm.email || 'user@acero.com';
        },

        async updateProfile() {
            if (!supabaseClient) {
                this.currentUser = this.profileForm.namaLengkap;
                localStorage.setItem('vortex_user', this.currentUser);
                this.showNotification('Profil diperbarui (Lokal) !', 'success');
                return;
            }
            try {
                this.isLoading = true;
                if (this.profileForm.newPassword) {
                    const { error: pwdErr } = await supabaseClient.auth.updateUser({ password: this.profileForm.newPassword });
                    if (pwdErr) throw pwdErr;
                }
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (user) {
                    const { error: profErr } = await supabaseClient.from('profiles').update({ nama_lengkap: this.profileForm.namaLengkap }).eq('id', user.id);
                    if (profErr) throw profErr;
                }
                this.currentUser = this.profileForm.namaLengkap;
                localStorage.setItem('vortex_user', this.currentUser);
                this.profileForm.newPassword = '';
                this.showNotification('Profil berhasil diperbarui!', 'success');
            } catch (err) {
                this.showNotification('Gagal update profil: ' + (err.message || err), 'error');
            } finally {
                this.isLoading = false;
            }
        },

        async openModal(type) {
            this.modalType = type; 
            this.isEdit = false; 
            this.editIndex = null;
            this.editingOriginalKode = null;

            if (type === 'project') {
                this.modalForm = { periode: this.todayWIB(), region: '', kodeProject: '(Otomatis dari Sistem)', type: 'Main Feeder', noPO: '', projectName: '' };
                await this.generateKodeProject();
            } else if (type === 'barang') {
                this.modalForm = { kategori: '', jenis: '', kodeBarang: '', namaBarang: '', sat: 'Pcs' };
            } else if (type === 'gudang') {
                this.modalForm = { region: '', kodeGudang: '', namaGudang: '', tipeKepemilikan: 'Milik Sendiri', lokasi: '' };
            }
            this.showModal = true; 
            this.refreshIcons();
        },

        openEditModal(type, target) {
            this.modalType = type; 
            this.isEdit = true; 
            let item = null;
            let realIndex = -1;

            if (typeof target === 'object' && target !== null) {
                item = target;
                if (type === 'barang') realIndex = this.masterBarang.findIndex(b => b.kodeBarang === item.kodeBarang);
                else if (type === 'gudang') realIndex = this.masterGudang.findIndex(g => g.kodeGudang === item.kodeGudang);
                else if (type === 'project') realIndex = this.masterProject.findIndex(p => p.kodeProject === item.kodeProject);
            } else if (typeof target === 'number') {
                realIndex = target;
                if (type === 'barang') item = this.masterBarang[target];
                else if (type === 'gudang') item = this.masterGudang[target];
                else if (type === 'project') item = this.masterProject[target];
            }

            if (!item) {
                console.error('Peringatan: Data tidak ditemukan untuk diedit.');
                return;
            }

            this.editIndex = realIndex;

            if (type === 'barang') {
                this.editingOriginalKode = item.kodeBarang;
                this.modalForm = JSON.parse(JSON.stringify(item));
            } else if (type === 'gudang') {
                this.editingOriginalKode = item.kodeGudang;
                this.modalForm = JSON.parse(JSON.stringify(item));
            } else if (type === 'project') {
                this.editingOriginalKode = item.kodeProject;
                this.modalForm = JSON.parse(JSON.stringify(item));
            }

            this.showModal = true; 
            this.refreshIcons();
        },

        getRegionCode(reg) {
            if (!reg) return 'ACH';
            let r = reg.trim().toUpperCase();
            if (r === 'ACEH') return 'ACH'; if (r === 'PADANG') return 'PDG';
            return r.substring(0, 3);
        },

        async generateKodeProject() {
            if (this.isEdit) return;

            const kodeInputEl = document.getElementById('kodeProjectInput') || document.getElementById('kode_project');
            if (kodeInputEl) {
                kodeInputEl.value = '(Otomatis dari Sistem)';
                kodeInputEl.disabled = true;
            }
            this.modalForm.kodeProject = '(Otomatis dari Sistem)';
        },

        async saveModalData() {
            const useSupabase = !!supabaseClient;
            try {
                this.isLoading = true;
                if (this.modalType === 'barang') {
                    if (!this.modalForm.kodeBarang || !this.modalForm.namaBarang) {
                        this.showNotification('Kode Barang dan Nama Barang wajib diisi!', 'error');
                        return;
                    }

                    if (useSupabase) {
                        const payload = {
                            kategori: this.modalForm.kategori,
                            jenis: this.modalForm.jenis,
                            kode_barang: this.modalForm.kodeBarang,
                            nama_barang: this.modalForm.namaBarang,
                            sat: this.modalForm.sat
                        };

                        if (this.isEdit) {
                            const origKey = this.editingOriginalKode || this.modalForm.kodeBarang;
                            const { error } = await supabaseClient
                                .from('master_barang')
                                .update(payload)
                                .eq('kode_barang', origKey);
                            if (error) throw error;
                        } else {
                            const { error } = await supabaseClient
                                .from('master_barang')
                                .insert([payload]);
                            if (error) throw error;
                        }
                    }

                    if (this.isEdit) {
                        const origKey = this.editingOriginalKode;
                        const idx = this.masterBarang.findIndex(b => b.kodeBarang === origKey || b.kodeBarang === this.modalForm.kodeBarang);
                        if (idx !== -1) {
                            this.masterBarang[idx] = { ...this.modalForm };
                        } else if (this.editIndex !== null && this.masterBarang[this.editIndex]) {
                            this.masterBarang[this.editIndex] = { ...this.modalForm };
                        } else {
                            this.masterBarang.push({ ...this.modalForm });
                        }
                    } else {
                        this.masterBarang.push({ ...this.modalForm });
                    }
                    localStorage.setItem('vortex_masterBarang', JSON.stringify(this.masterBarang));

                } else if (this.modalType === 'gudang') {
                    if (!this.modalForm.kodeGudang || !this.modalForm.namaGudang) {
                        this.showNotification('Kode Gudang dan Nama Gudang wajib diisi!', 'error');
                        return;
                    }

                    if (useSupabase) {
                        const payload = {
                            region: this.modalForm.region,
                            kode_gudang: this.modalForm.kodeGudang,
                            nama_gudang: this.modalForm.namaGudang,
                            tipe_kepemilikan: this.modalForm.tipeKepemilikan,
                            lokasi: this.modalForm.lokasi
                        };

                        if (this.isEdit) {
                            const origKey = this.editingOriginalKode || this.modalForm.kodeGudang;
                            const { error } = await supabaseClient
                                .from('master_gudang')
                                .update(payload)
                                .eq('kode_gudang', origKey);
                            if (error) throw error;
                        } else {
                            const { error } = await supabaseClient
                                .from('master_gudang')
                                .insert([payload]);
                            if (error) throw error;
                        }
                    }

                    if (this.isEdit) {
                        const origKey = this.editingOriginalKode;
                        const idx = this.masterGudang.findIndex(g => g.kodeGudang === origKey || g.kodeGudang === this.modalForm.kodeGudang);
                        if (idx !== -1) {
                            this.masterGudang[idx] = { ...this.modalForm };
                        } else if (this.editIndex !== null && this.masterGudang[this.editIndex]) {
                            this.masterGudang[this.editIndex] = { ...this.modalForm };
                        } else {
                            this.masterGudang.push({ ...this.modalForm });
                        }
                    } else {
                        this.masterGudang.push({ ...this.modalForm });
                    }
                    localStorage.setItem('vortex_masterGudang', JSON.stringify(this.masterGudang));

                } else if (this.modalType === 'project') {
                    if (this.isEdit) {
                        if (useSupabase) {
                            const payload = {
                                periode: this.modalForm.periode,
                                region: this.modalForm.region,
                                kode_project: this.modalForm.kodeProject,
                                type: this.modalForm.type,
                                no_po: this.modalForm.noPO,
                                project_name: this.modalForm.projectName
                            };
                            const origKey = this.editingOriginalKode || this.modalForm.kodeProject;
                            const { error } = await supabaseClient
                                .from('master_project')
                                .update(payload)
                                .eq('kode_project', origKey);
                            if (error) throw error;
                        }

                        const origKey = this.editingOriginalKode;
                        const idx = this.masterProject.findIndex(p => p.kodeProject === origKey || p.kodeProject === this.modalForm.kodeProject);
                        if (idx !== -1) {
                            this.masterProject[idx] = { ...this.modalForm };
                        } else if (this.editIndex !== null && this.masterProject[this.editIndex]) {
                            this.masterProject[this.editIndex] = { ...this.modalForm };
                        } else {
                            this.masterProject.push({ ...this.modalForm });
                        }
                    } else {
                        if (useSupabase) {
                            const payload = {
                                periode: this.modalForm.periode,
                                region: this.modalForm.region,
                                type: this.modalForm.type,
                                no_po: this.modalForm.noPO,
                                project_name: this.modalForm.projectName
                            };
                            const { data, error } = await supabaseClient
                                .from('master_project')
                                .insert([payload])
                                .select();
                            if (error) throw error;
                            if (data && data.length > 0) {
                                this.modalForm.kodeProject = data[0].kode_project;
                            }
                        } else {
                            this.modalForm.kodeProject = `PRJ-${this.getRegionCode(this.modalForm.region)}-${Date.now().toString(36).toUpperCase()}`;
                        }
                        this.masterProject.push({ ...this.modalForm });
                    }
                    localStorage.setItem('vortex_masterProject', JSON.stringify(this.masterProject));
                }

                if (useSupabase) {
                    this.logAudit('master_save', { type: this.modalType, data: this.modalForm });
                    await this.loadDataFromSupabase();
                }

                this.showModal = false;
                this.showNotification(useSupabase ? 'Data berhasil disimpan ke Supabase!' : 'Data berhasil disimpan (Mode Lokal)!', 'success');
            } catch (err) {
                this.showNotification('Gagal menyimpan: ' + (err.message || err), 'error');
            } finally {
                this.isLoading = false;
            }
        },

        async deleteItem(type, target) {
            if (!confirm('Hapus data ini?')) return;

            const tableMap = { barang: 'master_barang', gudang: 'master_gudang', project: 'master_project' };
            const keyMap = { barang: 'kode_barang', gudang: 'kode_gudang', project: 'kode_project' };
            const localKey = { barang: 'kodeBarang', gudang: 'kodeGudang', project: 'kodeProject' };
            const arrName = { barang: 'masterBarang', gudang: 'masterGudang', project: 'masterProject' };

            const arr = this[arrName[type]];
            let realIndex = -1;
            let item = null;

            if (typeof target === 'object' && target !== null) {
                item = target;
                realIndex = arr.findIndex(x => x[localKey[type]] === item[localKey[type]]);
            } else if (typeof target === 'number') {
                realIndex = target;
                item = arr[target];
            }

            if (!item || realIndex === -1) return;

            try {
                this.isLoading = true;
                if (supabaseClient) {
                    const { error } = await supabaseClient.from(tableMap[type]).delete().eq(keyMap[type], item[localKey[type]]);
                    if (error) throw error;
                }
                arr.splice(realIndex, 1);
                if (type === 'barang') localStorage.setItem('vortex_masterBarang', JSON.stringify(this.masterBarang));
                if (type === 'gudang') localStorage.setItem('vortex_masterGudang', JSON.stringify(this.masterGudang));
                if (type === 'project') localStorage.setItem('vortex_masterProject', JSON.stringify(this.masterProject));

                this.logAudit('master_delete', { type: type, key: item[localKey[type]] });
                this.showNotification('Data dihapus!', 'success');
                if (supabaseClient) await this.loadDataFromSupabase();
            } catch (err) {
                this.showNotification('Gagal menghapus: ' + (err.message || err), 'error');
            } finally {
                this.isLoading = false;
            }
        },

        async openInputTransaction() { 
            await this.resetInputTransaction();
            this.loadFormDraft();
            await this.generateNoTransaksi();
            this.switchTab('input-transaksi'); 
        },

        async resetInputTransaction() {
            this.editingOriginalNo = null;
            this.selectedFilesList = [];
            this.activeDropdownDrums = {};
            this.stokCache = {};
            this.drumCache = {};
            this.projectSearchText = '';
            this.newTrans = {
                tanggal: this.todayWIB(),
                noTransaksi: '',
                noReferensi: '', 
                tipeTransaksi: 'Masuk',
                gudangAsal: '', 
                gudangTujuan: '', 
                kodeProject: '', 
                keterangan: '', 
                lampiran: '', 
                lampiranUrl: '',
                staffGudang: '',
                projectManager: 'RUDI',
                namaPenerima: this.currentUser || '',
                items: [{ kategori: '', jenis: '', kodeBarang: '', namaBarang: '', drumId: '', qty: '' }]
            };
            if (this.newTrans.tipeTransaksi === 'Keluar') {
                this.newTrans.staffGudang = this.currentUser || '';
            }
            await this.generateNoTransaksi();
            this.clearFormDraft();
            const fileInput = document.getElementById('attachmentInput');
            if (fileInput) fileInput.value = '';
        },

        extractGoogleDriveFileId(url) {
            if (!url) return null;
            const regex = /(?:\/d\/|id=)([a-zA-Z0-9_-]{25,})/;
            const match = url.match(regex);
            return match ? match[1] : null;
        },

        async deleteTransaction(tx) {
            if (!tx || !tx.noTransaksi) return;

            if (!confirm(`Apakah Anda yakin ingin menghapus transaksi ${tx.noTransaksi}?\n\nPeringatan: Seluruh dampak stok gudang, drum ledger, dan material usage terkait akan dibatalkan/dihapus.`)) {
                return;
            }

            this.isLoading = true;

            try {
                if (tx.lampiranUrl) {
                    const fileId = this.extractGoogleDriveFileId(tx.lampiranUrl);
                    if (fileId && supabaseClient) {
                        try {
                            await supabaseClient.functions.invoke('trigger-gas', {
                                body: { action: 'delete', fileId: fileId }
                            });
                        } catch (driveErr) {
                            console.warn('Peringatan: Gagal menghapus file lampiran dari Google Drive:', driveErr);
                        }
                    }
                }

                if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                    // 1. Eksekusi RPC rollback transaksi di Supabase untuk memulihkan/menyesuaikan stok & drum ledger
                    const { data: rollbackData, error: rollbackErr } = await supabaseClient.rpc('delete_transaction_rollback', {
                        p_no_transaksi: tx.noTransaksi
                    });

                    if (rollbackErr) {
                        console.warn('Gagal eksekusi delete_transaction_rollback RPC:', rollbackErr.message);
                    }

                    // 2. Hapus sisa data terkait di tabel material_usage & transactions jika belum terhapus oleh RPC
                    const { error: errUsage } = await supabaseClient
                        .from('material_usage')
                        .delete()
                        .eq('transaction_no', tx.noTransaksi); 

                    if (errUsage) console.warn('Peringatan penghapusan Material Usage:', errUsage);

                    const { error: errTx } = await supabaseClient
                        .from('transactions')
                        .delete()
                        .eq('no_transaksi', tx.noTransaksi);

                    if (errTx && !rollbackErr) throw errTx;

                    this.showNotification(`Transaksi ${tx.noTransaksi} beserta data stok gudang & drum ledger terkait berhasil dibatalkan dan dihapus.`, 'success');
                    await this.logAudit('DELETE_TRANSACTION', { noTransaksi: tx.noTransaksi });

                    if (typeof this.loadDataFromSupabase === 'function') {
                        await this.loadDataFromSupabase();
                    }
                } else {
                    // Mode Offline / Lokal
                    this.revertStockOffline(tx);
                    this.transactions = this.transactions.filter(t => t.noTransaksi !== tx.noTransaksi);
                    if (this.materialUsage) {
                        this.materialUsage = this.materialUsage.filter(m => m.transactionNo !== tx.noTransaksi && m.noTransaksi !== tx.noTransaksi);
                    }

                    localStorage.setItem('vortex_transactions', JSON.stringify(this.transactions));
                    localStorage.setItem('vortex_stokGudang', JSON.stringify(this.stokGudang));
                    localStorage.setItem('vortex_drumLedger', JSON.stringify(this.drumLedger));
                    localStorage.setItem('vortex_materialUsage', JSON.stringify(this.materialUsage));

                    this.showNotification(`Transaksi ${tx.noTransaksi} berhasil dihapus dan stok telah disesuaikan (Mode Lokal).`, 'success');
                }
            } catch (error) {
                console.error('Kesalahan saat menghapus transaksi:', error);
                this.showNotification('Gagal menghapus transaksi: ' + (error.message || error), 'error');
            } finally {
                this.isLoading = false;
            }
        },

        // ============================================================
        // APPROVAL WORKFLOW (Project Manager / Super Admin)
        // Transaksi baru tersimpan sebagai 'Pending' dan stok drum/
        // stok gudang/material usage baru diterapkan setelah di-approve.
        // ============================================================
        canApprove(tx) {
            if (!tx || tx.approvalStatus !== 'Pending') return false;
            const role = (this.currentRole || '').toLowerCase();
            return this.isSuperAdmin || role.includes('project manager') || role.includes('pm') || role.includes('manager');
        },

        async approveTransaction(tx) {
            if (!tx || tx.approvalStatus !== 'Pending') return;
            if (!this.canApprove(tx)) {
                this.showNotification('Hanya Project Manager atau Super Admin yang dapat melakukan approval.', 'error');
                return;
            }
            if (!confirm(`Setujui transaksi ${tx.noTransaksi}?`)) return;

            this.isLoading = true;
            try {
                if (supabaseClient) {
                    const { data, error } = await supabaseClient.rpc('approve_transaction', {
                        p_no_transaksi: tx.noTransaksi,
                        p_approved_by: this.currentUser || ''
                    });
                    if (error) throw error;
                    if (data && data.status === 'error') throw new Error(data.message || 'Gagal approve transaksi.');

                    await this.logAudit('transaction_approve', { no: tx.noTransaksi, by: this.currentUser });
                    this.showNotification(`Transaksi ${tx.noTransaksi} telah di-approve. Stok berhasil diterapkan.`, 'success');
                    await this.loadDataFromSupabase();
                } else {
                    const localTx = this.transactions.find(t => t.noTransaksi === tx.noTransaksi);
                    if (!localTx) throw new Error('Transaksi lokal tidak ditemukan.');
                    this.applyTransactionStock(localTx);
                    localTx.approvalStatus = 'Approved';
                    localTx.approvedBy = this.currentUser || '';
                    localTx.approvedAt = new Date().toISOString();
                    localStorage.setItem('vortex_transactions', JSON.stringify(this.transactions));
                    localStorage.setItem('vortex_stokGudang', JSON.stringify(this.stokGudang));
                    localStorage.setItem('vortex_drumLedger', JSON.stringify(this.drumLedger));
                    localStorage.setItem('vortex_materialUsage', JSON.stringify(this.materialUsage));
                    this.showNotification(`Transaksi ${tx.noTransaksi} di-approve (Lokal). Stok diterapkan.`, 'success');
                }
            } catch (err) {
                console.error('Kesalahan saat approve transaksi:', err);
                this.showNotification('Gagal approve: ' + (err.message || err), 'error');
            } finally {
                this.isLoading = false;
            }
        },

        async rejectTransaction(tx) {
            if (!tx || tx.approvalStatus !== 'Pending') return;
            if (!this.canApprove(tx)) {
                this.showNotification('Hanya Project Manager atau Super Admin yang dapat melakukan rejection.', 'error');
                return;
            }
            const reason = prompt(`Tolak (reject) transaksi ${tx.noTransaksi}?\nMasukkan alasan penolakan (opsional):`, '');
            if (reason === null) return;

            this.isLoading = true;
            try {
                if (supabaseClient) {
                    const { data, error } = await supabaseClient.rpc('reject_transaction', {
                        p_no_transaksi: tx.noTransaksi,
                        p_reason: reason || '',
                        p_rejected_by: this.currentUser || ''
                    });
                    if (error) throw error;
                    if (data && data.status === 'error') throw new Error(data.message || 'Gagal reject transaksi.');

                    await this.logAudit('transaction_reject', { no: tx.noTransaksi, by: this.currentUser, reason: reason || '' });
                    this.showNotification(`Transaksi ${tx.noTransaksi} telah ditolak.`, 'info');
                    await this.loadDataFromSupabase();
                } else {
                    const localTx = this.transactions.find(t => t.noTransaksi === tx.noTransaksi);
                    if (!localTx) throw new Error('Transaksi lokal tidak ditemukan.');
                    localTx.approvalStatus = 'Rejected';
                    localTx.rejectReason = reason || '';
                    localStorage.setItem('vortex_transactions', JSON.stringify(this.transactions));
                    this.showNotification(`Transaksi ${tx.noTransaksi} ditolak (Lokal).`, 'info');
                }
            } catch (err) {
                console.error('Kesalahan saat reject transaksi:', err);
                this.showNotification('Gagal reject: ' + (err.message || err), 'error');
            } finally {
                this.isLoading = false;
            }
        },

        revertStockOffline(tx) {
            if (!tx || !tx.items) return;
            const tipe = tx.tipeTransaksi;
            const gAsal = tx.gudangAsal;
            const gTujuan = tx.gudangTujuan;

            tx.items.forEach(item => {
                const qty = parseFloat(item.qty) || 0;
                if (qty <= 0) return;
                const kat = this.getCategoryByKode(item.kodeBarang);

                if (tipe === 'Masuk' || tipe === 'Return' || tipe === 'Retur') {
                    // Revert Masuk/Retur: Kurangi stok gudang tujuan
                    this.updateStokGudang(item.kodeBarang, gTujuan, -qty);
                    if (kat === 'Cable' && item.drumId) {
                        let dIdx = this.drumLedger.findIndex(x => x.drumId === item.drumId);
                        if (dIdx !== -1) {
                            let d = this.drumLedger[dIdx];
                            let newRemaining = Math.max(0, Math.round((parseFloat(d.remainingLength || 0) - qty) * 100) / 100);
                            let newInitial = Math.max(0, Math.round((parseFloat(d.initialLength || 0) - qty) * 100) / 100);

                            if (newRemaining <= 0 || newInitial <= 0) {
                                this.drumLedger.splice(dIdx, 1);
                            } else {
                                d.remainingLength = newRemaining;
                                d.initialLength = newInitial;
                            }
                        }
                    }
                } else if (tipe === 'Keluar') {
                    // Revert Keluar: Kembalikan stok ke gudang asal
                    this.updateStokGudang(item.kodeBarang, gAsal, qty);
                    if (kat === 'Cable' && item.drumId) {
                        this.updateDrumLedger(item.drumId, qty, { kodeBarang: item.kodeBarang, namaBarang: item.namaBarang, gudang: gAsal });
                    }
                    if (tx.kodeProject && this.materialUsage) {
                        this.materialUsage = this.materialUsage.filter(m => !(m.transactionNo === tx.noTransaksi && m.drumId === item.drumId));
                    }
                } else if (tipe === 'Transfer') {
                    // Revert Transfer: Kembalikan stok ke gudang asal dan kurangi gudang tujuan
                    this.updateStokGudang(item.kodeBarang, gAsal, qty);
                    this.updateStokGudang(item.kodeBarang, gTujuan, -qty);
                    if (kat === 'Cable' && item.drumId) {
                        let d = this.drumLedger.find(x => x.drumId === item.drumId);
                        if (d) d.gudang = gAsal;
                    }
                }
            });

            // Bersihkan item stok gudang yang qty <= 0 agar saat seluruh transaksi dihapus, stokGudang bersih
            this.stokGudang = this.stokGudang.filter(s => parseFloat(s.qty) > 0);
        },

        async generateNoTransaksi() {
            if (this.editingOriginalNo) return;

            let targetWarehouseName = '';
            if (this.newTrans.tipeTransaksi === 'Masuk' || this.newTrans.tipeTransaksi === 'Return' || this.newTrans.tipeTransaksi === 'Retur') {
                targetWarehouseName = this.newTrans.gudangTujuan;
            } else {
                targetWarehouseName = this.newTrans.gudangAsal;
            }

            let kodeGudangClean = 'HQ';
            if (targetWarehouseName) {
                const wh = this.masterGudang.find(g => g.namaGudang === targetWarehouseName);
                if (wh && wh.kodeGudang) {
                    kodeGudangClean = wh.kodeGudang.replace(/-/g, '');
                } else {
                    kodeGudangClean = targetWarehouseName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                }
            }

            let typeCode = 'IN';
            if (this.newTrans.tipeTransaksi === 'Keluar') {
                typeCode = 'OUT';
            } else if (this.newTrans.tipeTransaksi === 'Return' || this.newTrans.tipeTransaksi === 'Retur') {
                typeCode = 'RET';
            } else if (this.newTrans.tipeTransaksi === 'Transfer') {
                typeCode = 'TRF';
            }

            const tglStr = this.newTrans.tanggal || this.todayWIB();
            const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(tglStr);
            const transDate = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(tglStr);
            const yy = String(transDate.getFullYear()).slice(-2);
            const mm = String(transDate.getMonth() + 1).padStart(2, '0');
            const yymm = `${yy}${mm}`;

            const prefix = `${kodeGudangClean}-${typeCode}-${yymm}-`;

            let maxSeq = 0;

            if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                try {
                    const { data, error } = await supabaseClient
                        .from('transactions')
                        .select('no_transaksi')
                        .ilike('no_transaksi', `${prefix}%`);

                    if (!error && data && data.length > 0) {
                        data.forEach(t => {
                            if (t.no_transaksi && t.no_transaksi.startsWith(prefix)) {
                                const seqNum = parseInt(t.no_transaksi.replace(prefix, ''), 10);
                                if (!isNaN(seqNum) && seqNum > maxSeq) maxSeq = seqNum;
                            }
                        });
                    }
                } catch (err) {
                    console.error('Gagal mengambil nomor transaksi dari Supabase:', err);
                }
            } else {
                this.transactions.forEach(t => {
                    if (t.noTransaksi && t.noTransaksi.startsWith(prefix)) {
                        const seqNum = parseInt(t.noTransaksi.replace(prefix, ''), 10);
                        if (!isNaN(seqNum) && seqNum > maxSeq) maxSeq = seqNum;
                    }
                });
            }

            this.newTrans.noTransaksi = `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
        },

        onTipeTransaksiChange() { 
            this.newTrans.gudangAsal = ''; 
            this.newTrans.gudangTujuan = ''; 
            if (this.newTrans.tipeTransaksi === 'Keluar') {
                this.newTrans.staffGudang = this.currentUser || '';
            } else {
                this.newTrans.staffGudang = '';
            }
            this.generateNoTransaksi(); 
        },
        resetItemsOnWarehouseChange() { 
            this.stokCache = {};
            this.drumCache = {};
            this.newTrans.items.forEach((i, idx) => {
                i.drumId = '';
                if (i.kodeBarang && this.getCategoryByKode(i.kodeBarang) === 'Cable') {
                    this.fetchDrumsForDropdown(i.kodeBarang, this.newTrans.gudangAsal, idx);
                }
            }); 
        },

        getGudangTujuanList() { 
            let list = this.masterGudang;
            if (!this.isSuperAdmin) {
                const reg = this.userRegion().toLowerCase();
                list = list.filter(g => (g.region || '').toLowerCase() === reg);
            }
            return list.filter(g => g.namaGudang !== this.newTrans.gudangAsal); 
        },

        getFilteredProjectsForAsal() { 
            if (this.isSuperAdmin) return this.masterProject;
            const reg = this.userRegion().toLowerCase();
            return this.masterProject.filter(p => (p.region || '').toLowerCase() === reg);
        },

        addTransactionItem() { this.newTrans.items.push({ kategori: '', jenis: '', kodeBarang: '', namaBarang: '', drumId: '', qty: '' }); },
        removeTransactionItem(index) {
            if (this.newTrans.items.length > 1) {
                this.newTrans.items.splice(index, 1);
                const updated = {};
                Object.keys(this.activeDropdownDrums).forEach(k => {
                    const i = parseInt(k, 10);
                    if (i < index) updated[i] = this.activeDropdownDrums[k];
                    else if (i > index) updated[i - 1] = this.activeDropdownDrums[k];
                });
                this.activeDropdownDrums = updated;
            }
        },

        getCategories() { return [...new Set(this.masterBarang.map(b => b.kategori))]; },
        getJenis(cat) { return [...new Set(this.masterBarang.filter(b => b.kategori === cat).map(b => b.jenis))]; },
        getBarangList(cat, jns) { return this.masterBarang.filter(b => b.kategori === cat && b.jenis === jns); },
        getCategoryByKode(code) { return this.masterBarang.find(b => b.kodeBarang === code)?.kategori || ''; },

        fillNamaBarang(item) { 
            item.namaBarang = this.masterBarang.find(b => b.kodeBarang === item.kodeBarang)?.namaBarang || ''; 
            if (this.getCategoryByKode(item.kodeBarang) === 'Cable') {
                this.fetchDrumsForDropdown(item.kodeBarang, this.newTrans.gudangAsal, this.newTrans.items.indexOf(item));
            }
        },

        getDrumList(item, index) {
            if (index !== undefined && index !== null && this.activeDropdownDrums[index]) {
                return this.activeDropdownDrums[index];
            }
            const gudang = this.newTrans.gudangAsal;
            if (!item || !item.kodeBarang || !gudang) return [];
            return this.drumLedger.filter(d => d.kodeBarang === item.kodeBarang && d.gudang === gudang && d.remainingLength > 0);
        },

        async fetchDrumsForDropdown(kodeBarang, gudangAsal, index) {
            if (index === undefined || index === null) return;
            if (!supabaseClient || !kodeBarang || !gudangAsal) {
                this.activeDropdownDrums = { ...this.activeDropdownDrums, [index]: [] };
                return;
            }

            try {
                const { data, error } = await supabaseClient.from('drum_ledger')
                    .select('drum_id, remaining_length')
                    .eq('kode_barang', kodeBarang)
                    .eq('gudang', gudangAsal)
                    .gt('remaining_length', 0);

                if (!error) {
                    this.activeDropdownDrums = {
                        ...this.activeDropdownDrums,
                        [index]: (data || []).map(d => ({
                            drumId: d.drum_id,
                            remainingLength: parseFloat(d.remaining_length) || 0
                        }))
                    };
                }
            } catch (err) {
                console.error("Gagal menarik daftar drum:", err);
            }
        },

        getMaxStock(item) {
            if (this.newTrans.tipeTransaksi === 'Masuk' || this.newTrans.tipeTransaksi === 'Return' || this.newTrans.tipeTransaksi === 'Retur') return 999999;
            if (!this.newTrans.gudangAsal || !item.kodeBarang) return 999999;
            if (this.getCategoryByKode(item.kodeBarang) === 'Cable' && item.drumId) {
                const localDrum = this.drumLedger.find(d => d.drumId === item.drumId);
                if (localDrum) return parseFloat(localDrum.remainingLength) || 0;
                const cachedDrum = Object.values(this.activeDropdownDrums).flat().find(d => d.drumId === item.drumId);
                if (cachedDrum) return parseFloat(cachedDrum.remainingLength) || 0;
                if (this.drumCache[item.drumId] !== undefined) return this.drumCache[item.drumId];
                this.fetchDrumRemaining(item.drumId);
                return 0;
            }
            const key = item.kodeBarang + '|' + this.newTrans.gudangAsal;
            const stok = this.stokGudang.find(s => s.kodeBarang === item.kodeBarang && s.gudang === this.newTrans.gudangAsal);
            if (stok) return parseFloat(stok.qty) || 0;
            if (this.stokCache[key] !== undefined) return this.stokCache[key];
            this.fetchStokForValidation(item.kodeBarang, this.newTrans.gudangAsal);
            return 0;
        },

        async fetchStokForValidation(kodeBarang, gudang) {
            if (!supabaseClient || !kodeBarang || !gudang) return;
            const key = kodeBarang + '|' + gudang;
            if (this._stokPending[key]) return;
            this._stokPending[key] = true;
            try {
                const { data, error } = await supabaseClient.from('stok_gudang')
                    .select('qty')
                    .eq('kode_barang', kodeBarang)
                    .eq('gudang', gudang)
                    .maybeSingle();
                if (!error) {
                    this.stokCache = { ...this.stokCache, [key]: data ? (parseFloat(data.qty) || 0) : 0 };
                }
            } catch (e) {
                console.error('Gagal memvalidasi stok:', e);
            } finally {
                delete this._stokPending[key];
            }
        },

        async fetchDrumRemaining(drumId) {
            if (!supabaseClient || !drumId) return;
            if (this._drumPending[drumId]) return;
            this._drumPending[drumId] = true;
            try {
                const { data, error } = await supabaseClient.from('drum_ledger')
                    .select('remaining_length')
                    .eq('drum_id', drumId)
                    .maybeSingle();
                if (!error) {
                    this.drumCache = { ...this.drumCache, [drumId]: data ? (parseFloat(data.remaining_length) || 0) : 0 };
                }
            } catch (e) {
                console.error('Gagal memvalidasi sisa drum:', e);
            } finally {
                delete this._drumPending[drumId];
            }
        },

        hasStockExceeded() {
            if (this.newTrans.tipeTransaksi === 'Masuk' || this.newTrans.tipeTransaksi === 'Return' || this.newTrans.tipeTransaksi === 'Retur') return false;
            return this.newTrans.items.some(item => {
                const max = this.getMaxStock(item);
                const qty = parseFloat(item.qty) || 0;
                return qty > max;
            });
        },

        handleFileSelect(event) {
            const files = event.target && event.target.files ? Array.from(event.target.files) : [];
            if (files.length === 0) {
                this.selectedFilesList = [];
                this.newTrans.lampiran = '';
                return;
            }
            this.selectedFilesList = files;
            if (files.length === 1) {
                this.newTrans.lampiran = files[0].name;
            } else {
                this.newTrans.lampiran = `${files.length} File Lampiran (Disatukan)`;
            }
        },

        clearSelectedFiles() {
            this.selectedFilesList = [];
            this.newTrans.lampiran = '';
            this.newTrans.lampiranUrl = '';
            const fileInput = document.getElementById('attachmentInput');
            if (fileInput) fileInput.value = '';
        },

        fileToDataURL(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (err) => reject(err);
                reader.readAsDataURL(file);
            });
        },

        fileToBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const raw = e.target.result;
                    const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
                    resolve(base64);
                };
                reader.onerror = (err) => reject(err);
                reader.readAsDataURL(file);
            });
        },

        getImageDimensions(dataUrl) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve({ width: img.width, height: img.height });
                img.onerror = () => resolve({ width: 800, height: 600 });
                img.src = dataUrl;
            });
        },

        async combineFilesToOnePdf(files) {
            if (!files || files.length === 0) return null;

            if (files.length === 1 && files[0].type === 'application/pdf') {
                const base64 = await this.fileToBase64(files[0]);
                return {
                    filename: files[0].name,
                    mimetype: 'application/pdf',
                    base64Data: base64
                };
            }

            try {
                const { jsPDF } = window.jspdf || {};
                if (jsPDF) {
                    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                    const pageWidth = 210;
                    const pageHeight = 297;

                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        if (i > 0) doc.addPage();

                        if (file.type.startsWith('image/')) {
                            const dataUrl = await this.fileToDataURL(file);
                            const dims = await this.getImageDimensions(dataUrl);

                            let w = dims.width;
                            let h = dims.height;
                            const margin = 10;
                            const maxW = pageWidth - (margin * 2);
                            const maxH = pageHeight - (margin * 2);

                            const scale = Math.min(maxW / w, maxH / h);
                            w = w * scale;
                            h = h * scale;

                            const x = (pageWidth - w) / 2;
                            const y = (pageHeight - h) / 2;

                            const format = file.type.includes('png') ? 'PNG' : 'JPEG';
                            doc.addImage(dataUrl, format, x, y, w, h);
                        } else {
                            doc.setFontSize(14);
                            doc.text(`Lampiran Dokumen #${i + 1}`, 15, 20);
                            doc.setFontSize(10);
                            doc.text(`Nama File: ${file.name}`, 15, 30);
                            doc.text(`Tipe: ${file.type || 'N/A'}`, 15, 37);
                            doc.text(`Ukuran: ${(file.size / 1024).toFixed(2)} KB`, 15, 44);
                        }
                    }

                    const pdfBase64 = doc.output('datauristring').split(',')[1];
                    return {
                        filename: `Lampiran_Gabungan_${Date.now()}.pdf`,
                        mimetype: 'application/pdf',
                        base64Data: pdfBase64
                    };
                }
            } catch (e) {
                console.warn('Gagal membuat PDF gabungan dengan jsPDF, menggunakan fallback:', e);
            }

            const base64 = await this.fileToBase64(files[0]);
            return {
                filename: files[0].name,
                mimetype: files[0].type || 'application/octet-stream',
                base64Data: base64
            };
        },

        updateStokGudang(kodeBarang, gudangName, delta) {
            if (!gudangName || !kodeBarang) return;
            let stokItem = this.stokGudang.find(s => s.kodeBarang === kodeBarang && s.gudang === gudangName);
            if (stokItem) {
                stokItem.qty = Math.max(0, Math.round((parseFloat(stokItem.qty || 0) + delta) * 100) / 100);
            } else if (delta > 0) {
                const brg = this.masterBarang.find(b => b.kodeBarang === kodeBarang);
                this.stokGudang.push({
                    kodeBarang: kodeBarang,
                    namaBarang: brg ? brg.namaBarang : '',
                    kategori: brg ? brg.kategori : '',
                    gudang: gudangName,
                    qty: Math.round(delta * 100) / 100,
                    sat: brg ? brg.sat : 'Pcs'
                });
            }
        },

        updateDrumLedger(drumId, delta, itemDetails = {}) {
            if (!drumId) return;
            const d = Math.round((parseFloat(delta) || 0) * 100) / 100;
            let drum = this.drumLedger.find(dr => dr.drumId === drumId);
            if (drum) {
                const currentRemaining = parseFloat(drum.remainingLength || 0);
                if (currentRemaining === 0 && d > 0) {
                    drum.initialLength = d;
                    drum.remainingLength = d;
                } else {
                    let newRemaining = Math.round((currentRemaining + d) * 100) / 100;
                    const initial = parseFloat(drum.initialLength || 0);
                    if (initial > 0 && newRemaining > initial) newRemaining = initial;
                    drum.remainingLength = Math.max(0, newRemaining);
                }
            } else if (d > 0 && itemDetails.kodeBarang) {
                this.drumLedger.push({
                    drumId: drumId,
                    kodeBarang: itemDetails.kodeBarang,
                    namaBarang: itemDetails.namaBarang || '',
                    gudang: itemDetails.gudang || '',
                    initialLength: d,
                    remainingLength: d
                });
            }
        },

        revertTransactionStock(tx) {
            this.revertStockOffline(tx);
        },

        rollbackTransaction(tx) {
            this.revertStockOffline(tx);
        },

        applyTransactionStock(tx) {
            if (!tx || !tx.items) return;
            const tipe = tx.tipeTransaksi;
            const gudangMasuk = tx.gudangTujuan;
            const gudangKeluar = tx.gudangAsal;

            tx.items.forEach(item => {
                const qty = parseFloat(item.qty) || 0;
                const kat = this.getCategoryByKode(item.kodeBarang);

                if (tipe === 'Masuk' || tipe === 'Return' || tipe === 'Retur') {
                    this.updateStokGudang(item.kodeBarang, gudangMasuk, qty);
                    if (kat === 'Cable' && item.drumId) {
                        this.updateDrumLedger(item.drumId, qty, { kodeBarang: item.kodeBarang, namaBarang: item.namaBarang, gudang: gudangMasuk });
                    }
                } else if (tipe === 'Keluar') {
                    this.updateStokGudang(item.kodeBarang, gudangKeluar, -qty);
                    if (kat === 'Cable' && item.drumId) {
                        this.updateDrumLedger(item.drumId, -qty);
                    }
                    if (tx.kodeProject) {
                        const proj = this.masterProject.find(p => p.kodeProject === tx.kodeProject);
                        this.materialUsage.push({
                            id: Date.now() + Math.random(),
                            transactionNo: tx.noTransaksi,
                            kodeProject: tx.kodeProject,
                            noPO: proj ? proj.noPO : '',
                            projectName: proj ? proj.projectName : '',
                            kodeBarang: item.kodeBarang,
                            namaBarang: item.namaBarang,
                            drumId: item.drumId || '',
                            qty: qty,
                            tanggal: tx.tanggal
                        });
                    }
                } else if (tipe === 'Transfer') {
                    this.updateStokGudang(item.kodeBarang, gudangKeluar, -qty);
                    this.updateStokGudang(item.kodeBarang, gudangMasuk, qty);
                    if (kat === 'Cable' && item.drumId) {
                        let drum = this.drumLedger.find(d => d.drumId === item.drumId);
                        if (drum) drum.gudang = gudangMasuk;
                    }
                }
            });
        },

        async submitTransaction() {
            if (this.isLoading) return;

            if (this.newTrans.gudangAsal && this.newTrans.gudangTujuan && 
                this.newTrans.gudangAsal.trim().toLowerCase() === this.newTrans.gudangTujuan.trim().toLowerCase()) {
                this.showNotification('Gudang Asal dan Gudang Tujuan tidak boleh sama!', 'error');
                return;
            }

            if (!this.newTrans.noReferensi || !this.newTrans.keterangan) {
                this.showNotification('No Referensi dan Keterangan wajib diisi!', 'error');
                return;
            }

            this.newTrans.items = this.newTrans.items.filter(i => i.kategori || i.jenis || i.kodeBarang || i.drumId || (parseFloat(i.qty) > 0));
            if (this.newTrans.items.length === 0) {
                this.showNotification('Minimal satu item material wajib diisi!', 'error');
                return;
            }

            for (const item of this.newTrans.items) {
                if (!item.kodeBarang) {
                    this.showNotification('Setiap item wajib memilih Kode Barang!', 'error');
                    return;
                }
                if (!(parseFloat(item.qty) > 0)) {
                    this.showNotification('Qty setiap item harus lebih besar dari 0!', 'error');
                    return;
                }
                // [PERBAIKAN] Retur kabel wajib mengisi Drum ID asal yang akan diretur,
                // karena nomor drum retur diturunkan dari drum asal (mis. ...-D01 -> ...-D01-01).
                if (this.getCategoryByKode(item.kodeBarang) === 'Cable' &&
                    (this.newTrans.tipeTransaksi === 'Keluar' || this.newTrans.tipeTransaksi === 'Transfer' || this.newTrans.tipeTransaksi === 'Return') &&
                    !item.drumId) {
                    this.showNotification('Item kabel wajib memilih/mengisi Drum ID untuk transaksi Keluar/Transfer/Return!', 'error');
                    return;
                }
            }

            if (this.selectedFilesList && this.selectedFilesList.length > 0) {
                if (!supabaseClient) {
                    this.showNotification('Lampiran tidak dapat diunggah tanpa koneksi Supabase. Hapus lampiran terlebih dahulu.', 'error');
                    return;
                }
                this.isLoading = true;
                try {
                    this.showNotification('Menyatukan lampiran dan mengunggah ke Google Drive...', 'info');

                    const mergedFile = await this.combineFilesToOnePdf(this.selectedFilesList);

                    if (mergedFile) {
                        const payload = {
                            filename: mergedFile.filename,
                            mimetype: mergedFile.mimetype,
                            data: mergedFile.base64Data,
                            file: mergedFile.base64Data,
                            contents: mergedFile.base64Data
                        };

                        const { data: edgeData, error: edgeError } = await supabaseClient.functions.invoke('trigger-gas', {
                            body: payload
                        });

                        if (edgeError) throw edgeError;

                        const result = typeof edgeData?.data === 'string' ? JSON.parse(edgeData.data) : (edgeData?.data || edgeData);

                        if (result && (result.status === 'success' || result.url || result.fileUrl)) {
                            const driveFileUrl = result.url || result.fileUrl || '';
                            this.newTrans.lampiranUrl = driveFileUrl;
                            this.showNotification('Lampiran berhasil disatukan & diunggah ke Google Drive!', 'success');
                        } else {
                            throw new Error((result && (result.message || result.error)) || 'Respon Google Script tidak valid.');
                        }
                    }
                } catch (err) {
                    console.error('Upload Drive Error:', err);
                    this.showNotification('Gagal mengunggah lampiran: ' + err.message, 'error');
                    this.isLoading = false;
                    return;
                }
            }

            this.newTrans.items.forEach(item => { item.qty = parseFloat(item.qty) || 0; });

            const tipe = this.newTrans.tipeTransaksi;
            const gudangMasuk = this.newTrans.gudangTujuan; 

            if (tipe === 'Masuk' || tipe === 'Return' || tipe === 'Retur') {
                let processedItems = [];
                const pendingDrumIds = new Set();
                const isReturn = (tipe === 'Return' || tipe === 'Retur');

                for (const item of this.newTrans.items) {
                    const kat = this.getCategoryByKode(item.kodeBarang);
                    let totalQty = parseFloat(item.qty) || 0;
                    const namaBrg = item.namaBarang || this.masterBarang.find(b => b.kodeBarang === item.kodeBarang)?.namaBarang || '';

                    const brgMaster = this.masterBarang.find(b => b.kodeBarang === item.kodeBarang);
                    const satuanItem = (kat === 'Cable') ? 'Meter' : ((brgMaster && brgMaster.sat) || item.satuan || 'Pcs');

                    if (kat === 'Cable' && totalQty > 0) {
                        const whObj = this.masterGudang.find(g => g.namaGudang === gudangMasuk);
                        // Ketentuan 1: NPM01 = kode Gudang TUJUAN (bukan nama gudang), tanpa tanda strip (-).
                        let whCodeClean = (whObj && whObj.kodeGudang) ? whObj.kodeGudang.replace(/-/g, '') : 'PLB';
                        // Ketentuan 2: potongan SKU mulai digit ke-6, tanpa strip.
                        // Contoh: 'ADSS-024-YOFC' -> '024YOFC'; hasil: 'NPM01-024YOFC-D01'.
                        let skuCodeClean = this.extractDrumSkuCode(item.kodeBarang);

                        // Kumpulkan drum ledger existing untuk SKU ini di gudang tujuan (untuk sequence & reuse).
                        let existingDrums = [];
                        if (supabaseClient) {
                            const { data: dbDrums } = await supabaseClient
                                .from('drum_ledger')
                                .select('drum_id, remaining_length, gudang, kode_barang')
                                .eq('kode_barang', item.kodeBarang);

                            if (dbDrums) {
                                existingDrums = dbDrums.filter(d =>
                                    d.gudang === gudangMasuk || (whObj && d.gudang === whObj.kodeGudang)
                                );
                            }
                        } else {
                            existingDrums = this.drumLedger.filter(d => d.kodeBarang === item.kodeBarang && d.gudang === gudangMasuk);
                        }

                        // ============================================================
                        // RETUR/RETURN: Drum ID asal yang diretur + nomor urut retur.
                        // Contoh: retur 'NPM01-024YOFC-D01' -> 'NPM01-024YOFC-D01-01'.
                        // ============================================================
                        if (isReturn && item.drumId && item.drumId.trim() !== '') {
                            const baseDrumId = item.drumId.trim();
                            let maxRetSeq = 0;
                            const escBase = baseDrumId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const retPattern = new RegExp('^' + escBase + '-(\\d+)$');
                            existingDrums.forEach(d => {
                                const dId = d.drum_id || d.drumId || '';
                                const m = dId.match(retPattern);
                                if (m) {
                                    const s = parseInt(m[1], 10);
                                    if (!isNaN(s) && s > maxRetSeq) maxRetSeq = s;
                                }
                            });
                            let retSeq = maxRetSeq + 1;
                            let assignedDrumId = `${baseDrumId}-${String(retSeq).padStart(2, '0')}`;
                            while (pendingDrumIds.has(assignedDrumId)) {
                                retSeq++;
                                assignedDrumId = `${baseDrumId}-${String(retSeq).padStart(2, '0')}`;
                            }
                            pendingDrumIds.add(assignedDrumId);
                            processedItems.push({ ...item, drumId: assignedDrumId, qty: totalQty, satuan: satuanItem, namaBarang: namaBrg });
                        } else if (item.drumId && item.drumId.trim() !== '') {
                            // MASUK dengan Drum ID manual yang ditentukan user sendiri.
                            pendingDrumIds.add(item.drumId.trim());
                            processedItems.push({ ...item, drumId: item.drumId.trim(), qty: totalQty, satuan: satuanItem, namaBarang: namaBrg });
                        } else {
                            // MASUK auto-generate / fallback retur tanpa Drum ID asal.
                            let remainingToAllocate = totalQty;

                            // Hitung sequence drum maksimum yang sudah ada (mendukung format lama & baru).
                            let currentMaxSeq = 0;
                            let currentMaxReturnSeq = 0;
                            const dSeqPattern = /-D(\d+)(?:-(\d+))?$/;
                            existingDrums.forEach(d => {
                                const dId = d.drum_id || d.drumId || '';
                                const m = dId.match(dSeqPattern);
                                if (m) {
                                    const drumSeq = parseInt(m[1], 10);
                                    const retSeq = m[2] ? parseInt(m[2], 10) : 0;
                                    if (!isNaN(drumSeq) && drumSeq > currentMaxSeq) currentMaxSeq = drumSeq;
                                    if (retSeq && !isNaN(retSeq) && retSeq > currentMaxReturnSeq) currentMaxReturnSeq = retSeq;
                                }
                            });
                            if (currentMaxSeq === 0) currentMaxSeq = 1;

                            while (remainingToAllocate > 0) {
                                let chunkQty = remainingToAllocate > 3000 ? 3000 : remainingToAllocate;
                                remainingToAllocate -= chunkQty;

                                let assignedDrumId = '';

                                if (isReturn) {
                                    // Format retur: NPM01-024YOFC-D01-01
                                    currentMaxReturnSeq++;
                                    assignedDrumId = `${whCodeClean}-${skuCodeClean}-D${String(currentMaxSeq).padStart(2, '0')}-${String(currentMaxReturnSeq).padStart(2, '0')}`;
                                } else {
                                    // Cek reuse drum kosong (sisa panjang 0) agar nomornya dipakai ulang.
                                    let zeroDrum = existingDrums.find(d => {
                                        const rem = d.remaining_length !== undefined ? parseFloat(d.remaining_length) : parseFloat(d.remainingLength);
                                        return rem === 0 && !pendingDrumIds.has(d.drum_id || d.drumId);
                                    });
                                    if (zeroDrum) {
                                        assignedDrumId = zeroDrum.drum_id || zeroDrum.drumId;
                                    } else {
                                        // Format normal: NPM01-024YOFC-D01
                                        currentMaxSeq++;
                                        assignedDrumId = `${whCodeClean}-${skuCodeClean}-D${String(currentMaxSeq).padStart(2, '0')}`;
                                    }
                                }

                                while (pendingDrumIds.has(assignedDrumId)) {
                                    if (isReturn) {
                                        currentMaxReturnSeq++;
                                        assignedDrumId = `${whCodeClean}-${skuCodeClean}-D${String(currentMaxSeq).padStart(2, '0')}-${String(currentMaxReturnSeq).padStart(2, '0')}`;
                                    } else {
                                        currentMaxSeq++;
                                        assignedDrumId = `${whCodeClean}-${skuCodeClean}-D${String(currentMaxSeq).padStart(2, '0')}`;
                                    }
                                }

                                pendingDrumIds.add(assignedDrumId);
                                processedItems.push({ ...item, drumId: assignedDrumId, qty: chunkQty, satuan: satuanItem, namaBarang: namaBrg });
                            }
                        }
                    } else {
                        processedItems.push({ ...item, satuan: satuanItem, namaBarang: namaBrg });
                    }
                }
                this.newTrans.items = processedItems;
            }

            if (supabaseClient) {
                try {
                    this.isLoading = true;
                    let editBackup = null;
                    if (this.editingOriginalNo) {
                        editBackup = this.transactions.find(t => t.noTransaksi === this.editingOriginalNo) || null;

                        const { data: rollbackData, error: rollbackErr } = await supabaseClient.rpc('delete_transaction_rollback', {
                            p_no_transaksi: this.editingOriginalNo
                        });
                        if (rollbackErr) throw rollbackErr;
                        if (rollbackData && rollbackData.status === 'error') {
                            throw new Error(rollbackData.message || 'Gagal melakukan rollback transaksi lama.');
                        }

                        await supabaseClient.from('material_usage').delete().eq('transaction_no', this.editingOriginalNo);
                    }

                    const { error } = await supabaseClient.rpc('submit_transaction_pending', this.buildRpcParams(this.newTrans));
                    if (error) {
                        if (editBackup) await supabaseClient.rpc('process_warehouse_transaction', this.buildRpcParams(editBackup));
                        throw error;
                    }

                    this.logAudit(this.editingOriginalNo ? 'transaction_update' : 'transaction_save', { no: this.newTrans.noTransaksi });
                    this.showNotification('Transaksi disimpan & menunggu Approval!', 'success');
                    this.clearFormDraft();
                    await this.resetInputTransaction();
                    this.switchTab('data-transaksi');
                    await this.loadDataFromSupabase();
                    return;
                } catch (err) {
                    this.showNotification('Gagal memproses transaksi: ' + (err.message || err), 'error');
                    this.isLoading = false;
                    return;
                } finally {
                    this.isLoading = false;
                }
            }

            this.newTrans.approvalStatus = 'Pending';
            this.transactions.push(JSON.parse(JSON.stringify(this.newTrans)));
            localStorage.setItem('vortex_transactions', JSON.stringify(this.transactions));
            this.showNotification('Transaksi tersimpan & menunggu approval PM/Super Admin (Lokal)!', 'success');
            this.clearFormDraft();
            await this.resetInputTransaction();
            this.switchTab('data-transaksi');
        },

        editTransaction(tx) {
            this.editingOriginalNo = tx.noTransaksi;
            this.newTrans = JSON.parse(JSON.stringify(tx));
            if (!supabaseClient && (tx.approvalStatus || 'Approved') === 'Approved') {
                this.revertStockOffline(tx);
                this.transactions = this.transactions.filter(t => t.noTransaksi !== tx.noTransaksi);
            }

            const foundProj = this.masterProject.find(p => p.kodeProject === this.newTrans.kodeProject);
            this.projectSearchText = foundProj ? foundProj.projectName : (this.newTrans.kodeProject || '');

            if (this.newTrans.items) {
                this.newTrans.items.forEach((item, idx) => {
                    if (item.kodeBarang && this.getCategoryByKode(item.kodeBarang) === 'Cable') {
                        this.fetchDrumsForDropdown(item.kodeBarang, this.newTrans.gudangAsal, idx);
                    }
                });
            }
            this.switchTab('input-transaksi');
        },

        printBAST(tx) {
            this.activeBast = tx;
            this.refreshIcons();

            // [PERBAIKAN] Nama file BAST: [No Transaksi]-[Gudang Asal]-[Gudang Tujuan].
            // Browser memakai document.title sebagai nama default file hasil print/PDF.
            const originalTitle = document.title;
            const safeName = (s) => {
                const v = String(s == null ? '' : s).replace(/[\\/:*?"<>|]/g, '_').trim();
                return v || '-';
            };
            document.title = `${safeName(tx.noTransaksi)}-${safeName(tx.gudangAsal)}-${safeName(tx.gudangTujuan)}`;
            const restoreTitle = () => {
                document.title = originalTitle;
                window.removeEventListener('afterprint', restoreTitle);
            };
            window.addEventListener('afterprint', restoreTitle);

            setTimeout(() => { window.print(); }, 300);
        },

        getExpandedBastItems() {
            let expanded = [];
            if (!this.activeBast || !this.activeBast.items) return expanded;
            let counter = 1;
            this.activeBast.items.forEach(item => {
                expanded.push({
                    no: counter++,
                    kodeBarang: item.kodeBarang,
                    namaBarang: item.namaBarang || this.masterBarang.find(b => b.kodeBarang === item.kodeBarang)?.namaBarang || '',
                    drumId: item.drumId,
                    qty: parseFloat(item.qty) || 0
                });
            });
            return expanded;
        },

        getBastProjectName(kodeProject) {
            if (!kodeProject) return '-';
            const proj = this.masterProject.find(p => p.kodeProject === kodeProject);
            return proj ? proj.projectName : kodeProject;
        },

        getBastSummaryItems() {
            let expanded = this.getExpandedBastItems();
            if (!expanded || expanded.length === 0) return [];
            let nameCounts = {};
            expanded.forEach(item => {
                let name = item.namaBarang || '-';
                nameCounts[name] = (nameCounts[name] || 0) + 1;
            });
            if (!Object.values(nameCounts).some(c => c > 1)) return [];
            let summaryMap = {};
            expanded.forEach(item => {
                let name = item.namaBarang || '-';
                summaryMap[name] = (summaryMap[name] || 0) + (parseFloat(item.qty) || 0);
            });
            let result = [];
            let counter = 1;
            for (let name in summaryMap) {
                result.push({ no: counter++, namaBarang: name, totalQty: summaryMap[name] });
            }
            return result;
        },

        async reuseDrum(drum, index) {
            const scrapQty = prompt(`Masukkan jumlah kuantitas/panjang yang di-reuse atau scrap dari drum ${drum.drumId} (Sisa: ${drum.remainingLength}m):`, drum.remainingLength);
            if (scrapQty === null) return;
            const qtyVal = parseFloat(scrapQty);
            if (isNaN(qtyVal) || qtyVal <= 0 || qtyVal > drum.remainingLength) {
                this.showNotification('Jumlah tidak valid!', 'error');
                return;
            }
            await this.catatPenggunaanKabel(drum.drumId, qtyVal);
        },

        async exportStokCSV() {
            let items = [];
            if (supabaseClient) {
                let q = supabaseClient.from('stok_gudang').select('*');
                if (this.filterStokGudang) {
                    q = q.eq('gudang', this.filterStokGudang);
                } else {
                    // [PERBAIKAN] Export tetap dibatasi region untuk non Super Admin.
                    const regionWhNames = this.getRegionalWarehouseNames();
                    if (regionWhNames) {
                        if (regionWhNames.length > 0) q = q.in('gudang', regionWhNames);
                        else q = q.eq('gudang', '__tidak_ada_gudang_region__');
                    }
                }
                const { data } = await q;
                if (data) {
                    items = data.map(s => ({ 
                        kodeBarang: s.kode_barang, 
                        namaBarang: s.nama_barang, 
                        kategori: s.kategori || this.masterBarang.find(b => b.kodeBarang === s.kode_barang)?.kategori || '', 
                        gudang: s.gudang, 
                        masuk: parseFloat(s.masuk) || 0,
                        keluar: parseFloat(s.keluar) || 0,
                        retur: parseFloat(s.retur) || 0,
                        tKeluar: parseFloat(s.t_keluar) || 0,
                        tMasuk: parseFloat(s.t_masuk) || 0,
                        qty: parseFloat(s.qty) || 0, 
                        sat: s.sat 
                    }));
                }
            } else {
                items = this.getFilteredStokGudang();
            }

            const headers = ['Kode Barang', 'Nama Barang', 'Kategori', 'Gudang', 'Masuk', 'Keluar', 'Retur', 'T.Keluar', 'T.Masuk', 'Total Stok', 'Satuan'];
            const rows = items.map(s => [
                `"${this.csvSafe(s.kodeBarang)}"`,
                `"${this.csvSafe(s.namaBarang)}"`,
                `"${this.csvSafe(s.kategori)}"`,
                `"${this.csvSafe(s.gudang)}"`,
                s.masuk || 0,
                s.keluar || 0,
                s.retur || 0,
                s.tKeluar || 0,
                s.tMasuk || 0,
                s.qty || 0,
                `"${this.csvSafe(s.sat)}"`
            ]);

            const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `stok_gudang_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        async exportUsageCSV() {
            let items = [];
            if (supabaseClient) {
                let q = supabaseClient.from('material_usage').select('*');
                const usageKw = this.sanitizeOrKeyword(this.searchMaterialUsageProject);
                if (usageKw) q = q.or(`kode_project.ilike.%${usageKw}%,project_name.ilike.%${usageKw}%`);
                // [PERBAIKAN] Export tetap dibatasi region untuk non Super Admin.
                const regionProjCodes = this.getRegionalProjectCodes();
                if (regionProjCodes) {
                    if (regionProjCodes.length > 0) q = q.in('kode_project', regionProjCodes);
                    else q = q.eq('kode_project', '__tidak_ada_project_region__');
                }
                const { data } = await q;
                if (data) items = data.map(u => ({ kodeProject: u.kode_project, noPO: u.no_po, projectName: u.project_name, namaBarang: u.nama_barang, drumId: u.drum_id, qty: u.qty, tanggal: u.tanggal }));
            } else {
                items = this.getFilteredMaterialUsage();
            }
            let csv = 'Kode Project,No PO,Project Name,Nama Barang,Drum ID,Qty Pakai,Tanggal\n';
            items.forEach(u => { csv += `"${this.csvSafe(u.kodeProject)}","${this.csvSafe(u.noPO)}","${this.csvSafe(u.projectName)}","${this.csvSafe(u.namaBarang)}","${this.csvSafe(u.drumId)}",${parseFloat(u.qty) || 0},"${this.csvSafe(u.tanggal)}"\n`; });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'material_usage.csv'; a.click();
        },

        async exportTransactionCSV() {
            this.isLoading = true;
            try {
                let selectedGudangName = this.filterStokGudang ? this.filterStokGudang.replace(/[^a-zA-Z0-9]/g, '_') : 'All';
                let fileName = 'data_transaksi_' + selectedGudangName + '.csv';

                let txsToExport = [];
                let client = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null) || this.supabase;

                if (client) {
                    let txQuery = client.from('transactions').select('*');
                    const txKw = this.sanitizeOrKeyword(this.searchNoTransaksi);
                    if (txKw) {
                        txQuery = txQuery.or('no_transaksi.ilike.%' + txKw + '%,no_referensi.ilike.%' + txKw + '%');
                    }
                    // [PERBAIKAN] Export tetap dibatasi region untuk non Super Admin.
                    const regionWhNames = this.getRegionalWarehouseNames();
                    if (regionWhNames) {
                        if (regionWhNames.length > 0) {
                            const whList = regionWhNames.map(n => '"' + String(n).replace(/"/g, '\\"') + '"').join(',');
                            txQuery = txQuery.or('gudang_asal.in.(' + whList + '),gudang_tujuan.in.(' + whList + ')');
                        } else {
                            txQuery = txQuery.or('gudang_asal.eq.__tidak_ada_gudang_region__,gudang_tujuan.eq.__tidak_ada_gudang_region__');
                        }
                    }
                    let response = await txQuery.order('tanggal', { ascending: false }).range(0, 9999);
                    let allTxData = response.data;
                    let error = response.error;
                    if (error) throw error;

                    if (allTxData && allTxData.length > 0) {
                        txsToExport = allTxData.map(t => ({
                            noTransaksi: t.no_transaksi, 
                            tanggal: t.tanggal, 
                            noReferensi: t.no_referensi,
                            tipeTransaksi: t.tipe_transaksi, 
                            gudangAsal: t.gudang_asal,
                            gudangTujuan: t.gudang_tujuan,
                            kodeProject: t.kode_project,
                            keterangan: t.keterangan,
                            staffGudang: t.staff_gudang,
                            projectManager: t.project_manager,
                            namaPenerima: t.nama_penerima,
                            items: this.safeParseItems(t.items)
                        }));
                    }
                } else {
                    txsToExport = this.getFilteredTransactions();
                }

                let csv = 'No Transaksi,Tanggal,No Referensi,Tipe Transaksi,Gudang Asal,Gudang Tujuan,Kode Project,Keterangan,Staff Gudang,Project Manager,Nama Penerima,Kode Barang,Nama Barang,Drum ID,Qty\n';
                txsToExport.forEach(tx => {
                    const cs = (v) => this.csvSafe(v);
                    const items = tx.items || [];
                    if (items.length === 0) {
                         csv += `"${cs(tx.noTransaksi)}","${cs(tx.tanggal)}","${cs(tx.noReferensi)}","${cs(tx.tipeTransaksi)}","${cs(tx.gudangAsal)}","${cs(tx.gudangTujuan)}","${cs(tx.kodeProject)}","${cs(tx.keterangan)}","${cs(tx.staffGudang)}","${cs(tx.projectManager)}","${cs(tx.namaPenerima)}","","","",0\n`;
                    } else {
                        items.forEach(i => {
                            csv += `"${cs(tx.noTransaksi)}","${cs(tx.tanggal)}","${cs(tx.noReferensi)}","${cs(tx.tipeTransaksi)}","${cs(tx.gudangAsal)}","${cs(tx.gudangTujuan)}","${cs(tx.kodeProject)}","${cs(tx.keterangan)}","${cs(tx.staffGudang)}","${cs(tx.projectManager)}","${cs(tx.namaPenerima)}","${cs(i.kodeBarang)}","${cs(i.namaBarang)}","${cs(i.drumId)}",${parseFloat(i.qty) || 0}\n`;
                        });
                    }
                });

                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); 
                a.href = url; 
                a.download = fileName; 
                a.click();
                URL.revokeObjectURL(url);
            } catch (err) {
                console.error("Gagal mengekspor CSV:", err);
                this.showNotification("Gagal mengekspor data transaksi ke CSV: " + (err.message || err), "error");
            } finally {
                this.isLoading = false;
            }
        }
    };
}
