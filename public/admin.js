function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
const session = JSON.parse(localStorage.getItem("session") || "null");
if (!session || session.role !== "admin") location.href = "/";

const $ = id => document.getElementById(id);
$("adminName").textContent = session.admin ? session.admin.name : "Administrator";

let memberPage = 1;
let memberPages = 1;
let currentFilter = "";
let currentPayments = [];
let currentFuneral = null;

function money(n){ return "R" + Number(n || 0).toLocaleString("en-ZA",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function dateOnly(v){ return v ? new Date(v).toLocaleDateString("en-ZA") : "—"; }
function dateTime(v){ return v ? new Date(v).toLocaleString("en-ZA") : "—"; }
function esc(v){
  return String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function api(url, options={}){
  const res = await fetch(url, options);
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}
function message(el,text,ok=false){ el.textContent=text; el.className="message "+(ok?"success":"error"); }

async function loadMembers(){
  try{
    const data = await api(`/api/members?page=${memberPage}&limit=50&search=${encodeURIComponent($("memberSearch").value)}`);
    memberPages = data.pages;
    $("totalMembers").textContent = data.total;
    $("pageInfo").textContent = `Page ${data.page} of ${data.pages} (${data.total} members)`;
    $("memberBody").innerHTML = data.members.map(m=>`
      <tr>
        <td><b>${esc(m.vn_number)}</b></td><td>${esc(m.name)}</td><td>${esc(m.surname)}</td><td>${esc(m.phone)}</td>
        <td>${esc(m.status)}</td><td>${dateOnly(m.join_date)}</td>
        <td><button class="btn btn-primary edit-member" data-id="${m._id}">✏️ Edit</button> <button class="btn btn-red delete-member" data-id="${m._id}">🗑️ Delete</button></td>
      </tr>`).join("") || `<tr><td colspan="7" class="empty">No members found.</td></tr>`;
  }catch(e){ message($("memberMessage"),e.message); }
}

async function loadFunerals(keepSelected=true){
  try{
    const previous = keepSelected ? $("funeralSelect").value : "";
    const data = await api("/api/funerals");
    $("funeralSelect").innerHTML = `<option value="">Select a funeral...</option>` +
      data.funerals.map(f=>`<option value="${f._id}">${esc(f.deceased_name)} — ${dateOnly(f.funeral_date)} — ${money(f.contribution_amount)}</option>`).join("");
    if(previous && data.funerals.some(f=>f._id===previous)){
      $("funeralSelect").value = previous;
      await loadPayments();
    }
  }catch(e){ message($("funeralMessage"),e.message); }
}

function closeEditFuneral(){
  $("editFuneralPanel").classList.add("hidden");
  $("editFuneralPanel").removeAttribute("data-id");
}

async function editSelectedFuneral(){
  const id=$("funeralSelect").value;
  if(!id){alert("Select a funeral first.");return;}
  try{
    const data=await api("/api/funerals");
    const f=data.funerals.find(x=>x._id===id);
    if(!f){alert("Funeral not found.");return;}
    $("editFuneralPanel").dataset.id=f._id;
    $("editFuneralName").value=f.deceased_name||"";
    $("editFuneralDate").value=f.funeral_date ? new Date(f.funeral_date).toISOString().slice(0,10) : "";
    $("editFuneralAmount").value=Number(f.contribution_amount||0);
    $("editFuneralPanel").classList.remove("hidden");
    $("editFuneralPanel").scrollIntoView({behavior:"smooth",block:"start"});
  }catch(e){message($("funeralMessage"),e.message)}
}

async function deleteSelectedFuneral(){
  const id=$("funeralSelect").value;
  if(!id){alert("Select a funeral first.");return;}
  const option=$("funeralSelect").selectedOptions[0];
  const label=option ? option.textContent : "this funeral";
  const confirmed=confirm(
    "⚠️ DELETE FUNERAL\n\n" +
    `Are you sure you want to permanently delete:\n${label}\n\n` +
    "This will also permanently delete ALL payment records belonging to this funeral.\n\n" +
    "This action cannot be undone.\n\nClick OK to continue."
  );
  if(!confirmed)return;
  try{
    const data=await api(`/api/funerals/${id}`,{method:"DELETE"});
    closeEditFuneral();
    $("funeralSelect").value="";
    currentPayments=[]; currentFuneral=null;
    $("paymentBody").innerHTML=`<tr><td colspan="8" class="empty">Select a funeral.</td></tr>`;
    $("paymentSummary").textContent="Select a funeral to begin.";
    updateStats();
    message($("funeralMessage"),`${data.message} ${data.payments_deleted} payment records removed.`,true);
    await loadFunerals(false);
  }catch(e){message($("funeralMessage"),e.message)}
}

async function loadPayments(){
  const id = $("funeralSelect").value;
  if(!id){
    $("paymentBody").innerHTML=`<tr><td colspan="8" class="empty">Select a funeral.</td></tr>`;
    $("paymentSummary").textContent="Select a funeral to begin.";
    currentPayments=[]; currentFuneral=null; updateStats();
    return;
  }
  try{
    const params = new URLSearchParams({search:$("paymentSearch").value});
    if(currentFilter) params.set("status",currentFilter);
    const data = await api(`/api/payments/${id}?${params}`);
    currentPayments = data.payments;
    currentFuneral = data.payments[0] ? {
      deceased_name:data.payments[0].funeral_deceased_name,
      funeral_date:data.payments[0].funeral_date,
      contribution_amount:data.payments[0].contribution_amount
    } : await funeralFromSelect(id);
    $("paymentSummary").innerHTML = `<b>${data.summary.paid}/${data.summary.total} PAID</b> · <b>${data.summary.notPaid}/${data.summary.total} NOT PAID</b> · <b>${money(data.summary.collected)} collected</b>`;
    $("paymentBody").innerHTML = currentPayments.map(p=>`
      <tr>
        <td><b>${esc(p.vn_number)}</b></td><td>${esc(p.name)}</td><td>${esc(p.surname)}</td><td>${esc(p.phone)}</td>
        <td>${p.status==="PAID"?'<span class="badge paid">✅ PAID</span>':'<span class="badge not-paid">❌ NOT PAID</span>'}</td>
        <td>${dateTime(p.payment_date)}</td>
        <td><button class="btn ${p.status==="PAID"?"btn-red":"btn-green"} toggle-payment" data-id="${p._id}">${p.status==="PAID"?"❌ Mark NOT PAID":"✅ Mark PAID"}</button></td>
        <td>${isPlaceholderPhone(p.phone)
  ? '<span class="small">No phone</span>'
  : `<button class="btn whatsapp single-wa" data-id="${p._id}">📱 WhatsApp</button>`}</td>
      </tr>`).join("") || `<tr><td colspan="8" class="empty">No payments match the filter.</td></tr>`;
    updateStats(data.summary);
  }catch(e){ message($("funeralMessage"),e.message); }
}
async function funeralFromSelect(id){
  const data=await api("/api/funerals");
  const f=data.funerals.find(x=>x._id===id);
  return f || null;
}
function updateStats(summary){
  if(summary){
    $("paidCount").textContent=`${summary.paid} / ${summary.total}`;
    $("notPaidCount").textContent=`${summary.notPaid} / ${summary.total}`;
    $("collected").textContent=money(summary.collected);
  } else {
    $("paidCount").textContent="0 / 0"; $("notPaidCount").textContent="0 / 0"; $("collected").textContent="R0";
  }
}
function phone27(phone){
  let p=String(phone||"").replace(/[^\d+]/g,"");
  if(p.startsWith("+27")) return p.slice(1);
  if(p.startsWith("27")) return p;
  if(p.startsWith("0")) return "27"+p.slice(1);
  return p;
}
function waMessage(p){
  const status = p.status==="PAID" ? "✅ PAID" : "❌ NOT PAID";
  return `Hello ${p.vn_number} ${p.name}, Burial Society Reminder, Funeral: ${p.funeral_deceased_name} Amount ${money(p.contribution_amount)} Status ${status} Please pay your contribution. Thank you.`;
}
function isPlaceholderPhone(phone){
  const p=String(phone||"").replace(/\D/g,"");
  // Missing-phone placeholders generated by the migration are 0000000000, 0000000001, ...
  return /^0{6}\d{4}$/.test(p);
}
function openWA(p){
  if(isPlaceholderPhone(p.phone)){
    alert(`No real phone number is recorded for ${p.vn_number}. WhatsApp is disabled for this member.`);
    return;
  }
  const url=`https://wa.me/${phone27(p.phone)}?text=${encodeURIComponent(waMessage(p))}`;
  window.open(url,"_blank","noopener");
}

$("memberSearch").addEventListener("input",()=>{memberPage=1;loadMembers()});
$("refreshMembers").onclick=loadMembers;
$("prevPage").onclick=()=>{if(memberPage>1){memberPage--;loadMembers()}};
$("nextPage").onclick=()=>{if(memberPage<memberPages){memberPage++;loadMembers()}};
$("memberBody").addEventListener("click",async e=>{
  const editBtn=e.target.closest(".edit-member");
  if(editBtn){
    try{
      const data=await api(`/api/members/${editBtn.dataset.id}`);
      const m=data.member;
      $("editMemberPanel").classList.remove("hidden");
      $("editMemberPanel").dataset.id=m._id;
      $("editVN").value=m.vn_number || "";
      $("editName").value=m.name || "";
      $("editSurname").value=m.surname || "";
      $("editPhone").value=isPlaceholderPhone(m.phone) ? "" : (m.phone || "");
      $("editPhone").placeholder=isPlaceholderPhone(m.phone) ? "No real phone number recorded" : "Phone";
      $("editStatus").value=m.status || "Active";
      $("editJoinDate").value=m.join_date ? new Date(m.join_date).toISOString().slice(0,10) : "";
      $("editMemberPanel").scrollIntoView({behavior:"smooth",block:"start"});
    }catch(err){message($("memberMessage"),err.message)}
    return;
  }

  const deleteBtn=e.target.closest(".delete-member");
  if(!deleteBtn)return;
  const confirmed = confirm(
  "⚠️ DELETE MEMBER\n\n" +
  "Are you sure you want to delete this member?\n\n" +
  "The member will be removed from the Members list.\n" +
  "Historical funeral payment records will NOT be deleted.\n\n" +
  "Click OK to permanently delete this member."
);

if (!confirmed) return;
  try{await api(`/api/members/${deleteBtn.dataset.id}`,{method:"DELETE"});loadMembers()}catch(err){message($("memberMessage"),err.message)}
});

$("cancelEditMember").onclick=()=>{
  $("editMemberPanel").classList.add("hidden");
  $("editMemberPanel").removeAttribute("data-id");
};

$("editMemberForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const id=$("editMemberPanel").dataset.id;
  if(!id){message($("memberMessage"),"No member selected for editing.");return;}
  try{
    const phone=$("editPhone").value.trim();
    if(!phone){
      alert("Enter a real phone number. If this member has no phone, leave the existing placeholder unchanged instead of saving an empty value.");
      return;
    }
    const data=await api(`/api/members/${id}`,{
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        name:$("editName").value.trim(),
        surname:$("editSurname").value.trim(),
        phone,
        status:$("editStatus").value,
        join_date:$("editJoinDate").value
      })
    });
    $("editMemberPanel").classList.add("hidden");
    $("editMemberPanel").removeAttribute("data-id");
    message($("memberMessage"),`${data.message} Payments updated: ${data.payments_updated}.`,true);
    await loadMembers();
    if($("funeralSelect").value) await loadPayments();
  }catch(err){message($("memberMessage"),err.message)}
});
$("memberForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    await api("/api/members",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      vn_number:$("newVN").value,name:$("newName").value,surname:$("newSurname").value,phone:$("newPhone").value,
      password:$("newPassword").value,status:$("newStatus").value
    })});
    e.target.reset();$("newPassword").value="1234";message($("memberMessage"),"Member added.",true);loadMembers();
  }catch(err){message($("memberMessage"),err.message)}
});

  $("funeralForm").addEventListener("submit", async e => {
  e.preventDefault();

  if (!confirm(
    "Create this funeral?\n\n" +
    "This will automatically create payment records for ALL active members."
  )) {
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;

  submitBtn.disabled = true;
  submitBtn.textContent = "⏳ Creating funeral...";

  try {
    const data = await api("/api/funerals", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        deceased_name: $("deceasedName").value,
        funeral_date: $("funeralDate").value,
        contribution_amount: $("funeralAmount").value
      })
    });

    message(
      $("funeralMessage"),
      `Funeral created successfully. ${data.payments_created} payment records created.`,
      true
    );

    e.target.reset();
    $("funeralAmount").value = "200";

    await loadFunerals();

  } catch (err) {
    message($("funeralMessage"), err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});

$("editFuneralBtn").onclick=editSelectedFuneral;
$("deleteFuneralBtn").onclick=deleteSelectedFuneral;
$("cancelEditFuneral").onclick=closeEditFuneral;
$("editFuneralForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const id=$("editFuneralPanel").dataset.id;
  if(!id){message($("funeralMessage"),"No funeral selected for editing.");return;}
  const saveBtn=e.target.querySelector('button[type="submit"]');
  const originalText=saveBtn.textContent;
  saveBtn.disabled=true; saveBtn.textContent="⏳ Saving...";
  try{
    const data=await api(`/api/funerals/${id}`,{
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        deceased_name:$("editFuneralName").value.trim(),
        funeral_date:$("editFuneralDate").value,
        contribution_amount:$("editFuneralAmount").value
      })
    });
    closeEditFuneral();
    message($("funeralMessage"),`${data.message} Payments updated: ${data.payments_updated}.`,true);
    await loadFunerals(true);
  }catch(err){message($("funeralMessage"),err.message)}
  finally{saveBtn.disabled=false;saveBtn.textContent=originalText}
});

$("funeralSelect").addEventListener("change",loadPayments);
let paymentTimer;
$("paymentSearch").addEventListener("input",()=>{clearTimeout(paymentTimer);paymentTimer=setTimeout(loadPayments,250)});
document.querySelectorAll(".filter").forEach(b=>b.onclick=()=>{document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));b.classList.add("active");currentFilter=b.dataset.filter;loadPayments()});
$("paymentBody").addEventListener("click",async e=>{
  const toggle=e.target.closest(".toggle-payment");
  const wa=e.target.closest(".single-wa");
  if(toggle){
    try{await api(`/api/payments/${toggle.dataset.id}/toggle`,{method:"PUT"});await loadPayments()}catch(err){alert(err.message)}
  }
  if(wa){
    const p=currentPayments.find(x=>x._id===wa.dataset.id);if(p)openWA(p);
  }
});
$("whatsappAll").onclick=async()=>{
  if(!$("funeralSelect").value){alert("Select a funeral first.");return}
  try{
    const data=await api(`/api/payments/${$("funeralSelect").value}?status=NOT%20PAID`);
    const realPhonePayments=data.payments.filter(p=>!isPlaceholderPhone(p.phone));
    const skipped=data.payments.length-realPhonePayments.length;
    const list=realPhonePayments.map(p=>`${p.vn_number} ${p.name} ${p.surname} ${p.phone}`).join("\n");
    if(!realPhonePayments.length){ alert("No NOT PAID members have a real phone number."); return; }
    const text=`Burial Society — NOT PAID members\nFuneral: ${currentFuneral?.funeral_deceased_name || "Selected funeral"}\n\n${list}`;
    if(realPhonePayments.length>50){
      await navigator.clipboard.writeText(text);
      alert(`${realPhonePayments.length} members copied to clipboard${skipped ? `; ${skipped} members without real phone numbers were skipped` : ""}. Paste it into WhatsApp.`);
    }else{
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank","noopener");
    }
  }catch(e){alert(e.message)}
};

function exportRows(mode){
  if(!currentPayments.length){alert("No payment data to export.");return []}
  return mode==="PAID" ? currentPayments.filter(p=>p.status==="PAID")
    : mode==="NOT PAID" ? currentPayments.filter(p=>p.status==="NOT PAID") : currentPayments;
}
function makePDF(mode){
  const rows=exportRows(mode); if(!rows.length){alert("No matching payments.");return}
  const {jsPDF}=window.jspdf; const doc=new jsPDF({orientation:"landscape"});
  const f=currentFuneral;
  doc.setFontSize(16);doc.text(`Burial Society — ${f?.deceased_name||"Funeral"}`,14,15);
  doc.setFontSize(10);doc.text(`Date: ${dateOnly(f?.funeral_date)}   Contribution: ${money(f?.contribution_amount)}   Filter: ${mode}`,14,22);
  doc.autoTable({
    startY:28,
    head:[["VN","Name","Surname","Phone","Status","Date","Amount"]],
    body:rows.map(p=>[p.vn_number,p.name,p.surname,p.phone,p.status==="PAID"?"✅ PAID":"❌ NOT PAID",dateTime(p.payment_date),money(p.amount_paid)]),
    styles:{fontSize:8}
  });
  doc.save(`funeral-${(f?.deceased_name||"payments").replace(/\s+/g,"-")}-${mode}.pdf`);
}
function csvEscape(v){return `"${String(v??"").replace(/"/g,'""')}"`}
$("pdfAll").onclick=()=>makePDF("ALL");$("pdfPaid").onclick=()=>makePDF("PAID");$("pdfNotPaid").onclick=()=>makePDF("NOT PAID");
$("csvExport").onclick=()=>{
  const rows=exportRows("ALL");if(!rows.length){alert("No payment data.");return}
  const headers=["funeral_id","funeral_deceased_name","funeral_date","contribution_amount","member_id","vn_number","name","surname","phone","status","payment_date","amount_paid","created_at"];
  const csv=[headers,...rows.map(p=>headers.map(h=>csvEscape(p[h])))] .map(r=>r.join(",")).join("\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="funeral-payments.csv";a.click();URL.revokeObjectURL(a.href);
};
$("logoutBtn").onclick=()=>{localStorage.removeItem("session");location.href="/"};
(async()=>{await loadMembers();await loadFunerals();})();


// ============================================================
// PENDING HELPER APPROVALS
// ============================================================

async function loadPendingApprovals() {
  const body = $("approvalBody");
  const summary = $("approvalSummary");

  if (!body) return;

  body.innerHTML = `
    <tr>
      <td colspan="9" class="empty">
        Loading pending changes...
      </td>
    </tr>
  `;

  try {
    const res = await fetch("/api/payment-change-requests");
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Could not load approvals.");
    }

    const requests = data.requests || [];

    summary.textContent =
      `${requests.length} pending helper change${requests.length === 1 ? "" : "s"}.`;

    if (!requests.length) {
      body.innerHTML = `
        <tr>
          <td colspan="9" class="empty">
            No pending helper changes.
          </td>
        </tr>
      `;
      return;
    }

    body.innerHTML = requests.map(request => {
      const helper = request.helper_id || {};
      const funeral = request.funeral_id || {};

      const helperName =
        `${helper.name || ""} ${helper.surname || ""}`.trim() || "Unknown";

      const memberName =
        `${request.name || ""} ${request.surname || ""}`.trim();

      const funeralName =
        funeral.deceased_name || "Unknown";

      const submitted =
        request.submitted_at
          ? new Date(request.submitted_at).toLocaleString()
          : "-";

      return `
        <tr>
          <td>${escapeHtml(helperName)}</td>

          <td>${escapeHtml(helper.vn_number || "-")}</td>

          <td>${escapeHtml(request.vn_number || "-")}</td>

          <td>${escapeHtml(memberName)}</td>

          <td>${escapeHtml(funeralName)}</td>

          <td>
            <strong>${escapeHtml(request.old_status)}</strong>
          </td>

          <td>
            <strong>${escapeHtml(request.new_status)}</strong>
          </td>

          <td>${escapeHtml(submitted)}</td>

          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap">

              <button
                class="btn btn-green"
                type="button"
                onclick="approvePaymentChange('${request._id}')"
              >
                ✅ Approve
              </button>

              <button
                class="btn btn-red"
                type="button"
                onclick="rejectPaymentChange('${request._id}')"
              >
                ❌ Reject
              </button>

            </div>
          </td>
        </tr>
      `;
    }).join("");

  } catch (err) {
    console.error(err);

    summary.textContent = "Could not load pending approvals.";

    body.innerHTML = `
      <tr>
        <td colspan="9" class="empty">
          ${escapeHtml(err.message)}
        </td>
      </tr>
    `;
  }
}


// ============================================================
// APPROVE
// ============================================================

async function approvePaymentChange(id) {

  if (!confirm(
    "Approve this payment change?\n\n" +
    "The official payment record will be updated."
  )) {
    return;
  }

  try {

    const res = await fetch(
      `/api/payment-change-requests/${encodeURIComponent(id)}/approve`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data.message || "Could not approve payment change."
      );
    }

    alert("✅ Payment change approved.");

    await loadPendingApprovals();

    // Refresh the current payment table if a funeral
    // is currently selected.
    if ($("funeralSelect") && $("funeralSelect").value) {
      await loadPayments();
    }

  } catch (err) {

    alert(`❌ ${err.message}`);

  }
}


// ============================================================
// REJECT
// ============================================================

async function rejectPaymentChange(id) {

  if (!confirm(
    "Reject this payment change?\n\n" +
    "The official payment record will NOT be changed."
  )) {
    return;
  }

  try {

    const res = await fetch(
      `/api/payment-change-requests/${encodeURIComponent(id)}/reject`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data.message || "Could not reject payment change."
      );
    }

    alert("❌ Payment change rejected.");

    await loadPendingApprovals();

  } catch (err) {

    alert(`❌ ${err.message}`);

  }
}


// ============================================================
// REFRESH APPROVALS BUTTON
// ============================================================

if ($("refreshApprovals")) {
  $("refreshApprovals").addEventListener(
    "click",
    loadPendingApprovals
  );
}


// Load approvals when Admin Dashboard opens
loadPendingApprovals();

// ============================================================
// PENDING HELPER APPROVALS
// ============================================================

async function loadPendingApprovals() {
  const body = $("approvalBody");
  const summary = $("approvalSummary");

  if (!body) return;

  body.innerHTML = `
    <tr>
      <td colspan="9" class="empty">
        Loading pending changes...
      </td>
    </tr>
  `;

  try {
    const res = await fetch("/api/payment-change-requests");
    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data.message || "Could not load approvals."
      );
    }

    const requests = data.requests || [];

    summary.textContent =
      `${requests.length} pending helper change${requests.length === 1 ? "" : "s"}.`;

    if (!requests.length) {
      body.innerHTML = `
        <tr>
          <td colspan="9" class="empty">
            No pending helper changes.
          </td>
        </tr>
      `;
      return;
    }

    body.innerHTML = requests.map(request => {
      const helper = request.helper_id || {};
      const funeral = request.funeral_id || {};

      const helperName =
        `${helper.name || ""} ${helper.surname || ""}`.trim() ||
        "Unknown";

      const memberName =
        `${request.name || ""} ${request.surname || ""}`.trim();

      const funeralName =
        funeral.deceased_name || "Unknown";

      const submitted =
        request.submitted_at
          ? new Date(request.submitted_at).toLocaleString()
          : request.created_at
            ? new Date(request.created_at).toLocaleString()
            : "-";

      return `
        <tr>

          <td>
            ${escapeHtml(helperName)}
          </td>

          <td>
            ${escapeHtml(helper.vn_number || "-")}
          </td>

          <td>
            ${escapeHtml(request.vn_number || "-")}
          </td>

          <td>
            ${escapeHtml(memberName)}
          </td>

          <td>
            ${escapeHtml(funeralName)}
          </td>

          <td>
            <strong>
              ${escapeHtml(request.old_status || "-")}
            </strong>
          </td>

          <td>
            <strong>
              ${escapeHtml(request.new_status || "-")}
            </strong>
          </td>

          <td>
            ${escapeHtml(submitted)}
          </td>

          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap">

              <button
                class="btn btn-green"
                type="button"
                onclick="approvePaymentChange('${request._id}')"
              >
                ✅ Approve
              </button>

              <button
                class="btn btn-red"
                type="button"
                onclick="rejectPaymentChange('${request._id}')"
              >
                ❌ Reject
              </button>

            </div>
          </td>

        </tr>
      `;
    }).join("");

  } catch (err) {

    console.error(err);

    summary.textContent =
      "Could not load pending approvals.";

    body.innerHTML = `
      <tr>
        <td colspan="9" class="empty">
          ${escapeHtml(err.message)}
        </td>
      </tr>
    `;
  }
}


// ============================================================
// APPROVE HELPER CHANGE
// ============================================================

async function approvePaymentChange(id) {

  if (!confirm(
    "Approve this payment change?\n\n" +
    "The official payment record will be updated."
  )) {
    return;
  }

  try {

    const res = await fetch(
      `/api/payment-change-requests/${encodeURIComponent(id)}/approve`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data.message ||
        "Could not approve payment change."
      );
    }

    alert("✅ Payment change approved.");

    await loadPendingApprovals();

    if (
      $("funeralSelect") &&
      $("funeralSelect").value
    ) {
      await loadPayments();
    }

  } catch (err) {

    console.error(err);

    alert(`❌ ${err.message}`);
  }
}


// ============================================================
// REJECT HELPER CHANGE
// ============================================================

async function rejectPaymentChange(id) {

  if (!confirm(
    "Reject this payment change?\n\n" +
    "The official payment record will NOT be changed."
  )) {
    return;
  }

  try {

    const res = await fetch(
      `/api/payment-change-requests/${encodeURIComponent(id)}/reject`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data.message ||
        "Could not reject payment change."
      );
    }

    alert("❌ Payment change rejected.");

    await loadPendingApprovals();

  } catch (err) {

    console.error(err);

    alert(`❌ ${err.message}`);
  }
}


// ============================================================
// REFRESH APPROVALS
// ============================================================

if ($("refreshApprovals")) {

  $("refreshApprovals").addEventListener(
    "click",
    loadPendingApprovals
  );

}


// Load pending approvals when Admin Dashboard opens
loadPendingApprovals();

async function closeSelectedFuneral(){
  const id = $("funeralSelect").value;

  if(!id){
    alert("Select a funeral first.");
    return;
  }

  const option = $("funeralSelect").selectedOptions[0];
  const label = option ? option.textContent : "this funeral";

  const confirmed = confirm(
    "🔒 CLOSE FUNERAL\n\n" +
    `Are you sure you want to close:\n${label}\n\n` +
    "After closing:\n" +
    "• Admins cannot mark payments\n" +
    "• Helpers cannot submit payment changes\n" +
    "• Payments can still be viewed\n\n" +
    "This action is intended to stop further payment marking."
  );

  if(!confirmed) return;

  try{
    const data = await api(`/api/funerals/${id}/close`, {
      method: "PUT"
    });

    message(
      $("funeralMessage"),
      data.message,
      true
    );

    await loadFunerals();

    $("funeralSelect").value = id;

    await loadPayments();

  }catch(e){
    message($("funeralMessage"), e.message);
  }
}

$("closeSelectedFuneral").onclick = closeSelectedFuneral;