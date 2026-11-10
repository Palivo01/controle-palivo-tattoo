-- V11.6: divisão de pagamento, preservando vendas, estoque e cadastros.
BEGIN;
SET LOCAL lock_timeout='10s';
LOCK TABLE public.vendas IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE vendas_116_antes ON COMMIT DROP AS SELECT id,to_jsonb(v)-'pagamentos' dados FROM public.vendas v;
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS pagamentos jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE OR REPLACE FUNCTION public.controle_validar_pagamentos() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p jsonb; soma numeric:=0; v numeric; formas text[]:='{}';
BEGIN
 IF NEW.forma_pagamento<>'Misto' THEN NEW.pagamentos:='[]'::jsonb;RETURN NEW;END IF;
 IF jsonb_typeof(NEW.pagamentos) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.pagamentos)<>2 THEN RAISE EXCEPTION 'O pagamento misto precisa de duas parcelas.';END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(NEW.pagamentos) LOOP
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'forma' IS NULL OR p->>'forma' NOT IN ('PIX','Dinheiro','Cartão de débito','Cartão de crédito') OR jsonb_typeof(p->'valor') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Selecione duas formas de pagamento válidas e informe seus valores.'; END IF;
  v:=(p->>'valor')::numeric;
  IF v::text IN ('NaN','Infinity','-Infinity') OR v<=0 OR v<>round(v,2) THEN RAISE EXCEPTION 'Cada parcela deve ter um valor positivo, com até duas casas decimais.'; END IF;
  IF p->>'forma'=ANY(formas) THEN RAISE EXCEPTION 'Escolha duas formas de pagamento diferentes.'; END IF;
  formas:=array_append(formas,p->>'forma');soma:=soma+v;
 END LOOP;
 IF NEW.valor IS NULL OR soma<>NEW.valor THEN RAISE EXCEPTION 'A soma das duas parcelas deve ser igual ao valor da venda.'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.controle_validar_pagamentos() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS controle_validar_pagamentos ON public.vendas;
CREATE TRIGGER controle_validar_pagamentos BEFORE INSERT OR UPDATE ON public.vendas FOR EACH ROW EXECUTE FUNCTION public.controle_validar_pagamentos();
CREATE OR REPLACE FUNCTION public.controle_salvar_venda(p_id uuid, p_dados jsonb, p_materiais jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 dono uuid := public.controle_owner();
 c public.controle_clientes;
 r public.vendas;
 m record;
 est text[];
BEGIN
 IF NOT coalesce(public.controle_admin(), false) THEN
 RAISE EXCEPTION
 'Somente o administrador pode registrar vendas.'
 USING ERRCODE = '42501';
 END IF;

 IF p_id IS NULL THEN
 RAISE EXCEPTION 'Identificador da venda ausente.';
 END IF;

 SELECT * INTO c
 FROM public.controle_clientes
 WHERE id = (p_dados->>'cliente_id')::uuid
 AND owner_id = dono;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'Selecione um cliente cadastrado.';
 END IF;

 SELECT coalesce(array_agg(x), '{}') INTO est
 FROM jsonb_array_elements_text(p_dados->'estilos') x;

 IF NOT public.controle_estilos_validos(est) THEN
 RAISE EXCEPTION 'Estilos inválidos.';
 END IF;

 IF jsonb_typeof(p_materiais) IS DISTINCT FROM 'array' THEN
 RAISE EXCEPTION 'Materiais inválidos.';
 END IF;

 r := jsonb_populate_record(
 NULL::public.vendas,
 p_dados || jsonb_build_object(
 'id', p_id,
 'user_id', dono,
 'cliente', c.nome,
 'genero', c.genero,
 'estilos', to_jsonb(est)
 )
 );

 IF r.valor IS NULL
 OR r.valor::text IN ('NaN', 'Infinity', '-Infinity')
 OR r.valor < 0
 OR r.duracao_minutos IS NULL
 OR r.duracao_minutos < 0
 OR r.duracao_minutos > 1440
 OR r.data_atendimento IS NULL
 OR r.cidade IS NULL
 OR length(trim(r.cidade)) = 0
 OR r.forma_pagamento IS NULL
 OR r.forma_pagamento NOT IN (
 'PIX', 'Dinheiro', 'Cartão de débito',
 'Cartão de crédito', 'Permuta', 'Cortesia', 'Retoque', 'Misto'
 ) THEN
 RAISE EXCEPTION
 'Confira valor, duração, cidade, data e pagamento.';
 END IF;

 PERFORM pg_advisory_xact_lock(
 hashtextextended(dono::text, 0)
 );

 IF EXISTS (
 SELECT 1
 FROM public.vendas
 WHERE id = p_id AND user_id <> dono
 ) THEN
 RAISE EXCEPTION 'Venda não autorizada.'
 USING ERRCODE = '42501';
 END IF;

 INSERT INTO public.vendas (
 id, user_id, data_atendimento, cliente, cliente_id,
 genero, cidade, valor, forma_pagamento,
 duracao_minutos, observacoes, estilos, nf_emitida, pagamentos
 )
 VALUES (
 p_id,
 dono,
 r.data_atendimento,
 r.cliente,
 c.id,
 r.genero,
 r.cidade,
 r.valor,
 r.forma_pagamento,
 r.duracao_minutos,
 r.observacoes,
 est,
 coalesce(
 (p_dados->>'nf_emitida')::boolean,
 (
 SELECT nf_emitida
 FROM public.vendas
 WHERE id = p_id AND user_id = dono
 ),
 false
 ),
 coalesce(r.pagamentos,'[]'::jsonb)
 )
 ON CONFLICT (id) DO UPDATE SET
 data_atendimento = EXCLUDED.data_atendimento,
 cliente = EXCLUDED.cliente,
 cliente_id = EXCLUDED.cliente_id,
 genero = EXCLUDED.genero,
 cidade = EXCLUDED.cidade,
 valor = EXCLUDED.valor,
 forma_pagamento = EXCLUDED.forma_pagamento,
 duracao_minutos = EXCLUDED.duracao_minutos,
 observacoes = EXCLUDED.observacoes,
 estilos = EXCLUDED.estilos,
 nf_emitida = EXCLUDED.nf_emitida,
 pagamentos = EXCLUDED.pagamentos;

 DELETE FROM public.venda_cartuchos
 WHERE venda_id = p_id AND user_id = dono;

 FOR m IN
 SELECT
 (x->>'cartucho_id')::uuid AS cartucho_id,
 (x->>'quantidade')::integer AS quantidade
 FROM jsonb_array_elements(p_materiais) x
 LOOP
 IF m.quantidade IS NULL
 OR m.quantidade < 1
 OR NOT EXISTS (
 SELECT 1
 FROM public.cartuchos
 WHERE id = m.cartucho_id AND user_id = dono
 ) THEN
 RAISE EXCEPTION 'Cartucho ou quantidade inválidos.';
 END IF;

 INSERT INTO public.venda_cartuchos (
 user_id, venda_id, cartucho_id, quantidade
 )
 VALUES (
 dono, p_id, m.cartucho_id, m.quantidade
 );
 END LOOP;

 RETURN p_id;
END $function$
;

DO $migration$
DECLARE source text; guard text := $guard$
 IF (p_dados->>'mensagem_enviada')::boolean IS TRUE AND NOT EXISTS(
 SELECT 1 FROM public.controle_clientes WHERE id=p_cliente AND owner_id=public.controle_owner()
 AND extract(month from data_nascimento)=extract(month from current_timestamp AT TIME ZONE 'America/Bahia')
 ) THEN RAISE EXCEPTION 'A mensagem de aniversário só está disponível no mês de aniversário do cliente.'; END IF;
$guard$;
BEGIN
 source:=pg_get_functiondef('public.controle_salvar_aniversario(uuid,integer,jsonb)'::regprocedure);
 IF position('A mensagem de aniversário só está disponível' in source)=0 THEN
   IF source !~* 'BEGIN' THEN RAISE EXCEPTION 'Função de aniversário não reconhecida.'; END IF;
   source:=regexp_replace(source,'BEGIN', 'BEGIN'||guard,'i');
   EXECUTE source;
 END IF;
END $migration$;
DO $$ BEGIN
 IF EXISTS((SELECT * FROM vendas_116_antes EXCEPT SELECT id,to_jsonb(v)-'pagamentos' FROM public.vendas v)
 UNION ALL(SELECT id,to_jsonb(v)-'pagamentos' FROM public.vendas v EXCEPT SELECT * FROM vendas_116_antes)) THEN RAISE EXCEPTION 'A conferência das vendas falhou. Atualização cancelada.'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT 'V11.6 ativada. Vendas anteriores preservadas.' AS resultado;
