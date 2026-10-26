
"use strict";

const views = [
  "loginView",
  "signupView",
  "recoveryView",
  "usernameRecoveryView"
];

const message = document.getElementById("authMessage");

function showView(viewId) {
  views.forEach(id => {
    document.getElementById(id).hidden = id !== viewId;
  });

  message.textContent = "";
  message.className = "auth-message";
}

document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

function showMessage(text, type = "success") {
  message.textContent = text;
  message.className = `auth-message show ${type}`;
}

async function apiRequest(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || "Permintaan gagal. Coba lagi.");
  }

  return result;
}

function setLoading(form, loading, defaultText) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;

  button.disabled = loading;
  button.textContent = loading ? "Memproses..." : defaultText;
}

// Tombol mata untuk seluruh input password.
document.querySelectorAll("[data-password-toggle]").forEach(button => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.passwordToggle);
    const show = input.type === "password";

    input.type = show ? "text" : "password";
    button.setAttribute("aria-pressed", String(show));
    button.setAttribute(
      "aria-label",
      show ? "Sembunyikan password" : "Lihat password"
    );

    button.innerHTML = show
      ? `<svg class="eye-icon" viewBox="0 0 24 24" aria-hidden="true">
           <path d="m3 3 18 18"/>
           <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/>
           <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a15 15 0 0 1-4 4.7"/>
           <path d="M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10 10 0 0 0 4-.8"/>
         </svg>`
      : `<svg class="eye-icon" viewBox="0 0 24 24" aria-hidden="true">
           <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/>
           <circle cx="12" cy="12" r="3"/>
         </svg>`;
  });
});

// LOGIN
document.getElementById("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;

  setLoading(form, true, "Login");

  try {
    const result = await apiRequest("/api/auth/login", { username, password });

    sessionStorage.setItem("ipan_access_token", result.session.access_token);
    sessionStorage.setItem("ipan_refresh_token", result.session.refresh_token);
    sessionStorage.setItem("ipan_username", result.user.username);

    window.location.replace("/dashboard");
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setLoading(form, false, "Login");
  }
});

// SIGNUP
document.getElementById("signupForm").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const username = document.getElementById("signupUsername").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const confirmPassword = document.getElementById("signupPasswordConfirm").value;

  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    showMessage("Username harus 3–24 karakter dan hanya berisi huruf, angka, atau underscore.", "error");
    return;
  }

  if (password.length < 10 || password.length > 128) {
    showMessage("Password harus 10–128 karakter.", "error");
    return;
  }

  if (password !== confirmPassword) {
    showMessage("Konfirmasi password tidak sama.", "error");
    return;
  }

  setLoading(form, true, "Buat Akun");

  try {
    const result = await apiRequest("/api/auth/signup", {
      username,
      email,
      password
    });

    showView("loginView");
    showMessage(result.message, "success");
    document.getElementById("loginUsername").value = username.toLowerCase();
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setLoading(form, false, "Buat Akun");
  }
});

// LUPA PASSWORD
document.getElementById("recoveryForm").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const email = document.getElementById("recoveryEmail").value.trim();

  setLoading(form, true, "Kirim Link Reset");

  try {
    const result = await apiRequest("/api/auth/forgot-password", { email });
    showMessage(result.message, "success");
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setLoading(form, false, "Kirim Link Reset");
  }
});

// LUPA USERNAME
document.getElementById("usernameRecoveryForm").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const email = document.getElementById("usernameRecoveryEmail").value.trim();

  setLoading(form, true, "Kirim ke Email");

  try {
    const result = await apiRequest("/api/auth/recover-username", { email });
    showMessage(result.message, "success");
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setLoading(form, false, "Kirim ke Email");
  }
});
