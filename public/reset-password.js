
"use strict";

const form = document.getElementById("resetPasswordForm");
const passwordInput = document.getElementById("newPassword");
const confirmInput = document.getElementById("confirmPassword");
const submitButton = document.getElementById("resetSubmit");
const message = document.getElementById("resetMessage");

let recoveryReady = false;

function showMessage(text, type = "success") {
  message.textContent = text;
  message.className = `auth-message show ${type}`;
}

function setLoading(loading) {
  submitButton.disabled = loading;
  submitButton.textContent = loading
    ? "Memproses..."
    : "Simpan Password Baru";
}

// Tombol untuk menampilkan atau menyembunyikan password.
document.querySelectorAll("[data-password-toggle]").forEach(button => {
  button.addEventListener("click", () => {
    const input = document.getElementById(
      button.dataset.passwordToggle
    );

    const show = input.type === "password";

    input.type = show ? "text" : "password";
    button.textContent = show ? "Sembunyikan" : "Lihat";
    button.setAttribute("aria-pressed", String(show));
    button.setAttribute(
      "aria-label",
      show ? "Sembunyikan password" : "Lihat password"
    );
  });
});

async function initializeRecovery() {
  const client = window.supabaseClient;

  if (!client) {
    showMessage("Supabase gagal dimuat. Muat ulang halaman.", "error");
    form.hidden = true;
    return;
  }

  try {
    // Supabase memproses sesi pemulihan dari tautan email.
    const { data, error } = await client.auth.getSession();

    if (error) throw error;

    const session = data.session;

    if (session) {
      recoveryReady = true;
      return;
    }

    // Jika link menggunakan PKCE, Supabase JS menukar code
    // dari URL menjadi sesi saat halaman dimuat.
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");

    if (code) {
      const { error: exchangeError } =
        await client.auth.exchangeCodeForSession(code);

      if (exchangeError) throw exchangeError;

      recoveryReady = true;
      return;
    }

    showMessage(
      "Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru dari halaman login.",
      "error"
    );
    form.hidden = true;
  } catch (error) {
    console.error("Recovery initialization error:", error);
    showMessage(
      "Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru.",
      "error"
    );
    form.hidden = true;
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();

  if (!recoveryReady) {
    showMessage(
      "Sesi pemulihan belum valid. Buka tautan dari email reset terbaru.",
      "error"
    );
    return;
  }

  const password = passwordInput.value;
  const confirmPassword = confirmInput.value;

  if (password.length < 10 || password.length > 128) {
    showMessage("Password harus 10–128 karakter.", "error");
    return;
  }

  if (password !== confirmPassword) {
    showMessage("Konfirmasi password tidak sama.", "error");
    return;
  }

  setLoading(true);

  try {
    const { error } = await window.supabaseClient.auth.updateUser({
      password
    });

    if (error) throw error;

    form.reset();
    recoveryReady = false;
    form.hidden = true;

    showMessage(
      "Password berhasil diperbarui. Silakan login menggunakan password baru.",
      "success"
    );

    await window.supabaseClient.auth.signOut();
  } catch (error) {
    console.error("Password reset error:", error);

    showMessage(
      error.message || "Gagal memperbarui password. Coba minta tautan reset baru.",
      "error"
    );
  } finally {
    setLoading(false);
  }
});

initializeRecovery();
