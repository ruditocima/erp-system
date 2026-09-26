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

        generateKodeProject() {
            if (!app.modalForm.periode || !app.modalForm.region) {
                app.modalForm.kodeProject = '';
                return;
            }
            const datePart = app.modalForm.periode.replace(/-/g, '').substring(2, 8); // Format YYMMDD
            const regCode = app.modalForm.region.substring(0, 3).toUpperCase();
            const randomNum = Math.floor(100 + Math.random() * 900);
            app.modalForm.kodeProject = `PRJ-${regCode}-${datePart}-${randomNum}`;
        },

        async openModal(type) {
            app.modalType = type; 
            app.isEdit = false; 
            app.editIndex = null;
            
            if (type === 'project') {
                app.modalForm = { 
                    periode: app.todayWIB(), 
                    region: app.userRegion() !== 'Semua Region' ? app.userRegion() : '', 
                    kodeProject: '', 
                    type: 'Main Feeder', 
                    noPO: '', 
                    projectName: '' 
                };
                app.generateKodeProject();
            } else if (type === 'barang') {
                app.modalForm = { 
                    kategori: 'Cable', 
                    jenis: 'ADSS', 
                    kodeBarang: '', 
                    namaBarang: '', 
                    sat: 'Meter' 
                };
            } else if (type === 'gudang') {
                app.modalForm = { 
                    region: app.userRegion() !== 'Semua Region' ? app.userRegion() : '', 
                    kodeGudang: '', 
                    namaGudang: '', 
                    tipeKepemilikan: 'Milik Sendiri', 
                    lokasi: '' 
                };
            }
            app.showModal = true;
            app.refreshIcons();
        },

        openEditModal(type, index) {
            app.modalType = type;
            app.isEdit = true;
            app.editIndex = index;
            let targetList = [];
            
            if (type === 'barang') targetList = app.masterBarang;
            else if (type === 'gudang') targetList = app.masterGudang;
            else if (type === 'project') targetList = app.masterProject;

            if (targetList[index]) {
                app.modalForm = { ...targetList[index] };
            }
            app.showModal = true;
            app.refreshIcons();
        },

        async saveModalData() {
            try {
                app.isLoading = true;
                const type = app.modalType;

                if (type === 'barang') {
                    if (!app.modalForm.kodeBarang || !app.modalForm.namaBarang) {
                        throw new Error('Kode dan Nama Barang wajib diisi.');
                    }
                    if (app.isEdit) {
                        app.masterBarang[app.editIndex] = { ...app.modalForm };
                        if (app.supabaseClient) {
                            await app.supabaseClient.from('master_barang').update({
                                kategori: app.modalForm.kategori,
                                jenis: app.modalForm.jenis,
                                nama_barang: app.modalForm.namaBarang,
                                sat: app.modalForm.sat
                            }).eq('kode_barang', app.modalForm.kodeBarang);
                        }
                    } else {
                        app.masterBarang.push({ ...app.modalForm });
                        if (app.supabaseClient) {
                            await app.supabaseClient.from('master_barang').insert({
                                kategori: app.modalForm.kategori,
                                jenis: app.modalForm.jenis,
                                kode_barang: app.modalForm.kodeBarang,
                                nama_barang: app.modalForm.namaBarang,
                                sat: app.modalForm.sat
                            });
                        }
                    }
                    localStorage.setItem('vortex_masterBarang', JSON.stringify(app.masterBarang));
                    app.showNotification('Master barang berhasil disimpan!', 'success');
                } 
                else if (type === 'gudang') {
                    if (!app.modalForm.kodeGudang || !app.modalForm.namaGudang) {
                        throw new Error('Kode dan Nama Gudang wajib diisi.');
                    }
                    if (app.isEdit) {
                        app.masterGudang[app.editIndex] = { ...app.modalForm };
                        if (app.supabaseClient) {
                            await app.supabaseClient.from('master_gudang').update({
                                region: app.modalForm.region,
                                nama_gudang: app.modalForm.namaGudang,
                                tipe_kepemilikan: app.modalForm.tipeKepemilikan,
                                lokasi: app.modalForm.lokasi
                            }).eq('kode_gudang', app.modalForm.kodeGudang);
                        }
                    } else {
                        app.masterGudang.push({ ...app.modalForm });
                        if (app.supabaseClient) {
                            await app.supabaseClient.from('master_gudang').insert({
                                region: app.modalForm.region,
                                kode_gudang: app.modalForm.kodeGudang,
                                nama_gudang: app.modalForm.namaGudang,
                                tipe_kepemilikan: app.modalForm.tipeKepemilikan,
                                lokasi: app.modalForm.lokasi
                            });
                        }
                    }
                    localStorage.setItem('vortex_masterGudang', JSON.stringify(app.masterGudang));
                    app.showNotification('Master gudang berhasil disimpan!', 'success');
                } 
                else if (type === 'project') {
                    if (!app.modalForm.kodeProject || !app.modalForm.projectName) {
                        throw new Error('Kode Project dan Nama Project wajib diisi.');
                    }
                    if (app.isEdit) {
                        app.masterProject[app.editIndex] = { ...app.modalForm };
                        if (app.supabaseClient) {
                            await app.supabaseClient.from('master_project').update({
                                periode: app.modalForm.periode,
                                region: app.modalForm.region,
                                type: app.modalForm.type,
                                no_po: app.modalForm.noPO,
                                project_name: app.modalForm.projectName
                            }).eq('kode_project', app.modalForm.kodeProject);
                        }
                    } else {
                        app.masterProject.push({ ...app.modalForm });
                        if (app.supabaseClient) {
                            await app.supabaseClient.from('master_project').insert({
                                periode: app.modalForm.periode,
                                region: app.modalForm.region,
                                kode_project: app.modalForm.kodeProject,
                                type: app.modalForm.type,
                                no_po: app.modalForm.noPO,
                                project_name: app.modalForm.projectName
                            });
                        }
                    }
                    localStorage.setItem('vortex_masterProject', JSON.stringify(app.masterProject));
                    app.showNotification('Master project berhasil disimpan!', 'success');
                }

                app.showModal = false;
                await app.loadDataFromSupabase();
            } catch (err) {
                app.showNotification('Gagal menyimpan data: ' + (err.message || err), 'error');
            } finally {
                app.isLoading = false;
            }
        },

        async deleteItem(type, index) {
            if (!confirm('Apakah Anda yakin ingin menghapus item master ini?')) return;
            try {
                app.isLoading = true;
                if (type === 'barang') {
                    const item = app.masterBarang[index];
                    app.masterBarang.splice(index, 1);
                    localStorage.setItem('vortex_masterBarang', JSON.stringify(app.masterBarang));
                    if (app.supabaseClient && item && item.kodeBarang) {
                        await app.supabaseClient.from('master_barang').delete().eq('kode_barang', item.kodeBarang);
                    }
                } else if (type === 'gudang') {
                    const item = app.masterGudang[index];
                    app.masterGudang.splice(index, 1);
                    localStorage.setItem('vortex_masterGudang', JSON.stringify(app.masterGudang));
                    if (app.supabaseClient && item && item.kodeGudang) {
                        await app.supabaseClient.from('master_gudang').delete().eq('kode_gudang', item.kodeGudang);
                    }
                } else if (type === 'project') {
                    const item = app.masterProject[index];
                    app.masterProject.splice(index, 1);
                    localStorage.setItem('vortex_masterProject', JSON.stringify(app.masterProject));
                    if (app.supabaseClient && item && item.kodeProject) {
                        await app.supabaseClient.from('master_project').delete().eq('kode_project', item.kodeProject);
                    }
                }
                app.showNotification('Data berhasil dihapus.', 'success');
                await app.loadDataFromSupabase();
            } catch (err) {
                app.showNotification('Gagal menghapus data: ' + (err.message || err), 'error');
            } finally {
                app.isLoading = false;
            }
        }
    };
}
