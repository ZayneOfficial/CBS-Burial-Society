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

async function loadFunerals(){
  try{
    const data = await api("/api/funerals");
    $("funeralSelect").innerHTML = `<option value="">Select a funeral...</option>` +
      data.funerals.map(f=>`<option value="${f._id}">${esc(f.deceased_name)} — ${dateOnly(f.funeral_date)} — ${money(f.contribution_amount)}</option>`).join("");
  }catch(e){ message($("funeralMessage"),e.message); }
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
