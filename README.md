# Palivo Tattoo — Controle

Aplicação estática conectada ao Supabase para registrar vendas, consumo e entrada de cartuchos.

## Publicar com GitHub + Cloudflare Pages

1. Extraia o ZIP e envie **todos os arquivos e a pasta `assets`** para a raiz de um repositório no GitHub.
2. No Cloudflare, abra **Workers & Pages → Create → Pages → Connect to Git**.
3. Selecione o repositório.
4. Em configuração de build, use:
   - Framework preset: `None`
   - Build command: deixe vazio
   - Build output directory: `/`
5. Clique em **Save and Deploy**.

Não é necessário executar `npm install`: este projeto é HTML, CSS e JavaScript puro.

## Supabase

A URL e a chave publicável já estão configuradas em `app.js`. A chave publicável pode ficar no navegador; a proteção real é feita pelas regras RLS já criadas no Supabase.

Nunca coloque no projeto a senha do banco nem uma chave `service_role`.

## Uso

Entre com o usuário criado em **Supabase → Authentication → Users**. No primeiro acesso, o sistema cadastra os tipos de cartucho padrão. Cadastre compras para aumentar o estoque e informe os cartuchos usados em cada venda para dar baixa automática.
