(() => {
  "use strict";

  const supabase = window.supabaseClient;
  const $ = (id) => document.getElementById(id);

  const state = {
    user: null,
    profile: null,
    activities: [],
    page: "home",
    editingId: null,
    statsPeriod: "month"
  };

  const MONTHS_ID = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  const TYPES = [
    "Lari", "Trail Run", "Jalan", "Hiking", "Bersepeda", "Treadmill"
  ];

  const MEDIA = {
    videos: Array.from({ length: 9 }, (_, i) => ({
      title: `Video Motivasi ${i + 1}`,
      src: `/video/video${i + 1}.mp4`
    })),
    photos: Array.from({ length: 3 }, (_, i) => ({
      title: `Foto Motivasi ${i + 1}`,
      src: `/picture/foto${i + 1}.jpeg`
    }))
  };

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function showMessage(message, type = "") {
    const el = $("globalMessage");
    if (!el) {
      console.log(message);
      return;
    }
    el.textContent = message;
    el.className = `message ${type}`.trim();
    el.hidden = false;
  }

  function hideMessage() {
    const el = $("globalMessage");
    if (el) el.hidden = true;
  }

  function localDate() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());

    const part = name => parts.find(p => p.type === name).value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  function dateFromKey(value) {
    return new Date(`${value}T12:00:00+07:00`);
  }

  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(date, amount) {
    const result = new Date(date);
    result.setDate(result.getDate() + amount);
    return result;
  }

  function formatDate(value) {
    if (!value) return "Tanggal tidak tersedia";
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Jakarta"
    }).format(dateFromKey(value));
  }

  function formatPace(secondsPerKm) {
    const value = Number(secondsPerKm);
    if (!Number.isFinite(value) || value <= 0) return "--:--";
    const seconds = Math.round(value);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function formatDuration(totalMinutes) {
    const seconds = Math.max(0, Math.round((Number(totalMinutes) || 0) * 60));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    const parts = [];
    if (hours) parts.push(`${hours} jam`);
    if (minutes) parts.push(`${minutes} menit`);
    if (remainder) parts.push(`${remainder} detik`);
    return parts.length ? parts.join(" ") : "0 menit";
  }

  function getDurationMinutes() {
    const hours = Number($("duration-hours")?.value || 0);
    const minutes = Number($("duration-minutes")?.value || 0);
    const seconds = Number($("duration-seconds")?.value || 0);

    if (
      !Number.isInteger(hours) || !Number.isInteger(minutes) ||
      !Number.isInteger(seconds) || hours < 0 || hours > 999 ||
      minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59
    ) return null;

    return hours * 60 + minutes + seconds / 60;
  }

  function updatePace() {
    const distance = Number($("distance")?.value);
    const duration = getDurationMinutes();
    const preview = $("pacePreview");
    if (!preview) return;

    if (!Number.isFinite(distance) || distance <= 0 ||
        duration === null || duration <= 0) {
      preview.textContent = "--:-- /km";
      return;
    }

    preview.textContent = `${formatPace(duration * 60 / distance)} /km`;
  }

  function openPage(page) {
    const allowed = ["home", "add", "history", "motivation", "settings"];
    if (!allowed.includes(page)) return;

    state.page = page;

    document.querySelectorAll(".page").forEach(section => {
      section.classList.toggle("active", section.id === `page-${page}`);
    });

    document.querySelectorAll(".nav-button[data-page]").forEach(button => {
      button.classList.toggle("active", button.dataset.page === page);
    });

    hideMessage();
    if (page === "home") renderDashboard();
    if (page === "history") renderHistory();
    if (page === "motivation") renderMotivation();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  window.openPage = openPage;

  function resetForm() {
    $("activityForm")?.reset();
    state.editingId = null;

    if ($("activityId")) $("activityId").value = "";
    if ($("activityDate")) $("activityDate").value = localDate();
    if ($("duration-hours")) $("duration-hours").value = "0";
    if ($("duration-minutes")) $("duration-minutes").value = "0";
    if ($("duration-seconds")) $("duration-seconds").value = "0";
    if ($("elevation")) $("elevation").value = "0";
    if ($("formTitle")) $("formTitle").textContent = "Catat aktivitas";
    if ($("saveButton")) $("saveButton").textContent = "Simpan Aktivitas";

    updatePace();
  }

  window.resetForm = resetForm;

  async function ensureSession() {
    if (!supabase) {
      throw new Error("Supabase belum terinisialisasi. Periksa public/supabase.js.");
    }

    const accessToken = sessionStorage.getItem("ipan_access_token");
    const refreshToken = sessionStorage.getItem("ipan_refresh_token");

    if (!accessToken || !refreshToken) {
      window.location.replace("/");
      throw new Error("Sesi login tidak ditemukan. Silakan login kembali.");
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    if (error || !data.session?.user) {
      sessionStorage.removeItem("ipan_access_token");
      sessionStorage.removeItem("ipan_refresh_token");
      sessionStorage.removeItem("ipan_username");
      window.location.replace("/");
      throw new Error("Sesi login tidak valid. Silakan login kembali.");
    }

    state.user = data.session.user;
    sessionStorage.setItem("ipan_access_token", data.session.access_token);
    sessionStorage.setItem("ipan_refresh_token", data.session.refresh_token);
    return state.user;
  }

  async function loadProfile() {
    if (!state.user) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", state.user.id)
      .maybeSingle();

    if (error) {
      console.warn("Profil tidak dapat dimuat:", error.message);
      state.profile = null;
      return;
    }

    state.profile = data || null;
  }

  function displayName() {
    return state.profile?.username ||
      sessionStorage.getItem("ipan_username") ||
      state.user?.user_metadata?.username ||
      "Pelari";
  }

  async function loadActivities() {
    if (!state.user) return;

    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .eq("user_id", state.user.id)
      .order("activity_date", { ascending: false });

    if (error) throw error;

    state.activities = (data || []).map(item => {
      const distance = Number(item.distance_km) || 0;
      const duration = Number(item.duration_minutes) || 0;

      return {
        ...item,
        distance_km: distance,
        duration_minutes: duration,
        pace_seconds: distance > 0 && duration > 0
          ? duration * 60 / distance
          : null
      };
    });
  }

  // =========================
  // STATISTIK PERIODE
  // =========================

  function initPeriodSelectors() {
    const monthSelect = $("statsMonth");
    const yearSelect = $("statsYear");
    if (!monthSelect || !yearSelect) return;

    const today = localDate();
    const currentYear = Number(today.slice(0, 4));
    const currentMonth = Number(today.slice(5, 7)) - 1;

    monthSelect.value = String(currentMonth);
    yearSelect.innerHTML = Array.from({ length: 11 }, (_, i) => currentYear + 2 - i)
      .map(year => `<option value="${year}">${year}</option>`)
      .join("");
    yearSelect.value = String(currentYear);

    document.querySelectorAll("[data-period]").forEach(button => {
      button.addEventListener("click", () => {
        state.statsPeriod = button.dataset.period;

        document.querySelectorAll("[data-period]").forEach(item => {
          item.classList.toggle("active", item === button);
        });

        renderPeriodStatistics();
      });
    });

    monthSelect.addEventListener("change", renderPeriodStatistics);
    yearSelect.addEventListener("change", renderPeriodStatistics);
  }

  function getPeriodRange() {
    const today = dateFromKey(localDate());
    const month = Number($("statsMonth")?.value ?? today.getMonth());
    const year = Number($("statsYear")?.value ?? today.getFullYear());

    if (state.statsPeriod === "week") {
      // Minggu berjalan, Senin sampai Minggu.
      const start = addDays(today, -((today.getDay() + 6) % 7));
      start.setHours(12, 0, 0, 0);
      const end = addDays(start, 7);

      return {
        start,
        end,
        label: `${formatDate(dateKey(start))} – ${formatDate(dateKey(addDays(end, -1)))}`
      };
    }

    if (state.statsPeriod === "year") {
      return {
        start: new Date(year, 0, 1, 12),
        end: new Date(year + 1, 0, 1, 12),
        label: String(year)
      };
    }

    return {
      start: new Date(year, month, 1, 12),
      end: new Date(year, month + 1, 1, 12),
      label: `${MONTHS_ID[month]} ${year}`
    };
  }

  function renderPeriodStatistics() {
    if (!$("periodChart")) return;

    const range = getPeriodRange();
    const selected = state.activities.filter(item => {
      const date = dateFromKey(item.activity_date);
      return date >= range.start && date < range.end;
    });

    const distance = selected.reduce((sum, item) => sum + item.distance_km, 0);
    const duration = selected.reduce((sum, item) => sum + item.duration_minutes, 0);
    const elevation = selected.reduce((sum, item) => sum + (Number(item.elevation_m) || 0), 0);
    const activeDays = new Set(selected.map(item => item.activity_date)).size;
    const pace = distance > 0 && duration > 0 ? duration * 60 / distance : null;

    if ($("periodLabel")) $("periodLabel").textContent = range.label;
    if ($("periodDistance")) $("periodDistance").textContent = `${distance.toFixed(1)} km`;
    if ($("periodActivities")) $("periodActivities").textContent = String(selected.length);
    if ($("periodDuration")) {
      $("periodDuration").textContent = duration >= 60
        ? `${(duration / 60).toFixed(1)}j`
        : `${Math.round(duration)}m`;
    }
    if ($("periodPace")) $("periodPace").textContent = pace ? formatPace(pace) : "--:--";
    if ($("periodElevation")) $("periodElevation").textContent = `${elevation.toFixed(0)} m`;
    if ($("periodActiveDays")) $("periodActiveDays").textContent = String(activeDays);

    // Bandingkan dengan periode sebelumnya yang sama panjang/jenis.
    let previousStart;
    let previousEnd = range.start;

    if (state.statsPeriod === "week") {
      previousStart = addDays(range.start, -7);
    } else if (state.statsPeriod === "year") {
      previousStart = new Date(range.start.getFullYear() - 1, 0, 1, 12);
    } else {
      previousStart = new Date(range.start.getFullYear(), range.start.getMonth() - 1, 1, 12);
    }

    const previousDistance = state.activities
      .filter(item => {
        const date = dateFromKey(item.activity_date);
        return date >= previousStart && date < previousEnd;
      })
      .reduce((sum, item) => sum + item.distance_km, 0);

    let comparison = "Belum ada jarak pada periode sebelumnya.";
    if (previousDistance > 0) {
      const change = ((distance - previousDistance) / previousDistance) * 100;
      comparison = `${change > 0 ? "+" : ""}${change.toFixed(0)}% jarak dibanding periode sebelumnya (${previousDistance.toFixed(1)} km).`;
    } else if (distance > 0) {
      comparison = "Ada progres pada periode ini; belum ada jarak pada periode sebelumnya.";
    }
    if ($("periodComparison")) $("periodComparison").textContent = comparison;

    let buckets = [];

    if (state.statsPeriod === "week") {
      buckets = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(range.start, i);
        const key = dateKey(date);
        return {
          label: ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"][i],
          distance: selected
            .filter(item => item.activity_date === key)
            .reduce((sum, item) => sum + item.distance_km, 0)
        };
      });
      if ($("periodChartTitle")) $("periodChartTitle").textContent = "Jarak per hari minggu ini";
    } else if (state.statsPeriod === "month") {
      const daysInMonth = new Date(range.start.getFullYear(), range.start.getMonth() + 1, 0).getDate();
      const count = Math.ceil(daysInMonth / 7);

      buckets = Array.from({ length: count }, (_, i) => {
        const from = i * 7 + 1;
        const to = Math.min((i + 1) * 7, daysInMonth);

        return {
          label: `M${i + 1}`,
          distance: selected
            .filter(item => {
              const day = Number(item.activity_date.slice(8, 10));
              return day >= from && day <= to;
            })
            .reduce((sum, item) => sum + item.distance_km, 0)
        };
      });

      if ($("periodChartTitle")) {
        $("periodChartTitle").textContent = `Jarak per minggu dalam ${MONTHS_ID[range.start.getMonth()]}`;
      }
    } else {
      buckets = MONTHS_ID.map((label, month) => ({
        label: label.slice(0, 3),
        distance: selected
          .filter(item => Number(item.activity_date.slice(5, 7)) === month + 1)
          .reduce((sum, item) => sum + item.distance_km, 0)
      }));

      if ($("periodChartTitle")) $("periodChartTitle").textContent = "Jarak per bulan dalam setahun";
    }

    const maxDistance = Math.max(1, ...buckets.map(item => item.distance));
    $("periodChart").style.gridTemplateColumns = `repeat(${buckets.length}, minmax(0, 1fr))`;
    $("periodChart").innerHTML = buckets.map(item => {
      const height = item.distance > 0 ? Math.max(4, item.distance / maxDistance * 100) : 0;
      return `
        <div class="bar-item">
          <span class="bar-value">${item.distance > 0 ? item.distance.toFixed(1) : ""}</span>
          <div class="bar-track">
            <div class="bar-fill" style="height:${height}%"></div>
          </div>
          <span class="bar-label">${item.label}</span>
        </div>
      `;
    }).join("");
  }

  // =========================
  // DASHBOARD
  // =========================

  function renderDashboard() {
    const activities = state.activities;
    renderPeriodStatistics();

    const totalDistance = activities.reduce((sum, item) => sum + item.distance_km, 0);
    const totalDuration = activities.reduce((sum, item) => sum + item.duration_minutes, 0);
    const totalElevation = activities.reduce((sum, item) => sum + (Number(item.elevation_m) || 0), 0);

    const goal = Number(localStorage.getItem("ipanUltraGoal")) || 100;
    const percentage = Math.min(100, totalDistance / goal * 100);

    if ($("greeting")) $("greeting").textContent = `Selamat datang, ${displayName()}.`;
    if ($("profileName")) $("profileName").textContent = displayName();
    if ($("totalDistance")) $("totalDistance").textContent = totalDistance.toFixed(2);
    if ($("totalActivities")) $("totalActivities").textContent = activities.length;
    if ($("totalDuration")) $("totalDuration").textContent = (totalDuration / 60).toFixed(1);
    if ($("totalElevation")) $("totalElevation").textContent = totalElevation.toFixed(0);
    if ($("goalPercent")) $("goalPercent").textContent = `${percentage.toFixed(0)}%`;
    if ($("goalProgress")) $("goalProgress").style.width = `${percentage}%`;
    if ($("goalCurrent")) $("goalCurrent").textContent = `${totalDistance.toFixed(2)} km terkumpul`;
    if ($("goalTarget")) $("goalTarget").textContent = `Target ${goal} km`;
    if ($("goalInput")) $("goalInput").value = String(goal);

    const recent = [...activities].sort((a, b) => {
      const dateCompare = String(b.activity_date).localeCompare(String(a.activity_date));
      if (dateCompare !== 0) return dateCompare;
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    }).slice(0, 5);

    if ($("recentActivities")) {
      $("recentActivities").innerHTML = recent.length
        ? recent.map(item => activityCard(item, false)).join("")
        : `<div class="empty">Belum ada aktivitas. Catat latihan pertamamu.</div>`;
    }
  }

  function activityCard(item, actions = true) {
    const pace = item.pace_seconds ? `${formatPace(item.pace_seconds)}/km` : "--:-- /km";

    return `
      <article class="activity">
        <div class="activity-body">
          <div class="activity-title">${escapeHTML(item.name || "Aktivitas")}</div>
          <div class="activity-meta">
            ${escapeHTML(formatDate(item.activity_date))}<br>
            ${escapeHTML(item.name || "Aktivitas")} · ${escapeHTML(formatDuration(item.duration_minutes))}<br>
            Pace ${escapeHTML(pace)}
            ${Number(item.elevation_m) > 0 ? ` · Elevasi ${Number(item.elevation_m).toFixed(0)} m` : ""}
            ${item.notes ? `<br>${escapeHTML(item.notes)}` : ""}
          </div>
          <div class="activity-distance">${Number(item.distance_km).toFixed(2)} km</div>
          ${actions ? `
            <div class="activity-actions">
              <button class="mini" type="button" data-edit="${escapeHTML(item.id)}">Edit</button>
              <button class="mini" type="button" data-delete="${escapeHTML(item.id)}">Hapus</button>
            </div>
          ` : ""}
        </div>
      </article>
    `;
  }

  function renderHistory() {
    const filter = $("historyFilter")?.value || "Semua";
    const list = state.activities.filter(item => {
      if (filter === "Semua") return true;
      return String(item.name || "").toLowerCase().includes(filter.toLowerCase());
    });

    if ($("historyActivities")) {
      $("historyActivities").innerHTML = list.length
        ? list.map(item => activityCard(item, true)).join("")
        : `<div class="empty">Belum ada aktivitas yang cocok dengan filter.</div>`;
    }
  }

  // =========================
  // TAMBAH / EDIT AKTIVITAS
  // =========================

  async function saveActivity(event) {
    event.preventDefault();
    hideMessage();

    if (!state.user) {
      showMessage("Sesi login belum tersedia. Silakan login kembali.", "error");
      return;
    }

    const name = $("activityName").value.trim();
    const type = $("activityType").value;
    const date = $("activityDate").value;
    const distance = Number($("distance").value);
    const durationMinutes = getDurationMinutes();
    const elevation = Number($("elevation")?.value || 0);
    const notes = $("notes").value.trim();
    const feeling = $("feeling").value;

    if (!name || !date) {
      showMessage("Nama aktivitas dan tanggal wajib diisi.", "error");
      return;
    }
    if (!Number.isFinite(distance) || distance <= 0 || distance > 9999) {
      showMessage("Masukkan jarak lebih dari 0 km dan maksimal 9999 km.", "error");
      return;
    }
    if (durationMinutes === null || durationMinutes <= 0) {
      showMessage("Masukkan durasi yang valid. Total durasi harus lebih dari 0.", "error");
      return;
    }
    if (!Number.isFinite(elevation) || elevation < 0) {
      showMessage("Elevasi tidak valid.", "error");
      return;
    }

    const button = $("saveButton");
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = "Menyimpan...";

    const payload = {
      user_id: state.user.id,
      activity_date: date,
      name: `${name} (${type})`,
      distance_km: distance,
      duration_minutes: durationMinutes,
      elevation_m: elevation,
      notes: notes ? `${notes}\nKondisi: ${feeling}` : `Kondisi: ${feeling}`
    };

    try {
      let result;

      if (state.editingId) {
        result = await supabase
          .from("activities")
          .update(payload)
          .eq("id", state.editingId)
          .eq("user_id", state.user.id);
      } else {
        result = await supabase.from("activities").insert(payload);
      }

      if (result.error) throw result.error;

      resetForm();
      await loadActivities();
      renderDashboard();
      renderHistory();
      openPage("home");
      showMessage("Aktivitas berhasil disimpan.", "success");
    } catch (error) {
      console.error("Gagal menyimpan aktivitas:", error);
      showMessage(`Gagal menyimpan aktivitas: ${error.message || "Kesalahan tidak diketahui"}`, "error");
    } finally {
      button.disabled = false;
      button.textContent = oldText || "Simpan Aktivitas";
    }
  }

  function editActivity(id) {
    const item = state.activities.find(activity => String(activity.id) === String(id));
    if (!item) return;

    state.editingId = item.id;
    const match = String(item.name || "").match(/^(.*) \(([^()]*)\)$/);

    $("activityName").value = match ? match[1] : (item.name || "");
    $("activityType").value = match && TYPES.includes(match[2]) ? match[2] : "Lari";
    $("activityDate").value = item.activity_date || localDate();
    $("distance").value = Number(item.distance_km) ? Number(item.distance_km).toFixed(2) : "";

    const totalSeconds = Math.max(0, Math.round((Number(item.duration_minutes) || 0) * 60));
    $("duration-hours").value = String(Math.floor(totalSeconds / 3600));
    $("duration-minutes").value = String(Math.floor((totalSeconds % 3600) / 60));
    if ($("duration-seconds")) $("duration-seconds").value = String(totalSeconds % 60);

    $("elevation").value = item.elevation_m ?? 0;

    const note = String(item.notes || "");
    const feelingMatch = note.match(/(?:\n)?Kondisi: (Nyaman|Sedang|Berat|Pemulihan)$/);

    $("feeling").value = feelingMatch ? feelingMatch[1] : "Nyaman";
    $("notes").value = feelingMatch
      ? note.replace(/(?:\n)?Kondisi: (Nyaman|Sedang|Berat|Pemulihan)$/, "")
      : note;

    $("formTitle").textContent = "Edit aktivitas";
    $("saveButton").textContent = "Simpan Perubahan";
    updatePace();
    openPage("add");
  }

  async function deleteActivity(id) {
    if (!confirm("Hapus aktivitas ini?")) return;
    if (!state.user) {
      showMessage("Sesi login tidak tersedia. Silakan login kembali.", "error");
      return;
    }

    const { error } = await supabase
      .from("activities")
      .delete()
      .eq("id", id)
      .eq("user_id", state.user.id);

    if (error) {
      showMessage(`Gagal menghapus aktivitas: ${error.message}`, "error");
      return;
    }

    await loadActivities();
    renderDashboard();
    renderHistory();
    showMessage("Aktivitas berhasil dihapus.", "success");
  }

  // =========================
  // VIDEO DAN FOTO MOTIVASI
  // =========================

  function renderMotivation() {
    const grid = $("videoGrid");
    if (!grid) return;

    const videosHTML = MEDIA.videos.map((video, index) => `
      <article class="video-card">
        <video controls playsinline preload="metadata" aria-label="${escapeHTML(video.title)}">
          <source src="${video.src}" type="video/mp4">
          Browser tidak mendukung pemutaran video ini.
        </video>
        <div class="video-info">
          <h3>${escapeHTML(video.title)}</h3>
          <p>Video motivasi lari #${index + 1}</p>
        </div>
      </article>
    `).join("");

    const photosHTML = MEDIA.photos.map((photo, index) => `
      <article class="video-card">
        <img src="${photo.src}" alt="${escapeHTML(photo.title)}" loading="lazy"
          style="display:block;width:100%;aspect-ratio:3/4;object-fit:cover;background:#080808">
        <div class="video-info">
          <h3>${escapeHTML(photo.title)}</h3>
          <p>Foto motivasi #${index + 1}</p>
        </div>
      </article>
    `).join("");

    grid.innerHTML = `
      <div class="full" style="grid-column:1/-1"><h2>9 Video Motivasi</h2></div>
      ${videosHTML}
      <div class="full" style="grid-column:1/-1"><h2>3 Foto Motivasi</h2></div>
      ${photosHTML}
    `;
  }

  async function saveGoal() {
    const goal = Number($("goalInput")?.value);

    if (!Number.isFinite(goal) || goal < 1 || goal > 100000) {
      showMessage("Target harus antara 1 sampai 100.000 km.", "error");
      return;
    }

    localStorage.setItem("ipanUltraGoal", String(goal));
    renderDashboard();
    showMessage("Target jarak berhasil disimpan.", "success");
  }

  window.saveGoal = saveGoal;

  async function logout() {
    const confirmed = confirm("Keluar dari sesi saat ini? Aktivitas tersimpan di database tidak akan dihapus.");
    if (!confirmed) return;

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error("Gagal menutup sesi Supabase:", error);
    }

    sessionStorage.removeItem("ipan_access_token");
    sessionStorage.removeItem("ipan_refresh_token");
    sessionStorage.removeItem("ipan_username");

    state.user = null;
    state.profile = null;
    state.activities = [];
    window.location.replace("/");
  }

  window.logout = logout;

  async function startApp() {
    try {
      if (!supabase) {
        throw new Error("Klien Supabase tidak ditemukan. Periksa public/supabase.js.");
      }

      document.querySelectorAll(".nav-button[data-page]").forEach(button => {
        button.addEventListener("click", () => openPage(button.dataset.page));
      });

      initPeriodSelectors();

      $("activityForm")?.addEventListener("submit", saveActivity);
      $("historyFilter")?.addEventListener("change", renderHistory);

      ["distance", "duration-hours", "duration-minutes", "duration-seconds"].forEach(id => {
        $(id)?.addEventListener("input", updatePace);
      });

      document.addEventListener("click", event => {
        const editButton = event.target.closest("[data-edit]");
        const deleteButton = event.target.closest("[data-delete]");
        if (editButton) editActivity(editButton.dataset.edit);
        if (deleteButton) deleteActivity(deleteButton.dataset.delete);
      });

      if ($("activityDate")) $("activityDate").value = localDate();
      updatePace();

      await ensureSession();
      await loadProfile();
      await loadActivities();

      renderDashboard();
      renderHistory();
      renderMotivation();
      updatePace();
      openPage("home");

      console.info("IPAN ULTRA siap. User ID:", state.user.id);
    } catch (error) {
      console.error("IPAN ULTRA gagal dimulai:", error);
      showMessage(error.message || "Aplikasi gagal dimulai.", "error");
      renderMotivation();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startApp);
  } else {
    startApp();
  }
})();