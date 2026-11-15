# Arquitetura

Como as peças conversam, e por quê. O objetivo é que você consiga mudar uma
parte sem quebrar três.

```
┌──────────────────────────────────────────────────────────┐
│  WebView (APK) / navegador                               │
│                                                          │
│  screens/  ──►  db/repo.ts  ──►  Dexie (IndexedDB)        │
│     │              ▲                                     │
│     │              │                                     │
│     ▼              │                                     │
│  ui/  ◄────────────┘  (useLiveQuery reativo)             │
│                                                          │
│  lib/jarvis/ ──► provedor de IA (HTTPS, chave do usuário) │
│     │                                                    │
│     └──► notificações locais (Android)                   │
└──────────────────────────────────────────────────────────┘
```

Sem servidor. Sem conta. A única saída de rede é a chamada ao provedor de IA,
feita com a chave que está no aparelho.

## Camadas

### `db/db.ts` — schema

Dexie sobre IndexedDB. O schema tem **versões numeradas** (`v1`…`v6`), e cada
uma só **adiciona** tabela, índice ou campo. Nada é renomeado nem removido: quem
já tem dados atualiza o APK e continua com tudo.

O banco se chama `urdume-publico`. Esse nome é deliberadamente próprio — o app
original usa outro. Dois apps com o mesmo nome de banco na mesma origem leem as
mesmas tarefas, e instalar esta variante por cima do original apagaria dados.
`lib/isolamento.test.ts` falha se alguém reverter isso.

### `db/repo.ts` — repositório

Toda leitura e escrita passa por aqui. As telas não tocam o Dexie direto.

- **Exclusão é suave** (`deletedAt`), nunca física. É o que permite desfazer,
  alimentar a Lixeira e preservar o histórico de hábito.
- **`updatedAt` em tudo** que muda. É o que ordena as listas e o que permitiria
  resolver conflito, se um dia houvesse sincronização.
- **Hooks reativos** (`useTasks`, `useProject`, `useLiveQuery`): criar ou
  concluir atualiza a tela sem sair e voltar.
- **Toda escrita anuncia** no diário (`registrarMudanca`), e o anúncio é à prova
  de falha: se o diário não puder gravar, o dado do usuário continua salvo.

### `lib/jarvis/` — o assistente

Separado em etapas, cada uma testável sozinha:

| Arquivo | Papel |
| --- | --- |
| `leitura.ts` | Lê o banco e monta um **retrato** do estado atual |
| `retrato.ts` | O formato do retrato e o que cada número significa |
| `sinais.ts` | Regras puras: hábito quebrado, projeto parado, prazo apertado… |
| `relevancia.ts` | Decide o que merece interromper e o que fica no painel |
| `motor.ts` | Junta retrato + sinais + relevância num painel do dia |
| `ia.ts` | Monta o resumo, chama o provedor e interpreta a resposta |
| `provedores.ts` | Os dialetos: OpenAI, Gemini e Anthropic |
| `executor.ts` | Transforma a proposta em ação, com prévia e desfazer |
| `lotes.ts` | Operações em volume ("conclua as atrasadas"), com teto de risco |
| `autonomia.ts` | O que pode rodar sem perguntar (por nível) |
| `ilha.ts` + `recados.ts` | O que a ilha flutuante mostra e a fila que sobrevive |
| `segundo-plano.ts` | Grava retrato e agenda para o app fechado |
| `estado.ts` | Preferências, memória operacional e poda por idade |

**Princípio:** o modelo é fonte não confiável. Ele devolve JSON; o app valida
campo a campo, recusa o que não conhece e pede confirmação. Nada do que o
modelo escreve é executado como código, e nenhuma ação apaga dado.

### `screens/` e `ui/`

Uma tela por rota (`app/router.tsx`), componentes compartilhados em `ui/`.
CSS por área em `styles/`, sem framework: variáveis de tema e classes.

O tema é **uma cor-semente** processada pelo Material Color Utilities e
distribuída numa roda cromática (`app/motor-cromatico.ts`), que gera a paleta
inteira. Trocar a semente ou o tipo de roda repinta o app — inclusive contraste
e estados. A roda vive em `Ajustes → Aparência`.

## Decisões que custam caro se revertidas

**Identidade própria.** `appId`, `applicationId`, `namespace` e nome do banco
são próprios desta variante. Reutilizar os do app original faz o Android tratar
esta versão como atualização daquela — e as duas passam a disputar o mesmo
banco. Há teste (`isolamento.test.ts`) que falha se alguém reverter.

**Sem o editor de desenho.** Não é só remover a dependência: as rotas
`paginas`/`pagina`, o bloco do Início, a tabela `pages`, o tema próprio do
editor e as ações `criar_pagina` e `escrever_no_quadro` da IA saíram junto. Um
teste varre o código atrás de import residual e outro recusa a volta dos
módulos.

**Sem sincronização e sem o motor de aprendizagem exclusivo.** Não existem aqui
`lib/sync/` nem os módulos que acumulam conhecimento sobre o usuário entre
sessões. O `isolamento.test.ts` verifica a ausência de cada um: se voltarem por
engano, o teste falha — e a variante passaria a prometer um comportamento que
não tem.

**Datas locais, não UTC.** O app conta o dia pelo fuso do aparelho
(`chaveDoDia`). Usar `toISOString()` faria uma tarefa marcada para hoje, às 22h
no Brasil, aparecer como amanhã.

**Exclusão suave.** Apagar de verdade impediria desfazer e apagaria histórico de
hábito. O "apagar de vez" existe, mas é explícito, na Lixeira.

**Lembrete não cobra prazo.** `Task.tipo` (`tarefa`, `lembrete`, `ideia`) decide
se o item atrasa e se entra na agenda. Sem ele, criar uma tarefa hoje sem prazo
a fazia aparecer como vencida no dia seguinte.

## Testes

`npm test` roda **569 testes** em 54 arquivos. Os que protegem decisões, não
funções:

- `db/migracao.test.ts` — abrir bancos de versões antigas sem perder dado
- `lib/jarvis/provedores.test.ts` — os três dialetos, sem rede
- `lib/jarvis/ia.test.ts` — formato do resumo, JSON da resposta, recusas
- `lib/jarvis/executor.ts` / `acoes.test.ts` — prévia, risco e desfazer
- `lib/isolamento.test.ts` — identidade própria, sem servidor, sem o editor,
  sem o motor exclusivo
- `lib/higiene.test.ts` — APK: versão, backup desligado, service worker
- `db/onda2-paridade.test.ts` — cada tela usa o mesmo componente, sem cópia

## Adicionar um provedor de IA

1. Acrescente uma entrada em `PROVEDORES` (`src/lib/jarvis/provedores.ts`),
   com `dialeto`, `url`, `modelo`, preço e `ondePegarChave`.
2. Se ele falar o formato da OpenAI, use `dialeto: 'openai'` e só mude os
   campos.
3. Rode `npm test`. O teste de dialeto monta corpo, monta cabeçalho e lê resposta
   de **todo** provedor declarado — se você errou um campo, ele falha antes de
   você testar no celular.

## Adicionar uma ação da IA

1. Declare o tipo na união `AcaoDaIA['tipo']` e em `TIPOS_PERMITIDOS`.
2. Descreva os dados no prompt (`INSTRUCAO`, seção "TIPOS PERMITIDOS").
3. Trate em `avaliarAcao` (risco e prévia) **e** em `executarLote` (o efeito),
   no `executor.ts`.
4. Se ela grava algo, registre o "antes" para o desfazer funcionar.
5. Rode `npm test`: `acoes.test.ts` confere que todo tipo tem avaliação.
