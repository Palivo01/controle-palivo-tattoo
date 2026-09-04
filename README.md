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

Os cartuchos aparecem organizados pelas famílias RL, RM e RS, sempre em ordem numérica. Vendas marcadas como Permuta, Cortesia ou Retoque permanecem no histórico de atendimentos, mas não entram no faturamento nem no ticket médio. A opção Transferência não faz parte das formas de pagamento disponíveis.

Todos os cartuchos começam com saldo zero. O saldo é calculado pelas entradas registradas menos o consumo nas vendas, sem permitir valor negativo. Entradas lançadas por engano podem ser excluídas no histórico, e o saldo é recalculado imediatamente. Os alertas de estoque são: Excelente (20 ou mais), Disponível (10–19), Pouco (5–9), Acabando (1–4) e Não há (zero).

O registro de entrada de estoque solicita somente data, cartucho e quantidade.

O painel inclui distribuição geral por gênero, com Mulher em rosa e Homem em azul. A duração do atendimento é preenchida em campos separados de horas e minutos para funcionar corretamente no teclado numérico de celulares.

O gráfico mensal exibe o faturamento acima de cada barra e usa alturas proporcionais. A distribuição por cidade usa degradês próprios para Jacobina (verde), Umburanas (azul) e Ourolândia (amarelo). A área de formas de pagamento mostra percentual e quantidade de pagamentos em um painel mais compacto.
