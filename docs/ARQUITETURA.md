# Arquitetura

Como as peças conversam, e por quê. O objetivo é que você consiga mudar uma
parte sem quebrar três.

```
┌─────────────────────────────────────────────────────────┐
│  WebView (APK) / navegador                              │
│                                                         │
│  screens/  ──►  db/repo.ts  ──►  Dexie (IndexedDB)       │
│     │              ▲                                    │
│     │              │                                    │
│     ▼              │                                    │
│  ui/  ◄────────────┘  (useLiveQuery reativo)            │
│                                                         │
│  lib/jarvis/ ──► provedor de IA (HTTP, chave do usuário) │
│     │                                                   │
│     └──► local notifications (Android)                  │
└─────────────────────────────────────────────────────────┘
```

Sem servidor. Sem conta. A única saída de rede é a chamada ao provedor de IA.

## Camadas

### `db/db.ts` — schema

Dexie sobre IndexedDB. O schema tem **versões numeradas** (`v1`…`v5`), e cada
uma só **adiciona** tabela, índice ou campo. Nada é renomeado nem removido: quem
já tem dados atualiza o APK e continua com tudo.

O banco se chama `urdume-publico`. Esse nome é deliberadamente próprio — o app
original usa outro. Dois apps com o mesmo nome de banco na mesma origem leem as
mesmas tarefas.

### `db/repo.ts` — repositório

Toda leitura e escrita passa por aqui. As telas não tocam o Dexie direto.

- **Exclusão é suave** (`deletedAt`), nunca física. Isso permite desfazer e é o
  que permite que "apagar" seja uma escrita com carimbo, não um buraco.
- **`updatedAt` em tudo** que muda. É o que ordena e o que diria quem venceu, se
  um dia houver sincronização.
- **Hooks reativos** (`useTasks`, `useProject`) com `useLiveQuery`: criar ou
  concluir atualiza a tela sem sair e voltar.

### `lib/jarvis/` — o assistente

Separado em etapas, cada uma testável sozinha:

| Arquivo | Papel |
| --- | --- |
| `leitura.ts` | Lê o banco e monta um **retrato** do estado atual |
| `sinais.ts` | Regras puras: hábito quebrado, projeto parado, prazo apertado… |
| `relevancia.ts` | Decide o que merece interromper e o que fica no painel |
| `resumo.ts` | Monta o texto que vai ao modelo (só o necessário) |
| `ia.ts` | Chama o provedor e interpreta a resposta |
| `provedores.ts` | Os três dialetos (OpenAI, Gemini, Anthropic) |
| `executor.ts` | Transforma a proposta em ação, com prévia e desfazer |
| `autonomia.ts` | O que pode rodar sem perguntar (por nível) |
| `segundo-plano.ts` | Grava retrato e agenda para o app fechado |

**Princípio:** o modelo é fonte não confiável. Ele devolve JSON; o app valida
campo a campo, recusa o que não conhece e pede confirmação. Nada do que o
modelo escreve é executado como código.

### `screens/` e `ui/`

Uma tela por rota (`app/router.tsx`), componentes compartilhados em `ui/`.
CSS por área em `styles/`, sem framework: variáveis de tema e classes.

O tema é **uma cor-semente** processada pelo Material Color Utilities, que gera
a paleta inteira. Trocar a semente repinta o app — inclusive o contraste e os
estados.

## Decisões que custam caro se revertidas

**Identidade própria.** `appId`, `applicationId`, `namespace` e nome do banco
são próprios desta variante. Reutilizar os do app original faz o Android tratar
esta versão como atualização daquela — e as duas passam a disputar o mesmo
banco. Há teste (`isolamento.test.ts`) que falha se alguém reverter.

**Sem tldraw.** Não é só remover a dependência: as rotas `paginas`/`pagina`, o
bloco do Início, o tema do quadro e a ação `criar_pagina` da IA saíram junto. Um
teste varre o código atrás de import residual.

**Datas locais, não UTC.** O app conta o dia pelo fuso do aparelho
(`chaveDoDia`). Usar `toISOString()` faria uma tarefa marcada para hoje, às 22h
no Brasil, aparecer como amanhã.

**Exclusão suave.** Apagar de verdade impediria desfazer e apagaria histórico de
hábito.

## Testes

`npm test` roda 295 testes. Os que protegem decisões, não funções:

- `db/migracao.test.ts` — abrir bancos de versões antigas sem perder dado
- `lib/jarvis/provedores.test.ts` — os três dialetos, sem rede
- `lib/isolamento.test.ts` — identidade própria, sem servidor, sem tldraw
- `lib/higiene.test.ts` — APK: versão, backup desligado, service worker

## Adicionar um provedor de IA

1. Acrescente uma entrada em `PROVEDORES` (`src/lib/jarvis/provedores.ts`).
2. Se ele falar o formato da OpenAI, use `dialeto: 'openai'` e só mude `url`,
   `modelo` e `ondePegarChave`.
3. Rode `npm test`. O teste de dialeto monta corpo e lê resposta de **todo**
   provedor declarado — se você errou um campo, ele falha antes de você testar
   no celular.
