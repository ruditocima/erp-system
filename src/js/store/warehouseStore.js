import { supabase } from '../config/supabase.js';
import { safeLoadStorage } from '../utils/storage.js';
import { createIcons, icons } from 'lucide';

export function warehouseStore() {
  return {
    isLoggedIn: localStorage.getItem('vortex_logged_in') === 'true',
    currentUser: localStorage.getItem('vortex_user') || 'Admin Pusat',
    currentRole: localStorage.getItem('vortex_role') || 'Admin',
    currentTab: 'dashboard',
    loginForm: { email: 'admin@vortexwms.com', password: '••••••', role: 'Admin' },

    showModal: false,
    modalType: '',
    modalForm: {},
    isEdit: false,
    editIndex: null,

    notification: { show: false, message: '', type: 'error' },
    isLoading: false,
    selectedFile: null,

    filterStokGudang: '',
    filterRegionUsage: '',
    searchNoTransaksi: '',
    searchNoReferensi: '',
    searchMaterialUsageProject: '',

    masterBarang: safeLoadStorage('vortex_masterBarang', [
      { kategori: 'Hardware', jenis: 'Router', kodeBarang: 'HW-RT-01', namaBarang: 'Cisco Router ISR 4331', sat: 'Unit' },
      { kategori: 'Cable', jenis: 'Fiber Optic', kodeBarang: 'CB-FO-12', namaBarang: 'FO Single Mode 24Core', sat: 'Meter' },
      { kategori: 'Cable', jenis: 'ADSS', kodeBarang: 'CBL-ADSS-024', namaBarang: 'Kabel ADSS-024 24Core (Max 3000m/Drum)', sat: 'Meter' },
      { kategori: 'Power', jenis: 'Rectifier', kodeBarang: 'PW-REC-04', namaBarang: 'Eltek Rectifier 48V', sat: 'Set' }
    ]),

    masterGudang: safeLoadStorage('vortex_masterGudang', [
      { kodeGudang: 'NPM-JKT-01', namaGudang: 'Gudang Utama Jakarta', tipeKepemilikan: 'Milik Sendiri', lokasi: 'Cakung, Jakarta Timur' },
      { kodeGudang: 'NPM-SBY-02', namaGudang: 'Gudang Regional Surabaya', tipeKepemilikan: 'Sewa / Vendor', lokasi: 'Rungkut, Surabaya' }
    ]),

    masterProject: safeLoadStorage('vortex_masterProject', [
      { periode: '2026-Q1', region: 'Jawa Barat', kodeProject: 'PRJ-BJB-09', type: 'FTTH Rollout', noPO: 'PO/2026/0192', projectName: 'Project Jabar FTTH 2026', poAwal: '2026-01-10', poFinal: '2026-06-30', statusPO: 'Approved', permit: 'Clear', snd: 'SND-8821', statusProject: 'On Progress' }
    ]),

    stokGudang: safeLoadStorage('vortex_stokGudang', [
      { id: 'HW-RT-01_Gudang Utama Jakarta', kodeBarang: 'HW-RT-01', namaBarang: 'Cisco Router ISR 4331', kategori: 'Hardware', gudang: 'Gudang Utama Jakarta', qty: 45, sat: 'Unit' },
      { id: 'CBL-ADSS-024_Gudang Utama Jakarta', kodeBarang: 'CBL-ADSS-024', namaBarang: 'Kabel ADSS-024 24Core (Max 3000m/Drum)', kategori: 'Cable', gudang: 'Gudang Utama Jakarta', qty: 7000, sat: 'Meter' }
    ]),

    drumLedger: safeLoadStorage('vortex_drumLedger', [
      { drumId: 'ADSS024-20260601-01', kodeBarang: 'CBL-ADSS-024', namaBarang: 'Kabel ADSS-024 24Core (Max 3000m/Drum)', gudang: 'Gudang Utama Jakarta', initialLength: 3000, remainingLength: 3000, status: 'Full' },
      { drumId: 'ADSS024-20260601-02', kodeBarang: 'CBL-ADSS-024', namaBarang: 'Kabel ADSS-024 24Core (Max 3000m/Drum)', gudang: 'Gudang Utama Jakarta', initialLength: 3000, remainingLength: 1000, status: 'Partial' }
    ]),

    materialUsage: safeLoadStorage('vortex_materialUsage', [
      { id: 'USG-INIT-001', kodeProject: 'PRJ-BJB-09', noPO: 'PO/2026/0192', projectName: 'Project Jabar FTTH 2026', kodeBarang: 'CBL-ADSS-024', namaBarang: 'Kabel ADSS-024 24Core (Max 3000m/Drum)', drumId: 'ADSS024-20260601-02', qty: 2000, tanggal: '2026-06-02' }
    ]),

    transactions: safeLoadStorage('vortex_transactions', [
      {
        tanggal: '2026-09-01',
        noTransaksi: 'ACM-NPM-IN-202609-01',
        noReferensi: 'REF-001',
        tipeTransaksi: 'Masuk',
        gudangAsal: 'PT Prysmian Cable',
        gudangTujuan: 'Gudang Utama Jakarta',
        kodeProject: 'PRJ-BJB-09',
        keterangan: 'Penerimaan awal material kabel project',
        lampiran: '',
        lampiranUrl: '',
        items: [{ kategori: 'Cable', jenis: 'ADSS', kodeBarang: 'CBL-ADSS-024', namaBarang: 'Kabel ADSS-024 24Core (Max 3000m/Drum)', drumId: 'ADSS024-20260601-01', qty: 3000, keterangan: 'Kondisi mulus, segel aman' }]
      }
    ]),

    newTrans: {
      tanggal: '',
      noTransaksi: '',
      noReferensi: '',
      tipeTransaksi: 'Masuk',
      gudangAsal: '',
      gudangTujuan: '',
      kodeProject: '',
      keterangan: '',
      lampiran: '',
      lampiranUrl: '',
      items: []
    },

    activeBast: {},

    init() {
      this.resetInputTransaction();
      this.syncWithSupabaseOnStart();

      this.$watch('masterBarang', val => { localStorage.setItem('vortex_masterBarang', JSON.stringify(val)); }, { deep: true });
      this.$watch('masterGudang', val => { localStorage.setItem('vortex_masterGudang', JSON.stringify(val)); }, { deep: true });
      this.$watch('masterProject', val => { localStorage.setItem('vortex_masterProject', JSON.stringify(val)); }, { deep: true });
      this.$watch('stokGudang', val => { localStorage.setItem('vortex_stokGudang', JSON.stringify(val)); }, { deep: true });
      this.$watch('drumLedger', val => { localStorage.setItem('vortex_drumLedger', JSON.stringify(val)); }, { deep: true });
      this.$watch('transactions', val => { localStorage.setItem('vortex_transactions', JSON.stringify(val)); }, { deep: true });
      this.$watch('materialUsage', val => { localStorage.setItem('vortex_materialUsage', JSON.stringify(val)); }, { deep: true });

      this.refreshIcons();
    },

    refreshIcons() {
      this.$nextTick(() => {
        createIcons({ icons });
      });
    },

    switchTab(tabName) {
      this.currentTab = tabName;
      this.refreshIcons();
    },

    showNotification(msg, type = 'success') {
      this.notification = { show: true, message: msg, type: type };
      this.refreshIcons();
      setTimeout(() => { this.notification.show = false; }, 4000);
    },

    async syncWithSupabaseOnStart() {
      if (!supabase) return;
      try {
        const { data: barangData } = await supabase.from('master_barang').select('*');
        if (barangData && barangData.length > 0) this.masterBarang = barangData;
        const { data: gudangData } = await supabase.from('master_gudang').select('*');
        if (gudangData && gudangData.length > 0) this.masterGudang = gudangData;
        const { data: projData } = await supabase.from('master_project').select('*');
        if (projData && projData.length > 0) this.masterProject = projData;
        const { data: stokData } = await supabase.from('stok_gudang').select('*');
        if (stokData && stokData.length > 0) this.stokGudang = stokData;
        const { data: drumData } = await supabase.from('drum_ledger').select('*');
        if (drumData && drumData.length > 0) this.drumLedger = drumData;
        const { data: usageData } = await supabase.from('material_usage').select('*');
        if (usageData && usageData.length > 0) this.materialUsage = usageData;
        const { data: txData } = await supabase.from('transactions').select('*');
        if (txData && txData.length > 0) this.transactions = txData;

        this.refreshIcons();
      } catch (err) {
        console.warn('Supabase offline mode active, using local persistent cache.', err);
      }
    },

    async persistToSupabase(table, data) {
      if (!supabase) return;
      try {
        const payload = Array.isArray(data) ? data : [data];
        if (payload.length === 0) return;
        const { error } = await supabase.from(table).upsert(payload);
        if (error) console.warn(`Supabase upsert error on ${table}:`, error.message);
      } catch (e) {
        console.warn(`Failed to sync table ${table} to Supabase:`, e);
      }
    },

    async deleteItem(type, index) {
      if (!confirm('Apakah Anda yakin ingin menghapus data ini beserta seluruh relasinya?')) return;

      let targetItem = null;

      if (type === 'barang') {
        targetItem = this.masterBarang[index];
        this.masterBarang.splice(index, 1);
        localStorage.setItem('vortex_masterBarang', JSON.stringify(this.masterBarang));
        
        this.stokGudang = this.stokGudang.filter(s => s.kodeBarang !== targetItem.kodeBarang);
        this.drumLedger = this.drumLedger.filter(d => d.kodeBarang !== targetItem.kodeBarang);

        if (supabase) {
          await supabase.from('master_barang').delete().eq('kodeBarang', targetItem.kodeBarang);
          await supabase.from('stok_gudang').delete().eq('kodeBarang', targetItem.kodeBarang);
          await supabase.from('drum_ledger').delete().eq('kodeBarang', targetItem.kodeBarang);
        }
      } 
      else if (type === 'project') {
        targetItem = this.masterProject[index];
        this.masterProject.splice(index, 1);
        localStorage.setItem('vortex_masterProject', JSON.stringify(this.masterProject));

        this.materialUsage = this.materialUsage.filter(m => m.kodeProject !== targetItem.kodeProject);

        if (supabase) {
          await supabase.from('master_project').delete().eq('kodeProject', targetItem.kodeProject);
          await supabase.from('material_usage').delete().eq('kodeProject', targetItem.kodeProject);
        }
      }
      else if (type === 'gudang') {
        targetItem = this.masterGudang[index];
        this.masterGudang.splice(index, 1);
        localStorage.setItem('vortex_masterGudang', JSON.stringify(this.masterGudang));

        this.stokGudang = this.stokGudang.filter(s => s.gudang !== targetItem.namaGudang);

        if (supabase) {
          await supabase.from('master_gudang').delete().eq('kodeGudang', targetItem.kodeGudang);
          await supabase.from('stok_gudang').delete().eq('gudang', targetItem.namaGudang);
        }
      }

      this.showNotification('Data dan relasinya berhasil dihapus!', 'success');
      this.refreshIcons();
    },

    login() {
      if (!this.loginForm.email || !this.loginForm.password) {
        this.showNotification('Mohon masukkan email dan password!', 'error');
        return;
      }
      this.currentUser = this.loginForm.email;
      this.currentRole = this.loginForm.role;
      this.isLoggedIn = true;
      localStorage.setItem('vortex_logged_in', 'true');
      localStorage.setItem('vortex_user', this.currentUser);
      localStorage.setItem('vortex_role', this.currentRole);
      this.refreshIcons();
    },

    logout() {
      this.isLoggedIn = false;
      localStorage.removeItem('vortex_logged_in');
      localStorage.removeItem('vortex_user');
      localStorage.removeItem('vortex_role');
    },

    openModal(type) {
      this.modalType = type;
      this.isEdit = false;
      this.editIndex = null;
      
      if (type === 'barang') this.modalForm = { kategori: '', jenis: '', kodeBarang: '', namaBarang: '', sat: '' };
      else if (type === 'gudang') this.modalForm = { kodeGudang: '', namaGudang: '', tipeKepemilikan: 'Milik Sendiri', lokasi: '' };
      else if (type === 'project') this.modalForm = { periode: '', region: '', kodeProject: '', type: '', noPO: '', projectName: '', poAwal: '', poFinal: '', statusPO: 'Approved', permit: '', snd: '', statusProject: '' };
      
      this.showModal = true;
      this.refreshIcons();
    },

    openEditModal(type, index) {
      this.modalType = type;
      this.isEdit = true;
      this.editIndex = index;
      
      const sourceArray = type === 'barang' ? this.masterBarang : (type === 'gudang' ? this.masterGudang : this.masterProject);
      this.modalForm = JSON.parse(JSON.stringify(sourceArray[index]));
      this.showModal = true;
      this.refreshIcons();
    },

    async saveModalData() {
      let targetArray = this.modalType === 'barang' ? this.masterBarang : (this.modalType === 'gudang' ? this.masterGudang : this.masterProject);
      let tableName = this.modalType === 'barang' ? 'master_barang' : (this.modalType === 'gudang' ? 'master_gudang' : 'master_project');

      if (this.isEdit) {
        targetArray[this.editIndex] = this.modalForm;
      } else {
        targetArray.push(this.modalForm);
      }

      if (supabase) await this.persistToSupabase(tableName, targetArray);

      this.showModal = false;
      this.showNotification(`Data Master ${this.modalType.toUpperCase()} berhasil disimpan!`, 'success');
      this.refreshIcons();
    },

    editTransaction(tx) {
      alert('Sistem Terkunci: Demi menjaga integritas kalkulasi Stok dan Drum Ledger, transaksi yang sudah ter-posting tidak dapat diedit langsung. Silakan HAPUS transaksi ini (sistem akan otomatis me-revert stok), kemudian buat transaksi baru yang sesuai.');
    },

    async deleteTransaction(tx) {
      if (!confirm('Peringatan Kritikal: Menghapus transaksi ini akan melakukan Rollback/Revert stok dan pemulihan riwayat drum kabel ke kondisi sebelum transaksi ini terjadi. Anda yakin melanjutkan?')) return;

      for (const it of tx.items) {
        const qtyNum = parseInt(it.qty, 10) || 0;
        const isCable = (this.getCategoryByKode(it.kodeBarang) === 'Cable');

        if (tx.tipeTransaksi === 'Masuk') {
          let stok = this.stokGudang.find(s => s.kodeBarang === it.kodeBarang && s.gudang === tx.gudangTujuan);
          if (stok) stok.qty = Math.max(0, stok.qty - qtyNum);
          if (isCable) this.drumLedger = this.drumLedger.filter(d => d.drumId !== it.drumId);
        } else if (tx.tipeTransaksi === 'Keluar') {
          let stok = this.stokGudang.find(s => s.kodeBarang === it.kodeBarang && s.gudang === tx.gudangAsal);
          if (stok) stok.qty += qtyNum;
          if (isCable && it.drumId) {
            let drum = this.drumLedger.find(d => d.drumId === it.drumId);
            if (drum) {
              drum.remainingLength += qtyNum;
              drum.status = drum.remainingLength >= drum.initialLength ? 'Full' : 'Partial';
            }
          }
        } else if (tx.tipeTransaksi === 'Transfer') {
          let srcStok = this.stokGudang.find(s => s.kodeBarang === it.kodeBarang && s.gudang === tx.gudangAsal);
          if (srcStok) srcStok.qty += qtyNum;
          let dstStok = this.stokGudang.find(s => s.kodeBarang === it.kodeBarang && s.gudang === tx.gudangTujuan);
          if (dstStok) dstStok.qty = Math.max(0, dstStok.qty - qtyNum);
          if (isCable && it.drumId) {
            let drum = this.drumLedger.find(d => d.drumId === it.drumId);
            if (drum) drum.gudang = tx.gudangAsal;
          }
        }
      }

      if (tx.tipeTransaksi === 'Keluar') {
        this.materialUsage = this.materialUsage.filter(u => u.kodeProject !== tx.kodeProject || u.tanggal !== tx.tanggal || u.drumId !== tx.items[0]?.drumId);
      }

      this.transactions = this.transactions.filter(t => t.noTransaksi !== tx.noTransaksi);

      if (supabase) {
        await this.persistToSupabase('stok_gudang', this.stokGudang);
        await this.persistToSupabase('drum_ledger', this.drumLedger);
        await supabase.from('transactions').delete().eq('noTransaksi', tx.noTransaksi);
      }

      this.showNotification('Transaksi berhasil dihapus dan kondisi stok telah berhasil di-revert secara otomatis.', 'success');
      this.refreshIcons();
    },

    openInputTransaction() {
      this.resetInputTransaction();
      this.currentTab = 'input-transaksi';
      this.$nextTick(() => {
        this.generateNoTransaksi();
        this.refreshIcons();
      });
    },

    generateNoTransaksi() {
      if (!this.newTrans.tanggal) return;

      const companyCode = 'ACM';
      let typeCode = 'IN';
      if (this.newTrans.tipeTransaksi === 'Keluar') typeCode = 'OUT';
      else if (this.newTrans.tipeTransaksi === 'Transfer') typeCode = 'TRF';

      const targetWhName = (this.newTrans.tipeTransaksi === 'Masuk') 
        ? this.newTrans.gudangTujuan 
        : this.newTrans.gudangAsal;

      let npmCode = 'XXX';
      if (targetWhName) {
        const foundWh = (this.masterGudang || []).find(g => g.namaGudang === targetWhName || g.kodeGudang === targetWhName);
        const codeStr = foundWh ? foundWh.kodeGudang : targetWhName;
        const cleanStr = codeStr.replace(/[^a-zA-Z0-9]/g, '');
        npmCode = (cleanStr.length >= 3 ? cleanStr : codeStr.replace(/[^a-zA-Z0-9]/g, '')).toUpperCase();
      }
      const dateStr = this.newTrans.tanggal.replace(/-/g, '');
      const randNum = Math.floor(10 + Math.random() * 90);
      this.newTrans.noTransaksi = `${companyCode}-${npmCode}-${typeCode}-${dateStr}-${randNum}`;
    },

    onTipeTransaksiChange() {
      if (this.newTrans.tipeTransaksi === 'Masuk') {
        this.newTrans.gudangAsal = '';
        this.newTrans.gudangTujuan = this.masterGudang[0]?.namaGudang || '';
      } else if (this.newTrans.tipeTransaksi === 'Keluar') {
        this.newTrans.gudangAsal = this.masterGudang[0]?.namaGudang || '';
        this.newTrans.gudangTujuan = '';
      } else if (this.newTrans.tipeTransaksi === 'Transfer') {
        this.newTrans.gudangAsal = this.masterGudang[0]?.namaGudang || '';
        this.newTrans.gudangTujuan = this.masterGudang[1]?.namaGudang || this.masterGudang[0]?.namaGudang || '';
      }
      this.generateNoTransaksi();
    },

    resetItemsOnWarehouseChange() {},

    getGudangTujuanList() {
      if (this.newTrans.tipeTransaksi === 'Transfer') {
        return this.masterGudang.filter(g => g.namaGudang !== this.newTrans.gudangAsal);
      }
      return this.masterGudang;
    },

    getFilteredProjects() {
      return this.masterProject;
    },

    handleFileUpload(event) {
      const file = event.target.files[0];
      if (file) {
        this.newTrans.lampiran = file.name;
        this.newTrans.lampiranUrl = URL.createObjectURL(file);
      }
    },

    addTransactionItem() {
      this.newTrans.items.push({
        kategori: '',
        jenis: '',
        kodeBarang: '',
        namaBarang: '',
        drumId: '',
        qty: 1,
        keterangan: ''
      });
    },

    removeTransactionItem(index) {
      this.newTrans.items.splice(index, 1);
    },

    getCategories(item) {
      return [...new Set(this.masterBarang.map(b => b.kategori))];
    },

    getJenis(kategori) {
      if (!kategori) return [];
      return [...new Set(this.masterBarang.filter(b => b.kategori === kategori).map(b => b.jenis))];
    },

    getBarangList(kategori, jenis) {
      return this.masterBarang.filter(b => b.kategori === kategori && b.jenis === jenis);
    },

    fillNamaBarang(item) {
      const found = this.masterBarang.find(b => b.kodeBarang === item.kodeBarang);
      if (found) {
        item.namaBarang = found.namaBarang;
      }
    },

    getCategoryByKode(kode) {
      const found = this.masterBarang.find(b => b.kodeBarang === kode);
      return found ? found.kategori : 'General';
    },

    getDrumList(item) {
      return this.drumLedger.filter(d => d.kodeBarang === item.kodeBarang && d.remainingLength > 0);
    },

    async submitTransaction() {
      if (!this.newTrans.tanggal || !this.newTrans.noTransaksi) {
        this.showNotification('Tanggal dan No Transaksi wajib diisi!', 'error');
        return;
      }
      if (this.newTrans.items.length === 0) {
        this.showNotification('Minimal tambahkan 1 item material!', 'error');
        return;
      }

      this.isLoading = true;

      for (const it of this.newTrans.items) {
        const qtyNum = parseInt(it.qty, 10) || 0;
        const isCable = (this.getCategoryByKode(it.kodeBarang) === 'Cable');

        if (this.newTrans.tipeTransaksi === 'Masuk') {
          let stok = this.stokGudang.find(s => s.kodeBarang === it.kodeBarang && s.gudang === this.newTrans.gudangTujuan);
          if (stok) {
            stok.qty += qtyNum;
          } else {
            this.stokGudang.push({
              id: `${it.kodeBarang}_${this.newTrans.gudangTujuan}`,
              kodeBarang: it.kodeBarang,
              namaBarang: it.namaBarang,
              kategori: this.getCategoryByKode(it.kodeBarang),
              gudang: this.newTrans.gudangTujuan,
              qty: qtyNum,
              sat: 'Unit'
            });
          }
          if (isCable) {
            let dId = it.drumId;
            if (!dId) {
              const dateTag = this.newTrans.tanggal.replace(/-/g, '');
              dId = `${it.kodeBarang.replace(/[^a-zA-Z0-9]/g, '')}-${dateTag}-${Math.floor(10 + Math.random() * 90)}`;
              it.drumId = dId;
            }
            this.drumLedger.push({
              drumId: dId,
              kodeBarang: it.kodeBarang,
              namaBarang: it.namaBarang,
              gudang: this.newTrans.gudangTujuan,
              initialLength: qtyNum,
              remainingLength: qtyNum,
              status: 'Full'
            });
          }
        }
        else if (this.newTrans.tipeTransaksi === 'Keluar') {
          let stok = this.stokGudang.find(s => s.kodeBarang === it.kodeBarang && s.gudang === this.newTrans.gudangAsal);
          if (stok) {
            stok.qty = Math.max(0, stok.qty - qtyNum);
          }
          if (isCable && it.drumId) {
            let drum = this.drumLedger.find(d => d.drumId === it.drumId);
            if (drum) {
              drum.remainingLength = Math.max(0, drum.remainingLength - qtyNum);
              drum.status = drum.remainingLength === 0 ? 'Empty' : (drum.remainingLength === drum.initialLength ? 'Full' : 'Partial');
            }
          }
          const proj = this.masterProject.find(p => p.kodeProject === this.newTrans.kodeProject);
          this.materialUsage.push({
            id: 'USG-' + Date.now() + '-' + Math.floor(Math.random()*1000),
            kodeProject: this.newTrans.kodeProject || '-',
            noPO: proj ? proj.noPO : '-',
            projectName: proj ? proj.projectName : '-',
            kodeBarang: it.kodeBarang,
            namaBarang: it.namaBarang,
            drumId: it.drumId || '-',
            qty: qtyNum,
            tanggal: this.newTrans.tanggal
          });
        }
        else if (this.newTrans.tipeTransaksi === 'Transfer') {
          let srcStok = this.stokGudang.find(s => s.kodeBarang === it.kodeBarang && s.gudang === this.newTrans.gudangAsal);
          if (srcStok) srcStok.qty = Math.max(0, srcStok.qty - qtyNum);

          let dstStok = this.stokGudang.find(s => s.kodeBarang === it.kodeBarang && s.gudang === this.newTrans.gudangTujuan);
          if (dstStok) {
            dstStok.qty += qtyNum;
          } else {
            this.stokGudang.push({
              id: `${it.kodeBarang}_${this.newTrans.gudangTujuan}`,
              kodeBarang: it.kodeBarang,
              namaBarang: it.namaBarang,
              kategori: this.getCategoryByKode(it.kodeBarang),
              gudang: this.newTrans.gudangTujuan,
              qty: qtyNum,
              sat: 'Unit'
            });
          }
          if (isCable && it.drumId) {
            let drum = this.drumLedger.find(d => d.drumId === it.drumId);
            if (drum) drum.gudang = this.newTrans.gudangTujuan;
          }
        }
      }

      this.transactions.unshift(JSON.parse(JSON.stringify(this.newTrans)));

      if (supabase) {
        await supabase.from('transactions').insert([this.newTrans]);
        await this.persistToSupabase('stok_gudang', this.stokGudang);
        await this.persistToSupabase('drum_ledger', this.drumLedger);
        await this.persistToSupabase('material_usage', this.materialUsage);
      }

      this.isLoading = false;
      this.showNotification('Transaksi berhasil disimpan & stok diperbarui!', 'success');
      this.resetInputTransaction();
      this.currentTab = 'data-transaksi';
      this.refreshIcons();
    },

    resetInputTransaction() {
      const today = new Date().toISOString().split('T')[0];
      this.newTrans = {
        tanggal: today,
        noTransaksi: '',
        noReferensi: '',
        tipeTransaksi: 'Masuk',
        gudangAsal: '',
        gudangTujuan: this.masterGudang[0]?.namaGudang || '',
        kodeProject: '',
        keterangan: '',
        lampiran: '',
        lampiranUrl: '',
        items: []
      };
      this.generateNoTransaksi();
      this.refreshIcons();
    },

    getFilteredStokGudang() {
      if (!this.filterStokGudang) return this.stokGudang;
      return this.stokGudang.filter(s => s.gudang === this.filterStokGudang);
    },

    getFilteredDrumLedger() {
      return this.drumLedger;
    },

    getUniqueRegions() {
      return [...new Set(this.masterProject.map(p => p.region).filter(Boolean))];
    },

    getFilteredMaterialUsage() {
      return this.materialUsage.filter(u => {
        const matchRegion = !this.filterRegionUsage || (() => {
          const proj = this.masterProject.find(p => p.kodeProject === u.kodeProject);
          return proj && proj.region === this.filterRegionUsage;
        })();
        const q = (this.searchMaterialUsageProject || '').toLowerCase();
        const matchSearch = !q || 
          (u.kodeProject && u.kodeProject.toLowerCase().includes(q)) || 
          (u.projectName && u.projectName.toLowerCase().includes(q)) || 
          (u.noPO && u.noPO.toLowerCase().includes(q)) ||
          (u.namaBarang && u.namaBarang.toLowerCase().includes(q));
        return matchRegion && matchSearch;
      });
    },

    getFilteredTransactions() {
      return this.transactions.filter(tx => {
        const matchNoTx = !this.searchNoTransaksi || (tx.noTransaksi && tx.noTransaksi.toLowerCase().includes(this.searchNoTransaksi.toLowerCase()));
        const matchRef = !this.searchNoReferensi || (tx.noReferensi && tx.noReferensi.toLowerCase().includes(this.searchNoReferensi.toLowerCase()));
        return matchNoTx && matchRef;
      });
    },

    printBAST(tx) {
      this.activeBast = JSON.parse(JSON.stringify(tx));
      this.$nextTick(() => {
        window.print();
        this.refreshIcons();
      });
    },

    getBastSummaryTotals() {
      if (!this.activeBast || !this.activeBast.items) return [];
      const map = {};
      this.activeBast.items.forEach(item => {
        const name = item.namaBarang || item.kodeBarang;
        const qty = parseInt(item.qty, 10) || 0;
        if (!map[name]) map[name] = 0;
        map[name] += qty;
      });
      return Object.keys(map).map(namaBarang => ({
        namaBarang,
        totalQty: map[namaBarang]
      }));
    }
  };
}