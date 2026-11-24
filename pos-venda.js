"use strict";
let followupSelection=null,couponSelection=null;
function followupToday(base=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat("en",{timeZone:"America/Bahia",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(base).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}`;
}
function followupAge(date,today=followupToday()){
 const parse=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||"");if(!m)return NaN;const n=Date.UTC(+m[1],+m[2]-1,+m[3]);return new Date(n).toISOString().slice(0,10)===s?n:NaN};return Math.floor((parse(today)-parse(date))/86400000);
}
function followupKey(row){return row.cliente_id+"|"+row.data_atendimento}
function followupTasks(rows,today=followupToday()){
 const unique=new Map();for(const row of rows||[]){const key=followupKey(row);if(!unique.has(key))unique.set(key,row)}
 return [...unique.values()].flatMap(row=>{
  const age=followupAge(row.data_atendimento,today);if(!Number.isFinite(age)||age<5||age>30)return [];
  const stage=!row.etapa5?.realizado?5:age>=15&&!row.etapa15?.realizado?15:0;
  return stage?[{...row,stage,age,key:followupKey(row)}]:[];
 }).sort((a,b)=>b.age-a.age||a.nome.localeCompare(b.nome,"pt-BR"));
}
function makeFollowupMessage(row,stage){
 const date=formatDate(row.data_atendimento);
 return stage===5?`Olá, ${row.nome}! Aqui é do Palivo Tattoo Studio!\n\nPassando para saber como você está e como está a cicatrização da tattoo que fizemos em ${date}.\n\nComo foram esses primeiros dias? Ficou alguma dúvida sobre os cuidados? Me conta e, se puder, envie uma foto para eu acompanhar de perto.\n\nEstou por aqui para te ajudar!`:`Olá, ${row.nome}! Aqui é do Palivo Tattoo Studio!\n\nComo está a tattoo que fizemos em ${date}? Quero saber como foi a cicatrização até aqui e se ficou alguma dúvida.\n\nSe puder, me envie uma foto para eu conferir como ela está. Mesmo que pareça cicatrizada, continue seguindo os cuidados que combinamos.\n\nObrigado pela confiança no meu trabalho!`;
}
function couponEligible(row,today=followupToday()){
 const age=followupAge(row.data_atendimento,today);
 return !!row.etapa5?.realizado&&!!row.etapa15?.realizado&&age>=15&&age<=30;
}
function couponActive(row,today=followupToday()){
 return !!row.cupom&&!row.cupom.utilizado&&row.etapa5?.realizado===true&&row.etapa15?.realizado===true&&row.cupom.expira_em>=today;
}
function makeCouponMessage(row,coupon){
 return `Olá, ${row.nome}! Aqui é do Palivo Tattoo Studio!\n\nFoi muito bom acompanhar sua tattoo! Para a próxima, preparei um cupom de 20% de desconto para você.\n\nCupom: ${coupon.codigo}\nVocê pode usá-lo para fazer uma nova tatuagem até ${formatDate(coupon.expira_em)}.\n\nJá tem alguma ideia em mente? Me manda por aqui e combinamos os detalhes!`;
}
function initFollowups(){
 $("followupSearch").oninput=renderFollowups;
 const open=e=>{const coupon=e.target.closest("[data-coupon-open]");if(coupon){openCoupon(coupon.dataset.couponOpen);return}const b=e.target.closest("[data-followup-open]");if(b)openFollowup(b.dataset.followupOpen,Number(b.dataset.stage))};
 for(const id of ["followupPending","followupHistory","followupCoupons"]){
  $(id).onclick=open;$(id).onkeydown=e=>{if(e.key==="Enter"||e.key===" "){const b=e.target.closest("article[data-followup-open]");if(b){e.preventDefault();openFollowup(b.dataset.followupOpen,Number(b.dataset.stage))}}};
 }
 $("followupWhatsapp").onclick=()=>{
  $("followupError").hidden=true;
  try{const row=Store.load().pos_venda.find(r=>followupKey(r)===followupSelection?.key);if(!row)throw new Error("Atendimento não encontrado. Atualize os dados.");const age=followupAge(row.data_atendimento);if(age<followupSelection.stage||age>30)throw new Error("Este contato está fora do período de acompanhamento.");launchClientWhatsapp(row.cliente_id,$("followupMessage").value)}catch(err){$("followupError").textContent=err.message;$("followupError").hidden=false}
 };
 $("followupForm").onsubmit=saveFollowup;
 $("followupDialog").addEventListener("close",()=>{followupSelection=null});
 $("couponDialog").addEventListener("close",()=>{couponSelection=null});
 $("couponWhatsapp").onclick=()=>{
  $("couponError").hidden=true;
  try{const row=Store.load().pos_venda.find(r=>followupKey(r)===couponSelection);if(!row||!couponActive(row))throw new Error("Este cupom não está disponível. Atualize os dados.");launchClientWhatsapp(row.cliente_id,$("couponMessage").value)}catch(err){$("couponError").textContent=err.message;$("couponError").hidden=false}
 };
 $("couponForm").onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,row=Store.load().pos_venda.find(r=>followupKey(r)===couponSelection);if(!row)return;setBusy(form,true);$("couponError").hidden=true;
  try{await Store.useCoupon(row.cliente_id,row.data_atendimento,$("couponUsed").checked);$("couponDialog").close();await loadData(false);toast("Cupom atualizado.")}
  catch(err){$("couponError").textContent=err.message;$("couponError").hidden=false}finally{setBusy(form,false)}
 };
}
function followupCard(row,stage,done=false){
 const key=followupKey(row),age=followupAge(row.data_atendimento),record=row["etapa"+stage],expired=age>30;
 return `<article class="panel followup-card ${done?"followup-complete":""}" role="button" tabindex="0" aria-haspopup="dialog" aria-label="Abrir ${stage===5?"primeiro":"segundo"} contato de ${esc(row.nome)}" data-followup-open="${esc(key)}" data-stage="${stage}"><div><h3>${esc(row.nome)}</h3><p>Tattoo em ${formatDate(row.data_atendimento)} · ${age} dias</p>${done?`<small>${stage===5?"1º":"2º"} contato realizado${record?.realizado_em?` em ${formatDate(record.realizado_data||record.realizado_em.slice(0,10))}`:""}${record?.responsavel?` · ${esc(record.responsavel)}`:""}${expired?" · Acompanhamento encerrado":""}</small>`:`<small>${esc(row.cidade||"")}</small>`}</div>${done?'<span class="followup-complete-label">Realizado</span>':`<button type="button" class="btn whatsapp-btn" data-followup-open="${esc(key)}" data-stage="${stage}">${whatsappIcon()} ${stage===5?"1º":"2º"} contato</button>`}</article>`;
}
function couponCard(row,enabled){
 const coupon=row.cupom,available=coupon?couponActive(row):couponEligible(row),label=!coupon?"Liberar cupom de 20%":coupon.utilizado?"Cupom utilizado":coupon.expira_em<followupToday()?"Cupom expirado":"Abrir cupom";
 return `<article class="panel followup-card coupon-card"><div><h3>${esc(row.nome)}</h3><p>Tattoo em ${formatDate(row.data_atendimento)}</p><small class="coupon-status">${coupon?`${esc(coupon.codigo)} · Até ${formatDate(coupon.expira_em)}`:"Dois contatos realizados · 20% na próxima tattoo"}</small></div><button class="btn ${coupon?"ghost":"primary"}" data-coupon-open="${esc(followupKey(row))}" ${!enabled||(!available&&!coupon)?"disabled":""}>${label}</button></article>`;
}
function renderFollowups(){
 const d=Store.load(),rows=d.pos_venda||[],tasks=followupTasks(rows),q=normalizeClientText($("followupSearch").value),filtered=tasks.filter(r=>normalizeClientText(r.nome).includes(q));
 document.querySelectorAll("[data-followup-count]").forEach(el=>{el.textContent=tasks.length>99?"99+":String(tasks.length);el.hidden=!d.pos_venda_disponivel||!tasks.length;el.closest("button").setAttribute("aria-label",`Pós-venda${tasks.length?`, ${tasks.length} acompanhamento(s) pendente(s)`:""}`)});
 $("followupAvailability").hidden=d.cupons_disponiveis;$("followupAvailability").textContent="Execute a atualização V12.2.0 no Supabase para ativar o novo fluxo e os cupons.";
 $("followupTotal").textContent=d.pos_venda_disponivel?`${tasks.length} acompanhamento(s) pendente(s)`:"";
 $("followupPending").innerHTML=!d.pos_venda_disponivel?"":filtered.length?[5,15].map(stage=>{const group=filtered.filter(r=>r.stage===stage);return group.length?`<section class="followup-group"><div class="followup-group-head"><h3>${stage===5?"1º contato":"2º contato"}</h3><span>A partir de ${stage} dias · ${group.length}</span></div>${group.map(r=>followupCard(r,stage)).join("")}</section>`:""}).join(""):`<div class="panel empty"><h3>${q?"Nenhum cliente encontrado.":"Tudo em dia por aqui."}</h3><p>${q?"Tente outro nome.":"Os contatos aparecem a partir de 5 e 15 dias, até 30 dias após a tattoo."}</p></div>`;
 const matching=rows.filter(r=>normalizeClientText(r.nome).includes(q));
 const coupons=matching.filter(r=>r.cupom||couponEligible(r)).sort((a,b)=>(b.cupom?.emitido_em||b.data_atendimento).localeCompare(a.cupom?.emitido_em||a.data_atendimento));
 $("followupCouponsSummary").textContent=`Cupons de retorno (${coupons.length})`;$("followupCoupons").innerHTML=coupons.map(r=>couponCard(r,d.cupons_disponiveis)).join("")||'<p class="muted">Os cupons serão liberados após os dois contatos.</p>';
 const history=matching.flatMap(r=>[5,15].filter(stage=>r["etapa"+stage]?.realizado).map(stage=>({r,stage,at:r["etapa"+stage].realizado_em||""}))).sort((a,b)=>b.at.localeCompare(a.at));
 $("followupHistorySummary").textContent=`Contatos realizados (${history.length})`;
 $("followupHistory").innerHTML=[5,15].map(stage=>{const group=history.filter(h=>h.stage===stage);return `<details class="followup-history-group"><summary>${stage===5?"1º contato · A partir de 5 dias":"2º contato · A partir de 15 dias"} (${group.length})</summary>${group.map(({r})=>followupCard(r,stage,true)).join("")||'<p class="muted">Nenhum contato registrado.</p>'}</details>`}).join("");
}
function openFollowup(key,stage){
 if(![5,15].includes(stage))return;const d=Store.load(),row=(d.pos_venda||[]).find(r=>followupKey(r)===key);if(!row||!d.pos_venda_disponivel)return;
 const age=followupAge(row.data_atendimento),done=row["etapa"+stage]?.realizado===true;
 if(age<stage||(!done&&age>30)||(stage===15&&!row.etapa5?.realizado&&!done)){toast("Este acompanhamento não está disponível.","error");return}
 followupSelection={key,stage,client:row.cliente_id,date:row.data_atendimento};$("followupTitle").textContent=row.nome;$("followupStage").textContent=`${stage===5?"1º":"2º"} contato · A partir de ${stage} dias`;$("followupDate").textContent=`Tattoo em ${formatDate(row.data_atendimento)} · ${age} dias`;$("followupMessage").value=makeFollowupMessage(row,stage);$("followupDone").checked=done;$("followupDone").disabled=age>30;$("followupError").hidden=true;$("followupWhatsapp").innerHTML=whatsappIcon()+" Abrir WhatsApp";$("followupWhatsapp").disabled=age>30;$("followupForm").querySelector('[type="submit"]').disabled=age>30;$("followupDialog").showModal();
}
async function saveFollowup(e){
 e.preventDefault();if(!followupSelection)return;const selection={...followupSelection},form=e.currentTarget,done=$("followupDone").checked;$("followupError").hidden=true;setBusy(form,true);
 try{await Store.saveFollowup(selection.client,selection.date,selection.stage,done);$("followupDialog").close();try{await loadData(false);toast(done?"Contato registrado.":"Acompanhamento reaberto.")}catch{toast("Acompanhamento salvo. Use Atualizar dados para conferir.","error")}}
 catch(err){$("followupError").textContent=err.message;$("followupError").hidden=false}finally{setBusy(form,false)}
}
async function openCoupon(key){
 const d=Store.load(),row=d.pos_venda.find(r=>followupKey(r)===key);if(!row||!d.cupons_disponiveis)return;
 try{
  let coupon=row.cupom;
  if(!coupon){if(!couponEligible(row))throw new Error("Conclua os dois contatos antes de liberar o cupom.");coupon=await Store.issueCoupon(row.cliente_id,row.data_atendimento);await Store.refresh()}
  couponSelection=key;$("couponTitle").textContent=row.nome;$("couponDates").textContent=`${coupon.codigo} · Emitido em ${formatDate(coupon.emitido_em)} · Até ${formatDate(coupon.expira_em)}`;$("couponMessage").value=makeCouponMessage(row,coupon);$("couponUsed").checked=coupon.utilizado===true;$("couponError").hidden=true;$("couponWhatsapp").innerHTML=whatsappIcon()+" Abrir WhatsApp";$("couponWhatsapp").disabled=!couponActive({...row,cupom:coupon});$("couponDialog").showModal();renderFollowups();
 }catch(err){toast(err.message,"error")}
}
