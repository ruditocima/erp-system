# Panduan WMS — Versi Perbaikan Produksi

File: `index.html` (versi telah diperbaiki, struktur & tampilan fitur tidak berubah)

---

## 1. Ringkasan Perubahan (apa yang berubah & mengapa)

| # | Perubahan | Alasan |
|---|-----------|--------|
| 1 | **Login offline tidak lagi otomatis jadi Super Admin.** Kini login wajib via Supabase. Mode demo lokal hanya aktif dengan URL `?demo=1` dan peran *Regional WH* (tanpa hak admin). | Lubang keamanan kritis: siapa pun bisa masuk sebagai admin saat CDN gagal. |
| 2 | **Role divalidasi ulang dari database** (`profiles`) setiap aplikasi dimuat, dan localStorage hanya jadi cache. Sesi kedaluwarsa → logout otomatis. | `isSuperAdmin` sebelumnya hanya dari localStorage — mudah dimanipulasi via DevTools. |
| 3 | **Satu sumber data:** `loadDataFromSupabase()` sekarang selalu menimpa data lokal, termasuk saat tabel DB kosong. | Sebelumnya data lama dari localStorage tetap tampil walau DB sudah dikosongkan → data palsu. |
| 4 | **Edit transaksi aman:** transaksi lama dicadangkan dulu; jika RPC gagal setelah penghapusan, transaksi lama **dikembalikan otomatis** (restore). | Sebelumnya: hapus dulu → RPC gagal = data hilang. |
| 5 | **Hapus transaksi via RPC `delete_warehouse_transaction`** (rollback stok + hapus = 1 transaksi atomik), dengan fallback manual lama. | Sebelumnya stok tidak dikembalikan ke DB saat menghapus. |
| 6 | **Bug paginasi Data Transaksi diperbaiki** — tabel kini memakai `getPaginatedTransactions()`. | Sebelumnya footer bilang "1–10 dari 50" tapi semua 50 baris tampil. |
| 7 | **Zona waktu WIB (UTC+7)** untuk tanggal transaksi, periode project, dan nomor transaksi fallback. | `toISOString()` memakai UTC → tanggal bisa bergeser 1 hari. |
| 8 | **Realtime debounce (800 ms)** pada pemantau perubahan tabel. | Mencegah loop reload antar-pengguna yang sama-sama aktif. |
| 9 | **Audit trail** (`audit_log`): login, logout, simpan/hapus master, simpan/update/hapus transaksi. | Jejak audit untuk sistem BAST yang bernilai hukum. |
| 10 | **Versi library dikunci** (Alpine 3.14.8, Lucide 0.454.0, Supabase JS 2.45.4); `html2pdf.js` dihapus (tidak pernah dipakai). | `@latest` berisiko merusak aplikasi saat library update. |

**Tidak berubah:** semua tampilan, template, menu, alur bisnis, logika drum/cable, BAST, CSV export, dan struktur file satu-halaman.

---

## 2. Persiapan Supabase (wajib)

### 2.1 Tabel yang sudah digunakan aplikasi
`profiles`, `master_barang`, `master_gudang`, `master_project`, `stok_gudang`, `drum_ledger`, `material_usage`, `transactions`, + bucket Storage `attachments`.

### 2.2 Tabel BARU: `audit_log`
```sql
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  user_name text,
  user_role text,
  action text not null,
  details jsonb,
  created_at timestamptz default now()
);
```

### 2.3 Function BARU (opsional tapi sangat disarankan): `delete_warehouse_transaction`
Aplikasi mencoba memanggil function ini; bila belum ada, otomatis jatuh ke fallback lama (tetap berfungsi, hanya kurang atomik).
```sql
create or replace function delete_warehouse_transaction(p_no_transaksi text)
returns jsonb language plpgsql security definer as $$
declare v_tx transactions%rowtype; v_item jsonb; v_qty numeric;
begin
  select * into v_tx from transactions where no_transaksi = p_no_transaksi;
  if not found then
    return jsonb_build_object('status','error','message','Transaksi tidak ditemukan');
  end if;

  -- rollback stok & ledger sesuai tipe (kebalikan dari applyTransactionStock)
  for v_item in select jsonb_array_elements(v_tx.items) loop
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    if v_tx.tipe_transaksi = 'Masuk' then
      update stok_gudang set qty = greatest(0, qty - v_qty)
        where kode_barang = v_item->>'kodeBarang' and gudang = v_tx.gudang_tujuan;
      if (v_item->>'drumId') is not null then
        update drum_ledger set remaining_length = greatest(0, remaining_length - v_qty)
          where drum_id = v_item->>'drumId';
      end if;
    elsif v_tx.tipe_transaksi = 'Keluar' then
      update stok_gudang set qty = qty + v_qty
        where kode_barang = v_item->>'kodeBarang' and gudang = v_tx.gudang_asal;
      if (v_item->>'drumId') is not null then
        update drum_ledger set remaining_length = remaining_length + v_qty
          where drum_id = v_item->>'drumId';
      end if;
    elsif v_tx.tipe_transaksi = 'Transfer' then
      update stok_gudang set qty = qty + v_qty
        where kode_barang = v_item->>'kodeBarang' and gudang = v_tx.gudang_asal;
      update stok_gudang set qty = greatest(0, qty - v_qty)
        where kode_barang = v_item->>'kodeBarang' and gudang = v_tx.gudang_tujuan;
      if (v_item->>'drumId') is not null then
        update drum_ledger set gudang = v_tx.gudang_asal where drum_id = v_item->>'drumId';
      end if;
    end if;
  end loop;

  delete from material_usage where transaction_no = p_no_transaksi;
  delete from transactions where no_transaksi = p_no_transaksi;
  return jsonb_build_object('status','success');
end $$;
```

### 2.4 Row Level Security (RLS) — inti keamanan
Karena role-check di browser bisa dimanipulasi, aturan wajib ada di database:
```sql
alter table master_barang enable row level security;
alter table master_gudang enable row level security;
alter table master_project enable row level security;
alter table stok_gudang enable row level security;
alter table drum_ledger enable row level security;
alter table material_usage enable row level security;
alter table transactions enable row level security;

-- Semua user terautentikasi boleh MEMBACA data operasional
create policy "read_barang" on master_barang for select to authenticated using (true);
create policy "read_gudang" on master_gudang for select to authenticated using (true);
create policy "read_project" on master_project for select to authenticated using (true);
create policy "read_stok" on stok_gudang for select to authenticated using (true);
create policy "read_drum" on drum_ledger for select to authenticated using (true);
create policy "read_usage" on material_usage for select to authenticated using (true);
create policy "read_tx" on transactions for select to authenticated using (true);

-- PROFIL: user hanya boleh membaca profilnya sendiri
create policy "read_own_profile" on profiles for select to authenticated
  using (auth.uid() = id);
```
**Prinsip penting:** tulis data operasional (stok, drum, transaksi, usage) **hanya lewat RPC** (`process_warehouse_transaction`, `potong_stok_kabel`, `delete_warehouse_transaction`) dengan `security definer` — jangan beri hak `insert/update/delete` langsung ke tabel-tabel tersebut bagi role `authenticated`. Master data boleh ditulis langsung hanya untuk role admin (buat policy `using` dengan cek role dari `profiles`).

---

## 3. Cara Menggunakan

### 3.1 Mode normal (produksi)
1. Upload `index.html` ke hosting statis apa pun (Netlify, Vercel, GitHub Pages, cPanel, nginx).
2. Pastikan **HTTPS aktif** (Supabase menolak request dari origin `http://` non-lokal).
3. Buka halaman → login dengan akun yang ada di tabel `auth.users` + `profiles`.

### 3.2 Mode demo lokal (tanpa database)
Buka dengan parameter: `index.html?demo=1`
- Masuk dengan email/password apa saja.
- Peran otomatis *Regional WH* (bukan admin): tidak bisa tambah/hapus master data dan transaksi — aman untuk demo ke klien.

### 3.3 Data dari versi lama
localStorage lama (`vortex_*`) otomatis menjadi cache awal, lalu ditimpa data dari Supabase begitu koneksi berhasil. Tidak perlu migrasi manual di browser.

---

## 4. Checklist Sebelum Publikasi

- [ ] RLS aktif di semua tabel (langkah 2.4)
- [ ] Tabel `audit_log` dibuat (2.2)
- [ ] Function `delete_warehouse_transaction` dibuat (2.3)
- [ ] RPC `process_warehouse_transaction` **menolak** transaksi dengan stok tidak cukup (validasi di server, bukan hanya di browser)
- [ ] Bucket `attachments` dibuat (publik untuk read, atau signed URL)
- [ ] Daftar RPC & tabel yang dipakai: `generate_kode_project`, `generate_no_transaksi`, `potong_stok_kabel`, `process_warehouse_transaction`, `delete_warehouse_transaction`
- [ ] Uji alur utama: Masuk → Transfer → Keluar (drum) → Edit transaksi → Hapus transaksi → Cetak BAST → Export CSV
- [ ] Uji dengan 2 browser bersamaan (validasi race condition stok)
- [ ] Backup otomatis database Supabase (fitur Scheduled Backups / pg_dump berkala)
- [ ] Ganti anon key bila pernah bocor: Supabase Dashboard → Settings → API → Reset anon key

## 5. Rollback (bila ada masalah)
Simpan file `index.html` versi lama. Semua perubahan bersifat additive — cukup kembalikan file lama; **tidak ada perubahan skema wajib** kecuali tabel `audit_log` dan function `delete_warehouse_transaction` yang sifatnya opsional.
