"use strict";
let followupSelection=null;
function followupToday(base=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat("en",{timeZone:"America/Bahia",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(base).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}`;
}
function followupAge(date,today=followupToday()){
 const parse=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||"");if(!m)return NaN;const n=Date.UTC(+m[1],+m[2]-1,+m[3]);return new Date(n).toISOString().slice(0,10)===s?n:NaN};return Math.floor((parse(today)-parse(date))/86400000);
}
function followupTasks(rows,today=followupToday()){
 const unique=new Map();for(const row of rows||[]){const key=row.cliente_id+"|"+row.data_atendimento;if(!unique.has(key))unique.set(key,row)}
 return [...unique.values()].flatMap(row=>{const age=followupAge(row.data_atendimento,today);if(!Number.isFinite(age)||age<5||row.etapa15?.realizado)return [];const stage=age>=15?15:!row.etapa5?.realizado?5:0;return stage?[{...row,stage,age,key:row.cliente_id+"|"+row.data_atendimento}]:[]}).sort((a,b)=>b.age-a.age||a.nome.localeCompare(b.nome,"pt-BR"));
}
function makeFollowupMessage(row,stage){
 const date=formatDate(row.data_atendimento);
 return stage===5?`Olá, ${row.nome}! Aqui é do Palivo Tattoo Studio!\n\nPassando para saber como você está e como está a cicatrização da tattoo que fizemos em ${date}.\n\nComo foram esses primeiros dias? Ficou alguma dúvida sobre os cuidados? Se puder, me envie uma foto para eu acompanhar como está.\n\nPode contar comigo por aqui!`:`Olá, ${row.nome}! Aqui é do Palivo Tattoo Studio!\n\nQuero saber como está a tattoo que fizemos em ${date}. Como foi a cicatrização até aqui?\n\nSe puder, me envie uma foto para eu acompanhar a evolução. Se ficou alguma dúvida ou algo está te preocupando, me conta por aqui!`;
}
function followupKey(row){return row.cliente_id+"|"+row.data_atendimento}
function initFollowups(){
 $("followupSearch").oninput=renderFollowups;
 const open=e=>{const b=e.target.closest("[data-followup-open]");if(b)openFollowup(b.dataset.followupOpen,Number(b.dataset.stage))};
 $("followupPending").onclick=open;$("followupHistory").onclick=open;
 for(const id of ["followupPending","followupHistory"])$(id).onkeydown=e=>{if(e.key==="Enter"||e.key===" "){const b=e.target.closest("article[data-followup-open]");if(b){e.preventDefault();openFollowup(b.dataset.followupOpen,Number(b.dataset.stage))}}};
 $("followupWhatsapp").onclick=()=>{
  $("followupError").hidden=true;
  try{const row=Store.load().pos_venda.find(r=>followupKey(r)===followupSelection?.key);if(!row)throw new Error("Atendimento não encontrado. Atualize os dados.");launchClientWhatsapp(row.cliente_id,$("followupMessage").value)}catch(err){$("followupError").textContent=err.message;$("followupError").hidden=false}
 };
 $("followupForm").onsubmit=saveFollowup;
 $("followupDialog").addEventListener("close",()=>{followupSelection=null});
}
function followupCard(row,stage,done=false){
 const key=followupKey(row),age=followupAge(row.data_atendimento),record=row["etapa"+stage];
 return `<article class="panel followup-card ${done?"followup-complete":""}" role="button" tabindex="0" aria-haspopup="dialog" aria-label="Abrir acompanhamento de ${esc(row.nome)}, tattoo em ${formatDate(row.data_atendimento)}" data-followup-open="${esc(key)}" data-stage="${stage}"><div><h3>${esc(row.nome)}</h3><p>Tattoo em ${formatDate(row.data_atendimento)} · ${age} dias</p>${done?`<small>Contato de ${stage} dias realizado${record?.realizado_em?` em ${formatDate(record.realizado_data||record.realizado_em.slice(0,10))}`:""}${record?.responsavel?` · ${esc(record.responsavel)}`:""}</small>`:`<small>${esc(row.cidade||"")}</small>`}</div>${done?'<span class="followup-complete-label">Realizado</span>':`<button type="button" class="btn whatsapp-btn" data-followup-open="${esc(key)}" data-stage="${stage}">${whatsappIcon()} Mensagem</button>`}</article>`;
}
function renderFollowups(){
 const d=Store.load(),rows=d.pos_venda||[],tasks=followupTasks(rows),q=normalizeClientText($("followupSearch").value),filtered=tasks.filter(r=>normalizeClientText(r.nome).includes(q));
 document.querySelectorAll("[data-followup-count]").forEach(el=>{el.textContent=tasks.length>99?"99+":String(tasks.length);el.hidden=!d.pos_venda_disponivel||!tasks.length;el.closest("button").setAttribute("aria-label",`Pós-venda${tasks.length?`, ${tasks.length} acompanhamento(s) pendente(s)`:""}`)});
 $("followupAvailability").hidden=d.pos_venda_disponivel;$("followupAvailability").textContent="O pós-venda aguarda a ativação da atualização V11.9 no Supabase.";
 $("followupTotal").textContent=d.pos_venda_disponivel?`${tasks.length} acompanhamento(s) pendente(s)`:"";
 $("followupPending").innerHTML=!d.pos_venda_disponivel?"":filtered.length?[5,15].map(stage=>{const group=filtered.filter(r=>r.stage===stage);return group.length?`<section class="followup-group"><div class="followup-group-head"><h3>${stage===5?"Primeiro acompanhamento":"Segundo acompanhamento"}</h3><span>A partir de ${stage} dias · ${group.length}</span></div>${group.map(r=>followupCard(r,stage)).join("")}</section>`:""}).join(""):`<div class="panel empty"><h3>${q?"Nenhum cliente encontrado.":"Tudo em dia por aqui."}</h3><p>${q?"Tente outro nome.":"Os próximos contatos aparecerão ao completar 5 ou 15 dias da tattoo."}</p></div>`;
 const history=rows.filter(r=>normalizeClientText(r.nome).includes(q)).flatMap(r=>[5,15].filter(stage=>r["etapa"+stage]?.realizado).map(stage=>({r,stage,at:r["etapa"+stage].realizado_em||""}))).sort((a,b)=>b.at.localeCompare(a.at));
 $("followupHistorySummary").textContent=`Contatos realizados (${history.length})`;$("followupHistory").innerHTML=history.map(({r,stage})=>followupCard(r,stage,true)).join("")||'<p class="muted">Nenhum contato registrado.</p>';
}
function openFollowup(key,stage){
 if(![5,15].includes(stage))return;const d=Store.load(),row=(d.pos_venda||[]).find(r=>followupKey(r)===key);if(!row||!d.pos_venda_disponivel)return;
 if(followupAge(row.data_atendimento)<stage){toast("Este acompanhamento ainda não está disponível.","error");return}
 followupSelection={key,stage,client:row.cliente_id,date:row.data_atendimento};$("followupTitle").textContent=row.nome;$("followupStage").textContent=`Acompanhamento de ${stage} dias`;$("followupDate").textContent=`Tattoo em ${formatDate(row.data_atendimento)} · ${followupAge(row.data_atendimento)} dias`;$("followupMerged").hidden=stage!==15||row.etapa5?.realizado||row.etapa15?.realizado;$("followupMessage").value=makeFollowupMessage(row,stage);$("followupDone").checked=row["etapa"+stage]?.realizado===true;$("followupError").hidden=true;$("followupWhatsapp").innerHTML=whatsappIcon()+" Abrir WhatsApp";$("followupDialog").showModal();
}
async function saveFollowup(e){
 e.preventDefault();if(!followupSelection)return;const selection={...followupSelection},form=e.currentTarget,done=$("followupDone").checked;$("followupError").hidden=true;setBusy(form,true);
 try{await Store.saveFollowup(selection.client,selection.date,selection.stage,done);$("followupDialog").close();try{await loadData(false);toast(done?"Contato registrado.":"Acompanhamento reaberto.")}catch{toast("Acompanhamento salvo. Use Atualizar dados para conferir.","error")}}
 catch(err){$("followupError").textContent=err.message;$("followupError").hidden=false}finally{setBusy(form,false)}
}
