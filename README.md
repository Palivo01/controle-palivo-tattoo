# Palivo Tattoo Controle V13.0.0

Aplicação estática conectada ao Supabase. Esta entrega não foi publicada nem executada no banco real.

## Instalação

1. A base necessária é V12.2.0, com o pós-venda já ativado.
2. Abra o projeto Supabase do Controle, SQL Editor, nova consulta. Cole TODO o conteúdo de ATUALIZAR-SUPABASE-V13.0.0.sql e execute.
3. Aguarde: V13.0.0 ativada. Vendas e estoque preservados.
4. Extraia o ZIP e envie seu conteúdo à raiz do repositório controle-palivo-tattoo, substituindo os arquivos. Preserve a pasta assets. Não envie ao repositório do site institucional.
5. Aguarde a hospedagem publicar e confira V13.0.0 no topo do Controle.

Não há npm install ou etapa de compilação. O upload no GitHub não executa SQL.

## Relatórios

Vendas > Exportar > mês > CSV / Excel ou PDF / impressão. O PDF utiliza a janela de impressão, onde pode escolher Salvar como PDF.
Faturamento bruto é calculado pela data do atendimento. Recebido líquido usa a data de recebimento e pode incluir parcelas de vendas de meses anteriores.
O relatório mensal geral não herda os filtros do painel.

## Recebimentos

PIX parcelado: informe o valor total da venda, a quantidade de parcelas e o primeiro vencimento. Confira e ajuste cada vencimento antes de salvar. A soma é conferida em centavos. O exemplo de dia 31 vai ao último dia disponível em meses mais curtos e retorna ao dia 31 no mês seguinte.
A venda inteira entra no faturamento bruto. Somente parcelas marcadas como pagas entram no recebido líquido.
No ícone de carteira, aparecem parcelas vencidas e as do mês, além de filtros de abertas/pagas. O indicador conta parcelas já vencidas ou vencendo hoje. É um aviso dentro do sistema; não envia cobrança sozinho.
O botão de WhatsApp prepara a cobrança. Ao receber, marque Receber e informe a data real. É possível reabrir um recebimento registrado por engano.
Uma venda com parcelas pagas exige reabrir os recebimentos antes de alterar o plano. Editar ou marcar uma parcela paga não duplica valores.

Cartão de crédito: abra Detalhes do cartão, escolha de 1 a 12 parcelas e confira a data de recebimento. As taxas cadastradas são as fornecidas pelo estúdio: 3,09%; 5,79%; 6,09%; 7,99%; 8,09%; 8,19%; 9,49%; 9,68%; 10,37%; 11,05%; 12,27%; 12,38%.
Em pagamento misto, a taxa incide apenas sobre a parte de crédito. A parte de PIX/dinheiro é recebida na data da venda. A parte de crédito usa a data informada nos detalhes.
O valor recebido do cartão é reconhecido na data cadastrada, nunca antes de ela chegar. Se a operadora mudar a data, atualize o registro.
O recebido líquido desconta taxas de cartão, não despesas do estúdio. Vendas antigas de cartão sem parcelamento informado não recebem uma taxa presumida; edite essas vendas para incluí-las no cálculo.
O sinal continua informativo e não é somado novamente ao financeiro.

## Agendamento e mensagens

Após um novo agendamento, abre a confirmação para revisar e enviar. Não há envio automático.
Informe Valor combinado para a mensagem calcular o restante na sessão, descontando apenas sinal marcado como pago. Sem valor combinado, a mensagem informa que o valor está a combinar.
O ícone do WhatsApp reúne Confirmar agendamento, Lembrar horário, Lembrar sinal (quando pendente) e Falar no WhatsApp.
A localização usa a cidade do atendimento, não a residência do cliente. As três localizações fornecidas estão pré-configuradas com links compactos do Google Maps por coordenadas. No ícone de localização, podem ser editadas.

## Pós-venda

Mantém primeiro contato a partir de 5 dias e segundo a partir de 15, com limite de 30 dias para acompanhamento.
A segunda mensagem já inclui o convite de 20% para uma nova tattoo até 60 dias depois da data do atendimento. Contato no dia 15 deixa 45 dias para retornar. Se o contato acontecer mais tarde, a data final não é prorrogada.
Ao registrar o segundo contato, o convite fica salvo. Não há código aleatório nos novos convites nem na mensagem.
A seção recolhida de retornos permite consultar a data e marcar utilização. Convites que já tinham sido emitidos na versão anterior conservam seu vencimento original.

## Privacidade e estoque

O olho no topo oculta valores e gráficos financeiros na tela. A preferência fica nesse navegador. Não altera dados, exportações nem mensagens preparadas para clientes.
O cartão de Conferência de estoque foi retirado. Correção de saldo, movimentações e exclusão de tipos continuam disponíveis ao abrir cada cartucho. A atualização não adiciona compras, consumos ou saldos.
Iuri mantém o acesso à agenda/clientes/pós-venda. Não recebe parcelas PIX, taxas ou faturamento.

## Validação

Testes em PostgreSQL isolado (PGlite), cobrindo reaplicação, preservação de registros, permissões, 12 taxas de cartão, misto, parcelas PIX, recebimento, retorno e estoque.
Testes em DOM simulado cobrindo formulários, relatórios, máscara financeira, links e mensagens. JavaScript validado sintaticamente.
Não foram usados dados de produção, enviados WhatsApps ou feitas publicações. Não houve inspeção visual completa em navegador.
