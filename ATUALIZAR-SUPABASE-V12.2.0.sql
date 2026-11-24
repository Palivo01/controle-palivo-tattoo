-- Palivo Controle V12.2.0. Executar inteiro no SQL Editor do projeto do Controle.
BEGIN;
SET LOCAL lock_timeout='10s';
-- Confere o conteúdo antes e depois: esta atualização não modifica seus registros.
CREATE TEMP TABLE preservacao_122(tabela text PRIMARY KEY,resumo text) ON COMMIT DROP;
DO $$ DECLARE t text; r text; BEGIN
 FOREACH t IN ARRAY ARRAY['controle_clientes','controle_agendamentos','vendas','cartuchos','compras_cartuchos','venda_cartuchos','controle_ajustes_estoque','controle_pos_venda','controle_pos_venda_config'] LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg((to_jsonb(x)-''agendamento_id'')::text,'''' ORDER BY (to_jsonb(x)-''agendamento_id'')::text),'''')) FROM public.%I x',t) INTO r;
  INSERT INTO preservacao_122 VALUES(t,r);
 END LOOP;
END $$;
DO $styles$ DECLARE arg text; BEGIN
 SELECT pg_get_function_arguments('public.controle_estilos_validos(text[])'::regprocedure) INTO arg;
 EXECUTE format($sql$CREATE OR REPLACE FUNCTION public.controle_estilos_validos(%s) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$
 SELECT coalesce(cardinality($1)>0 AND array_position($1,NULL) IS NULL AND $1 <@ ARRAY['Realismo','Fineline','Cristã','Fineart','Colorido','Tradicional','Escrita','Homenagem','Cobertura','Geométrico','Comercial','Promocional']::text[],false);$fn$;$sql$,arg);
END $styles$;
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS agendamento_id uuid REFERENCES public.controle_agendamentos(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vendas_agendamento_unico ON public.vendas(user_id,agendamento_id) WHERE agendamento_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.controle_pos_venda_cupons(
 owner_id uuid NOT NULL REFERENCES auth.users(id),cliente_id uuid NOT NULL REFERENCES public.controle_clientes(id) ON DELETE CASCADE,
 data_atendimento date NOT NULL,codigo text NOT NULL UNIQUE,emitido_em date NOT NULL,expira_em date NOT NULL,
 utilizado boolean NOT NULL DEFAULT false,atualizado_por uuid NOT NULL REFERENCES auth.users(id),
 PRIMARY KEY(owner_id,cliente_id,data_atendimento),CHECK(expira_em=emitido_em+30)
);
ALTER TABLE public.controle_pos_venda_cupons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.controle_pos_venda_cupons FROM PUBLIC,anon,authenticated;
-- As RPCs mantêm a mesma autorização por estúdio usada no Controle.
CREATE OR REPLACE FUNCTION public.controle_listar_pos_venda()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ctx jsonb:=public.controle_contexto(); dono uuid:=public.controle_owner(); inicio date; itens jsonb; hoje date:=(current_timestamp AT TIME ZONE 'America/Bahia')::date;
BEGIN
 IF auth.uid() IS NULL OR dono IS NULL OR coalesce(ctx->>'papel','') NOT IN ('admin','colaborador') THEN RAISE EXCEPTION 'Acesso não liberado.' USING ERRCODE='42501'; END IF;
 SELECT inicio_em INTO inicio FROM public.controle_pos_venda_config WHERE owner_id=dono;
 IF inicio IS NULL THEN RAISE EXCEPTION 'Ative primeiro o pós-venda V11.9.'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'cliente_id',c.id,'nome',c.nome,'whatsapp',c.whatsapp,'data_atendimento',a.data_atendimento,'cidade',a.cidade,
 'etapa5',jsonb_build_object('realizado',coalesce(p5.realizado,false),'realizado_em',p5.realizado_em,'realizado_data',(p5.realizado_em AT TIME ZONE 'America/Bahia')::date,'responsavel',p5.responsavel),
 'etapa15',jsonb_build_object('realizado',coalesce(p15.realizado,false),'realizado_em',p15.realizado_em,'realizado_data',(p15.realizado_em AT TIME ZONE 'America/Bahia')::date,'responsavel',p15.responsavel),
 'cupom',CASE WHEN u.codigo IS NULL THEN NULL ELSE jsonb_build_object('codigo',u.codigo,'emitido_em',u.emitido_em,'expira_em',u.expira_em,'utilizado',u.utilizado) END
 ) ORDER BY a.data_atendimento DESC,c.nome),'[]'::jsonb) INTO itens
 FROM (SELECT cliente_id,data_atendimento,min(cidade) cidade FROM public.vendas WHERE user_id=dono AND cliente_id IS NOT NULL AND data_atendimento>=inicio AND data_atendimento<=hoje GROUP BY cliente_id,data_atendimento) a
 JOIN public.controle_clientes c ON c.id=a.cliente_id AND c.owner_id=dono
 LEFT JOIN public.controle_pos_venda p5 ON p5.owner_id=dono AND p5.cliente_id=c.id AND p5.data_atendimento=a.data_atendimento AND p5.etapa=5
 LEFT JOIN public.controle_pos_venda p15 ON p15.owner_id=dono AND p15.cliente_id=c.id AND p15.data_atendimento=a.data_atendimento AND p15.etapa=15
 LEFT JOIN public.controle_pos_venda_cupons u ON u.owner_id=dono AND u.cliente_id=c.id AND u.data_atendimento=a.data_atendimento;
 RETURN jsonb_build_object('versao',122,'inicio',inicio,'atendimentos',itens);
END $$;
CREATE OR REPLACE FUNCTION public.controle_registrar_pos_venda(p_cliente uuid,p_data date,p_etapa smallint,p_realizado boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ctx jsonb:=public.controle_contexto(); dono uuid:=public.controle_owner(); inicio date; hoje date:=(current_timestamp AT TIME ZONE 'America/Bahia')::date;
BEGIN
 IF auth.uid() IS NULL OR dono IS NULL OR coalesce(ctx->>'papel','') NOT IN ('admin','colaborador') THEN RAISE EXCEPTION 'Acesso não liberado.' USING ERRCODE='42501'; END IF;
 IF p_cliente IS NULL OR p_data IS NULL OR p_etapa IS NULL OR p_etapa NOT IN (5,15) OR p_realizado IS NULL THEN RAISE EXCEPTION 'Confira o atendimento e a etapa.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(dono::text,0));
 SELECT inicio_em INTO inicio FROM public.controle_pos_venda_config WHERE owner_id=dono;
 IF inicio IS NULL OR p_data<inicio OR NOT EXISTS(SELECT 1 FROM public.vendas v JOIN public.controle_clientes c ON c.id=v.cliente_id AND c.owner_id=dono WHERE v.user_id=dono AND v.cliente_id=p_cliente AND v.data_atendimento=p_data) THEN RAISE EXCEPTION 'Atendimento não encontrado.'; END IF;
 IF hoje-p_data>30 OR hoje-p_data<p_etapa THEN RAISE EXCEPTION 'Contato fora do período de acompanhamento de até 30 dias.'; END IF;
 IF p_realizado AND p_etapa=15 AND NOT EXISTS(SELECT 1 FROM public.controle_pos_venda WHERE owner_id=dono AND cliente_id=p_cliente AND data_atendimento=p_data AND etapa=5 AND realizado) THEN RAISE EXCEPTION 'Registre o primeiro contato antes do segundo.'; END IF;
 INSERT INTO public.controle_pos_venda(owner_id,cliente_id,data_atendimento,etapa,realizado,realizado_em,atualizado_por,responsavel)
 VALUES(dono,p_cliente,p_data,p_etapa,p_realizado,CASE WHEN p_realizado THEN now() ELSE NULL END,auth.uid(),coalesce(ctx->>'nome','Equipe'))
 ON CONFLICT(owner_id,cliente_id,data_atendimento,etapa) DO UPDATE SET realizado=EXCLUDED.realizado,realizado_em=CASE WHEN EXCLUDED.realizado AND controle_pos_venda.realizado THEN controle_pos_venda.realizado_em ELSE EXCLUDED.realizado_em END,atualizado_em=now(),atualizado_por=EXCLUDED.atualizado_por,responsavel=EXCLUDED.responsavel;
END $$;
CREATE OR REPLACE FUNCTION public.controle_emitir_cupom_pos_venda(p_cliente uuid,p_data date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ctx jsonb:=public.controle_contexto(); dono uuid:=public.controle_owner(); hoje date:=(current_timestamp AT TIME ZONE 'America/Bahia')::date; cupom public.controle_pos_venda_cupons;
BEGIN
 IF auth.uid() IS NULL OR dono IS NULL OR coalesce(ctx->>'papel','') NOT IN ('admin','colaborador') THEN RAISE EXCEPTION 'Acesso não liberado.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(dono::text,0));
 IF p_cliente IS NULL OR p_data IS NULL OR NOT EXISTS(SELECT 1 FROM public.vendas v JOIN public.controle_clientes c ON c.id=v.cliente_id AND c.owner_id=dono WHERE v.user_id=dono AND v.cliente_id=p_cliente AND v.data_atendimento=p_data) THEN RAISE EXCEPTION 'Atendimento não encontrado.'; END IF;
 IF (SELECT count(*) FROM public.controle_pos_venda WHERE owner_id=dono AND cliente_id=p_cliente AND data_atendimento=p_data AND etapa IN (5,15) AND realizado)<>2 THEN RAISE EXCEPTION 'Conclua os dois contatos antes de liberar o cupom.'; END IF;
 SELECT * INTO cupom FROM public.controle_pos_venda_cupons WHERE owner_id=dono AND cliente_id=p_cliente AND data_atendimento=p_data;
 IF NOT FOUND THEN
  IF hoje-p_data NOT BETWEEN 15 AND 30 THEN RAISE EXCEPTION 'O período de liberação do cupom terminou.'; END IF;
  INSERT INTO public.controle_pos_venda_cupons(owner_id,cliente_id,data_atendimento,codigo,emitido_em,expira_em,atualizado_por)
  VALUES(dono,p_cliente,p_data,'VOLTE20-'||upper(substr(md5(dono::text||p_cliente::text||p_data::text),1,12)),hoje,hoje+30,auth.uid()) RETURNING * INTO cupom;
 END IF;
 RETURN jsonb_build_object('codigo',cupom.codigo,'emitido_em',cupom.emitido_em,'expira_em',cupom.expira_em,'utilizado',cupom.utilizado);
END $$;
CREATE OR REPLACE FUNCTION public.controle_utilizar_cupom_pos_venda(p_cliente uuid,p_data date,p_utilizado boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ctx jsonb:=public.controle_contexto(); dono uuid:=public.controle_owner(); hoje date:=(current_timestamp AT TIME ZONE 'America/Bahia')::date;
BEGIN
 IF auth.uid() IS NULL OR dono IS NULL OR coalesce(ctx->>'papel','') NOT IN ('admin','colaborador') THEN RAISE EXCEPTION 'Acesso não liberado.' USING ERRCODE='42501'; END IF;
 IF p_utilizado IS NULL THEN RAISE EXCEPTION 'Informe se o cupom foi utilizado.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(dono::text,0));
 IF p_utilizado AND NOT EXISTS(SELECT 1 FROM public.controle_pos_venda_cupons WHERE owner_id=dono AND cliente_id=p_cliente AND data_atendimento=p_data AND expira_em>=hoje) THEN RAISE EXCEPTION 'Cupom expirado ou não encontrado.'; END IF;
 IF p_utilizado AND (SELECT count(*) FROM public.controle_pos_venda WHERE owner_id=dono AND cliente_id=p_cliente AND data_atendimento=p_data AND etapa IN (5,15) AND realizado)<>2 THEN RAISE EXCEPTION 'Confira os dois contatos do pós-venda.'; END IF;
 UPDATE public.controle_pos_venda_cupons SET utilizado=p_utilizado,atualizado_por=auth.uid() WHERE owner_id=dono AND cliente_id=p_cliente AND data_atendimento=p_data;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cupom não encontrado.'; END IF;
END $$;
-- Chama a gravação de venda já existente exatamente uma vez.
-- Conclusão e materiais são salvos na mesma transação; qualquer erro cancela tudo.
CREATE OR REPLACE FUNCTION public.controle_salvar_venda_v122(p_id uuid,p_dados jsonb,p_materiais jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE dono uuid:=public.controle_owner(); ag uuid:=(p_dados->>'agendamento_id')::uuid; anterior uuid; dados_ag jsonb; resultado uuid;
BEGIN
 IF auth.uid() IS NULL OR dono IS NULL OR NOT coalesce(public.controle_admin(),false) THEN RAISE EXCEPTION 'Somente o administrador pode registrar vendas.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(dono::text,0));
 SELECT agendamento_id INTO anterior FROM public.vendas WHERE id=p_id AND user_id=dono;
 IF anterior IS NOT NULL AND anterior IS DISTINCT FROM ag THEN RAISE EXCEPTION 'Mantenha o vínculo do agendamento desta venda.'; END IF;
 IF ag IS NOT NULL THEN
  SELECT to_jsonb(a) INTO dados_ag FROM public.controle_agendamentos a WHERE a.id=ag FOR UPDATE;
  -- A RPC existente verifica o estúdio e a autorização do agendamento ao concluir.
  IF dados_ag IS NULL OR dados_ag->>'cliente_id' IS DISTINCT FROM p_dados->>'cliente_id' OR dados_ag->>'data' IS DISTINCT FROM p_dados->>'data_atendimento' OR dados_ag->>'cidade' IS DISTINCT FROM p_dados->>'cidade' OR coalesce(dados_ag->>'status','') NOT IN ('Agendado','Confirmado','Concluído') THEN RAISE EXCEPTION 'Confira cliente, data e cidade do agendamento vinculado.'; END IF;
  IF (p_dados->>'data_atendimento')::date>(current_timestamp AT TIME ZONE 'America/Bahia')::date THEN RAISE EXCEPTION 'Não conclua uma tattoo com data futura.'; END IF;
  IF EXISTS(SELECT 1 FROM public.vendas WHERE user_id=dono AND agendamento_id=ag AND id<>p_id) THEN RAISE EXCEPTION 'Este agendamento já possui uma venda. Edite a venda existente.'; END IF;
 END IF;
 resultado:=public.controle_salvar_venda(p_id,p_dados,p_materiais);
 IF ag IS NOT NULL THEN
  PERFORM public.controle_salvar_agendamento(ag,dados_ag||jsonb_build_object('status','Concluído'));
  UPDATE public.vendas SET agendamento_id=ag WHERE id=resultado AND user_id=dono;
 END IF;
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.controle_listar_pos_venda(),public.controle_registrar_pos_venda(uuid,date,smallint,boolean),public.controle_emitir_cupom_pos_venda(uuid,date),public.controle_utilizar_cupom_pos_venda(uuid,date,boolean),public.controle_salvar_venda_v122(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.controle_listar_pos_venda(),public.controle_registrar_pos_venda(uuid,date,smallint,boolean),public.controle_emitir_cupom_pos_venda(uuid,date),public.controle_utilizar_cupom_pos_venda(uuid,date,boolean),public.controle_salvar_venda_v122(uuid,jsonb,jsonb) TO authenticated;
DO $$ DECLARE t text; antes text; depois text; BEGIN
 FOR t,antes IN SELECT tabela,resumo FROM preservacao_122 LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg((to_jsonb(x)-''agendamento_id'')::text,'''' ORDER BY (to_jsonb(x)-''agendamento_id'')::text),'''')) FROM public.%I x',t) INTO depois;
  IF antes IS DISTINCT FROM depois THEN RAISE EXCEPTION 'Preservação falhou na tabela %. Atualização cancelada.',t; END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT 'V12.2.0 ativada. Dados e estoque preservados.' AS resultado;
