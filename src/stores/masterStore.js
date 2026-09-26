export function createMasterModule(app) {
    return {
        getFilteredMasterGudang() {
            if (app.isSuperAdmin) return app.masterGudang;
            const reg = app.userRegion().toLowerCase();
            return app.masterGudang.filter(g => (g.region || '').toLowerCase() === reg);
        },
        getFilteredMasterProject() {
            if (app.isSuperAdmin) return app.masterProject;
            const reg = app.userRegion().toLowerCase();
            return app.masterProject.filter(p => (p.region || '').toLowerCase() === reg);
        },

        async openModal(type) {
            app.modalType = type; app.isEdit = false; app.editIndex = null;
            if (type === 'project') {
                app.modalForm = { periode: app.todayWIB(), region: '', kodeProject: '(Otomatis dari Sistem)', type: 'Main Feeder', noPO: '', projectName: '' };
                await app.generateKodeProject();
            } else if (type === 'barang') {
                app.modalForm = { kategori: '', jenis: '', kodeBarang: '', namaBarang: '', sat: 'Pcs' };
            } else if (type === 'gudang') {
                app.modalForm = { region: '', kodeGudang: '', namaGudang: '', tipeKepemilikan: 'Milik Sendiri', lokasi: '' };
            }
            app.showModal = true; app.refreshIcons();
        },

        openEditModal(type, index) {
            app.modalType = type; app.isEdit = true; app.editIndex = index;
            if (type === 'project') app.modalForm = { ...app.masterProject[index] };
            if (type === 'barang') app.modalForm = { ...app.masterBarang[index] };
            if (type === 'gudang') app.modalForm = { ...app.masterGudang[index] };
            app.showModal = true; app.refreshIcons();
        },

        async generateKodeProject() {
            if (app.isEdit) return;
            const kodeInputEl = document.getElementById('kodeProjectInput') || document.getElementById('kode_project');
            if (kodeInputEl) {
                kodeInputEl.value = '(Otomatis dari Sistem)';
                kodeInputEl.disabled = true;
            }
            app.modalForm.kodeProject = '(Otomatis dari Sistem)';
        },

        async saveModalData() {
            if (!app.supabaseClient) {
                app.showNotification('Koneksi Supabase tidak tersedia!', 'error');
                return;
            }

            try {
                app.isLoading = true;
                if (app.modalType === 'barang') {
                    const payload = {
                        kategori: app.modalForm.kategori,
                        jenis: app.modalForm.jenis,
                        kode_barang: app.modalForm.kodeBarang,
                        nama_barang: app.modalForm.namaBarang,
                        sat: app.modalForm.sat
                    };
                    const { error } = await app.supabaseClient.from('master_barang').upsert(payload, { onConflict: 'kode_barang' });
                    if (error) throw error;
                    if (app.isEdit) {
                        app.masterBarang[app.editIndex] = { ...app.modalForm };
                    } else {
                        app.masterBarang.push({ ...app.modalForm });
                    }
                    localStorage.setItem('vortex_masterBarang', JSON.stringify(app.masterBarang));
                } else if (app.modalType === 'gudang') {
                    const payload = {
                        region: app.modalForm.region,
                        kode_gudang: app.modalForm.kodeGudang,
                        nama_gudang: app.modalForm.namaGudang,
                        tipe_kepemilikan: app.modalForm.tipeKepemilikan,
                        lokasi: app.modalForm.lokasi
                    };
                    const { error } = await app.supabaseClient.from('master_gudang').upsert(payload, { onConflict: 'kode_gudang' });
                    if (error) throw error;
                    if (app.isEdit) {
                        app.masterGudang[app.editIndex] = { ...app.modalForm };
                    } else {
                        app.masterGudang.push({ ...app.modalForm });
                    }
                    localStorage.setItem('vortex_masterGudang', JSON.stringify(app.masterGudang));
                } else if (app.modalType === 'project') {
                    if (app.isEdit) {
                        const payload = {
                            periode: app.modalForm.periode,
                            region: app.modalForm.region,
                            kode_project: app.modalForm.kodeProject,
                            type: app.modalForm.type,
                            no_po: app.modalForm.noPO,
                            project_name: app.modalForm.projectName
                        };
                        const { error } = await app.supabaseClient.from('master_project').upsert(payload, { onConflict: 'kode_project' });
                        if (error) throw error;
                        app.masterProject[app.editIndex] = { ...app.modalForm };
                    } else {
                        const payload = {
                            periode: app.modalForm.periode,
                            region: app.modalForm.region,
                            type: app.modalForm.type,
                            no_po: app.modalForm.noPO,
                            project_name: app.modalForm.projectName
                        };
                        const { data, error } = await app.supabaseClient
                            .from('master_project')
                            .insert([payload])
                            .select();
                        if (error) throw error;
                        if (data && data.length > 0) {
                            app.modalForm.kodeProject = data[0].kode_project;
                        }
                        app.masterProject.push({ ...app.modalForm });
                    }
                    localStorage.setItem('vortex_masterProject', JSON.stringify(app.masterProject));
                }

                app.logAudit('master_save', { type: app.modalType, data: app.modalForm });
                app.showModal = false;
                app.showNotification('Data berhasil disimpan ke Supabase!', 'success');
            } catch (err) {
                app.showNotification('Gagal menyimpan: ' + (err.message || err), 'error');
            } finally {
                app.isLoading = false;
            }
        },

        async deleteItem(type, index) {
            if (!confirm('Hapus data ini?')) return;

            const tableMap = { barang: 'master_barang', gudang: 'master_gudang', project: 'master_project' };
            const keyMap = { barang: 'kode_barang', gudang: 'kode_gudang', project: 'kode_project' };
            const localKey = { barang: 'kodeBarang', gudang: 'kodeGudang', project: 'kodeProject' };
            const arrName = { barang: 'masterBarang', gudang: 'masterGudang', project: 'masterProject' };

            const arr = app[arrName[type]];
            const item = arr ? arr[index] : null;
            if (!item) return;

            try {
                app.isLoading = true;
                if (app.supabaseClient) {
                    const { error } = await app.supabaseClient.from(tableMap[type]).delete().eq(keyMap[type], item[localKey[type]]);
                    if (error) throw error;
                }
                arr.splice(index, 1);
                if (type === 'barang') localStorage.setItem('vortex_masterBarang', JSON.stringify(app.masterBarang));
                if (type === 'gudang') localStorage.setItem('vortex_masterGudang', JSON.stringify(app.masterGudang));
                if (type === 'project') localStorage.setItem('vortex_masterProject', JSON.stringify(app.masterProject));

                app.logAudit('master_delete', { type: type, key: item[localKey[type]] });
                app.showNotification('Data dihapus!', 'success');
                if (app.supabaseClient) await app.loadDataFromSupabase();
            } catch (err) {
                app.showNotification('Gagal menghapus: ' + (err.message || err), 'error');
            } finally {
                app.isLoading = false;
            }
        }
    };
}