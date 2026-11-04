"use strict";
function currentActor(){return state.profile?.nome||""}
function isAdmin(){return state.role==="admin"}
function applyRole(){
  document.body.classList.toggle("collaborator",!isAdmin());
  $("profileLabel").textContent=`${currentActor()} · ${isAdmin()?"Administrador":"Agenda e clientes"}`;
}
let clientReturnTo="",appointmentDeleteId="";
function initWorkspace(){
  installIcons();initClientTools();
  $("newClientFromAppointment").onclick=()=>openClient("","appointment");
  $("newClientFromSale").onclick=()=>openClient("","sale");
  $("saleClient").onchange=syncSaleClient;
  $("clientDialog").addEventListener("close",()=>{clientReturnTo=""});
  for(const id of ["saleStyles","appointmentStyles"])$(id).innerHTML=Store.styles.map(s=>`<label class="style-chip"><input type="checkbox" value="${esc(s)}"><span>${esc(s)}</span></label>`).join("");
  $("agendaDate").value=isoToday();
  $("newAppointment").onclick=()=>openAppointment();$("newClient").onclick=()=>openClient();
  $("appointmentForm").onsubmit=saveAppointment;$("clientForm").onsubmit=saveClient;
  document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  for(const id of ["agendaDate","agendaView","agendaStatus"])$(id).onchange=renderAgenda;
  $("agendaSearch").oninput=renderAgenda;$("clientSearch").oninput=renderClients;
  $("previousDate").onclick=()=>moveAgenda(-1);$("nextDate").onclick=()=>moveAgenda(1);
  $("todayAgenda").onclick=()=>{$("agendaDate").value=isoToday();renderAgenda()};
  $("appointmentDepositPaid").onchange=syncDepositField;
  $("confirmAppointmentDelete").onclick=deleteAppointment;
  $("appointmentDeleteDialog").addEventListener("close",()=>{appointmentDeleteId=""});
  $("agendaList").onclick=e=>{const message=e.target.closest("[data-client-message]");if(message)openAppointmentMessage(message.dataset.clientMessage);const b=e.target.closest("[data-appointment]"),del=e.target.closest("[data-delete-appointment]");if(b)openAppointment(b.dataset.appointment);if(del)confirmAppointmentDeletion(del.dataset.deleteAppointment)};
  $("agendaList").onchange=async e=>{
    if(!e.target.matches("[data-art-ready]"))return;const input=e.target,pronta=input.checked;input.disabled=true;
    try{await Store.setArtReady(input.dataset.artReady,pronta);renderAgenda();toast(pronta?"Arte marcada como pronta.":"Arte marcada como pendente.")}
    catch(err){input.checked=!pronta;toast(err.message,"error")}finally{input.disabled=false}
  };
  $("clientList").onclick=e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.client)openClient(b.dataset.client);if(b.dataset.history)showClientHistory(b.dataset.history);if(b.dataset.book)openAppointment("",b.dataset.book);if(b.dataset.birthday)openBirthday(b.dataset.birthday)};
  $("printAgenda").onclick=()=>window.print();
  $("appointmentClient").onchange=syncAppointmentClient;
}
function readStyles(id){return [...$(id).querySelectorAll("input:checked")].map(e=>e.value)}
function setStyles(id,styles){$(id)?.querySelectorAll("input").forEach(e=>e.checked=styles.includes(e.value))}
function renderWorkspace(){renderAgenda();renderClients();renderSaleClients()}
function styleTags(styles){return (styles?.length?styles:["Não informado"]).map(s=>`<span class="tag">${esc(s)}</span>`).join("")}
function renderStyleStats(rows){
  const showRevenue=$("showStyleRevenue").checked;$("styleRevenueNote").hidden=!showRevenue;
  const stats=new Map();for(const row of rows)for(const style of row.estilos?.length?row.estilos:["Não informado"]){const s=stats.get(style)||{count:0,revenue:0};s.count++;if(!NON_REVENUE_PAYMENTS.has(row.forma_pagamento))s.revenue+=safeNumber(row.valor);stats.set(style,s)}
  const max=Math.max(1,...[...stats.values()].map(s=>s.count));
  $("stylesChart").innerHTML=stats.size?[...stats].sort((a,b)=>b[1].count-a[1].count).map(([style,s])=>`<div class="style-stat"><div><strong>${esc(style)}</strong><small>${s.count} ${s.count===1?"atendimento":"atendimentos"}${showRevenue?` · ${money(s.revenue)}`:""}</small></div><div class="bar-track"><div class="bar-fill" style="width:${s.count/max*100}%"></div></div></div>`).join(""):'<p class="empty">Sem atendimentos neste período.</p>';
}
function agendaRange(){
  const base=new Date(($("agendaDate").value||isoToday())+"T12:00:00");const start=new Date(base),end=new Date(base);const view=$("agendaView").value;
  if(view==="all")return {start:"0000-01-01",end:"9999-12-31",label:"Todos os agendamentos"};
  if(view==="week"){start.setDate(base.getDate()-((base.getDay()+6)%7));end.setTime(start.getTime());end.setDate(start.getDate()+6)}
  if(view==="month"){start.setDate(1);end.setMonth(end.getMonth()+1,0)}
  return {start:Store.date(start),end:Store.date(end),label:view==="day"?formatDate(Store.date(start)):`${formatDate(Store.date(start))} a ${formatDate(Store.date(end))}`};
}
function moveAgenda(sign){
  const d=new Date(($("agendaDate").value||isoToday())+"T12:00:00");const view=$("agendaView").value;
  if(view==="month"){d.setDate(1);d.setMonth(d.getMonth()+sign)}else d.setDate(d.getDate()+sign*(view==="week"?7:1));
  $("agendaDate").value=Store.date(d);renderAgenda();
}
function endTime(a){const [h,m]=a.hora.split(":").map(Number),total=h*60+m+a.duracao;return `${String(Math.floor(total/60)%24).padStart(2,"0")}:${String(total%60).padStart(2,"0")}${total>=1440?" (+1 dia)":""}`}
function appointmentCard(a,clients){
  const c=clients.find(c=>c.id===a.cliente_id);return `<article class="appointment-card"><div class="appointment-time"><strong>${esc(a.hora)}</strong><small>até ${endTime(a)}</small><small>${duration(a.duracao)}</small></div><div class="appointment-main"><div class="appointment-heading"><h3>${esc(c?.nome||"Cliente")}</h3><span class="badge status-${Store.statuses.indexOf(a.status)}">${esc(a.status)}</span></div><p class="muted">${esc(a.cidade)}${c?.whatsapp?` · ${esc(c.whatsapp)}`:""}</p><div class="tags">${styleTags(a.estilos)}</div>${a.observacoes?`<p class="appointment-note">${esc(a.observacoes)}</p>`:""}<label class="art-ready-control compact"><input type="checkbox" data-art-ready="${esc(a.id)}" ${a.arte_pronta?"checked":""}><span>Arte pronta</span></label><p class="deposit-status ${a.sinal_pago?"paid":""}">${a.sinal_pago?`Sinal pago: <strong>${money(a.sinal_valor)}</strong>`:"Sinal pendente"}</p><small class="appointment-signature">${icon("signature")} Agendado por <strong>${esc(a.criado_por||"Autoria não registrada")}</strong></small>${a.atualizado_por?`<small class="muted edit-signature">Última alteração: ${esc(a.atualizado_por)}</small>`:""}</div><div class="appointment-actions">${["Agendado","Confirmado","Concluído"].includes(a.status)?`<button class="btn ghost" data-client-message="${esc(a.id)}">${a.status==="Concluído"?"Pós-atendimento":"Lembrar horário"}</button>`:""}<button class="btn ghost" data-appointment="${esc(a.id)}">Editar / remarcar</button><button class="btn danger small" data-delete-appointment="${esc(a.id)}">Excluir</button></div></article>`;
}
function renderAgenda(){
  const d=Store.load(),range=agendaRange(),status=$("agendaStatus").value,q=$("agendaSearch").value.toLowerCase().trim();
  const period=d.agendamentos.filter(a=>a.data>=range.start&&a.data<=range.end);
  const rows=period.filter(a=>{const c=d.clientes.find(c=>c.id===a.cliente_id);return(status==="all"||a.status===status)&&[c?.nome,c?.whatsapp,a.cidade,...a.estilos].join(" ").toLowerCase().includes(q)}).sort((a,b)=>(a.data+a.hora).localeCompare(b.data+b.hora));
  const active=period.filter(a=>["Agendado","Confirmado"].includes(a.status));
  $("agendaMetrics").innerHTML=[["Agendamentos",period.length],["A confirmar",period.filter(a=>a.status==="Agendado").length],["Confirmados",period.filter(a=>a.status==="Confirmado").length],["Tempo reservado",duration(active.reduce((n,a)=>n+a.duracao,0))]].map(([label,value])=>`<div class="panel agenda-metric"><small>${label}</small><strong>${value}</strong></div>`).join("");
  $("agendaPeriod").textContent=range.label+` · ${rows.length} resultado(s)`;
  const days=[...new Set(rows.map(a=>a.data))];
  $("agendaList").innerHTML=days.length?days.map(day=>`<section class="agenda-day"><h3 class="day-label">${new Date(day+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}</h3>${rows.filter(a=>a.data===day).map(a=>appointmentCard(a,d.clientes)).join("")}</section>`).join(""):'<div class="panel empty"><h3>Agenda livre por aqui.</h3><p>Nenhum atendimento encontrado para este período e filtros.</p></div>';
}
function openAppointment(id="",clientId=""){
  const d=Store.load();
  const a=d.agendamentos.find(a=>a.id===id);$("appointmentForm").reset();$("appointmentError").hidden=true;$("appointmentId").value=a?.id||"";
  $("appointmentTitle").textContent=a?"Editar agendamento":"Novo agendamento";
  resetClientPicker("appointment",a?.cliente_id||clientId);
  $("appointmentClient").value=a?.cliente_id||clientId;$("appointmentDate").value=a?.data||$("agendaDate").value||isoToday();$("appointmentTime").value=a?.hora||"09:00";
  $("appointmentDuration").value=a?.duracao||60;$("appointmentCity").value=Store.cities.includes(a?.cidade)?a.cidade:"Jacobina";
  $("appointmentStatus").value=a?.status||"Agendado";$("appointmentNotes").value=a?.observacoes||"";setStyles("appointmentStyles",a?.estilos||[]);$("appointmentArtReady").checked=a?.arte_pronta===true;$("appointmentDepositPaid").checked=a?.sinal_pago===true;$("appointmentDepositValue").value=a?.sinal_pago?a.sinal_valor:"";syncDepositField();syncAppointmentClient(false);$("appointmentDialog").showModal();
}
async function saveAppointment(e){
  e.preventDefault();const form=e.currentTarget,id=$("appointmentId").value;
  const a={id:id||Store.uid(),cliente_id:$("appointmentClient").value,data:$("appointmentDate").value,hora:$("appointmentTime").value,duracao:Number($("appointmentDuration").value),cidade:$("appointmentCity").value.trim(),status:$("appointmentStatus").value,estilos:readStyles("appointmentStyles"),observacoes:$("appointmentNotes").value.trim(),arte_pronta:$("appointmentArtReady").checked,sinal_pago:$("appointmentDepositPaid").checked,sinal_valor:$("appointmentDepositPaid").checked?Number($("appointmentDepositValue").value):0,criado_por:currentActor()};
  try{
    if(!a.cliente_id)throw new Error("Selecione um cliente cadastrado.");
    if(a.sinal_pago&&(!Number.isFinite(a.sinal_valor)||a.sinal_valor<=0))throw new Error("Informe o valor do sinal pago.");
    if(!a.estilos.length)throw new Error("Selecione pelo menos um estilo.");if(!Store.cities.includes(a.cidade))throw new Error("Selecione a cidade do atendimento.");
    $("appointmentId").value=a.id;setBusy(form,true);
    await Store.saveAppointment(a);
    $("appointmentDialog").close();renderWorkspace();toast(id?"Agendamento atualizado.":"Cliente agendado.");
  }catch(err){$("appointmentError").textContent=err.message;$("appointmentError").hidden=false}finally{setBusy(form,false)}
}
function syncDepositField(){
  const paid=$("appointmentDepositPaid").checked;$("appointmentDepositValue").disabled=!paid;$("appointmentDepositValue").required=paid;
}
function confirmAppointmentDeletion(id){
  const d=Store.load(),a=d.agendamentos.find(a=>a.id===id);if(!a)return;
  appointmentDeleteId=id;const c=d.clientes.find(c=>c.id===a.cliente_id);
  $("appointmentDeleteSummary").textContent=`${c?.nome||"Cliente"} · ${formatDate(a.data)} às ${a.hora}${a.sinal_pago?` · Sinal pago: ${money(a.sinal_valor)}`:""}`;
  $("appointmentDeleteError").hidden=true;$("appointmentDeleteDialog").showModal();
}
async function deleteAppointment(){
  if(!appointmentDeleteId)return;const id=appointmentDeleteId,button=$("confirmAppointmentDelete");button.disabled=true;$("appointmentDeleteError").hidden=true;
  try{await Store.deleteAppointment(id);$("appointmentDeleteDialog").close();renderWorkspace();toast("Agendamento excluído.")}
  catch(err){$("appointmentDeleteError").textContent=err.message;$("appointmentDeleteError").hidden=false}finally{button.disabled=false}
}
function fillClientSelect(id,selected=""){
  const prefix=id==="saleClient"?"sale":"appointment";
  updateClientPicker(prefix,selected);
}
function renderSaleClients(selected){
  if(selected!==undefined)resetClientPicker("sale",selected);
  else updateClientPicker("sale",$("saleClient").value);
  updateSaleClientInfo();
}
function updateSaleClientInfo(){
  const d=Store.load(),c=d.clientes.find(c=>c.id===$("saleClient").value),stats=c?Store.clientStats(d,c.id):null;
  $("saleClientInfo").textContent=c?`${c.genero||"Não informado"} · ${stats.count} atendimento(s) registrado(s)`:"Selecione um cliente ou cadastre um novo.";
}
function syncSaleClient(){
  const c=Store.load().clientes.find(c=>c.id===$("saleClient").value);
  $("saleGender").value=c?.genero||"Não informado";
  updateSaleClientInfo();
}
function syncAppointmentClient(){
  const d=Store.load(),c=d.clientes.find(c=>c.id===$("appointmentClient").value);
  $("appointmentClientInfo").textContent=c?`${c.genero||"Não informado"} · ${Store.clientStats(d,c.id).count} atendimento(s) registrado(s)`:"Cadastre um novo cliente sem sair do agendamento.";
  // A cidade do cliente é residência; o local do atendimento é escolhido à parte.
}
function renderClients(){
  const d=Store.load(),q=normalizeClientText($("clientSearch").value),filter=$("clientBirthdayFilter").value;
  refreshClientCityFilter();
  const city=$("clientCityFilter").value,month=filter==="current"?new Date().getMonth()+1:Number(filter);
  const rows=d.clientes.filter(c=>(city==="all"||clientCityKey(c)===city)&&normalizeClientText([c.nome,c.whatsapp,c.cidade].join(" ")).includes(q)&&(filter==="all"||birthMonth(c)===month))
    .sort((a,b)=>filter==="all"?a.nome.localeCompare(b.nome):String(a.data_nascimento).slice(8).localeCompare(String(b.data_nascimento).slice(8))||a.nome.localeCompare(b.nome));
  $("clientResultCount").textContent=`${rows.length} ${rows.length===1?"cliente":"clientes"}`;
  $("clientList").innerHTML=rows.map(c=>{
    const all=d.agendamentos.filter(a=>a.cliente_id===c.id),stats=Store.clientStats(d,c.id),next=all.filter(a=>a.data>=isoToday()&&["Agendado","Confirmado"].includes(a.status)).sort((a,b)=>(a.data+a.hora).localeCompare(b.data+b.hora))[0];
    const record=birthdayRecord(c),birthday=c.data_nascimento?`<p class="birthday-date">Aniversário: ${formatBirthday(c.data_nascimento)}${birthMonth(c)===new Date().getMonth()+1?' <span class="tag">Neste mês</span>':""}</p>`:"";
    return `<article class="panel client-card"><div class="client-card-top"><h3>${esc(c.nome)}</h3><span class="loyalty-badge">${icon("loyalty")} ${stats.count} ${stats.count===1?"atendimento":"atendimentos"}</span></div><p class="muted">${esc(c.genero||"Não informado")} · ${esc(c.cidade||"Cidade não informada")}</p><p>${esc(c.whatsapp||"WhatsApp não informado")}</p>${birthday}<small class="muted">Origem: ${esc(c.origem==="Histórico de vendas"?"Cliente":c.origem||"Não informado")}</small>${clientFinancialSummary(d,c.id)}<div class="client-next">${next?`Próximo: ${formatDate(next.data)} às ${esc(next.hora.slice(0,5))}`:"Sem próximo atendimento"}<small>${stats.last?`Último atendimento: ${formatDate(stats.last)}`:""}</small></div>${c.data_nascimento&&filter!=="all"?`<div class="tags">${record.mensagem_enviada?'<span class="tag">Mensagem enviada</span>':""}${record.bonus_utilizado?'<span class="tag">Bonificação utilizada</span>':""}</div>`:""}<div class="client-actions"><button class="btn small ghost" data-client="${esc(c.id)}">Editar</button><button class="btn small ghost" data-history="${esc(c.id)}">Histórico</button>${c.data_nascimento?`<button class="btn small ghost" data-birthday="${esc(c.id)}">Aniversário</button>`:""}<button class="btn small primary" data-book="${esc(c.id)}">Agendar</button></div></article>`;
  }).join("")||'<div class="panel empty">Nenhum cliente encontrado.</div>';
}
function openClient(id="",returnTo=""){
  clientReturnTo=returnTo;
  const c=Store.load().clientes.find(c=>c.id===id);$("clientForm").reset();$("clientError").hidden=true;$("clientId").value=c?.id||"";$("clientName").value=c?.nome||"";$("clientGender").value=c?.genero||"";$("clientPhone").value=c?.whatsapp||"";$("clientBirthDate").value=c?.data_nascimento||"";$("clientBirthDate").max=isoToday();$("clientCity").value=c?.cidade||"";$("clientSource").value=c?.origem==="Histórico de vendas"?"Cliente":c?.origem||"";$("clientTitle").textContent=c?"Editar cliente":"Novo cliente";$("clientDialog").showModal();
}
async function saveClient(e){
  e.preventDefault();const form=e.currentTarget,id=$("clientId").value,c={id:id||Store.uid(),nome:$("clientName").value.trim(),genero:$("clientGender").value,whatsapp:$("clientPhone").value.trim(),cidade:$("clientCity").value.trim(),origem:$("clientSource").value,data_nascimento:$("clientBirthDate").value||null};
  try{
    if(c.data_nascimento&&(c.data_nascimento>isoToday()||c.data_nascimento<"1900-01-01"))throw new Error("Confira a data de nascimento.");if(!c.nome)throw new Error("Informe o nome do cliente.");if(!Store.genders.includes(c.genero))throw new Error("Selecione o gênero.");if(c.whatsapp&&!/^[+()\s\d-]{8,25}$/.test(c.whatsapp))throw new Error("Confira o número de WhatsApp.");
    $("clientId").value=c.id;setBusy(form,true);await Store.saveClient(c);
    const returnTo=clientReturnTo;clientReturnTo="";$("clientDialog").close();renderWorkspace();
    if(returnTo==="appointment"){resetClientPicker("appointment",c.id);syncAppointmentClient()}
    if(returnTo==="sale"){renderSaleClients(c.id);syncSaleClient()}
    toast("Cliente salvo.");
  }catch(err){$("clientError").textContent=err.message;$("clientError").hidden=false}finally{setBusy(form,false)}
}
function showClientHistory(id){
  const d=Store.load(),c=d.clientes.find(c=>c.id===id),stats=Store.clientStats(d,id);$("clientHistoryTitle").textContent=`Histórico de ${c?.nome||"cliente"}`;
  $("clientLoyaltySummary").innerHTML=clientFinancialSummary(d,id)+`<div class="loyalty-summary"><strong>${stats.count}</strong><span>atendimento(s) registrado(s) em vendas${stats.first?`<small>Primeiro: ${formatDate(stats.first)} · Último: ${formatDate(stats.last)}</small>`:""}</span></div>`;
  const rows=d.agendamentos.filter(a=>a.cliente_id===id).sort((a,b)=>(b.data+b.hora).localeCompare(a.data+a.hora));
  const sales=d.vendas.filter(s=>s.cliente_id===id).sort((a,b)=>b.data_atendimento.localeCompare(a.data_atendimento));
  $("clientHistory").innerHTML=(isAdmin()?'<h4>Atendimentos registrados</h4>'+(sales.map(s=>`<div class="history-item"><strong>${formatDate(s.data_atendimento)} · ${duration(s.duracao_minutos)}</strong><span>${esc(s.cidade)} · ${esc(s.genero||"Não informado")}</span><div class="tags">${styleTags(s.estilos)}</div>${isAdmin()?`<small class="muted">${money(s.valor)} · ${esc(s.forma_pagamento)}</small>`:""}</div>`).join("")||'<p class="empty">Sem atendimentos registrados em vendas.</p>'):"")+'<h4>Agendamentos</h4>'+(rows.map(a=>`<div class="history-item"><strong>${formatDate(a.data)} · ${esc(a.hora)}</strong><span>${esc(a.status)} · ${esc(a.cidade)} · Arte ${a.arte_pronta?"pronta":"pendente"} · ${a.sinal_pago?`Sinal pago: ${money(a.sinal_valor)}`:"Sinal pendente"}</span><div class="tags">${styleTags(a.estilos)}</div><small class="appointment-signature">Agendado por ${esc(a.criado_por||"Autoria não registrada")}</small></div>`).join("")||'<p class="empty">Nenhum agendamento registrado.</p>');$("clientHistoryDialog").showModal();
}
