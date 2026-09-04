"use strict";

const SUPABASE_URL = "https://cmwtijrlwfvpbkiclxyv.supabase.co";
const SUPABASE_KEY = "sb_publishable_G36NEdVkDlqE-A6zxD31Vg_oxLX8gAm";
const SESSION_KEY = "palivo_supabase_session";
const DEFAULT_CARTRIDGES = [
  ["3RL",21],["5RL",49],["7RL",18],["9RL",23],["13RL",11],
  ["7RM",0],["9RM",19],["11RM",20],["13RM",22],["15RM",19],["21RM",9],
  ["7RS",0],["14RS",13]
];
const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const PAYMENT_COLORS = ["#c6a15b","#e5ca8e","#9b7a42","#746247","#a7a49d","#66502d","#dfcda5","#775e31"];
const NON_REVENUE_PAYMENTS = new Set(["Permuta","Cortesia"]);

const state = { session:null, user:null, sales:[], cartridges:[], usages:[], purchases:[], stock:[], deleteId:null };
const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(n)||0);
const isoToday = () => new Date().toISOString().slice(0,10);
const esc = (v="") => String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const formatDate = (v) => v ? new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const duration = (mins=0) => `${Math.floor(mins/60)}h${mins%60 ? ` ${mins%60}min` : ""}`;
const durationInput = (mins=0) => `${Math.floor(Number(mins||0)/60)}:${String(Number(mins||0)%60).padStart(2,"0")}`;
function parseDuration(value){
  const match=String(value).trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if(!match)throw new Error("Informe a duração no formato horas:minutos. Exemplo: 1:35");
  return Number(match[1])*60+Number(match[2]);
}
function cartridgeOrder(item){
  const match=String(item.nome||item).toUpperCase().match(/^(\d+)\s*(RL|RM|RS)$/);
  const family={RL:0,RM:1,RS:2};
  return match?[family[match[2]],Number(match[1])]:[9,999];
}
function sortCartridges(a,b){const x=cartridgeOrder(a),y=cartridgeOrder(b);return x[0]-y[0]||x[1]-y[1]||String(a.nome).localeCompare(String(b.nome))}

function toast(message,type="ok"){
  const el=$("toast"); el.textContent=message; el.className=`toast show ${type}`;
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.className="toast",3200);
}
function setBusy(form,busy){
  const btn=form.querySelector('button[type="submit"]'); if(!btn)return;
  if(busy){btn.dataset.label=btn.textContent;btn.textContent=btn.dataset.busyLabel||"Salvando..."}else btn.textContent=btn.dataset.label||btn.textContent;
  btn.disabled=busy;
}
async function fetchWithTimeout(url,options={},milliseconds=15000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),milliseconds);
  try{return await fetch(url,{...options,signal:controller.signal})}
  catch(error){if(error.name==="AbortError")throw new Error("O Supabase demorou para responder. Tente novamente.");throw error}
  finally{clearTimeout(timer)}
}
function saveSession(session){
  if(session){session.saved_at=Date.now(); localStorage.setItem(SESSION_KEY,JSON.stringify(session));}
  else localStorage.removeItem(SESSION_KEY);
  state.session=session;
}
function getSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY))}catch{return null}}

async function authFetch(path,options={}){
  const res=await fetchWithTimeout(`${SUPABASE_URL}/auth/v1${path}`,{
    ...options,headers:{apikey:SUPABASE_KEY,"Content-Type":"application/json",...(options.headers||{})}
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.msg||data.error_description||data.message||"Falha na autenticação");
  return data;
}
async function refreshSession(){
  if(!state.session?.refresh_token) throw new Error("Sessão expirada");
  const fresh=await authFetch("/token?grant_type=refresh_token",{method:"POST",body:JSON.stringify({refresh_token:state.session.refresh_token})});
  saveSession(fresh); return fresh;
}
async function ensureToken(){
  if(!state.session) throw new Error("Faça login novamente");
  const expires=(state.session.expires_at?state.session.expires_at*1000:(state.session.saved_at+(state.session.expires_in||3600)*1000));
  if(expires-Date.now()<60000) await refreshSession();
  return state.session.access_token;
}
async function db(path,options={},retry=true){
  const token=await ensureToken();
  const res=await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`,{
    ...options,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(options.headers||{})}
  });
  if(res.status===401&&retry){await refreshSession();return db(path,options,false)}
  const data=res.status===204?null:await res.json().catch(()=>null);
  if(!res.ok) throw new Error(data?.message||data?.details||`Erro ${res.status}`);
  return data;
}

async function login(email,password){
  const session=await authFetch("/token?grant_type=password",{method:"POST",body:JSON.stringify({email,password})});
  saveSession(session); state.user=session.user;
  startApp().catch(error=>toast(error.message,"error"));
}
async function logout(){
  try{if(state.session)await authFetch("/logout",{method:"POST",headers:{Authorization:`Bearer ${state.session.access_token}`}})}catch{}
  saveSession(null); state.user=null; $("appView").hidden=true; $("loginView").hidden=false; $("loginForm").reset();
}

async function initializeCartridges(){
  const found=await db("cartuchos?select=*&order=nome");
  if(found.length){state.cartridges=found;return}
  const rows=DEFAULT_CARTRIDGES.map(([nome,estoque_inicial])=>({user_id:state.user.id,nome,estoque_inicial,estoque_minimo:5}));
  state.cartridges=await db("cartuchos",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(rows)});
}
async function loadData(showError=true){
  try{
    await initializeCartridges();
    const [sales,usages,purchases,stock]=await Promise.all([
      db("vendas?select=*&order=data_atendimento.desc,criado_em.desc"),
      db("venda_cartuchos?select=*&order=criado_em.desc"),
      db("compras_cartuchos?select=*&order=data_compra.desc,criado_em.desc"),
      db("estoque_atual?select=*&order=nome")
    ]);
    Object.assign(state,{sales,usages,purchases,stock}); renderAll();
  }catch(e){if(showError)toast(e.message,"error");throw e}
}
async function startApp(){
  $("loginView").hidden=true; $("appView").hidden=false;
  $("todayLabel").textContent=new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date());
  $("saleDate").value=isoToday(); $("purchaseDate").value=isoToday();
  try{await loadData()}catch(e){if(/sessão|token|jwt/i.test(e.message))logout()}
}

function setupFilters(){
  const current=new Date().getFullYear();
  const years=[...new Set(state.sales.map(s=>Number(s.data_atendimento.slice(0,4))))]; if(!years.includes(current))years.push(current);
  years.sort((a,b)=>b-a); const old=$("filterYear").value;
  $("filterYear").innerHTML=years.map(y=>`<option ${String(y)===old?"selected":""}>${y}</option>`).join("");
  $("filterMonth").innerHTML=MONTHS.map((m,i)=>`<option value="${i+1}">${m}</option>`).join("");
  const fill=(id,values)=>{const el=$(id),value=el.value;el.innerHTML='<option value="all">Todos</option>'+values.map(v=>`<option ${v===value?"selected":""}>${esc(v)}</option>`).join("")};
  fill("filterCity",[...new Set(state.sales.map(s=>s.cidade).filter(Boolean))].sort());
  fill("filterPayment",[...new Set(state.sales.map(s=>s.forma_pagamento).filter(Boolean))].sort());
}
function filteredSales(){
  const year=Number($("filterYear").value),period=$("filterPeriod").value,month=Number($("filterMonth").value);
  const ranges={s1:[1,6],s2:[7,12],q1:[1,3],q2:[4,6],q3:[7,9],q4:[10,12]};
  return state.sales.filter(s=>{
    const d=new Date(`${s.data_atendimento}T12:00:00`),m=d.getMonth()+1;
    if(d.getFullYear()!==year)return false;
    if(period==="month"&&m!==month)return false;
    if(ranges[period]&&(m<ranges[period][0]||m>ranges[period][1]))return false;
    if($("filterCity").value!=="all"&&s.cidade!==$("filterCity").value)return false;
    if($("filterPayment").value!=="all"&&s.forma_pagamento!==$("filterPayment").value)return false;
    if($("filterGender").value!=="all"&&(s.genero||"Não informado")!==$("filterGender").value)return false;
    return true;
  });
}
function renderDashboard(){
  const rows=filteredSales(),paidRows=rows.filter(s=>!NON_REVENUE_PAYMENTS.has(s.forma_pagamento)),revenue=paidRows.reduce((a,s)=>a+Number(s.valor),0),mins=rows.reduce((a,s)=>a+Number(s.duracao_minutos||0),0);
  $("metricRevenue").textContent=money(revenue); $("metricCount").textContent=rows.length; $("metricTicket").textContent=money(paidRows.length?revenue/paidRows.length:0); $("metricHours").textContent=duration(mins);
  const monthly=Array(12).fill(0); paidRows.forEach(s=>monthly[new Date(`${s.data_atendimento}T12:00:00`).getMonth()]+=Number(s.valor));
  const max=Math.max(...monthly,1); $("monthlyChart").innerHTML=monthly.map((v,i)=>`<div class="month-bar-wrap"><div class="month-bar" style="height:${Math.max(v/max*90,v?4:1)}%" data-value="${money(v)}"></div><span class="month-label">${MONTHS[i]}</span></div>`).join("");
  renderBars("cityChart",groupSum(paidRows,"cidade"),revenue);
  renderDonut(groupSum(paidRows,"forma_pagamento"),revenue);
  $("recentSales").innerHTML=rows.slice(0,5).map(s=>`<div class="recent-item"><div><p>${esc(s.cliente)}</p><small>${formatDate(s.data_atendimento)} · ${esc(s.cidade)}</small></div><strong>${money(s.valor)}</strong></div>`).join("")||'<div class="empty">Nenhuma venda neste filtro.</div>';
}
function groupSum(rows,key){return Object.entries(rows.reduce((a,s)=>{const k=s[key]||"Não informado";a[k]=(a[k]||0)+Number(s.valor);return a},{})).sort((a,b)=>b[1]-a[1])}
function renderBars(id,items,total){
  $(id).innerHTML=items.slice(0,6).map(([name,val])=>`<div class="bar-row"><span>${esc(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${total?val/total*100:0}%"></div></div><span class="bar-value">${money(val)}</span></div>`).join("")||'<div class="empty">Sem dados.</div>';
}
function renderDonut(items,total){
  if(!total){$("paymentChart").innerHTML='<div class="empty">Sem dados.</div>';return}
  let pos=0;const parts=items.map(([,v],i)=>{const start=pos;pos+=v/total*100;return `${PAYMENT_COLORS[i%PAYMENT_COLORS.length]} ${start}% ${pos}%`});
  $("paymentChart").innerHTML=`<div class="donut" style="background:conic-gradient(${parts.join(",")})"></div><div class="legend">${items.slice(0,6).map(([n,v],i)=>`<div class="legend-row"><span><i class="dot" style="background:${PAYMENT_COLORS[i%PAYMENT_COLORS.length]}"></i>${esc(n)}</span><b>${Math.round(v/total*100)}%</b></div>`).join("")}</div>`;
}
function renderSales(){
  const q=$("salesSearch").value.toLowerCase().trim();
  const rows=state.sales.filter(s=>[s.cliente,s.cidade,s.forma_pagamento].join(" ").toLowerCase().includes(q));
  $("salesList").innerHTML=rows.map(s=>`<article class="sale-card"><div class="sale-date"><strong>${s.data_atendimento.slice(8,10)}</strong><small>${MONTHS[Number(s.data_atendimento.slice(5,7))-1]} ${s.data_atendimento.slice(0,4)}</small></div><div class="sale-client"><strong>${esc(s.cliente)}</strong><span>${esc(s.genero||"Não informado")} · ${esc(s.cidade)}</span></div><div class="sale-meta"><small>Pagamento</small>${esc(s.forma_pagamento)}</div><div class="sale-value"><strong>${money(s.valor)}</strong><small>${duration(s.duracao_minutos)}</small></div><div class="sale-actions"><button data-edit="${s.id}" title="Editar">✎</button><button data-delete="${s.id}" class="delete" title="Excluir">×</button></div></article>`).join("")||'<div class="empty panel">Nenhuma venda encontrada.</div>';
}
function renderStock(){
  const low=state.stock.filter(s=>Number(s.quantidade_atual)<=Number(s.estoque_minimo)).length;
  $("stockSummary").textContent=`${state.stock.length} tipos cadastrados · ${low?`${low} precisam de reposição`:"todos com estoque regular"}`;
  const groups={RL:[],RM:[],RS:[]};
  [...state.stock].sort(sortCartridges).forEach(s=>{const family=String(s.nome).toUpperCase().match(/(RL|RM|RS)$/)?.[1];if(family)groups[family].push(s)});
  const labels={RL:"Traço",RM:"Magnum",RS:"Round Shader"};
  $("stockGrid").innerHTML=Object.entries(groups).map(([family,items])=>`<section class="stock-family"><div class="stock-family-head"><h3>${family}</h3><span>${labels[family]} · ${items.length} variações</span></div><div class="stock-grid">${items.map(s=>{const isLow=Number(s.quantidade_atual)<=Number(s.estoque_minimo);return `<article class="stock-card ${isLow?"low":""}"><p class="eyebrow">${family}</p><h3>${esc(s.nome)}</h3><div class="stock-qty">${Number(s.quantidade_atual)}</div><small>unidades disponíveis</small><br><span class="status ${isLow?"low":""}">${isLow?"COMPRAR":"DISPONÍVEL"}</span></article>`}).join("")}</div></section>`).join("");
}
function renderPurchases(){
  const byId=Object.fromEntries(state.cartridges.map(c=>[c.id,c.nome]));
  $("purchaseList").innerHTML=state.purchases.slice(0,10).map(p=>`<div class="recent-item"><div><p>${esc(byId[p.cartucho_id]||"Cartucho")}: +${p.quantidade}</p><small>${formatDate(p.data_compra)}${p.fornecedor?` · ${esc(p.fornecedor)}`:""}</small></div><strong>${p.valor_total==null?"—":money(p.valor_total)}</strong></div>`).join("")||'<div class="empty">Nenhuma entrada registrada.</div>';
}
function renderSelects(){
  const opts='<option value="">Selecione</option>'+[...state.cartridges].sort(sortCartridges).map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join("");
  $("purchaseCartridge").innerHTML=opts;
  document.querySelectorAll(".cartridge-select").forEach(el=>{const v=el.value;el.innerHTML=opts;el.value=v});
}
function renderAll(){setupFilters();renderSelects();renderDashboard();renderSales();renderStock();renderPurchases()}

function addCartridgeRow(cartuchoId="",quantidade=1){
  const row=document.createElement("div");row.className="cartridge-row";
  row.innerHTML=`<select class="cartridge-select" aria-label="Cartucho" required></select><input class="cartridge-qty" type="number" min="1" value="${quantidade}" aria-label="Quantidade" required><button class="remove-row" type="button" aria-label="Remover">×</button>`;
  $("cartridgeRows").appendChild(row);renderSelects();row.querySelector("select").value=cartuchoId;
  row.querySelector(".remove-row").onclick=()=>row.remove();
}
function resetSaleForm(){
  $("saleForm").reset();$("saleId").value="";$("saleDate").value=isoToday();$("saleDuration").value="0:30";$("cartridgeRows").innerHTML="";addCartridgeRow();$("saleFormTitle").textContent="Nova venda";$("cancelEdit").hidden=true;
}
async function saveSale(e){
  e.preventDefault();setBusy(e.currentTarget,true);
  const id=$("saleId").value;
  let durationMinutes;try{durationMinutes=parseDuration($("saleDuration").value)}catch(error){toast(error.message,"error");setBusy(e.currentTarget,false);return}
  const payload={user_id:state.user.id,data_atendimento:$("saleDate").value,cliente:$("saleClient").value.trim(),genero:$("saleGender").value,cidade:$("saleCity").value.trim(),valor:Number($("saleValue").value),forma_pagamento:$("salePayment").value,duracao_minutos:durationMinutes,observacoes:$("saleNotes").value.trim()||null};
  const materials=[...document.querySelectorAll(".cartridge-row")].map(r=>({cartucho_id:r.querySelector("select").value,quantidade:Number(r.querySelector("input").value)})).filter(x=>x.cartucho_id&&x.quantidade>0);
  try{
    let saleId=id;
    if(id){
      await db(`vendas?id=eq.${id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(payload)});
      await db(`venda_cartuchos?venda_id=eq.${id}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});
    }else{
      const created=await db("vendas",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(payload)});saleId=created[0].id;
    }
    if(materials.length)await db("venda_cartuchos",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(materials.map(x=>({...x,user_id:state.user.id,venda_id:saleId})))});
    toast(id?"Venda atualizada.":"Venda salva com sucesso.");resetSaleForm();await loadData(false);showPage("dashboard");
  }catch(err){toast(err.message,"error")}finally{setBusy(e.currentTarget,false)}
}
async function savePurchase(e){
  e.preventDefault();setBusy(e.currentTarget,true);
  const payload={user_id:state.user.id,data_compra:$("purchaseDate").value,cartucho_id:$("purchaseCartridge").value,quantidade:Number($("purchaseQty").value),valor_total:$("purchaseValue").value?Number($("purchaseValue").value):null,fornecedor:$("purchaseSupplier").value.trim()||null,observacoes:$("purchaseNotes").value.trim()||null};
  try{await db("compras_cartuchos",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(payload)});toast("Entrada registrada. Estoque atualizado.");e.currentTarget.reset();$("purchaseDate").value=isoToday();$("purchaseQty").value=1;await loadData(false);showPage("estoque")}catch(err){toast(err.message,"error")}finally{setBusy(e.currentTarget,false)}
}
function editSale(id){
  const s=state.sales.find(x=>x.id===id);if(!s)return;
  $("saleId").value=s.id;$("saleDate").value=s.data_atendimento;$("saleClient").value=s.cliente;$("saleGender").value=s.genero||"Não informado";$("saleCity").value=s.cidade;$("saleValue").value=s.valor;$("salePayment").value=s.forma_pagamento;$("saleDuration").value=durationInput(s.duracao_minutos);$("saleNotes").value=s.observacoes||"";
  $("cartridgeRows").innerHTML="";state.usages.filter(u=>u.venda_id===id).forEach(u=>addCartridgeRow(u.cartucho_id,u.quantidade));if(!$("cartridgeRows").children.length)addCartridgeRow();
  $("saleFormTitle").textContent="Editar venda";$("cancelEdit").hidden=false;showPage("nova-venda");window.scrollTo({top:0,behavior:"smooth"});
}
async function deleteSale(){
  if(!state.deleteId)return;
  try{await db(`vendas?id=eq.${state.deleteId}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});toast("Venda excluída.");$("confirmDialog").close();state.deleteId=null;await loadData(false)}catch(e){toast(e.message,"error")}
}
function showPage(name){
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${name}`));
  document.querySelectorAll("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===name));
  if(name==="nova-venda"&&!$("saleId").value&&document.activeElement?.classList.contains("jump-sale"))resetSaleForm();
  window.scrollTo({top:0,behavior:"smooth"});
}

function bindEvents(){
  $("loginForm").addEventListener("submit",async e=>{e.preventDefault();setBusy(e.currentTarget,true);try{await login($("loginEmail").value,$("loginPassword").value)}catch(err){toast(err.message||"Não foi possível entrar.","error")}finally{setBusy(e.currentTarget,false)}});
  $("logoutBtn").onclick=$("mobileLogout").onclick=logout;
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
  document.querySelectorAll("[data-page-link]").forEach(b=>b.onclick=()=>showPage(b.dataset.pageLink));
  document.querySelectorAll(".jump-sale").forEach(b=>b.onclick=()=>{resetSaleForm();showPage("nova-venda")});
  $("saleForm").addEventListener("submit",saveSale);$("purchaseForm").addEventListener("submit",savePurchase);
  $("addCartridgeRow").onclick=()=>addCartridgeRow();$("cancelEdit").onclick=()=>{resetSaleForm();showPage("vendas")};
  $("salesSearch").oninput=renderSales;
  $("salesList").onclick=e=>{const edit=e.target.closest("[data-edit]"),del=e.target.closest("[data-delete]");if(edit)editSale(edit.dataset.edit);if(del){state.deleteId=del.dataset.delete;$("confirmDialog").showModal()}};
  $("cancelDelete").onclick=()=>$("confirmDialog").close();$("confirmDelete").onclick=deleteSale;
  $("toggleFilters").onclick=()=>$("filterPanel").classList.toggle("open");
  ["filterYear","filterPeriod","filterMonth","filterCity","filterPayment","filterGender"].forEach(id=>$(id).onchange=()=>{$("monthFilterWrap").hidden=$("filterPeriod").value!=="month";renderDashboard()});
  $("clearFilters").onclick=()=>{$("filterYear").value=String(new Date().getFullYear());$("filterPeriod").value="all";$("filterCity").value="all";$("filterPayment").value="all";$("filterGender").value="all";$("monthFilterWrap").hidden=true;renderDashboard()};
}

async function boot(){
  bindEvents();resetSaleForm();state.session=getSession();
  if(state.session){state.user=state.session.user;try{await ensureToken();await startApp()}catch{saveSession(null)}}
}
document.addEventListener("DOMContentLoaded",boot);
