"use strict";
let whatsappMenuAppointment="";
function actionIcon(name){
 const paths={eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',eyeOff:'<path d="m3 3 18 18M10 5.2c.65-.13 1.3-.2 2-.2 6.5 0 10 7 10 7a17 17 0 0 1-3.1 3.8M6.3 6.3A22 22 0 0 0 2 12s3.5 7 10 7c2.1 0 4-.7 5.6-1.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5M5.1 7a8 8 0 0 1 13.8-1L20 8M4 16l1.1 2a8 8 0 0 0 13.8-1"/>',pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',wallet:'<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 8h18m-5 4h5v5h-5a2.5 2.5 0 0 1 0-5Z"/>',edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14l-1 7Z"/>',trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',check:'<path d="m4 12 5 5L20 6"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>'};
 return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.check}</svg>`;
}
function appointmentWhatsappButton(a){return `<button type="button" class="whatsapp-action-icon" data-whatsapp-menu="${esc(a.id)}" aria-label="Opções de WhatsApp do agendamento" title="WhatsApp">${whatsappIcon()}</button>`}
function openWhatsappMenu(id){
 const a=Store.load().agendamentos.find(a=>a.id===id);if(!a)return;
 whatsappMenuAppointment=id;$("whatsappMenuTitle").textContent=Store.load().clientes.find(c=>c.id===a.cliente_id)?.nome||"WhatsApp";
 const active=["Agendado","Confirmado"].includes(a.status);
 $("whatsappMenuOptions").innerHTML=(active?`<button type="button" class="btn ghost" data-message-kind="confirmation">Confirmar agendamento</button><button type="button" class="btn ghost" data-message-kind="appointment">Lembrar horário</button>${!a.sinal_pago?'<button type="button" class="btn ghost" data-message-kind="deposit">Lembrar sinal</button>':""}`:"")+'<button type="button" class="btn whatsapp-btn" data-message-kind="chat">'+whatsappIcon()+' Falar no WhatsApp</button>';
 $("whatsappMenuDialog").showModal();
}
function appointmentConfirmation(a,c){
 const hasTotal=a.valor_total!==null&&a.valor_total!==undefined&&Number.isFinite(Number(a.valor_total)),total=Number(a.valor_total),deposit=a.sinal_pago?Number(a.sinal_valor)||0:0;
 const signal=a.sinal_pago?`Sinal pago: ${money(deposit)}`:"Sinal: pendente";
 const prices=hasTotal?`\nValor combinado: ${money(total)}\nRestante na sessão: ${money(Math.max(0,total-deposit))}`:"\nValor da tattoo e restante na sessão: a combinar";
 const location=Store.load().locais_estudio?.[a.cidade];
 return `Olá, ${c.nome}! Aqui é do Palivo Tattoo Studio!\n\nSua tattoo está agendada!\n\nData: ${formatDate(a.data)}\nHorário: ${formatTime(a.hora)}\nCidade: ${a.cidade}\n${signal}${prices}\n\nLocalização do estúdio: ${location||"vou te enviar por aqui antes da sessão."}\n\nSe precisar ajustar algum detalhe, me avise por aqui. Estou te esperando!`;
}
function initCommunicationTools(){
 $("refreshData").innerHTML=actionIcon("refresh");$("studioSettingsButton").innerHTML=actionIcon("pin");
 $("whatsappMenuOptions").onclick=e=>{
  const b=e.target.closest("[data-message-kind]");if(!b)return;const id=whatsappMenuAppointment,a=Store.load().agendamentos.find(a=>a.id===id);if(!a)return;
  $("whatsappMenuDialog").close();const kind=b.dataset.messageKind;
  if(kind==="chat"){
   try{const c=Store.load().clientes.find(c=>c.id===a.cliente_id);launchClientWhatsapp(a.cliente_id,`Olá, ${c.nome}! Aqui é do Palivo Tattoo Studio!`)}catch(err){toast(err.message,"error")}
  }else openAppointmentMessage(id,kind);
 };
 $("studioSettingsButton").onclick=()=>{
  if(!isAdmin())return;const locais=Store.load().locais_estudio||{};
  for(const [city,id] of [["Jacobina","studioJacobina"],["Umburanas","studioUmburanas"],["Ourolândia","studioOurolandia"]])$(id).value=locais[city]||"";
  $("studioSettingsError").hidden=true;$("studioSettingsDialog").showModal();
 };
 $("studioSettingsForm").onsubmit=async e=>{
  e.preventDefault();if(!isAdmin())return;const form=e.currentTarget,locais={Jacobina:$("studioJacobina").value.trim(),Umburanas:$("studioUmburanas").value.trim(),"Ourolândia":$("studioOurolandia").value.trim()};
  $("studioSettingsError").hidden=true;
  try{for(const value of Object.values(locais))if(value&&!/^https:\/\/[^\s]+$/i.test(value))throw new Error("Use links completos começando com https://.");setBusy(form,true);await Store.saveStudioLocations(locais);await Store.refresh();$("studioSettingsDialog").close();toast("Localizações salvas.")}
  catch(err){$("studioSettingsError").textContent=err.message;$("studioSettingsError").hidden=false}finally{setBusy(form,false)}
 };
}
