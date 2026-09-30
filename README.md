# Checkout personalizado com Stripe

Checkout 100% com o seu visual, usando o **Stripe Payment Element**. A Stripe continua cuidando de tudo que é difícil:

- **Todas as formas de pagamento** que a Stripe oferece: cartão, Pix, boleto, Apple Pay, Google Pay, Link, PayPal, Klarna, Afterpay, iDEAL, SEPA, Bancontact, OXXO, Alipay, WeChat Pay, etc.
- **Várias moedas** (135+). Cada método aparece só quando é compatível com a moeda e o país do cliente (ex.: Pix/boleto em BRL, iDEAL em EUR, OXXO em MXN).
- 3D Secure, antifraude (Radar), PCI: os dados do cartão nunca passam pelo seu servidor.

## Como funciona

```
Navegador (seu HTML/CSS)                 Seu servidor (server.js)            Stripe
────────────────────────                 ────────────────────────            ──────
1. Monta o Payment Element  ── /quote ──▶ calcula o total
2. Cliente escolhe o método e clica em Pagar
3. elements.submit()        ── /create-payment-intent ─▶ cria o PaymentIntent ─▶
4. stripe.confirmPayment()  ───────────────────────────────────────────────────▶ cobra
5. Redireciona para /complete.html                                   ◀── webhook: payment_intent.succeeded
```

- `automatic_payment_methods: { enabled: true }` faz a Stripe mostrar **todos os métodos que você ativou no Dashboard**. Não é preciso mudar código para adicionar métodos novos.
- O fluxo usado é o *deferred intent*: o formulário é montado antes do pagamento existir, então trocar a moeda atualiza na hora os métodos disponíveis (`elements.update({ amount, currency })`).
- O **preço é sempre calculado no servidor** (`PRODUCTS` em `server.js`), nunca no navegador.
- A confirmação de verdade acontece no **webhook**, porque boleto, SEPA, OXXO etc. são pagos horas ou dias depois.

## Rodando localmente

```bash
npm install
cp .env.example .env        # coloque suas chaves de TESTE
npm start                   # http://localhost:4242
```

Para receber webhooks localmente, use a [Stripe CLI](https://docs.stripe.com/stripe-cli):

```bash
stripe listen --forward-to localhost:4242/webhook
# copie o whsec_... exibido para STRIPE_WEBHOOK_SECRET no .env
```

Cartões de teste: `4242 4242 4242 4242` (aprovado) e `4000 0027 6000 3184` (pede 3D Secure). Qualquer data futura e qualquer CVC.

## Ativando as formas de pagamento

1. Dashboard → **Settings → Payment methods**: ative os métodos que quiser (Pix, boleto, Klarna, iDEAL…).
2. **Apple Pay**: registre seu domínio em *Settings → Payment method domains* (exige HTTPS em produção).
3. Alguns métodos dependem do **país da sua conta Stripe** (ex.: Pix e boleto exigem conta no Brasil; OXXO, conta no México ou nos EUA). Veja a [tabela de compatibilidade](https://docs.stripe.com/payments/payment-methods/integration-options).

## Personalizando

| O quê | Onde |
|---|---|
| Cores, fontes, bordas do formulário da Stripe | `appearance` em `public/checkout.js` ([Appearance API](https://docs.stripe.com/elements/appearance-api)) |
| Layout do seu site | `public/index.html` e `public/style.css` |
| Abas ou acordeão | `layout: { type: 'tabs' \| 'accordion' }` |
| Produtos e preços por moeda | `PRODUCTS` em `server.js` |
| O que fazer quando o pagamento é aprovado | `case 'payment_intent.succeeded'` no webhook |

## Colocando em produção

- Troque para as chaves `sk_live_` e `pk_live_`.
- Crie o endpoint de webhook no Dashboard apontando para `https://seusite.com/webhook`.
- Sirva o site via HTTPS.
