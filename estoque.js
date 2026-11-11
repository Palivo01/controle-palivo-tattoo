"use strict";
const RETIRED_CARTRIDGES=new Set(["7RS","7RM"]);
const stockIsActive=c=>c.ativo!==false&&!RETIRED_CARTRIDGES.has(String(c.nome).replace(/\s+/g,"").toUpperCase());
let stockCountDraft=null,stockTypeId="",stockDeleteId="";
function initStockTools(){
 $("stockGrid").onclick=e=>{const history=e.target.closest("[data-stock-history]"),count=e.target.closest("[data-stock-count]");const del=e.target.closest("[data-stock-delete]");if(del)openStockTypeDelete(del.dataset.stockDelete);if(history)openStockHistory(history.dataset.stockHistory);if(count)openStockCount(count.dataset.stockCount)};
 $("stockPhysicalCount").oninput=stockCountPreview;$("stockCountForm").onsubmit=saveStockCount;
 $("newStockType").onclick=()=>{if(!isAdmin())return;if(!Store.load().estoque_ajuste_disponivel){toast("Aplique o SQL V11.8 no Supabase para habilitar o cadastro.","error");return}$("stockTypeForm").reset();$("stockTypeError").hidden=true;stockTypeId=Store.uid();$("stockTypeDialog").showModal()};
 $("stockTypeForm").onsubmit=saveStockType;$("confirmStockTypeDelete").onclick=deleteStockType;$("stockTypeDeleteDialog").addEventListener("close",()=>{stockDeleteId=""});
}
function stockIssues(d){
 const issues=[],active=new Set(d.cartuchos.filter(stockIsActive).map(c=>c.id)),sales=new Set(d.vendas.map(s=>s.id));
 for(const c of state.stock.filter(stockIsActive))if(c.quantidade_atual<0)issues.push(`${c.nome}: saldo negativo de ${c.quantidade_atual}.`);
 for(const [label,rows] of [["Entrada",d.compras_cartuchos],["Consumo",d.venda_cartuchos]]){
  const seen=new Set();for(const r of rows){
   if(!d.cartuchos.some(c=>c.id===r.cartucho_id)){issues.push(`${label} sem cartucho cadastrado.`);continue}if(!active.has(r.cartucho_id))continue;
   if(!Number.isInteger(Number(r.quantidade))||Number(r.quantidade)<=0)issues.push(`${label} com quantidade inválida.`);
   if(label==="Consumo"&&!sales.has(r.venda_id))issues.push("Consumo sem venda correspondente.");
   const key=[r.cartucho_id,r.quantidade,label==="Entrada"?r.data_compra:r.venda_id].join("|");
   if(seen.has(key))issues.push(`${d.cartuchos.find(c=>c.id===r.cartucho_id)?.nome}: ${label.toLowerCase()} semelhante repetido. Confira se foram lançamentos distintos.`);seen.add(key);
  }
 }
 const missing=d.vendas.filter(s=>!d.venda_cartuchos.some(u=>u.venda_id===s.id)).length;
 if(missing)issues.push(`${missing} venda(s) sem consumo de cartucho informado. Confira se houve uso de material.`);
 return [...new Set(issues)];
}
function renderStockAudit(){
 const d=Store.load(),issues=stockIssues(d);
 $("stockAuditSummary").innerHTML=`<h3>Conferência de estoque</h3>${!d.estoque_ajuste_disponivel?'<p class="stock-warning">Aplique a atualização V11.8 do Supabase para habilitar correções e cadastro de tipos.</p>':""}${issues.length?`<details><summary>${issues.length} ponto(s) para conferir</summary><ul>${issues.map(i=>`<li>${esc(i)}</li>`).join("")}</ul><p class="muted">Indícios para conferência. Nada é corrigido automaticamente.</p></details>`:'<p class="muted">Nenhuma inconsistência estrutural encontrada nos registros carregados. A contagem física deve ser conferida em cada cartucho.</p>'}`;
}
function openStockCount(id){
 if(!isAdmin())return;const c=state.stock.find(c=>c.id===id);if(!c||!stockIsActive(c))return;
 if(!Store.load().estoque_ajuste_disponivel){toast("Aplique o SQL V11.8 no Supabase para habilitar os ajustes.","error");return}
 stockCountDraft={id:Store.uid(),cartucho:id,expected:c.quantidade_atual};$("stockCountForm").reset();$("stockCountTitle").textContent=`Conferir ${c.nome}`;$("stockCurrentBalance").textContent=`Saldo no Controle: ${c.quantidade_atual} unidade(s)`;$("stockCountError").hidden=true;stockCountPreview();$("stockCountDialog").showModal();
}
function stockCountPreview(){
 const value=$("stockPhysicalCount").value,n=Number(value);$("stockCountDifference").textContent=value===""?"Informe quantas unidades você contou.":!Number.isInteger(n)||n<0?"Use uma quantidade inteira, a partir de zero.":`Diferença: ${n-stockCountDraft.expected>0?"+":""}${n-stockCountDraft.expected} unidade(s). Saldo após ajuste: ${n}.`;
}
async function saveStockCount(e){
 e.preventDefault();if(!isAdmin()||!stockCountDraft)return;const form=e.currentTarget,n=Number($("stockPhysicalCount").value),reason=$("stockCountReason").value.trim();$("stockCountError").hidden=true;
 try{if($("stockPhysicalCount").value===""||!Number.isInteger(n)||n<0||n>1000000)throw new Error("Informe uma contagem inteira entre 0 e 1.000.000.");if(reason.length<3)throw new Error("Informe o motivo do ajuste.");setBusy(form,true);
 await Store.saveStockCount(stockCountDraft.id,stockCountDraft.cartucho,n,stockCountDraft.expected,reason);$("stockCountDialog").close();stockCountDraft=null;
 try{await loadData(false);toast("Contagem salva e saldo atualizado.")}catch{toast("Contagem salva. Use Atualizar dados para conferir.","error")}
 }catch(err){$("stockCountError").textContent=err.message;$("stockCountError").hidden=false}finally{setBusy(form,false)}
}
function openStockHistory(id){
 if(!isAdmin())return;const c=state.stock.find(c=>c.id===id);if(!c)return;const d=Store.load();$("stockHistoryTitle").textContent=`Movimentações de ${c.nome}`;
 const rows=[...d.compras_cartuchos.filter(r=>r.cartucho_id===id).map(r=>({date:r.data_compra,created:r.criado_em,label:"Entrada",qty:safeNumber(r.quantidade),note:""})),...d.venda_cartuchos.filter(r=>r.cartucho_id===id).map(r=>{const s=d.vendas.find(s=>s.id===r.venda_id);return {date:s?.data_atendimento,created:r.criado_em,label:"Consumo",qty:-safeNumber(r.quantidade),note:s?.cliente||"Venda não encontrada"}}),...(d.ajustes_estoque||[]).filter(r=>r.cartucho_id===id).map(r=>({date:r.criado_em?.slice(0,10),created:r.criado_em,label:"Contagem física",qty:safeNumber(r.diferenca),note:`${r.saldo_antes} para ${r.contagem_fisica} · ${r.motivo} · ${r.responsavel||"Administrador"}`}))].sort((a,b)=>String(b.created||b.date||"").localeCompare(String(a.created||a.date||"")));
 $("stockHistory").innerHTML=`<div class="stock-breakdown"><span>Inicial <b>${c.inicial}</b></span><span>Entradas <b>+${c.entradas}</b></span><span>Consumos <b>−${c.consumos}</b></span><span>Ajustes <b>${c.ajustes>0?"+":""}${c.ajustes}</b></span><span>Saldo <b>${c.quantidade_atual}</b></span></div><div class="stock-movement-list">${rows.map(r=>`<div class="stock-movement"><div><strong>${esc(r.label)} · ${r.date?formatDate(r.date):"Sem data"}</strong><p>${esc(r.note)}</p></div><b>${r.qty>0?"+":""}${r.qty}</b></div>`).join("")||'<p class="muted">Sem movimentações registradas.</p>'}</div>`;$("stockHistoryDialog").showModal();
}
async function saveStockType(e){
 e.preventDefault();if(!isAdmin())return;const form=e.currentTarget,name=$("stockTypeName").value.replace(/\s+/g,"").toUpperCase();$("stockTypeError").hidden=true;
 try{if(!/^[1-9]\d{0,2}(RL|RM|RS)$/.test(name))throw new Error("Use um tipo como 3RL, 9RS ou 15RM.");if(RETIRED_CARTRIDGES.has(name))throw new Error("Este tipo foi retirado das opções de uso.");setBusy(form,true);await Store.saveStockType(stockTypeId,name);$("stockTypeDialog").close();try{await loadData(false);toast("Tipo cadastrado. Registre a entrada das unidades.")}catch{toast("Tipo salvo. Use Atualizar dados para conferir.","error")}}catch(err){$("stockTypeError").textContent=err.message;$("stockTypeError").hidden=false}finally{setBusy(form,false)}
}

function openStockTypeDelete(id){
 if(!isAdmin())return;const c=state.cartridges.find(c=>c.id===id);if(!c)return;
 stockDeleteId=id;$("stockTypeDeleteName").textContent=`Excluir ${c.nome}?`;$("stockTypeDeleteError").hidden=true;$("stockTypeDeleteDialog").showModal();
}
async function deleteStockType(){
 if(!isAdmin()||!stockDeleteId)return;const button=$("confirmStockTypeDelete"),id=stockDeleteId;button.disabled=true;$("stockTypeDeleteError").hidden=true;
 try{await Store.deleteStockType(id);$("stockTypeDeleteDialog").close();try{await loadData(false);toast("Tipo retirado do estoque e das opções de uso.")}catch{toast("Tipo excluído. Use Atualizar dados para conferir.","error")}}
 catch(err){$("stockTypeDeleteError").textContent=["PGRST202","42703"].includes(err.code)?"Aplique o SQL V11.8.1 no Supabase para habilitar a exclusão.":err.message;$("stockTypeDeleteError").hidden=false}finally{button.disabled=false}
}
