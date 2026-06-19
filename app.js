const SUPABASE_URL = window.KEION_CONFIG?.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.KEION_CONFIG?.SUPABASE_ANON_KEY || "";

const SLOT_DEFINITIONS = [
  { id: "p1a", label: "一限前半", time: "9:00-9:50" },
  { id: "p1b", label: "一限後半", time: "9:50-10:40" },
  { id: "p2a", label: "二限前半", time: "10:50-11:40" },
  { id: "p2b", label: "二限後半", time: "11:40-12:30" },
  { id: "lunch", label: "昼休み", time: "12:30-13:40" },
  { id: "p3a", label: "三限前半", time: "13:40-14:30" },
  { id: "p3b", label: "三限後半", time: "14:30-15:20" },
  { id: "p4a", label: "四限前半", time: "15:30-16:20" },
  { id: "p4b", label: "四限後半", time: "16:20-17:10" },
  { id: "p5a", label: "五限前半", time: "17:20-18:10" },
  { id: "p5b", label: "五限後半", time: "18:10-19:00" },
  { id: "p6a", label: "六限前半", time: "19:10-20:00" },
  { id: "p6b", label: "六限後半", time: "20:00-20:50" },
];

const DEFAULT_WEEKLY_OPEN_SLOTS = {
  1: ["lunch", "p3a", "p3b", "p4a", "p4b", "p5a", "p5b", "p6a", "p6b"],
  2: ["p1a", "p1b", "p2a", "p2b", "p5a", "p5b"],
  3: ["p1a", "p1b", "p2a", "p2b", "lunch", "p3a", "p3b", "p4a", "p4b", "p5a", "p5b"],
  4: SLOT_DEFINITIONS.map((slot) => slot.id),
  5: SLOT_DEFINITIONS.map((slot) => slot.id),
  6: ["p1a", "p1b", "p2a", "p2b"],
};

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const demoStore = {
  members: [
    { student_id: "admin001", name: "軽音部運営", role: "admin", password: "adminpass" },
  ],
  bands: [
    { id: "band-1", name: "放課後コード", status: "active" },
    { id: "band-2", name: "Blue Notes", status: "active" },
  ],
  band_members: [],
  room_days: [],
  room_slots: [],
  reservations: [],
  band_requests: [],
  settings: {
    personal_open_days: 3,
    monthly_band_limit: 8,
    monthly_personal_limit: 4,
    weekly_open_slots: structuredClone(DEFAULT_WEEKLY_OPEN_SLOTS),
  },
};

const state = {
  page: document.body.dataset.page,
  currentMonth: startOfMonth(new Date()),
  availabilityMonth: startOfMonth(new Date()),
  selectedAvailabilityDate: null,
  selectedDayOffset: 0,
  settings: demoStore.settings,
  roomDays: [],
  roomSlots: [],
  reservations: [],
  bands: [],
  bandMembers: [],
  members: [],
  requests: [],
  user: null,
};

const hasSupabaseConfig = SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 20;
const db = hasSupabaseConfig ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  await loadAll();
  state.user = getSessionUser();

  if (state.page === "portal") initPortalPage();
  if (state.page === "register") initRegisterPage();
  if (state.page === "reservation") initReservationPage();
  if (state.page === "requests") initRequestPage();
  if (state.page === "admin") initAdminPage();
}

async function loadAll() {
  if (!db) {
    Object.assign(state, {
      settings: demoStore.settings,
      roomDays: demoStore.room_days,
      roomSlots: demoStore.room_slots,
      reservations: demoStore.reservations.filter((item) => !item.cancelled_at),
      bands: demoStore.bands.filter((band) => band.status === "active"),
      bandMembers: demoStore.band_members,
      members: demoStore.members,
      requests: demoStore.band_requests,
    });
    return;
  }

  const range = getLoadRange();
  const [settings, roomDays, roomSlots, reservations, bands, bandMembers, members, requests] = await Promise.all([
    db.from("settings").select("*").single(),
    db.from("room_days").select("*").gte("date", range.start).lte("date", range.end),
    db.from("room_slots").select("*").gte("date", range.start).lte("date", range.end),
    db.from("reservations").select("*, bands(name)").is("cancelled_at", null).gte("date", range.start).lte("date", range.end),
    db.from("bands").select("*").eq("status", "active"),
    db.from("band_members").select("*"),
    db.from("members").select("*"),
    db.from("band_requests").select("*").order("created_at", { ascending: false }).limit(50),
  ]);

  for (const result of [settings, roomDays, roomSlots, reservations, bands, bandMembers, members, requests]) {
    if (result.error) throw result.error;
  }

  state.settings = settings.data;
  state.roomDays = roomDays.data;
  state.roomSlots = roomSlots.data;
  state.reservations = reservations.data;
  state.bands = bands.data;
  state.bandMembers = bandMembers.data;
  state.members = members.data;
  state.requests = requests.data;
}

function initPortalPage() {
  document.querySelector("#loginForm").addEventListener("submit", submitLogin);
  document.querySelector("#logoutButton").addEventListener("click", logout);
  renderPortal();
}

function renderPortal() {
  const loggedIn = Boolean(state.user);
  document.querySelector("#loginPanel").classList.toggle("hidden", loggedIn);
  document.querySelector("#portalContent").classList.toggle("hidden", !loggedIn);
  document.querySelector("#portalStatus").textContent = loggedIn ? `${state.user.name} ログイン中` : "ログインが必要";

  if (!loggedIn) return;
  document.querySelector("#welcomeTitle").textContent = `${state.user.name} さんのポータル`;
  document.querySelectorAll(".admin-only").forEach((item) => {
    item.classList.toggle("hidden", state.user.role !== "admin");
  });
}

async function submitLogin(event) {
  event.preventDefault();
  const message = document.querySelector("#loginMessage");
  setMessage(message, "");
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const auth = authenticateMember(data.studentId, data.password);
  if (!auth.ok) return setMessage(message, auth.error, true);

  setSessionUser(auth.member);
  state.user = getSessionUser();
  renderPortal();
}

function initRegisterPage() {
  document.querySelector("#registerForm").addEventListener("submit", submitRegister);
}

async function submitRegister(event) {
  event.preventDefault();
  const message = document.querySelector("#registerMessage");
  setMessage(message, "");
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const studentId = data.studentId.trim();
  const member = state.members.find((item) => item.student_id === studentId);

  if (!member) return setMessage(message, "E_MEMBER_NOT_FOUND: 学籍番号が部員データベースにありません", true);

  const patch = {
    student_id: studentId,
    name: data.name.trim(),
    role: member.role || "member",
    password: data.password,
  };

  if (db) {
    const { error } = await db.from("members").update(patch).eq("student_id", studentId);
    if (error) return setMessage(message, error.message, true);
  } else {
    Object.assign(member, patch);
  }

  await loadAll();
  setSessionUser(patch);
  setMessage(message, "登録しました。ポータルへ移動します");
  window.setTimeout(() => {
    window.location.href = "index.html";
  }, 600);
}

function initReservationPage() {
  if (!requireLogin()) return;
  fillSlotSelect();
  fillBandOptions();
  setupReservationDateRange();
  renderCalendar();
  renderMyReservations();
  document.querySelector("#reservationUserLabel").textContent = `${state.user.name} (${state.user.student_id}) として予約します`;
  document.querySelector("#prevMonth").addEventListener("click", () => moveDay(-1));
  document.querySelector("#nextMonth").addEventListener("click", () => moveDay(1));
  document.querySelector("#todayButton").addEventListener("click", () => moveToToday());
  document.querySelector("#reservationType").addEventListener("change", () => {
    toggleBandField();
    renderReservationQuota();
  });
  document.querySelector("#reservationDate").addEventListener("change", handleReservationDateChange);
  document.querySelector("#slotSelect").addEventListener("change", updateSelectedSlotSummary);
  document.querySelector("#bandNameField input").addEventListener("input", renderReservationQuota);
  document.querySelector("#reservationForm").addEventListener("submit", submitReservation);
  toggleBandField();
  updateSelectedSlotSummary();
  renderReservationQuota();
}

function initRequestPage() {
  if (!requireLogin()) return;
  document.querySelector("#requestUserLabel").textContent = `${state.user.name} (${state.user.student_id}) として申請します`;
  document.querySelector("#bandRequestForm").addEventListener("submit", submitBandRequest);
}

function initAdminPage() {
  if (!requireLogin()) return;
  if (state.user.role !== "admin") {
    window.location.href = getRootPath("index.html");
    return;
  }
  document.querySelector("#adminName").textContent = `${state.user.name} として管理中`;
  document.querySelector("#adminLogout").addEventListener("click", logout);
  document.querySelector("#settingsForm")?.addEventListener("submit", submitSettings);
  document.querySelector("#uploadCsvButton")?.addEventListener("click", uploadMembersCsv);
  document.querySelector("#availabilityPrev")?.addEventListener("click", () => moveAvailabilityMonth(-1));
  document.querySelector("#availabilityToday")?.addEventListener("click", () => moveAvailabilityMonth(0, true));
  document.querySelector("#availabilityNext")?.addEventListener("click", () => moveAvailabilityMonth(1));
  document.querySelector("#saveDefaultSlots")?.addEventListener("click", saveDefaultSlots);
  document.querySelector("#memberSearchInput")?.addEventListener("input", renderMemberSearch);
  renderSettings();
  renderMemberSearch();
  renderMemberList();
  renderAvailabilityMonth();
  renderDefaultSlotEditor();
  renderUsage();
  renderRequests();
}

async function moveDay(delta) {
  state.selectedDayOffset = Math.min(13, Math.max(0, state.selectedDayOffset + delta));
  await loadAll();
  renderCalendar();
}

async function moveToToday() {
  state.selectedDayOffset = 0;
  await loadAll();
  renderCalendar();
}

function renderCalendar() {
  const calendar = document.querySelector("#calendar");
  const monthLabel = document.querySelector("#monthLabel");
  calendar.innerHTML = "";
  const selectedDate = getReservableDate(state.selectedDayOffset);
  const selectedKey = toDateInput(selectedDate);
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  monthLabel.textContent = `${formatDateLabel(selectedDate)}（${dayNames[selectedDate.getDay()]}）`;

  document.querySelector("#prevMonth").disabled = state.selectedDayOffset === 0;
  document.querySelector("#nextMonth").disabled = state.selectedDayOffset === 13;
  document.querySelector("#reservationDate").value = selectedKey;
  updateSelectedSlotSummary();
  renderReservationQuota();

  const tabs = document.createElement("div");
  tabs.className = "day-tabs";
  for (let offset = 0; offset < 14; offset += 1) {
    const date = getReservableDate(offset);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `day-tab${offset === state.selectedDayOffset ? " active" : ""}`;
    button.innerHTML = `<span>${relativeDayLabel(offset)}</span><strong>${date.getMonth() + 1}/${date.getDate()}</strong>`;
    button.addEventListener("click", async () => {
      state.selectedDayOffset = offset;
      await loadAll();
      renderCalendar();
    });
    tabs.append(button);
  }
  calendar.append(tabs);

  const reservations = state.reservations.filter((item) => item.date === selectedKey);
  const openSlots = getOpenSlots(selectedDate);
  const isClosed = openSlots.length === 0;
  const day = document.createElement("div");
  day.className = "day day-detail";
  day.innerHTML = `
    <div class="date-number">
      <span>${formatDateLabel(selectedDate)}（${dayNames[selectedDate.getDay()]}）</span>
      ${isClosed ? '<span class="day-note">使用不可</span>' : '<span class="day-note open-note">予約受付中</span>'}
    </div>
  `;

  const list = document.createElement("div");
  list.className = "slot-list slot-list-full";
  SLOT_DEFINITIONS.forEach((slot) => {
    const reservation = reservations.find((item) => item.slot_id === slot.id);
    const isOpen = openSlots.includes(slot.id) && !isClosed;
    const chip = document.createElement(isOpen && !reservation ? "button" : "div");
    chip.className = `slot-chip${reservation ? " booked" : ""}${!isOpen ? " closed" : ""}`;
    if (chip.tagName === "BUTTON") chip.type = "button";
    chip.innerHTML = `
      <span class="slot-main">
        <strong>${slot.label}</strong>
        <small>${slot.time}</small>
      </span>
      <span class="slot-status">${reservation ? escapeHtml(getReservationOwner(reservation)) : (isOpen ? "空き" : "予約不可")}</span>
    `;
    if (isOpen && !reservation) {
      chip.addEventListener("click", () => selectSlot(selectedKey, slot.id));
    }
    list.append(chip);
  });
  day.append(list);
  calendar.append(day);
}

async function submitReservation(event) {
  event.preventDefault();
  const message = document.querySelector("#reservationMessage");
  setMessage(message, "");
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const result = validateReservation(data);
  if (!result.ok) return setMessage(message, result.error, true);

  const payload = {
    date: data.date,
    slot_id: data.slotId,
    reservation_type: data.reservationType,
    student_id: state.user.student_id,
    band_id: result.band?.id || null,
  };

  if (db) {
    const { error } = await db.from("reservations").insert(payload);
    if (error) return setMessage(message, error.code === "23505" ? "E_SLOT_TAKEN: このコマは予約済みです" : error.message, true);
  } else {
    demoStore.reservations.push({ id: newId(), ...payload });
  }

  await loadAll();
  renderCalendar();
  renderMyReservations();
  event.currentTarget.reset();
  setupReservationDateRange();
  toggleBandField();
  updateSelectedSlotSummary();
  renderReservationQuota();
  setMessage(message, "予約を受け付けました");
}

function validateReservation(data) {
  const bandName = (data.bandName || "").trim();
  const date = parseDateInput(data.date);
  const today = stripTime(new Date());
  const dateKey = toDateInput(date);
  const reservationLimit = addDays(today, 13);

  if (date < today) return { ok: false, error: "E_DATE_PAST: 過去の日付は予約できません" };
  if (date > reservationLimit) return { ok: false, error: "E_DATE_RANGE: 予約できるのは今日から14日間です" };
  if (!getOpenSlots(date).includes(data.slotId)) {
    return { ok: false, error: "E_ROOM_CLOSED: この日は使用できないか、対象コマが開放されていません" };
  }
  if (state.reservations.some((item) => item.date === data.date && item.slot_id === data.slotId)) {
    return { ok: false, error: "E_SLOT_TAKEN: このコマは予約済みです" };
  }

  if (data.reservationType === "band") {
    const band = state.bands.find((item) => item.name === bandName && item.status === "active");
    if (!band) return { ok: false, error: "E_BAND_NOT_FOUND: バンド名が登録されていません" };
    if (countMonthly("band", band.id, date) >= state.settings.monthly_band_limit) {
      return { ok: false, error: "E_MONTHLY_LIMIT: このバンドは今月の上限に達しています" };
    }
    return { ok: true, band };
  }

  if (date > addDays(today, state.settings.personal_open_days)) {
    return { ok: false, error: `E_PERSONAL_DATE_RANGE: 個人予約は今日から${state.settings.personal_open_days}日後までです` };
  }
  if (countMonthly("personal", state.user.student_id, date) >= state.settings.monthly_personal_limit) {
    return { ok: false, error: "E_MONTHLY_LIMIT: この個人は今月の上限に達しています" };
  }
  return { ok: true };
}

function renderMyReservations() {
  const container = document.querySelector("#myReservations");
  if (!container) return;
  const myReservations = state.reservations
    .filter((item) => item.student_id === state.user.student_id)
    .sort((a, b) => `${a.date}${a.slot_id}`.localeCompare(`${b.date}${b.slot_id}`));

  container.innerHTML = myReservations.map((item) => {
    const slot = SLOT_DEFINITIONS.find((slotItem) => slotItem.id === item.slot_id);
    const title = item.reservation_type === "band" ? getReservationOwner(item) : "個人予約";
    return `
      <div class="reservation-item">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <small>${item.date} ${slot?.label || item.slot_id} ${slot?.time || ""}</small>
        </div>
        <button type="button" class="tiny-button secondary" data-cancel-reservation="${item.id}">削除</button>
      </div>
    `;
  }).join("") || '<p class="hint">現在の予約はありません。</p>';

  container.querySelectorAll("[data-cancel-reservation]").forEach((button) => {
    button.addEventListener("click", () => cancelReservation(button.dataset.cancelReservation));
  });
}

async function cancelReservation(id) {
  const reservation = state.reservations.find((item) => item.id === id);
  if (!reservation || reservation.student_id !== state.user.student_id) return;

  if (db) {
    const { error } = await db.from("reservations").update({ cancelled_at: new Date().toISOString() }).eq("id", id);
    if (error) return alert(error.message);
  } else {
    reservation.cancelled_at = new Date().toISOString();
  }

  await loadAll();
  renderCalendar();
  renderMyReservations();
}

async function submitBandRequest(event) {
  event.preventDefault();
  const message = document.querySelector("#requestMessage");
  setMessage(message, "");
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const parsed = parseMemberEntries(data.membersText);
  if (!parsed.ok) return setMessage(message, parsed.error, true);
  const members = parsed.entries;
  const validation = data.requestType === "dissolve" ? { ok: true } : validateBandMembers(members);
  if (!validation.ok) return setMessage(message, validation.error, true);

  const payload = {
    request_type: data.requestType,
    band_name: data.bandName.trim(),
    student_id: state.user.student_id,
    reason: data.reason.trim(),
    member_entries: members,
    status: "pending",
  };

  if (db) {
    const { error } = await db.from("band_requests").insert(payload);
    if (error) return setMessage(message, error.message, true);
  } else {
    demoStore.band_requests.unshift({ id: newId(), ...payload });
  }

  await loadAll();
  event.currentTarget.reset();
  setMessage(message, "申請を受け付けました。運営の承認待ちです");
}

function parseMemberEntries(text) {
  const entries = [];
  const seen = new Set();
  const lines = String(text || "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;

    let studentId = "";
    let name = "";
    if (line.includes(",")) {
      const parts = line.split(",");
      if (parts.length !== 2) return { ok: false, error: `E_MEMBER_FORMAT: ${index + 1}行目は「学籍番号,氏名」で入力してください` };
      studentId = parts[0].trim();
      name = parts[1].trim();
    } else {
      const match = line.match(/^(\S+)\s+(.+)$/);
      if (!match) return { ok: false, error: `E_MEMBER_FORMAT: ${index + 1}行目は「学籍番号 氏名」または「学籍番号,氏名」で入力してください` };
      studentId = match[1].trim();
      name = match[2].trim();
    }

    if (!/^[A-Za-z0-9_-]+$/.test(studentId)) return { ok: false, error: `E_MEMBER_ID_FORMAT: ${index + 1}行目の学籍番号に使えない文字があります` };
    if (!name) return { ok: false, error: `E_MEMBER_NAME_REQUIRED: ${index + 1}行目の氏名が空です` };
    if (seen.has(studentId)) return { ok: false, error: `E_MEMBER_DUPLICATE: ${studentId} が重複しています` };

    seen.add(studentId);
    entries.push({ student_id: studentId, name });
  }

  return { ok: true, entries };
}

function validateBandMembers(entries) {
  if (entries.length === 0) return { ok: false, error: "E_BAND_MEMBERS_REQUIRED: メンバーを入力してください" };
  for (const entry of entries) {
    const member = state.members.find((item) => item.student_id === entry.student_id);
    if (!member) return { ok: false, error: `E_MEMBER_NOT_FOUND: ${entry.student_id} は登録されていません` };
    if (entry.name && member.name !== entry.name) return { ok: false, error: `E_MEMBER_NAME_MISMATCH: ${entry.student_id} の氏名が一致しません` };
  }
  return { ok: true };
}

async function submitSettings(event) {
  event.preventDefault();
  const payload = {
    personal_open_days: Number(event.currentTarget.personalOpenDays.value),
    monthly_band_limit: Number(event.currentTarget.monthlyBandLimit.value),
    monthly_personal_limit: Number(event.currentTarget.monthlyPersonalLimit.value),
  };

  if (db) {
    const { error } = await db.from("settings").update(payload).eq("id", true);
    if (error) return alert(error.message);
  } else {
    Object.assign(demoStore.settings, payload);
  }

  await loadAll();
  renderSettings();
  renderUsage();
}

async function submitRoomDay(event) {
  event.preventDefault();
  const payload = {
    date: event.currentTarget.date.value,
    is_open: event.currentTarget.isOpen.checked,
    note: event.currentTarget.note.value.trim(),
  };

  if (db) {
    const { error } = await db.from("room_days").upsert(payload);
    if (error) return alert(error.message);
  } else {
    const index = demoStore.room_days.findIndex((item) => item.date === payload.date);
    if (index >= 0) demoStore.room_days[index] = payload;
    else demoStore.room_days.push(payload);
  }
  await loadAll();
  renderRoomDayQuickList();
}

async function toggleRoomDay(dateKey) {
  const current = state.roomDays.find((item) => item.date === dateKey);
  const payload = {
    date: dateKey,
    is_open: current ? !current.is_open : false,
    note: current?.note || "",
  };

  if (db) {
    const { error } = await db.from("room_days").upsert(payload);
    if (error) return alert(error.message);
  } else {
    const index = demoStore.room_days.findIndex((item) => item.date === dateKey);
    if (index >= 0) demoStore.room_days[index] = payload;
    else demoStore.room_days.push(payload);
  }

  await loadAll();
  renderRoomDayQuickList();
}

async function uploadMembersCsv() {
  const message = document.querySelector("#csvMessage");
  const file = document.querySelector("#memberCsv").files[0];
  setMessage(message, "");
  if (!file) return setMessage(message, "CSVファイルを選択してください", true);

  const rows = parseCsv(await file.text());
  const members = rows.map((row) => ({
    student_id: row.student_id?.trim(),
    name: row.name?.trim(),
    role: (row.role || "member").trim(),
    password: row.password?.trim() || "",
  })).filter((row) => row.student_id && row.name);

  if (members.length === 0) return setMessage(message, "有効な部員データがありません", true);

  if (db) {
    const { error } = await db.from("members").upsert(members, { onConflict: "student_id" });
    if (error) return setMessage(message, error.message, true);
  } else {
    members.forEach((member) => {
      const index = demoStore.members.findIndex((item) => item.student_id === member.student_id);
      if (index >= 0) demoStore.members[index] = { ...demoStore.members[index], ...member };
      else demoStore.members.push(member);
    });
  }

  await loadAll();
  renderMemberSearch();
  renderMemberList();
  setMessage(message, `${members.length}件の部員情報を取り込みました`);
}

function renderSettings() {
  const form = document.querySelector("#settingsForm");
  form.personalOpenDays.value = state.settings.personal_open_days;
  form.monthlyBandLimit.value = state.settings.monthly_band_limit;
  form.monthlyPersonalLimit.value = state.settings.monthly_personal_limit;
}

function renderMemberSearch() {
  const container = document.querySelector("#memberSearchResults");
  if (!container) return;
  const query = (document.querySelector("#memberSearchInput")?.value || "").trim().toLowerCase();
  const members = state.members.filter((member) => {
    const bandNames = getMemberBands(member.student_id).map((band) => band.name).join(" ");
    const text = `${member.student_id} ${member.name} ${bandNames}`.toLowerCase();
    return !query || text.includes(query);
  });

  container.innerHTML = members.map((member) => {
    const isAdmin = member.role === "admin";
    const isSelf = member.student_id === state.user.student_id;
    const bands = getMemberBands(member.student_id);
    return `
      <article class="member-result-card">
        <div>
          <h3>${escapeHtml(member.name)}</h3>
          <p>${escapeHtml(member.student_id)} / ${isAdmin ? "管理者" : "一般部員"}</p>
        </div>
        <div>
          <strong>所属バンド</strong>
          <p>${bands.map((band) => escapeHtml(band.name)).join("、") || "所属なし"}</p>
        </div>
        <div class="member-result-actions">
          <button type="button" class="tiny-button ${isAdmin ? "secondary" : ""}" data-role-student="${escapeHtml(member.student_id)}" data-role-next="${isAdmin ? "member" : "admin"}" ${isSelf ? "disabled" : ""}>
            ${isAdmin ? "はく奪" : "付与"}
          </button>
        </div>
      </article>
    `;
  }).join("") || '<p class="hint">該当する部員はいません。</p>';

  container.querySelectorAll("[data-role-student]").forEach((button) => {
    button.addEventListener("click", () => updateMemberRole(button.dataset.roleStudent, button.dataset.roleNext));
  });
}

function renderMemberList() {
  const table = document.querySelector("#memberListTable");
  if (!table) return;
  table.innerHTML = state.members
    .map((member) => {
      const bands = getMemberBands(member.student_id).map((band) => escapeHtml(band.name)).join("、") || "所属なし";
      return `
        <tr>
          <td>${escapeHtml(member.student_id)}</td>
          <td>${escapeHtml(member.name)}</td>
          <td>${member.role === "admin" ? "管理者" : "一般部員"}</td>
          <td>${bands}</td>
        </tr>
      `;
    })
    .join("") || '<tr><td colspan="4">部員が登録されていません</td></tr>';
}

async function updateMemberRole(studentId, role) {
  if (studentId === state.user.student_id) return;
  if (db) {
    const { error } = await db.from("members").update({ role }).eq("student_id", studentId);
    if (error) return alert(error.message);
  } else {
    const member = demoStore.members.find((item) => item.student_id === studentId);
    if (member) member.role = role;
  }
  await loadAll();
  renderMemberSearch();
  renderMemberList();
}

async function moveAvailabilityMonth(delta, reset = false) {
  state.availabilityMonth = reset ? startOfMonth(new Date()) : addMonths(state.availabilityMonth, delta);
  const min = startOfMonth(new Date());
  const max = startOfMonth(addMonths(new Date(), 6));
  if (state.availabilityMonth < min) state.availabilityMonth = min;
  if (state.availabilityMonth > max) state.availabilityMonth = max;
  state.selectedAvailabilityDate = null;
  await loadAll();
  renderAvailabilityMonth();
}

function renderAvailabilityMonth() {
  const container = document.querySelector("#availabilityMonth");
  const label = document.querySelector("#availabilityMonthLabel");
  if (!container || !label) return;

  const month = state.availabilityMonth;
  const today = stripTime(new Date());
  const limit = addMonths(today, 6);
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  label.textContent = `${month.getFullYear()}年${month.getMonth() + 1}月`;
  container.innerHTML = "";

  for (let day = 1; day <= last.getDate(); day += 1) {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    const dateKey = toDateInput(date);
    const inRange = date >= today && date <= limit;
    const openCount = getOpenSlots(date).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `availability-date${state.selectedAvailabilityDate === dateKey ? " active" : ""}`;
    button.disabled = !inRange;
    button.innerHTML = `<strong>${day}</strong><span>${inRange ? `${openCount}コマ可` : "-"}</span>`;
    button.addEventListener("click", () => {
      state.selectedAvailabilityDate = dateKey;
      renderAvailabilityMonth();
      renderSlotEditor(date);
    });
    container.append(button);
  }

  document.querySelector("#availabilityPrev").disabled = first <= startOfMonth(today);
  document.querySelector("#availabilityNext").disabled = first >= startOfMonth(limit);
  if (!state.selectedAvailabilityDate) {
    document.querySelector("#slotEditor").classList.add("hidden");
  }
}

function renderSlotEditor(date) {
  const editor = document.querySelector("#slotEditor");
  const title = document.querySelector("#slotEditorTitle");
  const grid = document.querySelector("#slotEditorGrid");
  if (!editor || !title || !grid) return;

  const dateKey = toDateInput(date);
  title.textContent = `${formatDateLabel(date)} のコマ設定`;
  grid.innerHTML = "";
  SLOT_DEFINITIONS.forEach((slot) => {
    const isOpen = isSlotOpenOnDate(date, slot.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `slot-admin-toggle${isOpen ? " open" : " closed"}`;
    button.innerHTML = `<strong>${slot.label}</strong><small>${slot.time}</small><span>${isOpen ? "使用可能" : "使用不可"}</span>`;
    button.addEventListener("click", () => toggleRoomSlot(dateKey, slot.id));
    grid.append(button);
  });
  editor.classList.remove("hidden");
}

async function toggleRoomSlot(dateKey, slotId) {
  const currentOpen = isSlotOpenOnDate(parseDateInput(dateKey), slotId);
  const payload = {
    date: dateKey,
    slot_id: slotId,
    is_open: !currentOpen,
    note: "",
  };

  if (db) {
    const { error } = await db.from("room_slots").upsert(payload);
    if (error) return alert(error.message);
  } else {
    const index = demoStore.room_slots.findIndex((item) => item.date === dateKey && item.slot_id === slotId);
    if (index >= 0) demoStore.room_slots[index] = payload;
    else demoStore.room_slots.push(payload);
  }

  await loadAll();
  renderAvailabilityMonth();
  renderSlotEditor(parseDateInput(dateKey));
}

function isSlotOpenOnDate(date, slotId) {
  const dateKey = toDateInput(date);
  const override = state.roomSlots.find((item) => item.date === dateKey && item.slot_id === slotId);
  if (override) return override.is_open;
  return (getWeeklyOpenSlots()[date.getDay()] || []).includes(slotId);
}

function renderDefaultSlotEditor() {
  const container = document.querySelector("#defaultSlotEditor");
  if (!container) return;
  const weekly = getWeeklyOpenSlots();
  container.innerHTML = WEEKDAY_LABELS.map((label, dayIndex) => `
    <section class="default-day">
      <h3>${label}</h3>
      <div>
        ${SLOT_DEFINITIONS.map((slot) => `
          <label class="check-row">
            <input type="checkbox" data-default-day="${dayIndex}" value="${slot.id}" ${(weekly[dayIndex] || []).includes(slot.id) ? "checked" : ""}>
            ${slot.label}
          </label>
        `).join("")}
      </div>
    </section>
  `).join("");
}

async function saveDefaultSlots() {
  const next = {};
  for (let day = 0; day < 7; day += 1) next[day] = [];
  document.querySelectorAll("[data-default-day]").forEach((input) => {
    if (input.checked) next[input.dataset.defaultDay].push(input.value);
  });

  const payload = { weekly_open_slots: next };
  if (db) {
    const { error } = await db.from("settings").update(payload).eq("id", true);
    if (error) return setMessage(document.querySelector("#defaultSlotMessage"), error.message, true);
  } else {
    demoStore.settings.weekly_open_slots = next;
  }

  await loadAll();
  renderDefaultSlotEditor();
  renderAvailabilityMonth();
  setMessage(document.querySelector("#defaultSlotMessage"), "デフォルトを保存しました");
}

function renderRoomDayQuickList() {
  const container = document.querySelector("#roomDayQuickList");
  if (!container) return;
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  container.innerHTML = "";

  for (let offset = 0; offset < 14; offset += 1) {
    const date = getReservableDate(offset);
    const dateKey = toDateInput(date);
    const roomDay = state.roomDays.find((item) => item.date === dateKey);
    const isOpen = roomDay?.is_open !== false;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `availability-day${isOpen ? " open" : " closed"}`;
    button.innerHTML = `
      <strong>${date.getMonth() + 1}/${date.getDate()}（${dayNames[date.getDay()]}）</strong>
      <span>${isOpen ? "使用可能" : "使用不可"}</span>
      ${roomDay?.note ? `<small>${escapeHtml(roomDay.note)}</small>` : ""}
    `;
    button.addEventListener("click", () => toggleRoomDay(dateKey));
    container.append(button);
  }
}

function getMemberBands(studentId) {
  const bandIds = state.bandMembers
    .filter((entry) => entry.student_id === studentId)
    .map((entry) => entry.band_id);
  return state.bands.filter((band) => bandIds.includes(band.id));
}

function renderUsage() {
  const table = document.querySelector("#usageTable");
  const usage = new Map();
  state.reservations.forEach((reservation) => {
    if (reservation.reservation_type === "band") {
      const bandName = reservation.bands?.name || state.bands.find((band) => band.id === reservation.band_id)?.name || "不明なバンド";
      const key = `band:${bandName}`;
      usage.set(key, { type: "バンド", name: bandName, count: (usage.get(key)?.count || 0) + 1 });
      return;
    }
    const member = state.members.find((item) => item.student_id === reservation.student_id);
    const key = `personal:${reservation.student_id}`;
    usage.set(key, { type: "個人", name: member?.name || reservation.student_id, count: (usage.get(key)?.count || 0) + 1 });
  });
  table.innerHTML = [...usage.values()]
    .map((item) => `<tr><td>${item.type}</td><td>${escapeHtml(item.name)}</td><td>${item.count}</td></tr>`)
    .join("") || '<tr><td colspan="3">予約はありません</td></tr>';
}

function renderRequests() {
  const table = document.querySelector("#requestTable");
  table.innerHTML = state.requests
    .map((item) => `
      <tr>
        <td>${requestTypeLabel(item.request_type)}</td>
        <td>${escapeHtml(item.band_name)}</td>
        <td>${escapeHtml(item.student_id)}</td>
        <td>${formatMemberEntries(item.member_entries)}</td>
        <td>${statusLabel(item.status)}${item.status === "pending" ? requestActions(item.id) : ""}</td>
      </tr>
    `)
    .join("") || '<tr><td colspan="5">申請はありません</td></tr>';

  table.querySelectorAll("[data-request-action]").forEach((button) => {
    button.addEventListener("click", () => reviewBandRequest(button.dataset.requestId, button.dataset.requestAction));
  });
}

async function reviewBandRequest(requestId, action) {
  const request = state.requests.find((item) => item.id === requestId);
  if (!request) return alert("E_REQUEST_NOT_FOUND: 申請が見つかりません");
  if (action === "approved") {
    const result = await applyBandRequest(request);
    if (!result.ok) return alert(result.error);
  }

  const patch = {
    status: action,
    reviewed_at: new Date().toISOString(),
    reviewed_by: state.user.student_id,
  };

  if (db) {
    const { error } = await db.from("band_requests").update(patch).eq("id", requestId);
    if (error) return alert(error.message);
  } else {
    Object.assign(request, patch);
  }

  await loadAll();
  renderMemberSearch();
  renderRequests();
}

async function applyBandRequest(request) {
  if (request.request_type === "create" || request.request_type === "update_members") {
    const isCreate = request.request_type === "create";
    if (state.bands.some((band) => band.name === request.band_name && band.status === "active")) {
      if (isCreate) return { ok: false, error: "E_BAND_ALREADY_EXISTS: 同名の有効なバンドがあります" };
    }

    let bandId = newId();
    const existingBand = state.bands.find((band) => band.name === request.band_name && band.status === "active");
    if (!isCreate && !existingBand) return { ok: false, error: "E_BAND_NOT_FOUND: メンバー変更対象のバンドが見つかりません" };
    if (!isCreate) bandId = existingBand.id;

    if (db) {
      if (isCreate) {
        const { data, error } = await db.from("bands").insert({ name: request.band_name, status: "active" }).select("id").single();
        if (error) return { ok: false, error: error.message };
        bandId = data.id;
      } else {
        const deleteResult = await db.from("band_members").delete().eq("band_id", bandId);
        if (deleteResult.error) return { ok: false, error: deleteResult.error.message };
      }
      const memberRows = (request.member_entries || []).map((entry) => ({ band_id: bandId, student_id: entry.student_id }));
      if (memberRows.length) {
        const memberResult = await db.from("band_members").insert(memberRows);
        if (memberResult.error) return { ok: false, error: memberResult.error.message };
      }
    } else {
      if (isCreate) demoStore.bands.push({ id: bandId, name: request.band_name, status: "active" });
      else demoStore.band_members = demoStore.band_members.filter((entry) => entry.band_id !== bandId);
      (request.member_entries || []).forEach((entry) => {
        demoStore.band_members.push({ band_id: bandId, student_id: entry.student_id });
      });
    }
    return { ok: true };
  }

  const band = state.bands.find((item) => item.name === request.band_name && item.status === "active");
  if (!band) return { ok: false, error: "E_BAND_NOT_FOUND: 解散対象のバンドが見つかりません" };
  if (db) {
    const { error } = await db.from("bands").update({ status: "dissolved" }).eq("id", band.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const demoBand = demoStore.bands.find((item) => item.id === band.id);
    if (demoBand) demoBand.status = "dissolved";
  }
  return { ok: true };
}

function authenticateMember(studentId, password) {
  const member = state.members.find((item) => item.student_id === studentId.trim());
  if (!member) return { ok: false, error: "E_MEMBER_NOT_FOUND: 学籍番号が登録されていません" };
  if (!member.password) return { ok: false, error: "E_ACCOUNT_NOT_REGISTERED: 新規登録をしてください" };
  if (member.password !== password) return { ok: false, error: "E_PASSWORD_INVALID: パスワードが違います" };
  return { ok: true, member };
}

function requireLogin() {
  if (state.user) return true;
  window.location.href = getRootPath("index.html");
  return false;
}

function setSessionUser(member) {
  sessionStorage.setItem("keion_user", JSON.stringify({
    student_id: member.student_id,
    name: member.name,
    role: member.role || "member",
  }));
}

function getSessionUser() {
  const raw = sessionStorage.getItem("keion_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function logout() {
  sessionStorage.removeItem("keion_user");
  window.location.href = getRootPath("index.html");
}

function getRootPath(fileName) {
  const path = window.location.pathname.replace(/\\/g, "/");
  if (path.includes("/admin/manage-")) return `../../${fileName}`;
  return fileName;
}

function parseCsv(text) {
  const rows = [];
  const parsed = [];
  let field = "";
  let row = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted && char === '"' && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      parsed.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    parsed.push(row);
  }

  const headers = parsed.shift()?.map((header) => header.trim()) || [];
  parsed.forEach((values) => {
    if (values.every((value) => !value.trim())) return;
    const item = {};
    headers.forEach((header, index) => {
      item[header] = values[index] || "";
    });
    rows.push(item);
  });
  return rows;
}

function fillSlotSelect() {
  const select = document.querySelector("#slotSelect");
  select.innerHTML = SLOT_DEFINITIONS
    .map((slot) => `<option value="${slot.id}">${slot.label} ${slot.time}</option>`)
    .join("");
}

function fillBandOptions() {
  const options = document.querySelector("#bandOptions");
  if (!options) return;
  options.innerHTML = state.bands
    .map((band) => `<option value="${escapeHtml(band.name)}"></option>`)
    .join("");
}

function toggleBandField() {
  const type = document.querySelector("#reservationType").value;
  document.querySelector("#bandNameField").style.display = type === "band" ? "grid" : "none";
}

function renderReservationQuota() {
  const box = document.querySelector("#reservationQuota");
  if (!box || !state.user) return;

  const type = document.querySelector("#reservationType")?.value || "band";
  const dateValue = document.querySelector("#reservationDate")?.value;
  const monthDate = dateValue ? parseDateInput(dateValue) : stripTime(new Date());

  if (type === "personal") {
    const limit = Number(state.settings.monthly_personal_limit || 0);
    const used = countMonthly("personal", state.user.student_id, monthDate);
    renderQuotaBox(box, "個人予約", used, limit, monthDate);
    return;
  }

  const bandName = (document.querySelector("#bandNameField input")?.value || "").trim();
  if (!bandName) {
    box.className = "quota-box";
    box.innerHTML = `
      <strong>月間予約残数</strong>
      <span>バンド名を入力すると残りコマを表示します。</span>
    `;
    return;
  }

  const band = state.bands.find((item) => item.name === bandName && item.status === "active");
  if (!band) {
    box.className = "quota-box warning";
    box.innerHTML = `
      <strong>月間予約残数</strong>
      <span>E_BAND_NOT_FOUND: 登録済みのバンド名を入力してください。</span>
    `;
    return;
  }

  const limit = Number(state.settings.monthly_band_limit || 0);
  const used = countMonthly("band", band.id, monthDate);
  renderQuotaBox(box, "バンド予約", used, limit, monthDate);
}

function renderQuotaBox(box, label, used, limit, monthDate) {
  const remaining = Math.max(0, limit - used);
  box.className = `quota-box${remaining <= 0 ? " warning" : ""}`;
  box.innerHTML = `
    <strong>${label} 残り${remaining}コマ</strong>
    <span>${monthDate.getFullYear()}年${monthDate.getMonth() + 1}月: 上限${limit}コマ / 使用済み${used}コマ</span>
  `;
}

function selectSlot(date, slotId) {
  document.querySelector("#reservationDate").value = date;
  document.querySelector("#slotSelect").value = slotId;
  updateSelectedSlotSummary();
  renderReservationQuota();
  document.querySelector(".side-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleReservationDateChange() {
  const input = document.querySelector("#reservationDate");
  const selected = parseDateInput(input.value);
  const today = stripTime(new Date());
  const diff = Math.round((stripTime(selected) - today) / 86400000);
  state.selectedDayOffset = Math.min(13, Math.max(0, Number.isFinite(diff) ? diff : 0));
  input.value = toDateInput(getReservableDate(state.selectedDayOffset));
  await loadAll();
  renderCalendar();
}

function updateSelectedSlotSummary() {
  const summary = document.querySelector("#selectedSlotSummary");
  if (!summary) return;
  const date = document.querySelector("#reservationDate").value;
  const slotId = document.querySelector("#slotSelect").value;
  const slot = SLOT_DEFINITIONS.find((item) => item.id === slotId);
  summary.textContent = date && slot ? `選択中: ${date} ${slot.label} ${slot.time}` : "カレンダーから日付とコマを選べます";
}

function setupReservationDateRange() {
  const input = document.querySelector("#reservationDate");
  input.min = toDateInput(getReservableDate(0));
  input.max = toDateInput(getReservableDate(13));
  input.value = toDateInput(getReservableDate(state.selectedDayOffset));
}

function getLoadRange() {
  if (state.page === "reservation") {
    const today = getReservableDate(0);
    const limit = getReservableDate(13);
    return {
      start: toDateInput(startOfMonth(today)),
      end: toDateInput(endOfMonth(limit)),
    };
  }
  if (state.page === "admin") {
    return {
      start: toDateInput(stripTime(new Date())),
      end: toDateInput(addMonths(stripTime(new Date()), 6)),
    };
  }
  return {
    start: toDateInput(startOfMonth(state.currentMonth)),
    end: toDateInput(endOfMonth(state.currentMonth)),
  };
}

function getReservableDate(offset) {
  return addDays(stripTime(new Date()), offset);
}

function formatDateLabel(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function relativeDayLabel(offset) {
  if (offset === 0) return "今日";
  if (offset === 1) return "明日";
  return `${offset + 1}日目`;
}

function getReservationOwner(reservation) {
  if (reservation.reservation_type === "band") {
    return reservation.bands?.name || state.bands.find((band) => band.id === reservation.band_id)?.name || "バンド予約";
  }
  const member = state.members.find((item) => item.student_id === reservation.student_id);
  return member?.name || reservation.student_id || "個人予約";
}

function countMonthly(type, identifier, monthDate = new Date()) {
  const targetYear = monthDate.getFullYear();
  const targetMonth = monthDate.getMonth();
  return state.reservations.filter((reservation) => {
    if (reservation.reservation_type !== type) return false;
    const reservationDate = parseDateInput(reservation.date);
    if (reservationDate.getFullYear() !== targetYear || reservationDate.getMonth() !== targetMonth) return false;
    if (type === "band") return reservation.band_id === identifier;
    return reservation.student_id === identifier;
  }).length;
}

function getOpenSlots(date) {
  const dateKey = toDateInput(date);
  const weekly = getWeeklyOpenSlots()[date.getDay()] || [];
  const open = new Set(weekly);
  state.roomSlots
    .filter((item) => item.date === dateKey)
    .forEach((item) => {
      if (item.is_open) open.add(item.slot_id);
      else open.delete(item.slot_id);
    });
  return SLOT_DEFINITIONS.map((slot) => slot.id).filter((slotId) => open.has(slotId));
}

function getWeeklyOpenSlots() {
  return state.settings.weekly_open_slots || DEFAULT_WEEKLY_OPEN_SLOTS;
}

function setMessage(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle("error", isError);
}

function statusLabel(status) {
  return { pending: "承認待ち", approved: "承認済み", rejected: "却下" }[status] || status;
}

function requestTypeLabel(type) {
  return { create: "作成", update_members: "メンバー変更", dissolve: "解散" }[type] || type;
}

function requestActions(id) {
  return `
    <span class="request-actions">
      <button type="button" class="tiny-button" data-request-id="${id}" data-request-action="approved">承認</button>
      <button type="button" class="tiny-button secondary" data-request-id="${id}" data-request-action="rejected">却下</button>
    </span>
  `;
}

function formatMemberEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  return list.map((entry) => `${escapeHtml(entry.student_id)} ${escapeHtml(entry.name || "")}`).join("<br>") || "-";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function newId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
