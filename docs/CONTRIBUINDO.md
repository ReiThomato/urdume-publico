# Contribuindo

Obrigado pelo interesse. Antes de abrir um pull request grande, abra uma issue
descrevendo o problema — economiza tempo dos dois lados.

## Preparar

```bash
npm install
npm run dev      # navegador, com recarga rápida
npm test         # 295 testes
npx tsc -b       # tipos
```

Antes de enviar: `npx tsc -b && npm test` limpos.

## Padrões deste código

**Comentário explica o porquê, não o quê.** `// soma 1 ao contador` é ruído.
`// o Android descarta o aviso se o canal não existir` é o que impede alguém de
remover a linha. Se você consertou um defeito, escreva o defeito no comentário.

**Erro silencioso é pior que erro feio.** Prefira uma mensagem na tela a um
`catch {}`. Se algo não pode ser feito, diga o que o usuário deve fazer.

**Exclusão é suave.** Use `softDelete*` do repositório. Nada de `delete()` em
registro de usuário.

**Datas sempre locais.** `chaveDoDia(new Date())`, nunca `toISOString()` para
dia do calendário.

**Sem dependência nova sem justificativa.** O pacote é leve de propósito. Uma
biblioteca de datas de 70 kB para formatar "12 nov" não se paga.

## Testes que valem

Cubra a **decisão**, não a linha. Exemplos do que existe:

```ts
// ruim: testa o framework
expect(minhaFuncao).toBeDefined()

// bom: descreve o comportamento que importa
expect(equivalenteDias('2026-11-12', '2026-11-10')).toBe(2)
```

Um teste que depende do relógio vai falhar à noite sem defeito nenhum. Se a
função olha para "hoje", passe uma data fixa ou congele o horário. Isso já
aconteceu duas vezes neste projeto.

## O que não entra

- **tldraw ou qualquer código com licença incompatível** com PolyForm
  Noncommercial. Há teste que falha se aparecer.
- **Servidor, sincronização ou chave de API embutida.** A variante é local.
- **Endereço privado, dado pessoal do autor, telemetria.** Também há teste.
- **Mudar `appId`/`applicationId`/nome do banco** para o de outro app. Ver
  `isolamento.test.ts`.

## Licença das contribuições

Ao enviar um pull request você concorda em licenciar sua contribuição sob a
mesma [PolyForm Noncommercial 1.0.0](LICENSE).

## Relatar defeito

Inclua: modelo do aparelho, versão do Android, versão do app (Ajustes, rodapé),
o que esperava, o que aconteceu, e se possível uma captura. Sem isso, um defeito
que depende do fabricante é quase impossível de reproduzir.
