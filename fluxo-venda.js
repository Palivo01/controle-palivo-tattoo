"use strict";
let saleAppointmentSource="";
function initSaleWorkflow(){
 $("saleAppointment").onchange=()=>{$("saleCompleteAppointment").checked=!!$("saleAppointment").value};
 $("saleDate").addEventListener("change",()=>syncSaleAppointment());
}
function syncSaleAppointment(preferred){
 const d=Store.load(),client=$("saleClient").value,id=$("saleId").value,editing=d.vendas.find(s=>s.id===id);
 const selected=preferred??$("saleAppointment").value??"";
 const linked=editing?.agendamento_id||"";
 const rows=d.agendamentos.filter(a=>a.cliente_id===client&&["Agendado","Confirmado","Concluído"].includes(a.status)&&!d.vendas.some(s=>s.agendamento_id===a.id&&s.id!==id)).sort((a,b)=>(b.data+b.hora).localeCompare(a.data+a.hora));
 const matches=rows.filter(a=>a.data===$("saleDate").value);
 const next=linked||([selected,saleAppointmentSource].find(value=>rows.some(a=>a.id===value)))||(matches.length===1?matches[0].id:"");
 const current=$("saleAppointment").value,wasChecked=$("saleCompleteAppointment").checked;
 $("saleAppointment").innerHTML='<option value="">Sem agendamento vinculado</option>'+rows.map(a=>`<option value="${esc(a.id)}">${formatDate(a.data)} · ${esc(formatTime(a.hora))} · ${esc(a.cidade)} · ${esc(a.status)}</option>`).join("");
 $("saleAppointment").value=rows.some(a=>a.id===next)?next:"";
 $("saleAppointmentFields").hidden=!rows.length;
 $("saleCompleteAppointment").checked=!!linked||!!next&&(current===next?wasChecked:true);
 $("saleAppointment").disabled=!!linked;$("saleCompleteAppointment").disabled=!!linked;
}
function selectedSaleAppointment(){
 const d=Store.load(),editing=d.vendas.find(s=>s.id===$("saleId").value);
 if(editing?.agendamento_id)return editing.agendamento_id;
 if(!$("saleCompleteAppointment").checked)return null;
 const a=d.agendamentos.find(a=>a.id===$("saleAppointment").value);
 if(!a||a.cliente_id!==$("saleClient").value)throw new Error("Selecione o agendamento deste cliente para concluir.");
 if(a.data!==$("saleDate").value)throw new Error("A data da venda precisa ser a mesma do agendamento. Confira ou remarque antes de concluir.");
 return a.id;
}
function startAppointmentSale(id){
 if(!isAdmin())return;const d=Store.load(),a=d.agendamentos.find(a=>a.id===id);if(!a)return;
 const sale=d.vendas.find(s=>s.agendamento_id===id);if(sale){editSale(sale.id);return}
 resetSaleForm();saleAppointmentSource=id;$("saleDate").value=a.data;renderSaleClients(a.cliente_id);syncSaleClient();
 $("saleCity").value=a.cidade;setStyles("saleStyles",a.estilos||[]);$("saleDurationHours").value=Math.floor(Number(a.duracao)/60);$("saleDurationMinutes").value=Number(a.duracao)%60;
 $("saleNotes").value=a.observacoes||"";syncSaleAppointment(id);$("saleCompleteAppointment").checked=true;showPage("nova-venda");window.scrollTo({top:0,behavior:"smooth"});
}
async function completeAppointment(id,button){
 const a=Store.load().agendamentos.find(a=>a.id===id);if(!a||!["Agendado","Confirmado"].includes(a.status))return;
 if(a.data>isoToday()){toast("Conclua o atendimento na data da tattoo.","error");return}
 button.disabled=true;
 try{await Store.saveAppointment({...a,status:"Concluído"});renderWorkspace();toast("Atendimento concluído.")}
 catch(err){toast(err.message,"error")}finally{button.disabled=false}
}
async function toggleAppointmentDeposit(input){
 const a=Store.load().agendamentos.find(a=>a.id===input.dataset.depositPaid);if(!a)return;
 const paid=input.checked;
 if(paid&&!(Number(a.sinal_valor)>0)){input.checked=false;openAppointment(a.id);$("appointmentDepositPaid").checked=true;syncDepositField();$("appointmentDepositValue").focus();return}
 input.disabled=true;
 // Remove the reminder immediately; a failed save restores the previous card.
 const reminder=input.closest(".appointment-card")?.querySelector("[data-deposit-reminder]");if(reminder)reminder.hidden=paid;
 try{await Store.saveAppointment({...a,sinal_pago:paid});renderWorkspace();toast(paid?"Sinal marcado como pago.":"Sinal marcado como pendente.")}
 catch(err){renderWorkspace();toast(err.message,"error")}finally{input.disabled=false}
}
