
require("dotenv").config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));

// ---------- KONFIGURASI SUPABASE ----------

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Environment variable belum diatur: ${key}`);
    process.exit(1);
  }
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseSecretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const authClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ---------- RATE LIMIT ----------

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan. Coba lagi nanti." },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter);

// ---------- EMAIL OPSIONAL ----------

let transporter = null;

if (
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS
) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ---------- UTILITAS ----------

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validUsername(username) {
  return /^[a-zA-Z0-9_]{3,24}$/.test(username);
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function logSupabaseError(label, error) {
  console.error(label, {
    message: error?.message || "Unknown error",
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null,
    status: error?.status || null,
  });
}

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

// Kolom database adalah user_id.
// Properti id pada respons dipertahankan agar kompatibel dengan frontend.
function profileResponse(profile) {
  if (!profile) return null;

  return {
    id: profile.user_id,
    username: profile.username,
    recovery_email: profile.recovery_email,
    created_at: profile.created_at,
  };
}

// ---------- AUTENTIKASI REQUEST ----------

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return sendError(res, 401, "Silakan login terlebih dahulu.");
    }

    const accessToken = match[1];

    const {
      data: { user },
      error,
    } = await authClient.auth.getUser(accessToken);

    if (error || !user) {
      return sendError(
        res,
        401,
        "Sesi login tidak valid atau sudah berakhir."
      );
    }

    req.user = user;
    return next();
  } catch (error) {
    logSupabaseError("Auth middleware error:", error);
    return sendError(res, 500, "Gagal memeriksa sesi login.");
  }
}

// ---------- SIGNUP ----------

app.post("/api/auth/signup", async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!validUsername(username)) {
      return sendError(
        res,
        400,
        "Username harus 3–24 karakter dan hanya boleh berisi huruf, angka, atau underscore."
      );
    }

    if (!validEmail(email)) {
      return sendError(res, 400, "Format email tidak valid.");
    }

    if (password.length < 8) {
      return sendError(res, 400, "Password minimal 8 karakter.");
    }

    // Struktur tabel profiles menggunakan user_id, bukan id.
    const { data: existingUsername, error: usernameError } =
      await admin
        .from("profiles")
        .select("user_id")
        .eq("username", username)
        .maybeSingle();

    if (usernameError) {
      logSupabaseError("Username lookup error:", usernameError);
      return sendError(res, 500, "Gagal memeriksa username.");
    }

    if (existingUsername) {
      return sendError(res, 409, "Username sudah digunakan.");
    }

    const { data: existingEmail, error: emailError } =
      await admin
        .from("profiles")
        .select("user_id")
        .ilike("recovery_email", email)
        .maybeSingle();

    if (emailError) {
      logSupabaseError("Recovery email lookup error:", emailError);
      return sendError(res, 500, "Gagal memeriksa email.");
    }

    if (existingEmail) {
      return sendError(res, 409, "Email sudah digunakan.");
    }

    // Profil dibuat oleh trigger Supabase.
    // Jangan membuat profil kedua kali di endpoint ini.
    const { data, error: signupError } =
      await authClient.auth.signUp({
        email,
        password,
        options: {
          data: { username },
        },
      });

    if (signupError) {
      logSupabaseError("Signup error:", signupError);

      if (signupError.status === 429) {
        return sendError(
          res,
          429,
          "Terlalu banyak percobaan pendaftaran. Coba lagi nanti."
        );
      }

      return sendError(
        res,
        signupError.status || 400,
        signupError.message || "Pendaftaran gagal."
      );
    }

    if (!data.user) {
      return sendError(res, 400, "Pendaftaran gagal.");
    }

    return res.status(201).json({
      message: data.session
        ? "Pendaftaran berhasil."
        : "Pendaftaran berhasil. Periksa email untuk konfirmasi akun.",
      user: {
        id: data.user.id,
        email: data.user.email,
        username,
      },
      session: data.session
        ? {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
          }
        : null,
    });
  } catch (error) {
    logSupabaseError("Signup server error:", error);
    return sendError(res, 500, "Terjadi kesalahan pada server.");
  }
});

// ---------- LOGIN ----------

app.post("/api/auth/login", async (req, res) => {
  try {
    const identifier = String(
      req.body.username || req.body.email || ""
    )
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    if (!identifier || !password) {
      return sendError(
        res,
        400,
        "Username/email dan password wajib diisi."
      );
    }

    let email = identifier;

    // Login username: cari recovery_email pada profiles.
    if (!identifier.includes("@")) {
      const { data: profile, error } = await admin
        .from("profiles")
        .select("user_id,username,recovery_email")
        .eq("username", identifier)
        .maybeSingle();

      if (error) {
        logSupabaseError("Login profile lookup error:", error);
        return sendError(res, 500, "Gagal memeriksa akun.");
      }

      if (!profile?.recovery_email) {
        return sendError(res, 401, "Username atau password salah.");
      }

      email = normalizeEmail(profile.recovery_email);
    }

    const { data, error: loginError } =
      await authClient.auth.signInWithPassword({
        email,
        password,
      });

    if (loginError || !data.user || !data.session) {
      if (loginError) {
        logSupabaseError("Login error:", loginError);
      }

      return sendError(res, 401, "Username/email atau password salah.");
    }

    // Cari profil berdasarkan user_id.
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("user_id,username,recovery_email,created_at")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (profileError) {
      logSupabaseError("Login profile read error:", profileError);
      return sendError(res, 500, "Gagal memuat profil akun.");
    }

    return res.json({
      message: "Login berhasil.",
      user: {
        id: data.user.id,
        email: data.user.email,
        username:
          profile?.username ||
          data.user.user_metadata?.username ||
          null,
      },
      profile: profileResponse(profile),
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (error) {
    logSupabaseError("Login server error:", error);
    return sendError(res, 500, "Terjadi kesalahan pada server.");
  }
});

// ---------- PEMULIHAN USERNAME ----------

app.post("/api/auth/recover-username", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!validEmail(email)) {
      return sendError(res, 400, "Masukkan email yang valid.");
    }

    const { data: profile, error } = await admin
      .from("profiles")
      .select("username,recovery_email")
      .ilike("recovery_email", email)
      .maybeSingle();

    if (error) {
      logSupabaseError("Recover username error:", error);
      return sendError(res, 500, "Gagal memeriksa email.");
    }

    // Tidak membocorkan apakah email terdaftar.
    if (!profile) {
      return res.json({
        message:
          "Jika email terdaftar, instruksi pemulihan akan tersedia.",
      });
    }

    if (!transporter) {
      return res.json({
        message:
          "Email pemulihan belum dikonfigurasi. Hubungi administrator.",
      });
    }

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: "Pemulihan username IPAN ULTRA",
      text: `Username akun IPAN ULTRA kamu adalah: ${profile.username}`,
    });

    return res.json({
      message:
        "Jika email terdaftar, instruksi pemulihan akan tersedia.",
    });
  } catch (error) {
    logSupabaseError("Recover username server error:", error);
    return sendError(res, 500, "Gagal mengirim email pemulihan.");
  }
});

/* ---------- LUPA PASSWORD ---------- */

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!validEmail(email)) {
      return sendError(res, 400, "Masukkan email yang valid.");
    }

    // Gunakan URL aplikasi milik sendiri, bukan URL dari input pengguna.
    const appUrl = (
      process.env.APP_URL || `http://localhost:${PORT}`
    ).replace(/\/+$/, "");

    const redirectTo = `${appUrl}/reset-password.html`;

    const { error } = await authClient.auth.resetPasswordForEmail(
      email,
      { redirectTo }
    );

    if (error) {
      logSupabaseError("Forgot password error:", error);

      // Jangan mengungkap apakah email terdaftar.
      // Detail kegagalan tetap tercatat di log server.
    }

    return res.json({
      message:
        "Jika email terhubung dengan akun, instruksi reset password akan dikirim. Periksa juga folder spam.",
    });
  } catch (error) {
    logSupabaseError("Forgot password server error:", error);

    return sendError(
      res,
      500,
      "Permintaan reset password gagal. Coba lagi nanti."
    );
  }
});

// ---------- PROFIL PENGGUNA ----------

app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const { data: profile, error } = await admin
      .from("profiles")
      .select("user_id,username,recovery_email,created_at")
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) {
      logSupabaseError("Profile fetch error:", error);
      return sendError(res, 500, "Gagal memuat profil.");
    }

    return res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
      },
      profile: profileResponse(profile),
    });
  } catch (error) {
    logSupabaseError("Profile server error:", error);
    return sendError(res, 500, "Terjadi kesalahan pada server.");
  }
});

// ---------- AKTIVITAS ----------

const activityColumns =
  "id,user_id,activity_date,created_at,name,activity_type,distance_km,duration_minutes,elevation_m,feeling,notes,updated_at";

function validateActivity(body) {
  if (typeof body.name !== "string" || !body.name.trim()) {
    return "Nama aktivitas wajib diisi.";
  }

  const distance = Number(body.distance_km);
  const duration = Number(body.duration_minutes);

  if (!Number.isFinite(distance) || distance <= 0) {
    return "Jarak harus lebih besar dari 0.";
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    return "Durasi harus lebih besar dari 0.";
  }

  if (
    body.activity_date &&
    Number.isNaN(Date.parse(body.activity_date))
  ) {
    return "Tanggal aktivitas tidak valid.";
  }

  if (
    body.elevation_m !== undefined &&
    body.elevation_m !== "" &&
    (!Number.isFinite(Number(body.elevation_m)) ||
      Number(body.elevation_m) < 0)
  ) {
    return "Elevasi tidak boleh negatif.";
  }

  return null;
}

function activityPayload(body, userId) {
  const today = new Date().toISOString().slice(0, 10);

  return {
    user_id: userId,
    name: String(body.name).trim(),
    activity_type: String(body.activity_type || "Lari").trim(),
    activity_date: body.activity_date || today,
    distance_km: Number(body.distance_km),
    duration_minutes: Number(body.duration_minutes),
    elevation_m:
      body.elevation_m === undefined || body.elevation_m === ""
        ? 0
        : Number(body.elevation_m),
    feeling: String(body.feeling || "Nyaman").trim(),
    notes: String(body.notes || "").trim(),
  };
}

// Daftar aktivitas milik pengguna yang login.
app.get("/api/activities", requireAuth, async (req, res) => {
  try {
    const { data, error } = await admin
      .from("activities")
      .select(activityColumns)
      .eq("user_id", req.user.id)
      .order("activity_date", { ascending: false });

    if (error) {
      logSupabaseError("Activities fetch error:", error);
      return sendError(res, 500, "Gagal memuat aktivitas.");
    }

    return res.json({ activities: data || [] });
  } catch (error) {
    logSupabaseError("Activities server error:", error);
    return sendError(res, 500, "Terjadi kesalahan pada server.");
  }
});

// Tambah aktivitas.
app.post("/api/activities", requireAuth, async (req, res) => {
  try {
    const validationError = validateActivity(req.body);

    if (validationError) {
      return sendError(res, 400, validationError);
    }

    const payload = activityPayload(req.body, req.user.id);

    const { data, error } = await admin
      .from("activities")
      .insert(payload)
      .select(activityColumns)
      .single();

    if (error) {
      logSupabaseError("Activity insert error:", error);
      return sendError(res, 500, "Gagal menyimpan aktivitas.");
    }

    return res.status(201).json({
      message: "Aktivitas berhasil disimpan.",
      activity: data,
    });
  } catch (error) {
    logSupabaseError("Activity insert server error:", error);
    return sendError(res, 500, "Terjadi kesalahan pada server.");
  }
});

// Perbarui aktivitas milik pengguna yang login.
app.put("/api/activities/:id", requireAuth, async (req, res) => {
  try {
    const validationError = validateActivity(req.body);

    if (validationError) {
      return sendError(res, 400, validationError);
    }

    const payload = activityPayload(req.body, req.user.id);
    delete payload.user_id;
    payload.updated_at = new Date().toISOString();

    const { data, error } = await admin
      .from("activities")
      .update(payload)
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .select(activityColumns)
      .maybeSingle();

    if (error) {
      logSupabaseError("Activity update error:", error);
      return sendError(res, 500, "Gagal memperbarui aktivitas.");
    }

    if (!data) {
      return sendError(res, 404, "Aktivitas tidak ditemukan.");
    }

    return res.json({
      message: "Aktivitas berhasil diperbarui.",
      activity: data,
    });
  } catch (error) {
    logSupabaseError("Activity update server error:", error);
    return sendError(res, 500, "Terjadi kesalahan pada server.");
  }
});

// Hapus aktivitas milik pengguna yang login.
app.delete("/api/activities/:id", requireAuth, async (req, res) => {
  try {
    const { data, error } = await admin
      .from("activities")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      logSupabaseError("Activity delete error:", error);
      return sendError(res, 500, "Gagal menghapus aktivitas.");
    }

    if (!data) {
      return sendError(res, 404, "Aktivitas tidak ditemukan.");
    }

    return res.json({ message: "Aktivitas berhasil dihapus." });
  } catch (error) {
    logSupabaseError("Activity delete server error:", error);
    return sendError(res, 500, "Terjadi kesalahan pada server.");
  }
});

// ---------- HALAMAN WEB ----------

const publicDir = path.join(__dirname, "public");

app.use(express.static(publicDir, { index: false }));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "login.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Jangan mengirim halaman login sebagai respons endpoint API yang salah.
app.get("/{*splat}", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return sendError(res, 404, "Endpoint API tidak ditemukan.");
  }

  res.sendFile(path.join(publicDir, "login.html"), (error) => {
    if (error) next(error);
  });
});

// ---------- PENANGANAN ERROR ----------

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  logSupabaseError("Unhandled server error:", error);
  return sendError(res, 500, "Terjadi kesalahan pada server.");
});

// ---------- JALANKAN SERVER ----------

app.listen(PORT, () => {
  console.log(`IPAN ULTRA berjalan di http://localhost:${PORT}`);
});
