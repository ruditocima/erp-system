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
        googleScriptUrl: 'https://script.google.com/macros/s/AKfycbyOBAU4bomHpIg8omX-b9DptAAc8dgdFn9qlJcfdIFoImUcuhnNCjndnutG9LB3As7k/exec',

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
                p_items: tx.items || []
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

            this.$watch('filterStokGudang', () => { this.pageStok = 1; this.pageDrum = 1; if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('searchMaterialUsageProject', () => { this.pageUsage = 1; if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('searchNoTransaksi', () => { this.pageTx = 1; if(supabaseClient) this.loadDataFromSupabase(); });

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

        paginate(items, page, size) {
            const start = (page - 1) * size;
            return items.slice(start, start + size);
        },
        totalPages(items, size) {
            return Math.ceil(items.length / size) || 1;
        },

        getPaginatedStokGudang() {
            if (supabaseClient) return this.stokGudang;
            return this.paginate(this.getFilteredStokGudang(), this.pageStok, this.pageSizeStok);
        },
        getPaginatedDrumLedger() {
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
            try {
                // 1. Load Master Project
                const { data: projectData } = await supabaseClient.from('master_project').select('*');
                if (projectData) {
                    this.masterProject = projectData.map(p => ({
                        periode: p.periode, region: p.region, kodeProject: p.kode_project,
                        type: p.type, noPO: p.no_po, projectName: p.project_name
                    }));
                }

                // 2. Load Master Barang
                const { data: barangData } = await supabaseClient.from('master_barang').select('*');
                if (barangData) {
                    this.masterBarang = barangData.map(b => ({
                        kategori: b.kategori, jenis: b.jenis, kodeBarang: b.kode_barang,
                        namaBarang: b.nama_barang, sat: b.sat
                    }));
                }

                // 3. Load Master Gudang
                const { data: gudangData } = await supabaseClient.from('master_gudang').select('*');
                if (gudangData) {
                    this.masterGudang = gudangData.map(g => ({
                        region: g.region || '', kodeGudang: g.kode_gudang,
                        namaGudang: g.nama_gudang, tipeKepemilikan: g.tipe_kepemilikan, lokasi: g.lokasi
                    }));
                }

                // 4. Load Stok Gudang
                let stockQuery = supabaseClient.from('stok_gudang').select('*', { count: 'exact' });
                if (this.filterStokGudang) {
                    stockQuery = stockQuery.eq('gudang', this.filterStokGudang);
                }
                const fromStok = (this.pageStok - 1) * this.pageSizeStok;
                const { data: stockData, count: countStok } = await stockQuery.order('kode_barang', { ascending: true }).range(fromStok, fromStok + this.pageSizeStok - 1);
                if (stockData) {
                    this.stokGudang = stockData.map(s => ({
                        kodeBarang: s.kode_barang, namaBarang: s.nama_barang,
                        kategori: s.kategori, gudang: s.gudang, qty: parseFloat(s.qty) || 0, sat: s.sat
                    }));
                    this.totalStokCount = countStok !== null ? countStok : stockData.length;
                }

                // 5. Load Drum Ledger
                let drumQuery = supabaseClient.from('drum_ledger').select('*', { count: 'exact' });
                if (this.filterStokGudang) drumQuery = drumQuery.eq('gudang', this.filterStokGudang);
                if (this.selectedCableKode) drumQuery = drumQuery.eq('kode_barang', this.selectedCableKode);
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

                // 6. LOAD MATERIAL USAGE
                let usageQuery = supabaseClient.from('material_usage').select('*', { count: 'exact' });
                if (this.searchMaterialUsageProject) {
                    usageQuery = usageQuery.or(`kode_project.ilike.%${this.searchMaterialUsageProject}%,project_name.ilike.%${this.searchMaterialUsageProject}%`);
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

                // 7. Load Data Transaksi
                let txQuery = supabaseClient.from('transactions').select('*', { count: 'exact' });
                if (this.searchNoTransaksi) txQuery = txQuery.or(`no_transaksi.ilike.%${this.searchNoTransaksi}%,no_referensi.ilike.%${this.searchNoTransaksi}%`);
                const fromTx = (this.pageTx - 1) * this.pageSizeTx;
                const { data: txData, count: countTx } = await txQuery.order('tanggal', { ascending: false }).range(fromTx, fromTx + this.pageSizeTx - 1);
                if (txData) {
                    this.transactions = txData.map(t => ({
                        noTransaksi: t.no_transaksi, tanggal: t.tanggal, noReferensi: t.no_referensi,
                        tipeTransaksi: t.tipe_transaksi, gudangAsal: t.gudang_asal, gudangTujuan: t.gudang_tujuan,
                        kodeProject: t.kode_project, keterangan: t.keterangan, staffGudang: t.staff_gudang,
                        projectManager: t.project_manager, namaPenerima: t.nama_penerima, lampiranUrl: t.lampiran_url,
                        items: typeof t.items === 'string' ? JSON.parse(t.items) : (t.items || [])
                    }));
                    this.totalTxCount = countTx !== null ? countTx : txData.length;
                }

            } catch (err) {
                console.error('Gagal memuat data dari Supabase:', err);
            } finally {
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
                window.location.href = window.location.pathname;
            }
        },

        switchTab(tabName) {
            this.currentTab = tabName;
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
                this.showNotification('Profil diperbarui (Lokal)!', 'success');
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
            this.modalType = type; this.isEdit = false; this.editIndex = null;
            if (type === 'project') {
                this.modalForm = { periode: this.todayWIB(), region: '', kodeProject: '(Otomatis dari Sistem)', type: 'Main Feeder', noPO: '', projectName: '' };
                await this.generateKodeProject();
            } else if (type === 'barang') {
                this.modalForm = { kategori: '', jenis: '', kodeBarang: '', namaBarang: '', sat: 'Pcs' };
            } else if (type === 'gudang') {
                this.modalForm = { region: '', kodeGudang: '', namaGudang: '', tipeKepemilikan: 'Milik Sendiri', lokasi: '' };
            }
            this.showModal = true; this.refreshIcons();
        },

        openEditModal(type, index) {
            this.modalType = type; this.isEdit = true; this.editIndex = index;
            if (type === 'project') this.modalForm = { ...this.masterProject[index] };
            if (type === 'barang') this.modalForm = { ...this.masterBarang[index] };
            if (type === 'gudang') this.modalForm = { ...this.masterGudang[index] };
            this.showModal = true; this.refreshIcons();
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

        async simpanMasterProject() {
            const regionEl = document.getElementById('projectRegionInput');
            const periodeEl = document.getElementById('projectPeriodeInput');
            const projectNameEl = document.getElementById('projectNameInput');

            const payload = {
                region: regionEl ? regionEl.value : this.modalForm.region,
                periode: periodeEl ? periodeEl.value : this.modalForm.periode,
                project_name: projectNameEl ? projectNameEl.value : this.modalForm.projectName
            };

            const { data, error } = await supabaseClient
                .from('master_project')
                .insert([payload])
                .select();

            if (error) {
                alert('Gagal menyimpan project: ' + error.message);
            } else {
                alert(`Project berhasil disimpan dengan kode: ${data[0].kode_project}`);
            }
        },

        async saveModalData() {
            if (!supabaseClient) {
                this.showNotification('Koneksi Supabase tidak tersedia!', 'error');
                return;
            }

            try {
                this.isLoading = true;
                if (this.modalType === 'barang') {
                    const payload = {
                        kategori: this.modalForm.kategori,
                        jenis: this.modalForm.jenis,
                        kode_barang: this.modalForm.kodeBarang,
                        nama_barang: this.modalForm.namaBarang,
                        sat: this.modalForm.sat
                    };
                    const { error } = await supabaseClient.from('master_barang').upsert(payload, { onConflict: 'kode_barang' });
                    if (error) throw error;
                    if (this.isEdit) {
                        this.masterBarang[this.editIndex] = { ...this.modalForm };
                    } else {
                        this.masterBarang.push({ ...this.modalForm });
                    }
                    localStorage.setItem('vortex_masterBarang', JSON.stringify(this.masterBarang));
                } else if (this.modalType === 'gudang') {
                    const payload = {
                        region: this.modalForm.region,
                        kode_gudang: this.modalForm.kodeGudang,
                        nama_gudang: this.modalForm.namaGudang,
                        tipe_kepemilikan: this.modalForm.tipeKepemilikan,
                        lokasi: this.modalForm.lokasi
                    };
                    const { error } = await supabaseClient.from('master_gudang').upsert(payload, { onConflict: 'kode_gudang' });
                    if (error) throw error;
                    if (this.isEdit) {
                        this.masterGudang[this.editIndex] = { ...this.modalForm };
                    } else {
                        this.masterGudang.push({ ...this.modalForm });
                    }
                    localStorage.setItem('vortex_masterGudang', JSON.stringify(this.masterGudang));
                } else if (this.modalType === 'project') {
                    if (this.isEdit) {
                        const payload = {
                            periode: this.modalForm.periode,
                            region: this.modalForm.region,
                            kode_project: this.modalForm.kodeProject,
                            type: this.modalForm.type,
                            no_po: this.modalForm.noPO,
                            project_name: this.modalForm.projectName
                        };
                        const { error } = await supabaseClient.from('master_project').upsert(payload, { onConflict: 'kode_project' });
                        if (error) throw error;
                        this.masterProject[this.editIndex] = { ...this.modalForm };
                    } else {
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
                        this.masterProject.push({ ...this.modalForm });
                    }
                    localStorage.setItem('vortex_masterProject', JSON.stringify(this.masterProject));
                }

                this.logAudit('master_save', { type: this.modalType, data: this.modalForm });
                this.showModal = false;
                this.showNotification('Data berhasil disimpan ke Supabase!', 'success');
            } catch (err) {
                this.showNotification('Gagal menyimpan: ' + (err.message || err), 'error');
            } finally {
                this.isLoading = false;
            }
        },

        async deleteItem(type, index) {
            if (!confirm('Hapus data ini?')) return;

            const tableMap = { barang: 'master_barang', gudang: 'master_gudang', project: 'master_project' };
            const keyMap = { barang: 'kode_barang', gudang: 'kode_gudang', project: 'kode_project' };
            const localKey = { barang: 'kodeBarang', gudang: 'kodeGudang', project: 'kodeProject' };
            const arrName = { barang: 'masterBarang', gudang: 'masterGudang', project: 'masterProject' };

            const arr = this[arrName[type]];
            const item = arr ? arr[index] : null;
            if (!item) return;

            try {
                this.isLoading = true;
                if (supabaseClient) {
                    const { error } = await supabaseClient.from(tableMap[type]).delete().eq(keyMap[type], item[localKey[type]]);
                    if (error) throw error;
                }
                arr.splice(index, 1);
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

        openInputTransaction() { 
            this.resetInputTransaction();
            this.loadFormDraft();
            this.switchTab('input-transaksi'); 
        },

        async resetInputTransaction() {
            this.editingOriginalNo = null;
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

        async deleteTransaction(tx) {
            if (!confirm(`Apakah Anda yakin ingin menghapus transaksi "${tx.noTransaksi}"? Data stok, usage, dan drum ledger terkait akan di-rollback.`)) {
                return;
            }

            this.isLoading = true;
            try {
                if (supabaseClient) {
                    const { data, error } = await supabaseClient.rpc('delete_transaction_rollback', {
                        p_no_transaksi: tx.noTransaksi
                    });

                    if (error) throw error;

                    if (data && data.status === 'error') {
                        this.showNotification(data.message, 'error');
                        return;
                    }

                    this.showNotification('Transaksi & data terkait berhasil dihapus!', 'success');
                    await this.logAudit('DELETE_TRANSACTION', { noTransaksi: tx.noTransaksi });
                    await this.loadDataFromSupabase();
                } else {
                    this.revertStockOffline(tx);
                    this.transactions = this.transactions.filter(t => t.noTransaksi !== tx.noTransaksi);
                    this.materialUsage = this.materialUsage.filter(m => m.kodeProject !== tx.kodeProject && m.noTransaksi !== tx.noTransaksi);
                    
                    localStorage.setItem('vortex_transactions', JSON.stringify(this.transactions));
                    localStorage.setItem('vortex_stokGudang', JSON.stringify(this.stokGudang));
                    localStorage.setItem('vortex_drumLedger', JSON.stringify(this.drumLedger));
                    localStorage.setItem('vortex_materialUsage', JSON.stringify(this.materialUsage));

                    this.showNotification('Transaksi dihapus & stok dikembalikan (Offline Mode).', 'success');
                }
            } catch (err) {
                console.error('Gagal menghapus transaksi:', err);
                this.showNotification('Gagal menghapus transaksi: ' + (err.message || err), 'error');
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

                if (tipe === 'Keluar') {
                    let s = this.stokGudang.find(x => x.kodeBarang === item.kodeBarang && x.gudang === gAsal);
                    if (s) s.qty += qty;
                    if (item.drumId) {
                        let d = this.drumLedger.find(x => x.drumId === item.drumId);
                        if (d) d.remainingLength += qty;
                    }
                } else if (tipe === 'Masuk') {
                    let s = this.stokGudang.find(x => x.kodeBarang === item.kodeBarang && x.gudang === gTujuan);
                    if (s) s.qty = Math.max(0, s.qty - qty);
                    if (item.drumId) {
                        let d = this.drumLedger.find(x => x.drumId === item.drumId);
                        if (d) {
                            d.remainingLength = Math.max(0, d.remainingLength - qty);
                            d.initialLength = Math.max(0, d.initialLength - qty);
                        }
                    }
                } else if (tipe === 'Transfer') {
                    let sAsal = this.stokGudang.find(x => x.kodeBarang === item.kodeBarang && x.gudang === gAsal);
                    if (sAsal) sAsal.qty += qty;
                    let sTuj = this.stokGudang.find(x => x.kodeBarang === item.kodeBarang && x.gudang === gTujuan);
                    if (sTuj) sTuj.qty = Math.max(0, sTuj.qty - qty);
                    if (item.drumId) {
                        let d = this.drumLedger.find(x => x.drumId === item.drumId);
                        if (d) d.gudang = gAsal;
                    }
                }
            });
        },

        async generateNoTransaksi() {
            if (this.editingOriginalNo) return;
            if (!supabaseClient) {
                const dateStr = (this.newTrans.tanggal || this.todayWIB()).replace(/-/g, '').substring(0, 6);
                const typeCode = this.newTrans.tipeTransaksi === 'Masuk' ? 'IN' : (this.newTrans.tipeTransaksi === 'Keluar' ? 'OUT' : 'TRF');
                const prefix = `ACM-${typeCode}-${dateStr}-`;
                let maxSeq = 0;
                this.transactions.forEach(t => {
                    if (t.noTransaksi && t.noTransaksi.startsWith(prefix)) {
                        const seqNum = parseInt(t.noTransaksi.replace(prefix, ''), 10);
                        if (!isNaN(seqNum) && seqNum > maxSeq) maxSeq = seqNum;
                    }
                });
                this.newTrans.noTransaksi = `${prefix}${String(maxSeq + 1).padStart(2, '0')}`;
                return;
            }

            try {
                const typeCode = this.newTrans.tipeTransaksi === 'Masuk' ? 'IN' : (this.newTrans.tipeTransaksi === 'Keluar' ? 'OUT' : 'TRF');
                const { data, error } = await supabaseClient.rpc('generate_no_transaksi', { p_tipe: typeCode });
                if (error) throw error;
                this.newTrans.noTransaksi = data;
            } catch (err) {
                console.error('Gagal generate nomor transaksi:', err.message);
                const dateStr = (this.newTrans.tanggal || this.todayWIB()).replace(/-/g, '').substring(0, 6);
                const typeCode = this.newTrans.tipeTransaksi === 'Masuk' ? 'IN' : (this.newTrans.tipeTransaksi === 'Keluar' ? 'OUT' : 'TRF');
                const prefix = `ACM-${typeCode}-${dateStr}-`;
                let maxSeq = 0;
                this.transactions.forEach(t => {
                    if (t.noTransaksi && t.noTransaksi.startsWith(prefix)) {
                        const seqNum = parseInt(t.noTransaksi.replace(prefix, ''), 10);
                        if (!isNaN(seqNum) && seqNum > maxSeq) maxSeq = seqNum;
                    }
                });
                this.newTrans.noTransaksi = `${prefix}${String(maxSeq + 1).padStart(2, '0')}`;
            }
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
        resetItemsOnWarehouseChange() { this.newTrans.items.forEach(i => i.drumId = ''); },
        
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
        removeTransactionItem(index) { if (this.newTrans.items.length > 1) this.newTrans.items.splice(index, 1); },

        getCategories() { return [...new Set(this.masterBarang.map(b => b.kategori))]; },
        getJenis(cat) { return [...new Set(this.masterBarang.filter(b => b.kategori === cat).map(b => b.jenis))]; },
        getBarangList(cat, jns) { return this.masterBarang.filter(b => b.kategori === cat && b.jenis === jns); },
        getCategoryByKode(code) { return this.masterBarang.find(b => b.kodeBarang === code)?.kategori || ''; },
        fillNamaBarang(item) { item.namaBarang = this.masterBarang.find(b => b.kodeBarang === item.kodeBarang)?.namaBarang || ''; },
        getDrumList(item) { return this.drumLedger.filter(d => d.kodeBarang === item.kodeBarang && d.gudang === this.newTrans.gudangAsal && d.remainingLength > 0); },

        getMaxStock(item) {
            if (this.newTrans.tipeTransaksi === 'Masuk') return 999999;
            if (!this.newTrans.gudangAsal || !item.kodeBarang) return 999999;
            if (this.getCategoryByKode(item.kodeBarang) === 'Cable' && item.drumId) {
                const drum = this.drumLedger.find(d => d.drumId === item.drumId);
                return drum ? drum.remainingLength : 0;
            }
            const stok = this.stokGudang.find(s => s.kodeBarang === item.kodeBarang && s.gudang === this.newTrans.gudangAsal);
            return stok ? stok.qty : 0;
        },

        hasStockExceeded() {
            if (this.newTrans.tipeTransaksi === 'Masuk') return false;
            return this.newTrans.items.some(item => {
                const max = this.getMaxStock(item);
                const qty = parseFloat(item.qty) || 0;
                return qty > max;
            });
        },

        async handleFileUpload(event) {
    const file = event.target && event.target.files ? event.target.files[0] : null;
    
    // Jika pengguna membatalkan pilihan file
    if (!file) {
        this.newTrans.lampiran = '';
        this.newTrans.lampiranUrl = '';
        return;
    }

    this.isLoading = true;
    try {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const rawResult = e && e.target ? e.target.result : null;
                
                if (!rawResult || typeof rawResult !== 'string') {
                    throw new Error('Isi file tidak terbaca atau format tidak valid.');
                }

                // Ambil string Base64 murni
                let base64Data = rawResult.includes(',') ? rawResult.split(',')[1] : rawResult;

                if (!base64Data) {
                    throw new Error('Gagal memproses data Base64 file.');
                }

                // Payload lengkap dengan variasi key agar cocok dengan Google Apps Script
                const payload = {
                    filename: file.name || 'attachment',
                    mimetype: file.type || 'application/octet-stream',
                    data: base64Data,
                    file: base64Data,      // Fallback jika GAS membaca json.file
                    contents: base64Data  // Fallback jika GAS membaca json.contents
                };

                const response = await fetch(this.googleScriptUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();
                
                if (result && (result.status === 'success' || result.url || result.fileUrl)) {
                    this.newTrans.lampiranUrl = result.url || result.fileUrl || '';
                    this.showNotification('File berhasil diunggah!', 'success');
                } else {
                    throw new Error((result && (result.message || result.error)) || 'Respon Google Script tidak valid.');
                }
            } catch (err) {
                console.error('Upload Error:', err);
                this.showNotification('Gagal unggah file: ' + err.message, 'error');
            } finally {
                this.isLoading = false;
            }
        };

        reader.onerror = (err) => {
            console.error('FileReader Error:', err);
            this.showNotification('Gagal membaca file dari perangkat.', 'error');
            this.isLoading = false;
        };

        reader.readAsDataURL(file);
    } catch (err) {
        console.error('Upload Error:', err);
        this.showNotification('Gagal unggah file: ' + err.message, 'error');
        this.isLoading = false;
    }
},

                reader.onerror = (err) => {
                    console.error('FileReader Error:', err);
                    this.showNotification('Gagal membaca file dari perangkat.', 'error');
                    this.isLoading = false;
                };

                reader.readAsDataURL(file);
            } catch (err) {
                console.error('Upload Error:', err);
                this.showNotification('Gagal unggah file: ' + err.message, 'error');
                this.isLoading = false;
            }
        },

        async uploadAttachment(fileInput, transactionId) {
            const file = fileInput.files[0];
            if (!file) return null;
            const fileExt = file.name.split('.').pop();
            const fileName = `tx_${transactionId}_${Date.now()}.${fileExt}`;
            const filePath = `documents/${fileName}`;

            const { data, error } = await supabaseClient.storage.from('attachments').upload(filePath, file);
            if (error) {
                this.showNotification('Gagal mengunggah lampiran ke server.', 'error');
                return null;
            }
            const { data: publicUrlData } = supabaseClient.storage.from('attachments').getPublicUrl(filePath);
            return publicUrlData.publicUrl;
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
            let drum = this.drumLedger.find(d => d.drumId === drumId);
            if (drum) {
                drum.remainingLength = Math.max(0, Math.round((parseFloat(drum.remainingLength || 0) + delta) * 100) / 100);
            } else if (delta > 0 && itemDetails.kodeBarang) {
                this.drumLedger.push({
                    drumId: drumId,
                    kodeBarang: itemDetails.kodeBarang,
                    namaBarang: itemDetails.namaBarang || '',
                    gudang: itemDetails.gudang || '',
                    initialLength: delta,
                    remainingLength: delta
                });
            }
        },

        revertTransactionStock(tx) {
            if (!tx || !tx.items) return;
            this.rollbackTransaction(tx);
        },

        rollbackTransaction(tx) {
            if (!tx || !tx.items) return;
            const tipe = tx.tipeTransaksi;
            const gudangMasuk = tx.gudangTujuan;
            const gudangKeluar = tx.gudangAsal;

            tx.items.forEach(item => {
                const qty = parseFloat(item.qty) || 0;
                const kat = this.getCategoryByKode(item.kodeBarang);

                if (tipe === 'Masuk') {
                    this.updateStokGudang(item.kodeBarang, gudangMasuk, -qty);
                    if (kat === 'Cable' && item.drumId) {
                        let drum = this.drumLedger.find(d => d.drumId === item.drumId);
                        if (drum) {
                            drum.remainingLength = Math.max(0, Math.round((parseFloat(drum.remainingLength || 0) - qty) * 100) / 100);
                            if (drum.remainingLength === 0 && drum.initialLength === qty) {
                                this.drumLedger = this.drumLedger.filter(d => d.drumId !== item.drumId);
                            }
                        }
                    }
                } else if (tipe === 'Keluar') {
                    this.updateStokGudang(item.kodeBarang, gudangKeluar, qty);
                    if (kat === 'Cable' && item.drumId) {
                        this.updateDrumLedger(item.drumId, qty, { kodeBarang: item.kodeBarang, namaBarang: item.namaBarang, gudang: gudangKeluar });
                    }
                    if (tx.kodeProject) {
                        this.materialUsage = this.materialUsage.filter(u => !(u.transactionNo === tx.noTransaksi && u.drumId === item.drumId));
                    }
                } else if (tipe === 'Transfer') {
                    this.updateStokGudang(item.kodeBarang, gudangKeluar, qty);
                    this.updateStokGudang(item.kodeBarang, gudangMasuk, -qty);
                    if (kat === 'Cable' && item.drumId) {
                        let drum = this.drumLedger.find(d => d.drumId === item.drumId);
                        if (drum) drum.gudang = gudangKeluar;
                    }
                }
            });
            this.stokGudang = this.stokGudang.filter(s => s.qty > 0);
        },

        applyTransactionStock(tx) {
            if (!tx || !tx.items) return;
            const tipe = tx.tipeTransaksi;
            const gudangMasuk = tx.gudangTujuan;
            const gudangKeluar = tx.gudangAsal;

            tx.items.forEach(item => {
                const qty = parseFloat(item.qty) || 0;
                const kat = this.getCategoryByKode(item.kodeBarang);

                if (tipe === 'Masuk') {
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

            const fileInput = document.getElementById('attachmentInput');
            if (fileInput && fileInput.files.length > 0) {
                const uploadedUrl = await this.uploadAttachment(fileInput, this.newTrans.noTransaksi);
                if (uploadedUrl) {
                    if (this.newTrans.lampiranUrl && String(this.newTrans.lampiranUrl).startsWith('blob:')) {
                        URL.revokeObjectURL(this.newTrans.lampiranUrl);
                    }
                    this.newTrans.lampiranUrl = uploadedUrl;
                    this.newTrans.lampiran = fileInput.files[0].name;
                }
            }

            this.newTrans.items.forEach(item => { item.qty = parseFloat(item.qty) || 0; });

            const tipe = this.newTrans.tipeTransaksi;
            const gudangMasuk = this.newTrans.gudangTujuan; 

            if (tipe === 'Masuk') {
                let processedItems = [];
                this.newTrans.items.forEach(item => {
                    const kat = this.getCategoryByKode(item.kodeBarang);
                    let totalQty = parseFloat(item.qty) || 0;
                    const namaBrg = item.namaBarang || this.masterBarang.find(b => b.kodeBarang === item.kodeBarang)?.namaBarang || '';
        
                    const satuanItem = (kat === 'Cable') ? 'Meter' : (item.satuan || 'Pcs');

                    if (kat === 'Cable' && totalQty > 0) {
                        const whObj = this.masterGudang.find(g => g.namaGudang === gudangMasuk);
                        let whCode = whObj && whObj.kodeGudang ? whObj.kodeGudang.split('-')[0].toUpperCase() : 'PLB';
                        const threeCharBarang = item.kodeBarang ? item.kodeBarang.split('-').pop() : '036';

                        if (item.drumId && item.drumId.trim() !== '') {
                            processedItems.push({ ...item, drumId: item.drumId, qty: totalQty, satuan: satuanItem, namaBarang: namaBrg });
                        } else {
                            let remainingToAllocate = totalQty;
                            let temporaryAssignedDrums = [];

                            const existingDrums = this.drumLedger.filter(d => d.kodeBarang === item.kodeBarang && d.gudang === gudangMasuk);
                            let currentMaxSeq = 0;
                            existingDrums.forEach(d => {
                                const parts = d.drumId.split('-D');
                                if (parts.length > 1) {
                                    const seqNum = parseInt(parts[parts.length - 1], 10);
                                    if (!isNaN(seqNum) && seqNum > currentMaxSeq) currentMaxSeq = seqNum;
                                }
                            });

                            while (remainingToAllocate > 0) {
                                let chunkQty = remainingToAllocate > 3000 ? 3000 : remainingToAllocate;
                                remainingToAllocate -= chunkQty;

                                let zeroDrum = this.drumLedger.find(d => d.kodeBarang === item.kodeBarang && d.gudang === gudangMasuk && d.remainingLength === 0 && !temporaryAssignedDrums.includes(d.drumId));
                                let assignedDrumId = '';

                                if (zeroDrum) {
                                    assignedDrumId = zeroDrum.drumId;
                                } else {
                                    currentMaxSeq++; 
                                    assignedDrumId = `${whCode}-${threeCharBarang}-D${String(currentMaxSeq).padStart(2, '0')}`;
                                }
                    
                                temporaryAssignedDrums.push(assignedDrumId);
                                processedItems.push({ ...item, drumId: assignedDrumId, qty: chunkQty, satuan: satuanItem, namaBarang: namaBrg });
                            }
                        }
                    } else {
                        processedItems.push({ ...item, satuan: satuanItem, namaBarang: namaBrg });
                    }
                });
                this.newTrans.items = processedItems;
            }
            if (supabaseClient) {
                try {
                    this.isLoading = true;
                    let editBackup = null;
                    if (this.editingOriginalNo) {
                        editBackup = this.transactions.find(t => t.noTransaksi === this.editingOriginalNo) || null;
                        await supabaseClient.from('transactions').delete().eq('no_transaksi', this.editingOriginalNo);
                        await supabaseClient.from('material_usage').delete().eq('transaction_no', this.editingOriginalNo);
                    }

                    const { error } = await supabaseClient.rpc('process_warehouse_transaction', this.buildRpcParams(this.newTrans));
                    if (error) {
                        if (editBackup) await supabaseClient.rpc('process_warehouse_transaction', this.buildRpcParams(editBackup));
                        throw error;
                    }

                    this.logAudit(this.editingOriginalNo ? 'transaction_update' : 'transaction_save', { no: this.newTrans.noTransaksi });
                    this.showNotification('Transaksi berhasil disimpan!', 'success');
                    this.clearFormDraft();
                    await this.resetInputTransaction();
                    this.switchTab('data-transaksi');
                    await this.loadDataFromSupabase();
                    return;
                } catch (err) {
                    this.showNotification('Gagal memproses transaksi: ' + (err.message || err), 'error');
                } finally {
                    this.isLoading = false;
                }
            }

            this.applyTransactionStock(this.newTrans);
            this.transactions.push(JSON.parse(JSON.stringify(this.newTrans)));
            this.showNotification('Transaksi disimpan (Lokal)!', 'success');
            this.clearFormDraft();
            await this.resetInputTransaction();
            this.switchTab('data-transaksi');
        },

        editTransaction(tx) {
            this.editingOriginalNo = tx.noTransaksi;
            this.newTrans = JSON.parse(JSON.stringify(tx));
            this.revertTransactionStock(tx);
            this.transactions = this.transactions.filter(t => t.noTransaksi !== tx.noTransaksi);
            this.switchTab('input-transaksi');
        },

        printBAST(tx) {
            this.activeBast = tx;
            this.refreshIcons();
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
                return this.materialUsage;
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
            return list;
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
                if (this.filterStokGudang) q = q.eq('gudang', this.filterStokGudang);
                const { data } = await q;
                if (data) items = data.map(s => ({ kodeBarang: s.kode_barang, namaBarang: s.nama_barang, kategori: s.kategori, gudang: s.gudang, qty: s.qty, sat: s.sat }));
            } else {
                items = this.getFilteredStokGudang();
            }
            let csv = 'Kode Barang,Nama Barang,Kategori,Gudang,Total Stok,Satuan\n';
            items.forEach(s => { csv += `"${s.kodeBarang || ''}","${s.namaBarang || ''}","${s.kategori || ''}","${s.gudang || ''}",${s.qty || 0},"${s.sat || ''}"\n`; });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'stok_gudang.csv'; a.click();
        },

        async exportUsageCSV() {
            let items = [];
            if (supabaseClient) {
                let q = supabaseClient.from('material_usage').select('*');
                if (this.searchMaterialUsageProject) q = q.or(`kode_project.ilike.%${this.searchMaterialUsageProject}%`);
                const { data } = await q;
                if (data) items = data.map(u => ({ kodeProject: u.kode_project, noPO: u.no_po, projectName: u.project_name, namaBarang: u.nama_barang, drumId: u.drum_id, qty: u.qty, tanggal: u.tanggal }));
            } else {
                items = this.getFilteredMaterialUsage();
            }
            let csv = 'Kode Project,No PO,Project Name,Nama Barang,Drum ID,Qty Pakai,Tanggal\n';
            items.forEach(u => { csv += `"${u.kodeProject || ''}","${u.noPO || ''}","${u.projectName || ''}","${u.namaBarang || ''}","${u.drumId || ''}",${u.qty || 0},"${u.tanggal || ''}"\n`; });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'material_usage.csv'; a.click();
        },

        async exportTransactionCSV() {
            let items = [];
            if (supabaseClient) {
                let q = supabaseClient.from('transactions').select('*');
                if (this.searchNoTransaksi) q = q.or(`no_transaksi.ilike.%${this.searchNoTransaksi}%`);
                const { data } = await q;
                if (data) items = data.map(t => ({ tanggal: t.tanggal, noTransaksi: t.no_transaksi, tipeTransaksi: t.tipe_transaksi, gudangAsal: t.gudang_asal, gudangTujuan: t.gudang_tujuan, keterangan: t.keterangan }));
            } else {
                items = this.getFilteredTransactions();
            }
            let csv = 'Tanggal,No Transaksi,Tipe Transaksi,Gudang Asal,Gudang Tujuan,Keterangan\n';
            items.forEach(t => { csv += `"${t.tanggal || ''}","${t.noTransaksi || ''}","${t.tipeTransaksi || ''}","${t.gudangAsal || ''}","${t.gudangTujuan || ''}","${t.keterangan || ''}"\n`; });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'data_transaksi.csv'; a.click();
        }
    };
}
