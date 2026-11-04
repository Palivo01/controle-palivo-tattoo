"use strict";
const normalizeClientText=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const isInvalidCity=v=>["homem","mulher","nao informado","masculino","feminino"].includes(normalizeClientText(v));
const clientCityKey=c=>!c.cidade?.trim()||isInvalidCity(c.cidade)?"__none":normalizeClientText(c.cidade);
const birthMonth=c=>Number(String(c.data_nascimento||"").slice(5,7));
const formatBirthday=value=>{const parts=String(value||"").split("-");return parts.length===3?`${parts[2]}/${parts[1]}`:""};
const birthdayRecord=c=>c?.aniversario_registros?.[new Date().getFullYear()]||{};
const BIRTHDAY_BENEFIT="20% de desconto em uma tattoo durante todo o mês de aniversário";
let messageClientId="",birthdayClientId="",birthdayTrackingYear=0;
function clientCities(){
  const list=new Map(Store.cities.map(city=>[normalizeClientText(city),city]));
  for(const c of Store.load().clientes)if(c.cidade?.trim()&&!isInvalidCity(c.cidade))list.set(clientCityKey(c),c.cidade.trim());
  return [...list].sort((a,b)=>a[1].localeCompare(b[1],"pt-BR"));
}
function cityOptions(){return clientCities().map(([key,label])=>`<option value="${esc(key)}">${esc(label)}</option>`).join("")+`<option value="__none">Cidade não informada</option>`}
function refreshClientCityFilter(){
  const el=$("clientCityFilter"),value=el.value||"all";
  el.innerHTML='<option value="all">Todas as cidades</option>'+cityOptions();
  el.value=[...el.options].some(o=>o.value===value)?value:"all";
}
function refreshPickerCities(prefix){
  const el=$(prefix+"ClientCity"),value=el.value;
  el.innerHTML='<option value="">Selecione a cidade do cadastro</option>'+cityOptions()+'<option value="__all">Todas as cidades</option>';
  el.value=[...el.options].some(o=>o.value===value)?value:"";
}
function updateClientPicker(prefix,selected=""){
  refreshPickerCities(prefix);
  const city=$(prefix+"ClientCity").value,q=normalizeClientText($(prefix+"ClientSearch").value),select=$(prefix+"Client");
  const rows=Store.load().clientes.filter(c=>(city==="__all"||clientCityKey(c)===city)&&normalizeClientText(c.nome).includes(q)).sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
  select.innerHTML=`<option value="">${!city?"Escolha a cidade do cadastro":rows.length?"Selecione o cliente":"Nenhum cliente encontrado"}</option>`+(city?rows.map(c=>`<option value="${esc(c.id)}">${esc(c.nome)}${city==="__all"?` · ${esc(c.cidade||"Cidade não informada")}`:""}</option>`).join(""):"");
  select.disabled=!city;select.value=rows.some(c=>c.id===selected)?selected:"";
}
function resetClientPicker(prefix,selected=""){
  const c=Store.load().clientes.find(c=>c.id===selected);
  $(prefix+"ClientMode").value="existing";$(prefix+"ClientSearch").value="";
  refreshPickerCities(prefix);$(prefix+"ClientCity").value=c?clientCityKey(c):"";
  updateClientPicker(prefix,selected);
}
function clientFinancialSummary(d,id){
  if(!isAdmin())return "";
  const sales=d.vendas.filter(s=>s.cliente_id===id),paid=sales.filter(s=>!NON_REVENUE_PAYMENTS.has(s.forma_pagamento));
  const total=paid.reduce((n,s)=>n+safeNumber(s.valor),0),count=Store.clientStats(d,id).count;
  return `<div class="client-finance"><div><small>Total gasto</small><strong>${money(total)}</strong></div><div><small>Média por atendimento</small><strong>${money(count?total/count:0)}</strong></div></div>`;
}
function initClientTools(){
  $("clientPhone").onblur=()=>{$("clientPhone").value=formatWhatsapp($("clientPhone").value)};
  for(const prefix of ["sale","appointment"]){
    refreshPickerCities(prefix);
    $(prefix+"ClientCity").onchange=()=>{updateClientPicker(prefix);prefix==="sale"?syncSaleClient():syncAppointmentClient()};
    $(prefix+"ClientSearch").oninput=()=>{const id=$(prefix+"Client").value;updateClientPicker(prefix,id);prefix==="sale"?syncSaleClient():syncAppointmentClient()};
    $(prefix+"ClientMode").onchange=e=>{if(e.target.value==="new"){e.target.value="existing";openClient("",prefix)}};
  }
  $("clientGenderFilter").onchange=renderClients;
  $("clientDetails").onclick=e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.client)openClient(b.dataset.client);if(b.dataset.book)openAppointment("",b.dataset.book);if(b.dataset.birthday)openBirthday(b.dataset.birthday)};
  $("upcomingReminders").onclick=e=>{const b=e.target.closest("[data-client-message]");if(b)openAppointmentMessage(b.dataset.clientMessage)};
  $("clientBirthdayFilter").onchange=renderClients;$("clientCityFilter").onchange=renderClients;
  $("clientMessageForm").onsubmit=e=>{
    e.preventDefault();$("clientMessageError").hidden=true;
    try{launchClientWhatsapp(messageClientId,$("clientMessageText").value)}catch(err){$("clientMessageError").textContent=err.message;$("clientMessageError").hidden=false}
  };
  $("birthdayBenefit").oninput=()=>{const c=Store.load().clientes.find(c=>c.id===birthdayClientId);if(c)$("birthdayMessage").value=makeBirthdayMessage(c,$("birthdayBenefit").value)};
  $("birthdayWhatsapp").onclick=async()=>{
    $("birthdayError").hidden=true;
    const button=$("birthdayWhatsapp"),id=birthdayClientId,year=birthdayTrackingYear;
    try{
      button.disabled=true;
      launchClientWhatsapp(id,$("birthdayMessage").value);
      await Store.saveBirthday(id,year,{beneficio:BIRTHDAY_BENEFIT,mensagem_enviada:true});
      if(birthdayClientId===id&&birthdayTrackingYear===year)$("birthdaySent").checked=true;renderClients();toast("Abertura no WhatsApp registrada.");
    }catch(err){$("birthdayError").textContent=err.message;$("birthdayError").hidden=false}finally{button.disabled=false}
  };
  $("birthdayForm").onsubmit=async e=>{
    e.preventDefault();const form=e.currentTarget;$("birthdayError").hidden=true;
    try{
      setBusy(form,true);await Store.saveBirthday(birthdayClientId,birthdayTrackingYear,{beneficio:$("birthdayBenefit").value.trim(),mensagem_enviada:$("birthdaySent").checked,bonus_utilizado:$("birthdayUsed").checked});
      $("birthdayDialog").close();renderClients();toast("Acompanhamento salvo.");
    }catch(err){$("birthdayError").textContent=err.message;$("birthdayError").hidden=false}finally{setBusy(form,false)}
  };
}
function whatsappDigits(value){
  let digits=String(value||"").replace(/\D/g,"");
  if(digits.length===10||digits.length===11)digits="55"+digits;
  if(!/^55\d{10,11}$/.test(digits))throw new Error("Cadastre um WhatsApp válido com DDD para este cliente.");
  return digits;
}
function clientWhatsappUrl(client,message){
  if(!String(message||"").trim())throw new Error("Escreva a mensagem antes de abrir o WhatsApp.");
  return `https://wa.me/${whatsappDigits(client?.whatsapp)}?text=${encodeURIComponent(message.trim())}`;
}
function launchClientWhatsapp(id,message){
  const c=Store.load().clientes.find(c=>c.id===id);if(!c)throw new Error("Cliente não encontrado.");
  const url=clientWhatsappUrl(c,message);
  const tab=window.open("about:blank","_blank");
  if(!tab)throw new Error("Permita abrir uma nova aba para continuar no WhatsApp.");
  tab.opener=null;tab.location.href=url;
}
function appointmentMessage(a,c){
  if(a.status==="Concluído")return `Olá, ${c.nome}! Aqui é do Palivo Tattoo Studio!\n\nComo foi sua experiência com a gente no dia ${formatDate(a.data)}?\n\nE como está a cicatrização da sua tattoo? Se tiver alguma dúvida sobre os cuidados, pode falar por aqui!`;
  return `Olá, ${c.nome}! Aqui é do Palivo Tattoo Studio!\n\nPassando para lembrar da sua tattoo\n\n\u{1F4C5} ${formatDate(a.data)}\n\u231A ${formatTime(a.hora)}\n\u{1F4CD} ${a.cidade}\n\nEstá tudo certo para o nosso encontro? Se precisar falar sobre algum detalhe, é só responder por aqui!`;
}
function openAppointmentMessage(id){
  const d=Store.load(),a=d.agendamentos.find(a=>a.id===id),c=d.clientes.find(c=>c.id===a?.cliente_id);if(!a||!c)return;
  $("clientMessageForm").querySelector('button[type="submit"]').innerHTML=whatsappIcon()+" Abrir WhatsApp";
  messageClientId=c.id;$("clientMessageTitle").textContent=a.status==="Concluído"?"Como foi o atendimento?":"Lembrar horário";
  $("clientMessageRecipient").innerHTML=`${esc(c.nome)} · ${whatsappContact(c)}`;
  $("clientMessageText").value=appointmentMessage(a,c);$("clientMessageError").hidden=true;$("clientMessageDialog").showModal();
}
function birthdayMonthName(c){return new Intl.DateTimeFormat("pt-BR",{month:"long"}).format(new Date(2000,birthMonth(c)-1,15))}
function makeBirthdayMessage(c){
  return `Olá, ${c.nome}! Aqui é do Palivo Tattoo Studio!\n\nPreparamos um presente para o seu mês de aniversário!\n\n\u{1F4C5} Mês de ${birthdayMonthName(c)}\nBenefício: 20% de desconto em uma tattoo\nValidade: durante todo o seu mês de aniversário\n\nQue esse novo ciclo venha com saúde, alegrias e boas histórias!\n\nQuer aproveitar seu presente? Responda por aqui e combinamos os detalhes da sua próxima tattoo!`;
}
function openBirthday(id){
  const c=Store.load().clientes.find(c=>c.id===id);if(!c)return;
  birthdayClientId=id;birthdayTrackingYear=new Date().getFullYear();const record=birthdayRecord(c);
  $("birthdayTitle").textContent=c.nome;$("birthdayYear").textContent=`Benefício de ${birthdayMonthName(c)} · ${birthdayTrackingYear}`;
  $("birthdayWhatsapp").className="btn whatsapp-btn";$("birthdayWhatsapp").innerHTML=whatsappIcon()+" Abrir WhatsApp";
  $("birthdayBenefit").value=BIRTHDAY_BENEFIT;$("birthdayMessage").value=makeBirthdayMessage(c,BIRTHDAY_BENEFIT);
  $("birthdaySent").checked=record.mensagem_enviada===true;$("birthdayUsed").checked=record.bonus_utilizado===true;
  $("birthdayError").hidden=true;$("birthdayDialog").showModal();
}

function formatTime(value){return String(value||"").slice(0,5)}
function formatWhatsapp(value){
 let digits=String(value||"").replace(/\D/g,"");
 if(digits.startsWith("55")&&(digits.length===12||digits.length===13))digits=digits.slice(2);
 if(digits.length===11)return `${digits.slice(0,2)} ${digits[2]} ${digits.slice(3,7)}-${digits.slice(7)}`;
 if(digits.length===10)return `${digits.slice(0,2)} ${digits.slice(2,6)}-${digits.slice(6)}`;
 return String(value||"");
}
function whatsappIcon(){return '<svg class="whatsapp-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.04 2a9.84 9.84 0 0 0-8.47 14.84L2 22l5.28-1.52A9.95 9.95 0 1 0 12.04 2Zm0 18.16a8.25 8.25 0 0 1-4.2-1.15l-.3-.18-3.13.9.83-3.05-.2-.31a8.19 8.19 0 1 1 7 3.79Zm4.5-6.13c-.25-.12-1.46-.72-1.69-.8-.23-.09-.4-.13-.57.12-.17.25-.65.8-.8.96-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.24a7.48 7.48 0 0 1-1.39-1.73c-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.12-.15.17-.25.25-.42.08-.17.04-.31-.02-.43-.06-.13-.57-1.38-.78-1.89-.2-.49-.41-.42-.57-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.12.17 1.78 2.71 4.3 3.8.6.26 1.07.42 1.44.54.6.19 1.15.16 1.58.1.48-.07 1.46-.6 1.67-1.17.2-.58.2-1.07.14-1.17-.06-.11-.23-.17-.48-.3Z"/></svg>'}
function whatsappContact(c){
 if(!c.whatsapp)return '<span class="muted contact-missing">WhatsApp não informado</span>';
 try{return `<a class="whatsapp-contact" href="https://wa.me/${whatsappDigits(c.whatsapp)}" target="_blank" rel="noopener noreferrer">${whatsappIcon()}<span>${esc(formatWhatsapp(c.whatsapp))}</span></a>`}
 catch{return `<span class="whatsapp-contact">${whatsappIcon()}<span>${esc(formatWhatsapp(c.whatsapp))}</span></span>`}
}
function genderBadge(gender){const value=["Homem","Mulher"].includes(gender)?gender:"Não informado";return `<span class="client-label gender-${value==="Homem"?"man":value==="Mulher"?"woman":"unknown"}">${esc(value)}</span>`}
function cityBadge(city){const key=clientCityKey({cidade:city}),value=key==="__none"?"Cidade não informada":city;return `<span class="client-label city-${key==="jacobina"?"jacobina":key==="ourolandia"?"ourolandia":key==="umburanas"?"umburanas":"other"}">${esc(value)}</span>`}
function tomorrowDate(base=new Date()){const d=new Date(base);d.setDate(d.getDate()+1);return Store.date(d)}
function tomorrowAppointments(data,base=new Date()){
 const tomorrow=tomorrowDate(base);
 return data.agendamentos.filter(a=>a.data===tomorrow&&["Agendado","Confirmado"].includes(a.status)).sort((a,b)=>a.hora.localeCompare(b.hora));
}
function renderUpcomingReminders(){
 const data=Store.load(),rows=tomorrowAppointments(data),panel=$("upcomingReminders");
 panel.hidden=!rows.length;
 panel.innerHTML=rows.length?`<div class="reminder-heading"><div><span class="eyebrow">LEMBRETES</span><h3>${rows.length===1?"Você tem 1 atendimento amanhã":`Você tem ${rows.length} atendimentos amanhã`}</h3><p class="muted">${formatDate(tomorrowDate())}</p></div></div><div class="reminder-list">${rows.map(a=>{const c=data.clientes.find(c=>c.id===a.cliente_id);return `<div class="reminder-row"><div><strong>${esc(c?.nome||"Cliente")}</strong><span>${formatTime(a.hora)} · ${esc(a.cidade)}</span></div><button type="button" class="btn whatsapp-btn" data-client-message="${esc(a.id)}">${whatsappIcon()} Lembrar horário</button></div>`}).join("")}</div>`:"";
}
