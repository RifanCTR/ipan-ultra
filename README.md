# IPAN ULTRA — Road to 100K

Starter app web pencatatan lari menggunakan HTML/CSS/JavaScript, Express, Supabase, dan Chart.js. Tidak menggunakan AI API.

## Catatan akun username-only

Aplikasi ini tidak menggunakan kode pemulihan. Supabase Anonymous Auth menyimpan sesi di browser yang digunakan saat pembuatan akun. Sesi dapat dilanjutkan otomatis pada browser yang sama, tetapi username saja tidak dapat mengautentikasi pemilik akun di perangkat/browser lain. Jika cache/browser data dihapus atau perangkat diganti, akun lama tidak dapat dipulihkan dengan username saja. Jangan gunakan untuk data sensitif.

## 1. Siapkan Supabase

Project URL dan publishable key sudah dimasukkan ke `public/app.js`. Publishable key memang dirancang untuk client, tetapi hanya aman bila RLS aktif dan policy benar.

1. Buka Supabase Dashboard project kamu.
2. Buka Authentication settings dan aktifkan **Anonymous Sign-Ins**.
3. Buka SQL Editor.
4. Jalankan isi `supabase-schema.sql`.
6. Jika dashboard meminta mengaktifkan akses Data API untuk tabel, pastikan policy/RLS tetap aktif. Jangan pernah menonaktifkan RLS.

## 2. Jalankan secara lokal

Perlu Node.js versi LTS.

```bash
npm install
npm start
```

Buka `http://localhost:3000`.

Bisa juga buka `public/index.html` dengan server statis, tetapi memakai Express lokal lebih konsisten.

## 3. Deploy

Bisa deploy sebagai Node.js app ke layanan hosting yang mendukung Node. Set `PORT` bila platform memerlukannya. Pastikan URL website menggunakan HTTPS. Karena frontend menggunakan Supabase URL/key publik, key tersebut bukan password database; keamanan data bergantung pada RLS. Edge Function delete-my-account tetap diperlukan untuk fitur hapus akun.

## 4. Fitur

- Dashboard dengan total jarak, durasi, sesi, long run, dan ringkasan minggu.
- Form aktivitas lari dan Rest.
- Validasi pace `MM:SS` dan durasi `HH:MM:SS`.
- Riwayat dengan pencarian/filter, edit, hapus.
- Kalender bulanan.
- Grafik jarak dan elevasi.
- Jadwal latihan manual.
- Koleksi video YouTube dan catatan pribadi.
- Pengaturan tanggal mulai program dan ekspor CSV.
- Data aktivitas disimpan di Supabase.

## 5. Catatan pengembangan

- Jadwal latihan masih manual; bukan pelatih medis otomatis.
- Rekomendasi beban latihan harus ditinjau berdasarkan pemulihan dan keluhan tubuh.
- Day number dihitung dari tanggal mulai program.
- Statistik dihitung dari aktivitas yang tercatat, bukan data contoh.
- Lakukan pengujian keamanan sebelum digunakan publik.
