-- Palivo Controle V13.0.0. Base: V12.2.0 já instalada.
BEGIN;
SET LOCAL lock_timeout='10s';
CREATE TEMP TABLE preservar130(tabela text,resumo text) ON COMMIT DROP;
DO $$ DECLARE t text; r text; BEGIN
 FOREACH t IN ARRAY ARRAY['vendas','controle_agendamentos','controle_clientes','cartuchos','compras_cartuchos','venda_cartuchos','controle_ajustes_estoque','controle_pos_venda','controle_pos_venda_cupons'] LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg((to_jsonb(x)-ARRAY[''credito_parcelas'',''credito_taxa'',''credito_valor_liquido'',''recebimento_data'',''valor_total''])::text,'''' ORDER BY (to_jsonb(x)-ARRAY[''credito_parcelas'',''credito_taxa'',''credito_valor_liquido'',''recebimento_data'',''valor_total''])::text),'''')) FROM public.%I x',t) INTO r;
  INSERT INTO preservar130 VALUES(t,r);
 END LOOP;
END $$;
ALTER TABLE public.controle_agendamentos ADD COLUMN IF NOT EXISTS valor_total numeric(12,2) CHECK(valor_total>=0);
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS credito_parcelas smallint CHECK(credito_parcelas BETWEEN 1 AND 12);
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS credito_taxa numeric(5,2);
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS credito_valor_liquido numeric(12,2);
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS recebimento_data date;
-- Mantém as formas anteriores e permite PIX parcelado em checks exclusivos desse campo.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname,pg_get_expr(conbin,conrelid) expr FROM pg_constraint
 WHERE conrelid='public.vendas'::regclass AND contype='c'
 AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.vendas'::regclass AND attname='forma_pagamento')]::smallint[] LOOP
  IF position('PIX parcelado' IN c.expr)=0 THEN
   EXECUTE format('ALTER TABLE public.vendas DROP CONSTRAINT %I',c.conname);
   EXECUTE format('ALTER TABLE public.vendas ADD CONSTRAINT %I CHECK((%s) OR forma_pagamento=''PIX parcelado'')',c.conname,c.expr);
  END IF;
 END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS public.controle_parcelas_pix(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES auth.users(id),
 venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
 numero smallint NOT NULL CHECK(numero BETWEEN 1 AND 24),valor numeric(12,2) NOT NULL CHECK(valor>0),
 vencimento date NOT NULL,recebido_em date,atualizado_por uuid NOT NULL REFERENCES auth.users(id),
 UNIQUE(venda_id,numero)
);
CREATE INDEX IF NOT EXISTS parcelas_pix_vencimento ON public.controle_parcelas_pix(owner_id,vencimento) WHERE recebido_em IS NULL;
CREATE TABLE IF NOT EXISTS public.controle_locais_estudio(
 owner_id uuid PRIMARY KEY REFERENCES auth.users(id),locais jsonb NOT NULL DEFAULT '{}'::jsonb
);
-- Localizações fornecidas pelo estúdio; não sobrescreve futuras edições.
INSERT INTO public.controle_locais_estudio(owner_id,locais)
 SELECT owner_id,'{"Jacobina": "https://maps.google.com/?q=-11.184110,-40.515932", "Umburanas": "https://maps.google.com/?q=-10.7287961,-41.3241657", "Ourolândia": "https://maps.google.com/?q=-10.9697147,-41.0804711"}'::jsonb FROM public.controle_config
 ON CONFLICT(owner_id) DO NOTHING;
ALTER TABLE public.controle_parcelas_pix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controle_locais_estudio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.controle_parcelas_pix,public.controle_locais_estudio FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.controle_extras_v130()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ctx jsonb:=public.controle_contexto(); dono uuid:=public.controle_owner(); locais jsonb; parcelas jsonb:='[]';
BEGIN
 IF auth.uid() IS NULL OR dono IS NULL OR coalesce(ctx->>'papel','') NOT IN ('admin','colaborador') THEN RAISE EXCEPTION 'Acesso não liberado.' USING ERRCODE='42501'; END IF;
 SELECT l.locais INTO locais FROM public.controle_locais_estudio l WHERE owner_id=dono;
 IF ctx->>'papel'='admin' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.vencimento,p.numero),'[]') INTO parcelas FROM public.controle_parcelas_pix p WHERE owner_id=dono;
 END IF;
 RETURN jsonb_build_object('versao',130,'locais',coalesce(locais,'{}'),'parcelas',parcelas);
END $$;
CREATE OR REPLACE FUNCTION public.controle_salvar_locais_v130(p_locais jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE dono uuid:=public.controle_owner(); k text; v text; limpo jsonb:='{}';
BEGIN
 IF auth.uid() IS NULL OR dono IS NULL OR NOT coalesce(public.controle_admin(),false) THEN RAISE EXCEPTION 'Somente o administrador.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_locais) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Confira as localizações.'; END IF;
 FOREACH k IN ARRAY ARRAY['Jacobina','Umburanas','Ourolândia'] LOOP
  v:=trim(coalesce(p_locais->>k,''));
  IF v<>'' AND (v !~* '^https://[^[:space:]]+$' OR length(v)>2000) THEN RAISE EXCEPTION 'Use links completos com https://.'; END IF;
  limpo:=limpo||jsonb_build_object(k,v);
 END LOOP;
 INSERT INTO public.controle_locais_estudio VALUES(dono,limpo) ON CONFLICT(owner_id) DO UPDATE SET locais=EXCLUDED.locais;
END $$;
CREATE OR REPLACE FUNCTION public.controle_salvar_agendamento_v130(p_id uuid,p_dados jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ctx jsonb:=public.controle_contexto(); dono uuid:=public.controle_owner(); total numeric; sinal numeric;
BEGIN
 IF auth.uid() IS NULL OR dono IS NULL OR coalesce(ctx->>'papel','') NOT IN ('admin','colaborador') THEN RAISE EXCEPTION 'Acesso não liberado.' USING ERRCODE='42501'; END IF;
 total:=nullif(p_dados->>'valor_total','')::numeric;sinal:=CASE WHEN coalesce((p_dados->>'sinal_pago')::boolean,false) THEN coalesce((p_dados->>'sinal_valor')::numeric,0) ELSE 0 END;
 IF total IS NOT NULL AND (total::text IN ('NaN','Infinity','-Infinity') OR total<0 OR total<>round(total,2) OR sinal>total) THEN RAISE EXCEPTION 'Confira o valor combinado e o sinal.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(dono::text,0));
 PERFORM public.controle_salvar_agendamento(p_id,p_dados);
 IF p_dados ? 'valor_total' THEN UPDATE public.controle_agendamentos SET valor_total=total WHERE id=p_id; END IF;
 RETURN p_id;
END $$;
-- Convite simbólico: novos registros não precisam de código.
ALTER TABLE public.controle_pos_venda_cupons ALTER COLUMN codigo DROP NOT NULL;
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.controle_pos_venda_cupons'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%expira_em%emitido_em%' LOOP
  EXECUTE format('ALTER TABLE public.controle_pos_venda_cupons DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.controle_emitir_cupom_pos_venda(p_cliente uuid,p_data date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ctx jsonb:=public.controle_contexto(); dono uuid:=public.controle_owner(); hoje date:=(current_timestamp AT TIME ZONE 'America/Bahia')::date; c public.controle_pos_venda_cupons;
BEGIN
 IF auth.uid() IS NULL OR dono IS NULL OR coalesce(ctx->>'papel','') NOT IN ('admin','colaborador') THEN RAISE EXCEPTION 'Acesso não liberado.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(dono::text,0));
 IF p_cliente IS NULL OR p_data IS NULL OR NOT EXISTS(SELECT 1 FROM public.vendas v JOIN public.controle_clientes cl ON cl.id=v.cliente_id AND cl.owner_id=dono WHERE v.user_id=dono AND v.cliente_id=p_cliente AND v.data_atendimento=p_data) THEN RAISE EXCEPTION 'Atendimento não encontrado.'; END IF;
 IF (SELECT count(*) FROM public.controle_pos_venda WHERE owner_id=dono AND cliente_id=p_cliente AND data_atendimento=p_data AND etapa IN(5,15) AND realizado)<>2 THEN RAISE EXCEPTION 'Conclua os dois contatos.'; END IF;
 SELECT * INTO c FROM public.controle_pos_venda_cupons WHERE owner_id=dono AND cliente_id=p_cliente AND data_atendimento=p_data;
 IF NOT FOUND THEN
  IF hoje-p_data NOT BETWEEN 15 AND 60 THEN RAISE EXCEPTION 'Prazo do retorno encerrado.'; END IF;
  INSERT INTO public.controle_pos_venda_cupons(owner_id,cliente_id,data_atendimento,codigo,emitido_em,expira_em,atualizado_por) VALUES(dono,p_cliente,p_data,NULL,hoje,p_data+60,auth.uid()) RETURNING * INTO c;
 END IF;
 RETURN jsonb_build_object('codigo',NULL,'emitido_em',c.emitido_em,'expira_em',c.expira_em,'utilizado',c.utilizado);
END $$;
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.controle_listar_pos_venda()'::regprocedure);
 d:=replace(d,'WHEN u.codigo IS NULL','WHEN u.cliente_id IS NULL');
 d:=replace(d,'''versao'',122','''versao'',130');
 EXECUTE d;
END $$;
-- Guarda a implementação anterior uma vez; o wrapper libera o convite no 2º contato.
DO $$ DECLARE d text; BEGIN
 IF to_regprocedure('public.controle_registrar_pos_venda_base130(uuid,date,smallint,boolean)') IS NULL THEN
  d:=pg_get_functiondef('public.controle_registrar_pos_venda(uuid,date,smallint,boolean)'::regprocedure);
  EXECUTE replace(d,'public.controle_registrar_pos_venda(','public.controle_registrar_pos_venda_base130(');
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.controle_registrar_pos_venda_base130(uuid,date,smallint,boolean) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.controle_registrar_pos_venda(p_cliente uuid,p_data date,p_etapa smallint,p_realizado boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.controle_registrar_pos_venda_base130(p_cliente,p_data,p_etapa,p_realizado);
 IF p_etapa=15 AND p_realizado THEN PERFORM public.controle_emitir_cupom_pos_venda(p_cliente,p_data); END IF;
END $$;
CREATE OR REPLACE FUNCTION public.controle_salvar_venda_v130(p_id uuid,p_dados jsonb,p_materiais jsonb,p_parcelas jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 dono uuid:=public.controle_owner(); metodo text:=p_dados->>'forma_pagamento'; total numeric:=(p_dados->>'valor')::numeric;
 credito numeric:=0; n integer; taxa numeric; liquido numeric; recebido date; r uuid; p jsonb; soma numeric:=0; i integer:=0; venc date; anterior date; v numeric; pagos boolean; plano jsonb;
 taxas numeric[]:=ARRAY[3.09,5.79,6.09,7.99,8.09,8.19,9.49,9.68,10.37,11.05,12.27,12.38];
BEGIN
 IF auth.uid() IS NULL OR dono IS NULL OR NOT coalesce(public.controle_admin(),false) THEN RAISE EXCEPTION 'Somente o administrador pode registrar vendas.' USING ERRCODE='42501'; END IF;
 IF total IS NULL OR total::text IN ('NaN','Infinity','-Infinity') OR total<0 OR total<>round(total,2) THEN RAISE EXCEPTION 'Confira o valor da venda.'; END IF;
 IF jsonb_typeof(p_parcelas) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Confira as parcelas PIX.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(dono::text,0));
 SELECT EXISTS(SELECT 1 FROM public.controle_parcelas_pix WHERE venda_id=p_id AND owner_id=dono AND recebido_em IS NOT NULL) INTO pagos;
 IF metodo='PIX parcelado' THEN
  IF jsonb_array_length(p_parcelas) NOT BETWEEN 1 AND 24 THEN RAISE EXCEPTION 'Use de 1 a 24 parcelas PIX.'; END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(p_parcelas) LOOP
   i:=i+1;v:=(p->>'valor')::numeric;venc:=(p->>'vencimento')::date;
   IF (p->>'numero')::int IS DISTINCT FROM i OR v IS NULL OR v::text IN ('NaN','Infinity','-Infinity') OR v<=0 OR v<>round(v,2) OR venc IS NULL OR (anterior IS NOT NULL AND venc<=anterior) THEN RAISE EXCEPTION 'Confira a ordem, os valores e os vencimentos das parcelas.'; END IF;
   soma:=soma+v;anterior:=venc;
  END LOOP;
  IF soma<>total THEN RAISE EXCEPTION 'A soma das parcelas precisa ser igual ao valor da venda.'; END IF;
 ELSIF jsonb_array_length(p_parcelas)>0 THEN RAISE EXCEPTION 'Parcelas PIX só se aplicam ao PIX parcelado.';
 END IF;
 IF pagos THEN
  SELECT jsonb_agg(jsonb_build_object('numero',numero,'valor',valor,'vencimento',vencimento) ORDER BY numero) INTO plano FROM public.controle_parcelas_pix WHERE venda_id=p_id AND owner_id=dono;
  IF metodo<>'PIX parcelado' OR plano IS DISTINCT FROM p_parcelas THEN RAISE EXCEPTION 'Esta venda já possui parcelas pagas. Reabra os recebimentos antes de alterar o plano.'; END IF;
 END IF;
 IF metodo='Cartão de crédito' THEN credito:=total;
 ELSIF metodo='Misto' THEN SELECT coalesce(sum((x->>'valor')::numeric),0) INTO credito FROM jsonb_array_elements(p_dados->'pagamentos') x WHERE x->>'forma'='Cartão de crédito'; END IF;
 IF credito>0 THEN
  n:=(p_dados->>'credito_parcelas')::integer;
  IF n IS NULL OR n NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Informe de 1 a 12 parcelas no cartão.'; END IF;
  taxa:=taxas[n];liquido:=credito-round(credito*taxa/100,2);recebido:=(p_dados->>'recebimento_data')::date;
  IF recebido IS NULL THEN RAISE EXCEPTION 'Informe a data de recebimento do cartão.'; END IF;
 END IF;
 -- A função existente grava a venda e o material uma única vez.
 r:=public.controle_salvar_venda_v122(p_id,CASE WHEN metodo='PIX parcelado' THEN p_dados||jsonb_build_object('forma_pagamento','PIX') ELSE p_dados END,p_materiais);
 UPDATE public.vendas SET forma_pagamento=metodo,credito_parcelas=n,credito_taxa=taxa,credito_valor_liquido=liquido,recebimento_data=recebido WHERE id=r AND user_id=dono;
 IF NOT pagos THEN
  DELETE FROM public.controle_parcelas_pix WHERE venda_id=r AND owner_id=dono;
  IF metodo='PIX parcelado' THEN
   INSERT INTO public.controle_parcelas_pix(owner_id,venda_id,numero,valor,vencimento,atualizado_por)
   SELECT dono,r,(x->>'numero')::smallint,(x->>'valor')::numeric,(x->>'vencimento')::date,auth.uid() FROM jsonb_array_elements(p_parcelas) x;
  END IF;
 END IF;
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.controle_receber_parcela_pix(p_id uuid,p_data date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE dono uuid:=public.controle_owner(); hoje date:=(current_timestamp AT TIME ZONE 'America/Bahia')::date;
BEGIN
 IF auth.uid() IS NULL OR dono IS NULL OR NOT coalesce(public.controle_admin(),false) THEN RAISE EXCEPTION 'Somente o administrador.' USING ERRCODE='42501'; END IF;
 IF p_data>hoje OR p_data<date '1900-01-01' THEN RAISE EXCEPTION 'Confira a data do recebimento.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(dono::text,0));
 UPDATE public.controle_parcelas_pix p SET recebido_em=p_data,atualizado_por=auth.uid() WHERE p.id=p_id AND p.owner_id=dono AND EXISTS(SELECT 1 FROM public.vendas v WHERE v.id=p.venda_id AND v.user_id=dono AND v.forma_pagamento='PIX parcelado');
 IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.controle_extras_v130(),public.controle_salvar_locais_v130(jsonb),public.controle_salvar_agendamento_v130(uuid,jsonb),public.controle_emitir_cupom_pos_venda(uuid,date),public.controle_registrar_pos_venda(uuid,date,smallint,boolean),public.controle_salvar_venda_v130(uuid,jsonb,jsonb,jsonb),public.controle_receber_parcela_pix(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.controle_extras_v130(),public.controle_salvar_locais_v130(jsonb),public.controle_salvar_agendamento_v130(uuid,jsonb),public.controle_emitir_cupom_pos_venda(uuid,date),public.controle_registrar_pos_venda(uuid,date,smallint,boolean),public.controle_salvar_venda_v130(uuid,jsonb,jsonb,jsonb),public.controle_receber_parcela_pix(uuid,date) TO authenticated;
DO $$ DECLARE t text; a text; b text; BEGIN
 FOR t,a IN SELECT tabela,resumo FROM preservar130 LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg((to_jsonb(x)-ARRAY[''credito_parcelas'',''credito_taxa'',''credito_valor_liquido'',''recebimento_data'',''valor_total''])::text,'''' ORDER BY (to_jsonb(x)-ARRAY[''credito_parcelas'',''credito_taxa'',''credito_valor_liquido'',''recebimento_data'',''valor_total''])::text),'''')) FROM public.%I x',t) INTO b;
  IF a IS DISTINCT FROM b THEN RAISE EXCEPTION 'Preservação falhou em %. Atualização cancelada.',t; END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT 'V13.0.0 ativada. Vendas e estoque preservados.' AS resultado;
