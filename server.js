import 'dotenv/config';
import express from 'express';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();

// ---------------------------------------------------------------------------
// Catálogo (em produção isso viria do seu banco de dados).
// O preço SEMPRE é calculado no servidor — nunca confie no valor vindo do navegador.
// Os valores estão na unidade "humana" da moeda (ex.: 49.90 BRL).
// ---------------------------------------------------------------------------
const PRODUCTS = {
  'curso-pro': {
    name: 'Curso Pro',
    prices: { brl: 199.9, usd: 39.9, eur: 36.9, gbp: 31.9, jpy: 5900, mxn: 699, cad: 54.9, aud: 59.9 },
  },
  'ebook': {
    name: 'E-book Premium',
    prices: { brl: 49.9, usd: 9.9, eur: 8.9, gbp: 7.9, jpy: 1500, mxn: 169, cad: 13.9, aud: 14.9 },
  },
};

// Moedas sem casas decimais e com 3 casas decimais na Stripe:
// https://docs.stripe.com/currencies#zero-decimal
const ZERO_DECIMAL = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf',
  'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);
const THREE_DECIMAL = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);

function toMinorUnits(amount, currency) {
  if (ZERO_DECIMAL.has(currency)) return Math.round(amount);
  if (THREE_DECIMAL.has(currency)) return Math.round(amount * 100) * 10; // Stripe exige múltiplo de 10
  return Math.round(amount * 100);
}

function calculateOrder(items, currency) {
  let total = 0;
  for (const { id, quantity } of items) {
    const product = PRODUCTS[id];
    if (!product) throw new Error(`Produto inválido: ${id}`);
    const price = product.prices[currency];
    if (price === undefined) throw new Error(`Moeda ${currency} não disponível para ${id}`);
    const qty = Number.isInteger(quantity) && quantity > 0 && quantity <= 99 ? quantity : 1;
    total += price * qty;
  }
  return toMinorUnits(total, currency);
}

// ---------------------------------------------------------------------------
// Webhook — precisa do corpo "raw", por isso vem ANTES do express.json().
// É aqui que você confirma o pagamento de verdade (liberar pedido, enviar e-mail…),
// pois métodos como boleto, OXXO, SEPA etc. são confirmados horas/dias depois.
// ---------------------------------------------------------------------------
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error('Assinatura do webhook inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const pi = event.data.object;
  switch (event.type) {
    case 'payment_intent.succeeded':
      console.log(`✅ Pago: ${pi.id} ${pi.amount} ${pi.currency} via ${pi.payment_method_types?.join(',')}`);
      // TODO: marcar pedido como pago / liberar acesso
      break;
    case 'payment_intent.processing':
      console.log(`⏳ Processando (ex.: boleto/SEPA): ${pi.id}`);
      break;
    case 'payment_intent.payment_failed':
      console.log(`❌ Falhou: ${pi.id} — ${pi.last_payment_error?.message}`);
      break;
    default:
      break;
  }
  res.json({ received: true });
});

app.use(express.json());
app.use(express.static('public'));

app.get('/config', (_req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    products: Object.fromEntries(
      Object.entries(PRODUCTS).map(([id, p]) => [id, { name: p.name, prices: p.prices }]),
    ),
  });
});

// Devolve o total calculado pelo servidor (em unidade mínima da moeda),
// usado pelo front para configurar o Payment Element antes do pagamento.
app.post('/quote', (req, res) => {
  try {
    const { items = [], currency: rawCurrency = 'brl' } = req.body;
    const currency = String(rawCurrency).toLowerCase();
    res.json({ amount: calculateOrder(items, currency), currency });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Cria o PaymentIntent no momento do "Pagar". Com automatic_payment_methods a
// Stripe usa TODOS os métodos que você ativou no Dashboard e que são compatíveis
// com a moeda / país do cliente (cartão, Pix, boleto, Apple Pay, Google Pay,
// Link, iDEAL, SEPA, Klarna, Afterpay, OXXO, WeChat Pay, Alipay…).
app.post('/create-payment-intent', async (req, res) => {
  try {
    const { items = [], currency: rawCurrency = 'brl', email, name } = req.body;
    const currency = String(rawCurrency).toLowerCase();
    const amount = calculateOrder(items, currency);

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      receipt_email: email || undefined,
      metadata: {
        customer_name: String(name || '').slice(0, 200),
        items: JSON.stringify(items).slice(0, 500),
      },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

const port = process.env.PORT || 4242;
app.listen(port, () => console.log(`Checkout rodando em http://localhost:${port}`));
