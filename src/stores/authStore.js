export function createAuthModule(app) {
    return {
        async validateSession() {
            if (!app.supabaseClient) return;
            const { data: { session } } = await app.supabaseClient.auth.getSession();
            if (app.isLoggedIn && !session) { app.logout(); return; }
            if (session && session.user) {
                const { data: prof } = await app.supabaseClient.from('profiles')
                    .select('role, nama_lengkap, region').eq('id', session.user.id).single();
                if (prof) {
                    app.currentRole = prof.role || app.currentRole;
                    app.currentUser = prof.nama_lengkap || app.currentUser;
                    if (prof.region) localStorage.setItem('vortex_region', prof.region);
                    localStorage.setItem('vortex_role', app.currentRole);
                    localStorage.setItem('vortex_user', app.currentUser);
                }
                app.supabaseClient.auth.onAuthStateChange((event) => {
                    if (event === 'SIGNED_OUT') app.logout();
                });
            }
        },

        async login() {
            const demoMode = new URLSearchParams(window.location.search).get('demo') === '1';
            if (!app.supabaseClient && demoMode) {
                app.isLoggedIn = true;
                app.currentUser = 'Demo User';
                app.currentRole = 'Regional WH';
                localStorage.setItem('vortex_logged_in', 'true');
                localStorage.setItem('vortex_user', app.currentUser);
                localStorage.setItem('vortex_role', app.currentRole);
                app.showNotification('Masuk mode demo lokal.', 'success');
                return;
            }
            if (!app.supabaseClient) {
                app.showNotification('Koneksi database tidak tersedia.', 'error');
                return;
            }

            try {
                app.isLoading = true;
                const { data: authData, error: authError } = await app.supabaseClient.auth.signInWithPassword({
                    email: app.loginForm.email,
                    password: app.loginForm.password
                });
                if (authError) throw authError;

                const userId = authData.user.id;
                const { data: profileData, error: profileError } = await app.supabaseClient.from('profiles').select('role, nama_lengkap, region').eq('id', userId).single();

                if (profileError || !profileData) {
                    throw new Error('Data profil pengguna tidak ditemukan di database.');
                }

                app.isLoggedIn = true;
                app.currentUser = profileData.nama_lengkap || authData.user.email.split('@')[0];
                app.currentRole = profileData.role;
                if (profileData.region) {
                    localStorage.setItem('vortex_region', profileData.region);
                }

                localStorage.setItem('vortex_logged_in', 'true');
                localStorage.setItem('vortex_user', app.currentUser);
                localStorage.setItem('vortex_role', app.currentRole);
                app.initProfileData();
                app.logAudit('login', { user: app.currentUser, role: app.currentRole });
                app.showNotification('Berhasil masuk ke sistem!', 'success');
            } catch (err) {
                app.showNotification('Gagal Masuk: ' + (err.message || err), 'error');
            } finally {
                app.isLoading = false;
            }
        },

        async logout() {
            if (app.isLoading) return;
            app.isLoading = true;
            try {
                if (app._reloadTimer) clearTimeout(app._reloadTimer);
                if (app._draftTimer) clearTimeout(app._draftTimer);
                
                if (app.supabaseClient) {
                    await app.supabaseClient.removeAllChannels();
                    await app.supabaseClient.auth.signOut().catch(() => {});
                }
            } catch (e) {
                console.error('Kesalahan saat proses logout:', e);
            } finally {
                localStorage.removeItem('vortex_logged_in');
                localStorage.removeItem('vortex_user');
                localStorage.removeItem('vortex_role');
                localStorage.removeItem('vortex_region');
                app.isLoggedIn = false;
                app.isLoading = false;
                window.location.href = window.location.pathname;
            }
        },

        initProfileData() {
            app.profileForm.namaLengkap = app.currentUser;
            app.profileForm.email = app.loginForm.email || 'user@acero.com';
        },

        async updateProfile() {
            if (!app.supabaseClient) {
                app.currentUser = app.profileForm.namaLengkap;
                localStorage.setItem('vortex_user', app.currentUser);
                app.showNotification('Profil diperbarui (Lokal) !', 'success');
                return;
            }
            try {
                app.isLoading = true;
                if (app.profileForm.newPassword) {
                    const { error: pwdErr } = await app.supabaseClient.auth.updateUser({ password: app.profileForm.newPassword });
                    if (pwdErr) throw pwdErr;
                }
                const { data: { user } } = await app.supabaseClient.auth.getUser();
                if (user) {
                    const { error: profErr } = await app.supabaseClient.from('profiles').update({ nama_lengkap: app.profileForm.namaLengkap }).eq('id', user.id);
                    if (profErr) throw profErr;
                }
                app.currentUser = app.profileForm.namaLengkap;
                localStorage.setItem('vortex_user', app.currentUser);
                app.profileForm.newPassword = '';
                app.showNotification('Profil berhasil diperbarui!', 'success');
            } catch (err) {
                app.showNotification('Gagal update profil: ' + (err.message || err), 'error');
            } finally {
                app.isLoading = false;
            }
        },

        async logAudit(action, details) {
            try {
                if (!app.supabaseClient) return;
                await app.supabaseClient.from('audit_log').insert({
                    user_name: app.currentUser || 'unknown',
                    user_role: app.currentRole || '',
                    action: action,
                    details: JSON.stringify(details || {}),
                    created_at: new Date().toISOString()
                });
            } catch (e) { 
                console.error('Terjadi kesalahan saat mencatat audit log:', e); 
            }
        }
    };
}