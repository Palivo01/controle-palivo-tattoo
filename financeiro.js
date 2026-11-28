"use strict";
const CREDIT_BPS=[0,309,579,609,799,809,819,949,968,1037,1105,1227,1238];
let pixScheduleDraft=[],pixReceiptSelection="",financePrivacy=false;
const cents=value=>Math.round(Number(value||0)*100);
function creditAmount(s){return paymentParts(s).filter(p=>p.forma==="Cartão de crédito").reduce((n,p)=>n+cents(p.valor),0)/100}
function creditCalculation(value,installments){
 const n=Number(installments),gross=cents(value);if(!Number.isInteger(n)||n<1||n>12||gross<0)throw new Error("Selecione de 1 a 12 parcelas no cartão.");
 const fee=Math.round(gross*CREDIT_BPS[n]/10000);return {taxa:CREDIT_BPS[n]/100,taxa_valor:fee/100,liquido:(gross-fee)/100};
}
function monthlyDue(first,index){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(first)||!Number.isFinite(Date.parse(first+"T12:00:00")))throw new Error("Informe o primeiro vencimento.");
 const [y,m,d]=first.split("-").map(Number),start=new Date(y,m-1+index,1,12),last=new Date(start.getFullYear(),start.getMonth()+1,0).getDate();
 return Store.date(new Date(start.getFullYear(),start.getMonth(),Math.min(d,last),12));
}
function splitPix(total,count,first){
 const value=cents(total),n=Number(count);if(!Number.isInteger(n)||n<1||n>24||value<n)throw new Error("Divida em até 24 parcelas, com pelo menos R$ 0,01 em cada.");
 const base=Math.floor(value/n);return Array.from({length:n},(_,i)=>({numero:i+1,valor:(base+(i===n-1?value-base*n:0))/100,vencimento:monthlyDue(first,i)}));
}
function formPayment(){return {forma_pagamento:$("salePayment").value,valor:Number($("saleValue").value)||0,pagamentos:$("salePayment").value==="Misto"?[1,2].map(i=>({forma:$("paymentMethod"+i).value,valor:Number($("paymentValue"+i).value)||0})):[]}}
function resetFinanceForm(){
 pixScheduleDraft=[];if(!$("creditInstallments"))return;$("creditInstallments").value="1";$("creditReceiptDate").value=isoToday();$("pixInstallmentCount").value=2;$("pixFirstDue").value=isoToday();$("pixScheduleRows").innerHTML="";
}
function renderPixSchedule(){
 $("pixScheduleRows").innerHTML=pixScheduleDraft.map(p=>`<div class="pix-schedule-row"><span>${p.numero}ª parcela</span><strong class="private-value">${money(p.valor)}</strong><label>Vencimento<input type="date" data-pix-number="${p.numero}" value="${esc(p.vencimento)}" required ${p.recebido_em?"disabled":""}></label>${p.recebido_em?'<small>Pago</small>':""}</div>`).join("");
}
function syncFinancePayment(regenerate=false){
 if(!$("creditDetails"))return;const payment=formPayment(),hasCredit=creditAmount(payment)>0,isPix=payment.forma_pagamento==="PIX parcelado";
 if(hasCredit&&!$("creditReceiptDate").value)$("creditReceiptDate").value=$("saleDate").value||isoToday();
 $("creditDetails").hidden=!hasCredit;$("creditInstallments").required=hasCredit;$("creditReceiptDate").required=hasCredit;
 $("pixInstallmentFields").hidden=!isPix;$("pixInstallmentFields").disabled=!isPix;
 if(hasCredit){try{const result=creditCalculation(creditAmount(payment),$("creditInstallments").value);$("creditNetPreview").textContent=`Taxa ${result.taxa.toLocaleString("pt-BR")}% · Recebido ${money(result.liquido)}`}catch{$("creditNetPreview").textContent="Selecione as parcelas do cartão."}}
 if(isPix&&(!pixScheduleDraft.length||regenerate)&&!pixScheduleDraft.some(p=>p.recebido_em)){
  try{pixScheduleDraft=splitPix($("saleValue").value,$("pixInstallmentCount").value,$("pixFirstDue").value||$("saleDate").value||isoToday());renderPixSchedule()}catch{pixScheduleDraft=[];$("pixScheduleRows").innerHTML=""}
 }
 const paid=pixScheduleDraft.some(p=>p.recebido_em);$("pixInstallmentCount").disabled=paid;$("pixFirstDue").disabled=paid;
 applyFinancePrivacy();
}
function restoreSaleFinance(s){
 $("creditInstallments").value=s.credito_parcelas||"";$("creditReceiptDate").value=s.recebimento_data||s.data_atendimento;
 pixScheduleDraft=(Store.load().parcelas_pix||[]).filter(p=>p.venda_id===s.id).sort((a,b)=>a.numero-b.numero).map(p=>({...p,vencimento:p.vencimento}));
 if(pixScheduleDraft.length){$("pixInstallmentCount").value=pixScheduleDraft.length;$("pixFirstDue").value=pixScheduleDraft[0].vencimento}renderPixSchedule();syncFinancePayment();
}
function readSaleFinance(payload){
 const hasCredit=creditAmount(payload)>0,installments=Number($("creditInstallments").value),isPix=payload.forma_pagamento==="PIX parcelado";
 if(hasCredit)creditCalculation(creditAmount(payload),installments);
 if(hasCredit&&!$("creditReceiptDate").value)throw new Error("Informe a data em que recebeu ou receberá o cartão.");
 let plan=[];
 if(isPix){
  if(!pixScheduleDraft.length)throw new Error("Confira o valor e as parcelas do PIX.");
  plan=pixScheduleDraft.map(p=>({numero:p.numero,valor:p.valor,vencimento:$("pixScheduleRows").querySelector(`[data-pix-number="${p.numero}"]`)?.value||p.vencimento}));
  if(plan.some(p=>!p.vencimento)||plan.reduce((n,p)=>n+cents(p.valor),0)!==cents(payload.valor))throw new Error("Confira os vencimentos e a soma das parcelas PIX.");
 }
 return {credito_parcelas:hasCredit?installments:null,recebimento_data:hasCredit?$("creditReceiptDate").value:null,parcelas_pix:plan};
}
function receiptEvents(data){
 const events=[];
 for(const sale of data.vendas||[]){
  if(NON_REVENUE_PAYMENTS.has(sale.forma_pagamento))continue;
  if(sale.forma_pagamento==="PIX parcelado"){
   for(const p of data.parcelas_pix||[])if(p.venda_id===sale.id&&p.recebido_em)events.push({venda_id:sale.id,cliente:sale.cliente,cidade:sale.cidade,data:p.recebido_em,forma:`PIX ${p.numero}ª parcela`,bruto:Number(p.valor),taxa:0,liquido:Number(p.valor)});
   continue;
  }
  for(const part of paymentParts(sale)){
   if(!(Number(part.valor)>0))continue;
   const credit=part.forma==="Cartão de crédito";
   if(credit&&(sale.credito_parcelas==null||sale.credito_valor_liquido==null))continue;
   const gross=Number(part.valor),net=credit?Number(sale.credito_valor_liquido):gross;
   events.push({venda_id:sale.id,cliente:sale.cliente,cidade:sale.cidade,data:credit?(sale.recebimento_data||sale.data_atendimento):sale.data_atendimento,forma:part.forma,bruto:gross,taxa:credit?(cents(gross)-cents(net))/100:0,liquido:net});
  }
 }
 return events;
}
function financePeriod(){
 const year=Number($("filterYear").value)||new Date().getFullYear(),period=$("filterPeriod").value,month=Number($("filterMonth").value)||1,ranges={s1:[1,6],s2:[7,12],q1:[1,3],q2:[4,6],q3:[7,9],q4:[10,12]},range=period==="month"?[month,month]:ranges[period]||[1,12];
 return {start:`${year}-${String(range[0]).padStart(2,"0")}-01`,end:Store.date(new Date(year,range[1],0,12))};
}
function matchesFinanceFilters(s){return [["filterCity",s.cidade],["filterPayment",s.forma_pagamento],["filterGender",s.genero||"Não informado"]].every(([id,value])=>$(id).value==="all"||$(id).value===value)&&($("filterStyle").value==="all"||(s.estilos||[]).includes($("filterStyle").value))}
function renderFinanceExtras(){
 if(!$("netReceived"))return;if(!isAdmin()){$("receivablesButton").hidden=true;return}
 const data=Store.load(),period=financePeriod(),sales=(data.vendas||[]).filter(matchesFinanceFilters),ids=new Set(sales.map(s=>s.id));
 const events=receiptEvents(data).filter(e=>ids.has(e.venda_id)&&e.data>=period.start&&e.data<=period.end&&e.data<=isoToday()),sum=key=>events.reduce((n,e)=>n+cents(e[key]),0)/100;
 $("netReceived").textContent=money(sum("liquido"));$("netFees").textContent=money(sum("taxa"));$("netOutstanding").textContent=money((data.parcelas_pix||[]).filter(p=>ids.has(p.venda_id)&&!p.recebido_em).reduce((n,p)=>n+cents(p.valor),0)/100);
 const unknown=sales.filter(s=>creditAmount(s)>0&&s.credito_parcelas==null&&s.data_atendimento>=period.start&&s.data_atendimento<=period.end).length;
 $("legacyCreditNote").textContent=unknown?`${unknown} venda(s) de cartão sem parcelas informadas. Edite para calcular o líquido.`:"";
 const due=(data.parcelas_pix||[]).filter(p=>!p.recebido_em&&p.vencimento<=isoToday());
 $("receivablesButton").hidden=false;$("receivablesButton").innerHTML=actionIcon("wallet")+(due.length?`<b class="tool-badge">${due.length}</b>`:"");$("receivablesButton").setAttribute("aria-label",`Parcelas PIX${due.length?`: ${due.length} para cobrar`:""}`);
 applyFinancePrivacy();
}
function applyFinancePrivacy(){
 document.body.classList.toggle("finance-hidden",financePrivacy);
 const eye=$("financePrivacy");if(eye){eye.innerHTML=actionIcon(financePrivacy?"eyeOff":"eye");eye.setAttribute("aria-label",financePrivacy?"Mostrar valores":"Ocultar valores");eye.title=financePrivacy?"Mostrar valores":"Ocultar valores";eye.setAttribute("aria-pressed",String(financePrivacy))}
 const selectors='#metricRevenue,#metricTicket,#monthlyChart,#cityChart,#paymentChart,.recent-item>strong,.sale-value>strong,.sale-payment-detail,.client-finance,#clientHistory .history-item small.muted,#clientHistory .history-item>span,#mixedPaymentSummary,#netReceived,#netFees,#netOutstanding,.private-value,.deposit-status';
 for(const el of document.querySelectorAll(selectors)){el.classList.add("financial-private");el.setAttribute("aria-hidden",String(financePrivacy))}
 for(const id of ["saleValue","paymentValue1","paymentValue2","appointmentTotal","appointmentDepositValue","depositReminderValue"]){const el=$(id)?.closest("label");if(el){el.classList.add("financial-private-field");el.setAttribute("aria-hidden",String(financePrivacy))}}
 if($("showStyleRevenue")?.checked){$("stylesChart").classList.add("financial-private");$("stylesChart").setAttribute("aria-hidden",String(financePrivacy))}else{$("stylesChart")?.classList.remove("financial-private");$("stylesChart")?.removeAttribute("aria-hidden")}
}
function initFinanceTools(){
 try{financePrivacy=localStorage.getItem("palivo_finance_hidden")==="1"}catch{}
 $("financePrivacy").onclick=()=>{financePrivacy=!financePrivacy;try{localStorage.setItem("palivo_finance_hidden",financePrivacy?"1":"0")}catch{}applyFinancePrivacy()};
 $("creditInstallments").onchange=()=>syncFinancePayment();$("pixInstallmentCount").oninput=$("pixFirstDue").onchange=()=>syncFinancePayment(true);
 $("pixScheduleRows").onchange=e=>{if(e.target.matches('[data-pix-number]')){const p=pixScheduleDraft.find(p=>p.numero===Number(e.target.dataset.pixNumber));if(p)p.vencimento=e.target.value}};
 $("saleDate").addEventListener("change",()=>{if(!$("saleId").value){$("creditReceiptDate").value=$("saleDate").value;$("pixFirstDue").value=$("saleDate").value;syncFinancePayment(true)}});
 $("receivablesButton").onclick=()=>{if(!isAdmin())return;$("receivableMonth").value=isoToday().slice(0,7);renderReceivables();$("receivablesDialog").showModal()};
 $("receivableMonth").onchange=$("receivableStatus").onchange=renderReceivables;
 $("receivableList").onclick=e=>{const receipt=e.target.closest('[data-pix-receipt]'),collect=e.target.closest('[data-pix-collect]');if(receipt)openPixReceipt(receipt.dataset.pixReceipt);if(collect)collectPix(collect.dataset.pixCollect)};
 $("pixReceiptForm").onsubmit=e=>{e.preventDefault();savePixReceipt($("pixReceiptDate").value)};$("undoPixReceipt").onclick=()=>savePixReceipt(null);
 $("exportSalesButton").innerHTML=actionIcon("download")+' Exportar';$("exportSalesButton").onclick=()=>{if(!isAdmin())return;$("exportSalesMonth").value=isoToday().slice(0,7);$("exportSalesDialog").showModal()};
 $("exportSalesForm").onsubmit=e=>{e.preventDefault();if(!isAdmin())return;try{const report=buildMonthlyReport(Store.load(),$("exportSalesMonth").value);$("exportSalesFormat").value==="csv"?downloadSalesCSV(report):printSalesReport(report)}catch(err){toast(err.message,"error")}};
 applyFinancePrivacy();
}
function renderReceivables(){
 if(!isAdmin())return;const data=Store.load(),month=$("receivableMonth").value,mode=$("receivableStatus").value;
 const rows=(data.parcelas_pix||[]).filter(p=>mode==="paid"?p.recebido_em?.startsWith(month):mode==="open"?!p.recebido_em:mode==="month"?p.vencimento.startsWith(month):!p.recebido_em&&(p.vencimento.startsWith(month)||p.vencimento<month+'-01')).sort((a,b)=>a.vencimento.localeCompare(b.vencimento)||a.numero-b.numero);
 $("receivableList").innerHTML=rows.map(p=>{const s=data.vendas.find(s=>s.id===p.venda_id),overdue=!p.recebido_em&&p.vencimento<isoToday();return `<article class="receivable-row ${overdue?"overdue":""}"><div><strong>${esc(s?.cliente||"Cliente")}</strong><small>${p.numero}ª parcela · ${formatDate(p.vencimento)}${p.recebido_em?` · Pago em ${formatDate(p.recebido_em)}`:overdue?" · Vencida":""}</small><b class="private-value">${money(p.valor)}</b></div><div class="receipt-actions">${!p.recebido_em?`<button class="whatsapp-action-icon" type="button" data-pix-collect="${esc(p.id)}" aria-label="Cobrar parcela pelo WhatsApp" title="Cobrar">${whatsappIcon()}</button>`:""}<button class="btn ${p.recebido_em?"ghost":"primary"}" type="button" data-pix-receipt="${esc(p.id)}">${p.recebido_em?"Pago":"Receber"}</button></div></article>`}).join("")||'<p class="empty">Nenhuma parcela neste filtro.</p>';
 applyFinancePrivacy();
}
function collectPix(id){
 if(!isAdmin())return;const d=Store.load(),p=d.parcelas_pix.find(p=>p.id===id);if(!p||p.recebido_em)return;const s=d.vendas.find(s=>s.id===p.venda_id),c=d.clientes.find(c=>c.id===s?.cliente_id);if(!s||!c)return;
 try{launchClientWhatsapp(c.id,`Olá, ${c.nome}! Aqui é do Palivo Tattoo Studio!\n\nPassando para lembrar da ${p.numero}ª parcela da sua tattoo, no valor de ${money(p.valor)}, com vencimento em ${formatDate(p.vencimento)}.\n\nQuando fizer o PIX, me envie o comprovante por aqui para eu dar baixa. Obrigado!`)}catch(err){toast(err.message,"error")}
}
function openPixReceipt(id){
 if(!isAdmin())return;const p=Store.load().parcelas_pix.find(p=>p.id===id);if(!p)return;pixReceiptSelection=id;$("pixReceiptSummary").textContent=`${p.numero}ª parcela · ${money(p.valor)}`;$("pixReceiptDate").value=p.recebido_em||isoToday();$("pixReceiptDate").max=isoToday();$("undoPixReceipt").hidden=!p.recebido_em;$("pixReceiptError").hidden=true;$("pixReceiptDialog").showModal();applyFinancePrivacy();
}
async function savePixReceipt(date){
 if(!isAdmin()||!pixReceiptSelection)return;const form=$("pixReceiptForm");setBusy(form,true);$("pixReceiptError").hidden=true;
 try{if(date&&date>isoToday())throw new Error("O recebimento não pode ter data futura.");await Store.markPixPayment(pixReceiptSelection,date);await loadData(false);renderReceivables();$("pixReceiptDialog").close();toast(date?"Parcela recebida.":"Parcela reaberta.")}
 catch(err){$("pixReceiptError").textContent=err.message;$("pixReceiptError").hidden=false}finally{setBusy(form,false)}
}
function buildMonthlyReport(data,month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error("Selecione o mês do relatório.");
 const sales=(data.vendas||[]).filter(s=>s.data_atendimento.startsWith(month)).sort((a,b)=>a.data_atendimento.localeCompare(b.data_atendimento)||String(a.cliente).localeCompare(b.cliente));
 const receipts=receiptEvents(data).filter(e=>e.data.startsWith(month)&&e.data<=isoToday()).sort((a,b)=>a.data.localeCompare(b.data));
 const gross=sales.filter(s=>!NON_REVENUE_PAYMENTS.has(s.forma_pagamento)).reduce((n,s)=>n+cents(s.valor),0)/100;
 return {month,sales,receipts,gross,net:receipts.reduce((n,e)=>n+cents(e.liquido),0)/100,fees:receipts.reduce((n,e)=>n+cents(e.taxa),0)/100,unknown:sales.filter(s=>creditAmount(s)>0&&s.credito_parcelas==null).length};
}
function csvCell(value){const s=String(value??"");return '"'+(/^[\s]*[=+\-@]/.test(s)?"'":"")+s.replace(/"/g,'""')+'"'}
function reportCSV(r){
 const num=n=>Number(n||0).toFixed(2).replace('.',','),rows=[['Palivo Tattoo Studio','Relatório mensal',r.month],['Faturamento bruto',num(r.gross)],['Recebido líquido no mês',num(r.net)],['Taxas descontadas no mês',num(r.fees)],['Vendas de cartão sem parcelas informadas',r.unknown],[],['Vendas realizadas no mês'],['Data','Cliente','Gênero','Cidade','Estilos','Valor bruto','Pagamento','Parcelas cartão','Taxa cartão (%)','Líquido da parte crédito','Duração (minutos)','Nota fiscal','Observações']];
 for(const s of r.sales)rows.push([formatDate(s.data_atendimento),s.cliente,s.genero||'Não informado',s.cidade,(s.estilos||[]).join(', '),num(s.valor),salePaymentDescription(s),s.credito_parcelas||'',s.credito_taxa==null?'':num(s.credito_taxa),s.credito_valor_liquido==null?'':num(s.credito_valor_liquido),s.duracao_minutos||0,s.nf_emitida?'Emitida':'Pendente',s.observacoes||'']);
 rows.push([],['Recebimentos do mês (inclui vendas de outros meses)'],['Recebido em','Cliente','Cidade','Pagamento','Bruto recebido','Taxa','Líquido']);
 for(const e of r.receipts)rows.push([formatDate(e.data),e.cliente,e.cidade,e.forma,num(e.bruto),num(e.taxa),num(e.liquido)]);
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
}
function downloadSalesCSV(r){const blob=new Blob([reportCSV(r)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Palivo-vendas-${r.month}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function printSalesReport(r){
 const w=window.open('about:blank','_blank');if(!w)throw new Error("Permita abrir a janela do relatório.");w.opener=null;
 w.document.write(`<!doctype html><html lang="pt-BR"><meta charset="UTF-8"><title>Palivo ${esc(r.month)}</title><style>body{font:12px Arial;color:#111;margin:30px}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin:18px 0}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}small{color:#555}@page{size:A4 landscape;margin:12mm}</style><h1>Palivo Tattoo Studio</h1><h2>Relatório mensal · ${esc(r.month)}</h2><p>Faturamento bruto: <b>${money(r.gross)}</b> · Recebido líquido: <b>${money(r.net)}</b> · Taxas: <b>${money(r.fees)}</b></p>${r.unknown?`<p>${r.unknown} venda(s) de cartão sem parcelas informadas, pendentes de cálculo líquido.</p>`:""}<h3>Vendas do mês</h3><table><thead><tr><th>Data</th><th>Cliente</th><th>Cidade</th><th>Estilos</th><th>Pagamento</th><th>Valor bruto</th></tr></thead><tbody>${r.sales.map(s=>`<tr><td>${formatDate(s.data_atendimento)}</td><td>${esc(s.cliente)}</td><td>${esc(s.cidade)}</td><td>${esc((s.estilos||[]).join(', '))}</td><td>${esc(salePaymentDescription(s))}</td><td>${money(s.valor)}</td></tr>`).join('')}</tbody></table><h3>Recebimentos do mês</h3><small>Inclui parcelas de vendas de meses anteriores. Líquido após taxas de cartão.</small><table><thead><tr><th>Data</th><th>Cliente</th><th>Forma</th><th>Bruto recebido</th><th>Taxa</th><th>Líquido</th></tr></thead><tbody>${r.receipts.map(e=>`<tr><td>${formatDate(e.data)}</td><td>${esc(e.cliente)}</td><td>${esc(e.forma)}</td><td>${money(e.bruto)}</td><td>${money(e.taxa)}</td><td>${money(e.liquido)}</td></tr>`).join('')}</tbody></table></html>`);w.document.close();setTimeout(()=>{w.focus();w.print()},300);
}
