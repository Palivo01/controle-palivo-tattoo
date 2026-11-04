"use strict";
const normalizeClientText=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const clientCityKey=c=>normalizeClientText(c.cidade)||"__none";
const birthMonth=c=>Number(String(c.data_nascimento||"").slice(5,7));
const formatBirthday=value=>{const parts=String(value||"").split("-");return parts.length===3?`${parts[2]}/${parts[1]}`:""};
const birthdayRecord=c=>c?.aniversario_registros?.[new Date().getFullYear()]||{};
const BIRTHDAY_BENEFIT="20% de desconto em uma tattoo durante todo o mês de aniversário";
let messageClientId="",birthdayClientId="",birthdayTrackingYear=0;
function clientCities(){
  const list=new Map(Store.cities.map(city=>[normalizeClientText(city),city]));
  for(const c of Store.load().clientes)if(c.cidade?.trim())list.set(clientCityKey(c),c.cidade.trim());
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
  for(const prefix of ["sale","appointment"]){
    refreshPickerCities(prefix);
    $(prefix+"ClientCity").onchange=()=>{updateClientPicker(prefix);prefix==="sale"?syncSaleClient():syncAppointmentClient()};
    $(prefix+"ClientSearch").oninput=()=>{const id=$(prefix+"Client").value;updateClientPicker(prefix,id);prefix==="sale"?syncSaleClient():syncAppointmentClient()};
    $(prefix+"ClientMode").onchange=e=>{if(e.target.value==="new"){e.target.value="existing";openClient("",prefix)}};
  }
  $("clientBirthdayFilter").onchange=renderClients;$("clientCityFilter").onchange=renderClients;
  $("clientMessageForm").onsubmit=e=>{
    e.preventDefault();$("clientMessageError").hidden=true;
    try{launchClientWhatsapp(messageClientId,$("clientMessageText").value)}catch(err){$("clientMessageError").textContent=err.message;$("clientMessageError").hidden=false}
  };
  $("birthdayBenefit").oninput=()=>{const c=Store.load().clientes.find(c=>c.id===birthdayClientId);if(c)$("birthdayMessage").value=makeBirthdayMessage(c,$("birthdayBenefit").value)};
  $("birthdayWhatsapp").onclick=()=>{
    $("birthdayError").hidden=true;
    try{launchClientWhatsapp(birthdayClientId,$("birthdayMessage").value)}catch(err){$("birthdayError").textContent=err.message;$("birthdayError").hidden=false}
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
  const url=clientWhatsappUrl(c,message);window.open(url,"_blank","noopener,noreferrer");
}
function appointmentMessage(a,c){
  if(a.status==="Concluído")return `Olá, ${c.nome}! Aqui é do Palivo Tattoo Studio 😊 Como foi sua experiência com a gente no dia ${formatDate(a.data)}? E como está a cicatrização da sua tattoo? Se tiver alguma dúvida sobre os cuidados, pode falar por aqui!`;
  return `Olá, ${c.nome}! Aqui é do Palivo Tattoo Studio 😊 Passando para lembrar da sua tattoo no dia ${formatDate(a.data)}, às ${a.hora.slice(0,5)}, em ${a.cidade}. Está tudo certo para o nosso encontro? Se precisar falar sobre algum detalhe, é só responder por aqui!`;
}
function openAppointmentMessage(id){
  const d=Store.load(),a=d.agendamentos.find(a=>a.id===id),c=d.clientes.find(c=>c.id===a?.cliente_id);if(!a||!c)return;
  messageClientId=c.id;$("clientMessageTitle").textContent=a.status==="Concluído"?"Como foi o atendimento?":"Lembrar horário";
  $("clientMessageRecipient").textContent=`${c.nome} · ${c.whatsapp||"WhatsApp não informado"}`;
  $("clientMessageText").value=appointmentMessage(a,c);$("clientMessageError").hidden=true;$("clientMessageDialog").showModal();
}
function birthdayMonthName(c){return new Intl.DateTimeFormat("pt-BR",{month:"long"}).format(new Date(2000,birthMonth(c)-1,15))}
function makeBirthdayMessage(c,benefit=BIRTHDAY_BENEFIT){
  return `Olá, ${c.nome}! Aqui é do Palivo Tattoo Studio 😊 Para comemorar seu aniversário, você tem ${benefit.toLowerCase()}, em ${birthdayMonthName(c)}! Que esse novo ciclo venha com saúde, alegrias e boas histórias. Me chama por aqui para combinarmos sua tattoo!`;
}
function openBirthday(id){
  const c=Store.load().clientes.find(c=>c.id===id);if(!c)return;
  birthdayClientId=id;birthdayTrackingYear=new Date().getFullYear();const record=birthdayRecord(c);
  $("birthdayTitle").textContent=c.nome;$("birthdayYear").textContent=`Benefício de ${birthdayMonthName(c)} · ${birthdayTrackingYear}`;
  $("birthdayBenefit").value=BIRTHDAY_BENEFIT;$("birthdayMessage").value=makeBirthdayMessage(c,BIRTHDAY_BENEFIT);
  $("birthdaySent").checked=record.mensagem_enviada===true;$("birthdayUsed").checked=record.bonus_utilizado===true;
  $("birthdayError").hidden=true;$("birthdayDialog").showModal();
}
