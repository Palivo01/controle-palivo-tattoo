-- Complemento da V11.8: excluir tipos de cartucho.
BEGIN;
ALTER TABLE public.cartuchos
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.controle_excluir_cartucho(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  dono uuid := public.controle_owner();
  c public.cartuchos;
BEGIN
  IF NOT coalesce(public.controle_admin(), false)
     OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Somente o administrador pode excluir tipos de cartucho.'
      USING ERRCODE = '42501';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o tipo de cartucho.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(dono::text, 0)
  );
  LOCK TABLE public.cartuchos, public.compras_cartuchos,
    public.venda_cartuchos IN SHARE ROW EXCLUSIVE MODE;

  SELECT * INTO c
  FROM public.cartuchos
  WHERE id = p_id AND user_id = dono
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'Tipo não encontrado ou já excluído.';
  END IF;

  IF coalesce(c.estoque_inicial, 0) <> 0
     OR EXISTS (
       SELECT 1 FROM public.compras_cartuchos
       WHERE cartucho_id = p_id
     )
     OR EXISTS (
       SELECT 1 FROM public.venda_cartuchos
       WHERE cartucho_id = p_id
     )
     OR EXISTS (
       SELECT 1 FROM public.controle_ajustes_estoque
       WHERE cartucho_id = p_id
     ) THEN
    UPDATE public.cartuchos SET ativo = false
    WHERE id = p_id AND user_id = dono;
    RETURN 'Tipo retirado das opções. Histórico preservado.';
  END IF;

  DELETE FROM public.cartuchos
  WHERE id = p_id AND user_id = dono;
  RETURN 'Tipo sem movimentações excluído.';
END;
$$;

REVOKE ALL ON FUNCTION public.controle_excluir_cartucho(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.controle_excluir_cartucho(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT 'Exclusão de tipos habilitada.' AS resultado;
