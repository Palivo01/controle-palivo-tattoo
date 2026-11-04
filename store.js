"use strict";
// Dados exclusivamente do Supabase. A demonstração local não é importada.
const Store=(()=>{
  const styles=["Realismo","Fineline","Cristã","Fineart","Colorido","Tradicional","Escrita","Homenagem","Cobertura","Geométrico","Comercial"];
  const statuses=["Agendado","Confirmado","Concluído","Cancelado","Não compareceu"],cities=["Jacobina","Umburanas","Ourolândia"],genders=["Homem","Mulher","Não informado"];
  const empty=()=>({clientes:[],agendamentos:[],vendas:[],cartuchos:[],compras_cartuchos:[],venda_cartuchos:[]});
  let data=empty(),profile=null,epoch=0;
  const uid=()=>{
    if(crypto.randomUUID)return crypto.randomUUID();
    const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const h=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  };
  const date=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const clone=o=>JSON.parse(JSON.stringify(o));
  async function rpc(name,body={}){return db(`rpc/${name}`,{method:"POST",body:JSON.stringify(body)})}
  async function all(path){
    const rows=[];let offset=0;
    for(;;){
      const page=await db(`${path}${path.includes("?")?"&":"?"}limit=500&offset=${offset}`,{headers:{Prefer:"count=exact"},withCount:true});
      if(!Array.isArray(page.data))throw new Error("Resposta inválida do banco.");rows.push(...page.data);offset+=page.data.length;
      if(!page.data.length||(page.total!==null?offset>=page.total:page.data.length<500))break;
    }
    return rows;
  }
  async function workspace(){
    const [clients,agenda]=await Promise.all([rpc("controle_listar_clientes"),all("controle_agendamentos?select=*&order=data.asc,hora.asc,id.asc")]);
    if(!Array.isArray(clients))throw new Error("Não foi possível carregar os clientes.");
    return {clientes:clients,agendamentos:agenda};
  }
  async function refresh(){
    const started=epoch;
    const ctx=await rpc("controle_contexto");
    if(!ctx||!["admin","colaborador"].includes(ctx.papel))throw new Error("Perfil sem acesso ao Controle.");
    const tasks=[workspace()];
    if(ctx.papel==="admin")tasks.push(Promise.all([
      all("vendas?select=*&order=data_atendimento.desc,criado_em.desc,id.asc"),all("cartuchos?select=*&order=nome.asc,id.asc"),
      all("venda_cartuchos?select=*&order=criado_em.desc,id.asc"),all("compras_cartuchos?select=*&order=data_compra.desc,criado_em.desc,id.asc")
    ]));
    const [w,finance]=await Promise.all(tasks);const fresh={...empty(),...w};
    if(finance)[fresh.vendas,fresh.cartuchos,fresh.venda_cartuchos,fresh.compras_cartuchos]=finance;
    // Substitui o cache somente após todas as leituras necessárias concluírem.
    if(started!==epoch)throw new Error("Sessão encerrada.");
    profile=ctx;data=fresh;
  }
  function syncWarning(){const el=document.getElementById("syncStatus");if(el)el.textContent="Salvo. Atualize os dados para conferir a sincronização."}
  async function reloadWorkspace(){try{Object.assign(data,await workspace())}catch{syncWarning()}}
  async function saveClient(c){
    await rpc("controle_salvar_cliente",{p_id:c.id,p_dados:c});
    const old=data.clientes.find(x=>x.id===c.id);data.clientes=data.clientes.filter(x=>x.id!==c.id);data.clientes.push({...old,...c,legado_pendente:false});await reloadWorkspace();
  }
  async function saveAppointment(a){
    await rpc("controle_salvar_agendamento",{p_id:a.id,p_dados:a});
    const old=data.agendamentos.find(x=>x.id===a.id);data.agendamentos=data.agendamentos.filter(x=>x.id!==a.id);
    data.agendamentos.push({...a,criado_por:old?.criado_por||profile.nome,atualizado_por:profile.nome});await reloadWorkspace();
  }
  async function setArtReady(id,ready){
    await rpc("controle_arte_pronta",{p_id:id,p_pronta:ready});const a=data.agendamentos.find(x=>x.id===id);if(a){a.arte_pronta=ready;a.atualizado_por=profile.nome}
  }
  async function deleteAppointment(id){
    await rpc("controle_excluir_agendamento",{p_id:id});data.agendamentos=data.agendamentos.filter(a=>a.id!==id);await reloadWorkspace();
  }
  async function setInvoice(id,issued){
    await rpc("controle_nota_fiscal",{p_id:id,p_emitida:issued});const s=data.vendas.find(s=>s.id===id);if(s)s.nf_emitida=issued;
  }
  function clientStats(d,id){const c=d.clientes.find(c=>c.id===id);return {count:Number(c?.atendimentos)||0,first:c?.primeiro_atendimento,last:c?.ultimo_atendimento}}
  return {styles,statuses,cities,genders,uid,date,load:()=>clone(data),profile:()=>profile,refresh,saveClient,saveAppointment,setArtReady,deleteAppointment,setInvoice,clientStats,
    saveBirthday:async(id,year,details)=>{await rpc("controle_salvar_aniversario",{p_cliente:id,p_ano:year,p_dados:details});await reloadWorkspace()},
    saveSale:(id,payload,materials)=>rpc("controle_salvar_venda",{p_id:id,p_dados:payload,p_materiais:materials}),
    deleteSale:id=>rpc("controle_excluir_venda",{p_id:id}),clear:()=>{epoch++;data=empty();profile=null}};
})();
