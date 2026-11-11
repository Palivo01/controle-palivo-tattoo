-- Palivo Controle V11.8. Execute uma vez no SQL Editor.
-- Não apaga nem altera vendas, entradas, consumos ou cartuchos existentes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.controle_ajustes_estoque (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES auth.users(id),
 cartucho_id uuid NOT NULL REFERENCES public.cartuchos(id),
 saldo_antes bigint NOT NULL,
 contagem_fisica integer NOT NULL CHECK (contagem_fisica BETWEEN 0 AND 1000000),
 diferenca bigint NOT NULL,
 motivo text NOT NULL CHECK (length(trim(motivo)) BETWEEN 3 AND 500),
 criado_por uuid NOT NULL REFERENCES auth.users(id),
 responsavel text NOT NULL,
 criado_em timestamptz NOT NULL DEFAULT now(),
 CHECK (diferenca = contagem_fisica::bigint - saldo_antes)
);
ALTER TABLE public.controle_ajustes_estoque ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.controle_ajustes_estoque FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.controle_ajustes_estoque TO authenticated;
DROP POLICY IF EXISTS controle_ajustes_admin ON public.controle_ajustes_estoque;
CREATE POLICY controle_ajustes_admin ON public.controle_ajustes_estoque FOR SELECT TO authenticated
 USING (coalesce(public.controle_admin(),false) AND owner_id=public.controle_owner());
CREATE INDEX IF NOT EXISTS controle_ajustes_cartucho_idx ON public.controle_ajustes_estoque(owner_id,cartucho_id);

CREATE OR REPLACE FUNCTION public.controle_ajustar_estoque(p_id uuid,p_cartucho uuid,p_contagem integer,p_saldo_esperado bigint,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE dono uuid:=public.controle_owner(); c public.cartuchos; atual bigint; anterior public.controle_ajustes_estoque; resultado public.controle_ajustes_estoque;
BEGIN
 IF NOT coalesce(public.controle_admin(),false) OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Somente o administrador pode corrigir o estoque.' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_cartucho IS NULL OR p_contagem IS NULL OR p_contagem<0 OR p_contagem>1000000 OR p_saldo_esperado IS NULL OR p_motivo IS NULL OR length(trim(p_motivo)) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Confira a contagem e o motivo do ajuste.'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(dono::text,0));
 -- Impede que entradas, vendas e consumos mudem durante a conferência.
 LOCK TABLE public.cartuchos,public.compras_cartuchos,public.venda_cartuchos IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO anterior FROM public.controle_ajustes_estoque WHERE id=p_id;
 IF FOUND THEN
  IF anterior.owner_id=dono AND anterior.cartucho_id=p_cartucho AND anterior.contagem_fisica=p_contagem AND anterior.saldo_antes=p_saldo_esperado AND anterior.motivo=trim(p_motivo) THEN RETURN to_jsonb(anterior); END IF;
  RAISE EXCEPTION 'Identificador de ajuste já utilizado.';
 END IF;
 SELECT * INTO c FROM public.cartuchos WHERE id=p_cartucho AND user_id=dono FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cartucho não encontrado.'; END IF;
 IF upper(regexp_replace(c.nome,'\s','','g')) IN ('7RM','7RS') THEN RAISE EXCEPTION 'Este tipo foi retirado das opções de uso.'; END IF;
 atual:=coalesce(c.estoque_inicial,0)::bigint
  +coalesce((SELECT sum(quantidade) FROM public.compras_cartuchos WHERE cartucho_id=p_cartucho AND user_id=dono),0)
  -coalesce((SELECT sum(quantidade) FROM public.venda_cartuchos WHERE cartucho_id=p_cartucho AND user_id=dono),0)
  +coalesce((SELECT sum(diferenca) FROM public.controle_ajustes_estoque WHERE cartucho_id=p_cartucho AND owner_id=dono),0);
 IF atual<>p_saldo_esperado THEN RAISE EXCEPTION 'O estoque mudou desde a abertura. Atualize os dados e confira novamente.' USING ERRCODE='40001'; END IF;
 INSERT INTO public.controle_ajustes_estoque(id,owner_id,cartucho_id,saldo_antes,contagem_fisica,diferenca,motivo,criado_por,responsavel)
 VALUES(p_id,dono,p_cartucho,atual,p_contagem,p_contagem::bigint-atual,trim(p_motivo),auth.uid(),coalesce(public.controle_contexto()->>'nome','Administrador')) RETURNING * INTO resultado;
 RETURN to_jsonb(resultado);
END $$;
REVOKE ALL ON FUNCTION public.controle_ajustar_estoque(uuid,uuid,integer,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.controle_ajustar_estoque(uuid,uuid,integer,bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.controle_criar_cartucho(p_id uuid,p_nome text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE dono uuid:=public.controle_owner(); nome_limpo text:=upper(regexp_replace(trim(p_nome),'\s','','g')); existente public.cartuchos;
BEGIN
 IF NOT coalesce(public.controle_admin(),false) OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Somente o administrador pode cadastrar cartuchos.' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR nome_limpo IS NULL OR nome_limpo !~ '^[1-9][0-9]{0,2}(RL|RM|RS)$' OR nome_limpo IN ('7RM','7RS') THEN RAISE EXCEPTION 'Informe um tipo válido, como 3RL, 9RS ou 15RM.'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(dono::text,0));
 SELECT * INTO existente FROM public.cartuchos WHERE id=p_id;
 IF FOUND THEN
  IF existente.user_id=dono AND existente.nome=nome_limpo THEN RETURN p_id; END IF;
  RAISE EXCEPTION 'Identificador de cartucho já utilizado.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.cartuchos WHERE user_id=dono AND upper(regexp_replace(nome,'\s','','g'))=nome_limpo) THEN RAISE EXCEPTION 'Este tipo de cartucho já está cadastrado.'; END IF;
 INSERT INTO public.cartuchos(id,user_id,nome,estoque_inicial,estoque_minimo) VALUES(p_id,dono,nome_limpo,0,0);
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.controle_criar_cartucho(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.controle_criar_cartucho(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT 'V11.8 pronta. Nenhum registro anterior foi apagado ou recontado.' AS resultado;
