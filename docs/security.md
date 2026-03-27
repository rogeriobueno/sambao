# Seguranca

## Regras basicas

- Nunca commitar segredos, chaves, tokens ou credenciais.
- Usar apenas variaveis de ambiente para dados sensiveis.
- Revisar logs para nao imprimir valores sensiveis.

## Cloudflare (quando migrar)

- Usar `wrangler secret put` para segredos.
- Nao salvar segredo em `wrangler.toml`.
- Limitar permissao de tokens por ambiente (dev/prod).

