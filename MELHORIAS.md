# Finanças K: melhorias implementadas

Data: 28/10/2026. Base: cópia da pasta `Finan-as-K` desta data. O diff completo está em `melhorias.patch`.

## Como aplicar

1. Substitua os arquivos da sua pasta pelos desta pasta (ou aplique `melhorias.patch` com `git apply`).
2. Rode `npm install`: há dependências novas (`@tanstack/react-query`, `compression`, `helmet`, `@fontsource-variable/inter`, `@fontsource/jetbrains-mono`) e `motion` foi removida. Se você usa Bun, rode `bun install` para atualizar o `bun.lock`.
3. Os índices do banco são criados automaticamente na primeira inicialização do servidor (`CREATE INDEX IF NOT EXISTS`). A extensão `pg_trgm` também é criada se o Postgres permitir; se não permitir, o servidor apenas registra um aviso.

## Bugs corrigidos

- **Valor digitado com ponto decimal** (`1234.56`) virava R$ 123.456,00. Agora `1234.56`, `1.234,56` e `1234,56` dão R$ 1.234,56.
- **Tema escuro**: o Tailwind 4 aplicava `dark:` pela preferência do sistema, não pela classe; o botão de tema não mudava as cores. Corrigido com `@custom-variant dark`.
- **Classes inexistentes**: `gray-150/850/750/450/55`, `emerald-150/250`, `amber-250`, `rose-150/750` e as animações `animate-fade-in`, `animate-scale-in`, `animate-slide-down`, `animate-spin-once` e `animate-in` agora existem.
- **Token do Google Drive** saía na URL; agora vai no cabeçalho `X-Google-Token`, e o servidor não aceita mais na URL.
- **Backup no Drive** não inclui mais o código-fonte do app, só os dados.
- **Restauração de backup** no modo "substituir" apagava tudo antes de inserir; uma falha no meio deixava a conta vazia. Agora é tudo ou nada (transação SQL), testado com um backup inválido.
- **Edição de lançamento** permitia mover para uma conta de outro usuário, e etiquetas de outro usuário podiam ser vinculadas. Ambos bloqueados.
- `lang="pt-BR"` no HTML.

## Desempenho

- **Servidor**: saldos das contas calculados no SQL (antes eram todas as transações carregadas no Node); 9 índices; busca com índice trigram; montagem de tags/splits com `Map` (antes era quadrática); saldo corrente restrito às contas da página; contagem e totais numa única consulta; criação/edição/importação com inserção em lote e transação SQL; detecção de duplicados na importação em tempo constante.
- **HTTP**: compressão gzip, cabeçalhos de segurança (`helmet`), cache de 1 ano para `/assets`, limite de 2 MB no corpo das requisições (100 MB só em importação e restauração).
- **Frontend**: cada tela baixa só o que usa (Categorias não baixa mais as transações), com cache de 1 minuto e atualização só do que mudou (TanStack Query). Pré-carregamento ao passar o mouse no menu. Fontes locais em vez do Google Fonts bloqueante. Biblioteca `motion` substituída por CSS. Pacote dividido em blocos com cache longo; o JavaScript inicial caiu de 163 KB para cerca de 135 KB (gzip), e os gráficos (106 KB) só carregam na Previsão.

## Design

- Navegação agrupada (Visão geral, Movimentação, Cadastros, Ferramentas), indicador da tela ativa e busca rápida **Ctrl+K / ⌘K**.
- Barra inferior no celular com Painel, Transações, Agenda, Previsão e Mais.
- Tema **Claro / Escuro / Automático** (segue o sistema), sem "flash" branco ao abrir.
- Painel com faixa "resumo do mês" (entradas, saídas e saldo, com variação contra o mês anterior).
- Números tabulares em todo o app; tamanho mínimo de texto 12 px; tokens de cor semânticos no `@theme`.
- Formulário de lançamento: atalhos **Hoje/Ontem** e **Ctrl+Enter** para salvar.
- Esqueletos de carregamento no lugar de spinners; tela de login renovada.
- Cada tela tem endereço próprio (`#/transactions`), então Voltar, favoritos e recarregar funcionam.

## Acessibilidade (WCAG 2.2 AA)

- Contraste: textos cinza, verdes, vermelhos e âmbar ajustados para no mínimo 4,5:1, inclusive botões verdes com texto branco.
- Modais: foco entra no diálogo, Tab fica preso, fundo fica inerte, Esc fecha e o foco volta ao botão de origem (vale para todos os 10 modais e para o menu lateral no celular).
- Link "Pular para o conteúdo", título da aba por tela, anúncio da troca de tela e foco no título da nova tela.
- Avisos: sucesso/informação usam `status` e somem em 6 s (pausam com mouse ou foco); erros usam `alert` e ficam até serem fechados.
- `prefers-reduced-motion` respeitado.
- Um único `<h1>` por tela; rótulos nos campos que não tinham; erros de formulário ligados aos campos (`aria-invalid`, `aria-describedby`).
- Gráfico da Previsão com descrição textual; tabelas roláveis acessíveis pelo teclado; botões de ícone com área de toque maior.

## Como foi verificado

- `tsc --noEmit` e `npm run build` sem erros.
- 31 verificações da API num Postgres 16 local (saldos, paginação, totais, busca, tags, splits, importação, duplicados, exportação, restauração, rollback, cabeçalhos, compressão, limites).
- Navegador (Chromium): as 11 telas em desktop claro, desktop escuro e celular, sem erros no console; **axe-core sem nenhuma violação WCAG 2.2 AA**; 18 testes de teclado (skip link, modais, Ctrl+K, Voltar, tema, menu no celular).
- O login do Google foi simulado nos testes; vale abrir o app de verdade uma vez e entrar com sua conta.

## O que ficou de fora

- Painel e Relatório ainda calculam a partir da lista completa de transações (agora com cache). Para dezenas de milhares de lançamentos, o próximo passo é criar endpoints de resumo no servidor.
- Sugestão automática de categoria pelo beneficiário e máscara de moeda no campo de valor.
- Política de segurança de conteúdo (CSP) desligada, porque o login do Firebase e o Vite em desenvolvimento precisam dela mais aberta.
