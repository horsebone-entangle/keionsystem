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

const DEFAULT_SETTINGS = { personal_open_days:3, monthly_band_limit:8, monthly_personal_limit:4, weekly_open_slots:structuredClone(DEFAULT_WEEKLY_OPEN_SLOTS) };
const state = {
  page: document.body.dataset.page,
  currentMonth: startOfMonth(new Date()),
  availabilityMonth: startOfMonth(new Date()),
  selectedAvailabilityDate: null,
  selectedDayOffset: 0,
  settings: DEFAULT_SETTINGS,
  roomDays: [],
  roomSlots: [],
  reservations: [],
  bands: [],
  bandMembers: [],
  members: [],
  requests: [],
  user: null,
};

document.addEventListener("DOMContentLoaded", () => init().catch(showError));
window.addEventListener("unhandledrejection", event => { event.preventDefault(); showError(event.reason); });
async function api(path, body) {
  const response = await fetch('/api/' + path, {method:body === undefined ? 'GET' : 'POST', credentials:'same-origin', headers:body === undefined ? {} : {'Content-Type':'application/json'}, body:body === undefined ? undefined : JSON.stringify(body)});
  const result = await response.json().catch(() => ({error:'サーバーからの応答を読み取れませんでした'}));
  if(!response.ok) throw new Error(result.error || '操作に失敗しました');
  return result;
}
function showError(error) {
  let box=document.querySelector('#appError');
  if(!box){box=document.createElement('div');box.id='appError';box.className='message error';box.setAttribute('role','alert');document.querySelector('main').prepend(box);}
  box.replaceChildren(document.createTextNode(error?.message || '通信できませんでした。再試行してください。'));
  const button=document.createElement('button');button.textContent='再読み込み';button.type='button';button.onclick=()=>location.reload();box.append(button);
}
async function runForm(event, action) {
  event.preventDefault();const form=event.currentTarget;const button=form.querySelector('[type=submit]');
  if(button?.disabled)return;if(button)button.disabled=true;
  const message=form.parentElement.querySelector('.message');if(message)setMessage(message,'');
  try {await action(form,message);} catch(error){if(message)setMessage(message,error.message,true);else showError(error);} finally{if(button)button.disabled=false;}
}

async function init() {
  await loadAll();


  if (state.page === "portal") initPortalPage();
  if (state.page === "register") initRegisterPage();
  if (state.page === "reservation") initReservationPage();
  if (state.page === "requests") initRequestPage();
  if (state.page === "admin") initAdminPage();
}

async function loadAll() { Object.assign(state, await api('state')); }

function initPortalPage() {
  document.querySelector('#loginForm').addEventListener('submit', submitLogin);
  document.querySelector('#logoutButton').addEventListener('click', logout);
  if(state.needsSetup) {
    document.querySelector('#loginPanel h2').textContent='最初の管理者を設定';
    const form=document.querySelector('#loginForm');
    const label=document.createElement('label');label.textContent='氏名';const input=document.createElement('input');input.name='name';input.required=true;label.append(input);form.prepend(label);
    form.querySelector('[name=password]').minLength=10;
    form.querySelector('button').textContent='管理者を登録する';
    document.querySelector('#loginPanel .hint').textContent='管理者の学籍番号・氏名と10文字以上のパスワードを設定してください。';
    document.querySelector('#loginPanel a').classList.add('hidden');
  }
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

async function submitLogin(event) { return runForm(event, async (form) => {
  await api(state.needsSetup ? 'setup' : 'login',Object.fromEntries(new FormData(form)));await loadAll();renderPortal();
}); }

function initRegisterPage() {
  document.querySelector("#registerForm").addEventListener("submit", submitRegister);
}

async function submitRegister(event) { return runForm(event, async(form,message)=>{
  await api('register',Object.fromEntries(new FormData(form)));setMessage(message,'登録しました');location.href='index.html';
}); }

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
  renderMyRequests();
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

async function submitReservation(event) { return runForm(event,async(form,message)=>{
  const data=Object.fromEntries(new FormData(form));const result=validateReservation(data);
  if(!result.ok)throw new Error(result.error);
  await api('reservations',{date:data.date,slot_id:data.slotId,reservation_type:data.reservationType,band_id:result.band?.id||null});
  await loadAll();renderCalendar();renderMyReservations();form.reset();setupReservationDateRange();toggleBandField();updateSelectedSlotSummary();renderReservationQuota();setMessage(message,'予約を受け付けました');
}); }

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
    if(!state.bandMembers.some(x=>x.band_id===band.id&&x.student_id===state.user.student_id))return {ok:false,error:"所属バンドのみ予約できます"};
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

async function cancelReservation(id) { await api('reservations/cancel',{id});await loadAll();renderCalendar();renderMyReservations();renderReservationQuota(); }

async function submitBandRequest(event) { return runForm(event,async(form,message)=>{
  const data=Object.fromEntries(new FormData(form)),parsed=parseMemberEntries(data.membersText);
  if(data.requestType!=='dissolve'&&!parsed.ok)throw new Error(parsed.error);
  await api('requests',{request_type:data.requestType,band_name:data.bandName.trim(),reason:data.reason.trim(),member_entries:parsed.entries||[]});
  await loadAll();form.reset();setMessage(message,'申請を受け付けました。運営の承認待ちです');renderMyRequests();
}); }
function renderMyRequests(){
  let panel=document.querySelector('#myRequests');if(!panel){panel=document.createElement('section');panel.id='myRequests';panel.className='panel';document.querySelector('main').append(panel);}
  panel.innerHTML='<h2>自分の申請</h2>'+state.requests.map(item=>'<p><strong>'+escapeHtml(item.band_name)+'</strong> '+requestTypeLabel(item.request_type)+' / '+statusLabel(item.status)+'</p>').join('');
  if(!state.requests.length)panel.innerHTML+='<p class="hint">申請はありません。</p>';
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

async function submitSettings(event) { return runForm(event,async(form)=>{
 await api('settings',{personal_open_days:Number(form.personalOpenDays.value),monthly_band_limit:Number(form.monthlyBandLimit.value),monthly_personal_limit:Number(form.monthlyPersonalLimit.value)});await loadAll();renderSettings();renderUsage();
}); }

async function submitRoomDay(event) { return runForm(event,async(form)=>{await api('room-days',{date:form.date.value,is_open:form.isOpen.checked,note:form.note.value.trim()});await loadAll();renderRoomDayQuickList();}); }

async function toggleRoomDay(dateKey) {const current=state.roomDays.find(x=>x.date===dateKey);await api('room-days',{date:dateKey,is_open:current?!current.is_open:false,note:current?.note||''});await loadAll();renderRoomDayQuickList();}

async function uploadMembersCsv() {
  const message=document.querySelector('#csvMessage'),file=document.querySelector('#memberCsv').files[0],button=document.querySelector('#uploadCsvButton');
  if(!file)return setMessage(message,'CSVファイルを選択してください',true);
  if(button.disabled)return;button.disabled=true;
  try {
    const rows=parseCsv((await file.text()).replace(/^\uFEFF/,''));
    const result=await api('members/import',{members:rows});await loadAll();renderMemberSearch();renderMemberList();
    setMessage(message,result.count+'件の部員情報を取り込みました');
    document.querySelector('#invitationDownload')?.remove();
    if(result.invitations.length){
      const csv='student_id,name,invitation_code\r\n'+result.invitations.map(row=>[row.student_id,row.name,row.invitation_code].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
      const link=document.createElement('a');link.id='invitationDownload';link.textContent='招待コードをダウンロード';link.download='member-invitations.csv';link.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));message.after(link);
      setMessage(message,result.count+'件を取り込みました。招待コードを保存して各部員に渡してください。');
    }
  }catch(error){setMessage(message,error.message,true);}finally{button.disabled=false;}
}

function renderSettings() {
  const form = document.querySelector("#settingsForm");
  if(!form)return;
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

async function updateMemberRole(studentId,role){await api('members/role',{student_id:studentId,role});await loadAll();renderMemberSearch();renderMemberList();}

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

async function toggleRoomSlot(dateKey,slotId){await api('room-slots',{date:dateKey,slot_id:slotId,is_open:!isSlotOpenOnDate(parseDateInput(dateKey),slotId),note:''});await loadAll();renderAvailabilityMonth();renderSlotEditor(parseDateInput(dateKey));}

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

async function saveDefaultSlots(){
 const next={};for(let day=0;day<7;day++)next[day]=[];document.querySelectorAll('[data-default-day]').forEach(input=>{if(input.checked)next[input.dataset.defaultDay].push(input.value);});
 try{await api('settings',{weekly_open_slots:next});await loadAll();renderDefaultSlotEditor();renderAvailabilityMonth();setMessage(document.querySelector('#defaultSlotMessage'),'デフォルトを保存しました');}catch(error){setMessage(document.querySelector('#defaultSlotMessage'),error.message,true);}
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
  if(!table)return;
  const usage = new Map();
  state.reservations.filter(item=>item.date.slice(0,7)===toDateInput(new Date()).slice(0,7)).forEach((reservation) => {
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
  if(!table)return;
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

async function reviewBandRequest(requestId,action){await api('requests/review',{id:requestId,status:action});await loadAll();renderMemberSearch();renderMemberList();renderRequests();}





function requireLogin() {
  if (state.user) return true;
  window.location.href = getRootPath("index.html");
  return false;
}





async function logout(){await api('logout',{});location.href=getRootPath('index.html');}

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
  options.innerHTML = getMemberBands(state.user.student_id)
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
  if(state.roomDays.some(day=>day.date===dateKey&&!day.is_open))return [];
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
