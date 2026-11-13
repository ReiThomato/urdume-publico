# Limites e falhas conhecidas

Este documento existe para você decidir **antes** de confiar seus dados ao app.
O que está aqui foi verificado ou é consequência direta do código — não é
modéstia genérica.

**Estado: beta.** Não houve uso prolongado em muitos aparelhos. Testes
automatizados cobrem lógica, não o comportamento do Android em cada fabricante.

---

## 1. O que o app não faz

| Não existe | Por quê |
| --- | --- |
| Conta, login, nuvem | O banco é local (IndexedDB no WebView). Não há servidor. |
| Sincronizar entre aparelhos | A variante pública não traz sincronização. Cada aparelho é independente. |
| Quadro de desenho | Removido por licença: o tldraw tem termos próprios. |
| IA sem a sua chave | Não há chave embutida nem proxy. |
| Widget de tela inicial | Não implementado. |
| Versão iOS | Só Android e navegador. |

> **Sem sincronização, um aparelho perdido é um banco perdido.** Exporte o
> backup (Ajustes → Seus dados → Exportar) e guarde fora do celular.

## 2. Dados e backup

- **O backup não inclui a chave da API.** Ela mora numa tabela separada, de
  propósito. Restaurar um backup em outro aparelho exige colar a chave de novo.
- **Exportar substitui tudo no import.** O arquivo é o banco inteiro, não um
  incremento.
- **Não há backup automático.** O Android está configurado para *não* copiar o
  banco (`allowBackup="false"`) — de propósito, porque a restauração automática
  já fez dados apagados reaparecerem. O efeito colateral é que só existe o
  backup que você exportar.
- **Migrações são aditivas** (v1 → v5 do schema) e testadas, mas um banco muito
  antigo, muito editado ou interrompido no meio de uma migração pode falhar.
  Exporte antes de trocar de versão.

## 3. A IA

- **Ela propõe, você confirma.** Nunca apaga, nunca muda configuração, nunca
  mexe em backup.
- **O modelo erra.** Pode inventar uma tarefa, sugerir o projeto errado ou
  devolver JSON inválido. Resposta inválida vira "não entendi" e nada é
  executado; mas uma ação *válida e errada* depende do seu "não é isso" para não
  virar dado.
- **Custo é estimativa.** O preço por token vem de uma tabela no código, que
  envelhece. O "teto mensal" é uma trava local, não uma garantia da fatura.
- **No navegador, a IA pode não funcionar** por CORS. Funciona no APK.
- **Provedor fora do ar ou chave recusada** aparecem como erro na tela; o app
  não tenta de novo sozinho com outra chave.
- **O que sai do aparelho:** um resumo do dia (títulos, prazos, nomes de
  projeto) e o texto da conversa. Anotações livres e o banco inteiro não vão.

## 4. Notificações

- Dependem de permissão do Android e, em aparelhos MIUI/Xiaomi, de excluir o app
  da economia de bateria. Sem isso o sistema encerra o app e o aviso não sai.
- O horário é de minuto em minuto; **atrasos de alguns minutos acontecem**,
  mesmo com alarme exato.
- Não há notificação de tarefa sem hora marcada além do resumo diário.

## 5. Visual e plataforma

- **Só Android e navegador.** O layout é pensado para tela de celular; em
  desktop fica uma coluna estreita.
- **Fonte e ícones** vêm no pacote; sem rede o app abre, mas o primeiro
  carregamento no navegador precisa de rede.
- **Leitor de tela**: há rótulos e foco, mas não houve auditoria com TalkBack.

## 6. Segurança, dito sem eufemismo

- **A chave da API fica em texto claro** no banco do aparelho. Não é
  criptografada, porque o IndexedDB não oferece isso — dizer "AES" com a chave
  ao lado seria teatro. A proteção real é o bloqueio de tela do aparelho.
- **Não há login.** Quem tem o celular desbloqueado tem os dados.
- **Não há criptografia em repouso** do banco.
- **O app não envia nada para o autor.** Não há telemetria, analytics nem
  crash reporting.

## 7. Defeitos conhecidos

| Sintoma | Situação |
| --- | --- |
| Aparelho Xiaomi encerra o app em segundo plano | Não é defeito do app; exige isenção de bateria nas configurações do sistema |
| Atraso de minutos em notificação | Limitação do agendador do Android |
| IA responde "não entendi" com modelos pequenos | Modelo menor erra o formato JSON com mais frequência; tente um maior |
| Importar backup de versão futura | Recusado com mensagem, sem tocar nos dados |

Encontrou algo que não está aqui? Abra uma issue com o modelo do aparelho, a
versão do Android e o que aconteceu.

---

## O que foi testado de fato

- **295 testes automatizados** (`npm test`): banco, migrações, mesclagem de
  dados, sinais do assistente, três dialetos de provedor, higiene do APK.
- **Telas** verificadas em navegador com viewport de celular e dados de exemplo
  (as imagens deste repositório).
- **APK** compila e instala.

## O que **não** foi testado

- Uso por semanas seguidas.
- Muitos fabricantes (só um Redmi).
- Dois aparelhos ao mesmo tempo — não há sincronização, então é por desenho.
- Chamada real a cada provedor com chave válida: os dialetos são testados sem
  rede, comparando o corpo e a leitura da resposta.
- TalkBack e outros leitores de tela.
