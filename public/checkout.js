// Carrinho de exemplo — em produção venha da sua sessão/carrinho.
const cart = [
  { id: 'curso-pro', quantity: 1 },
  { id: 'ebook', quantity: 2 },
];

// Aparência 100% personalizável: https://docs.stripe.com/elements/appearance-api
const appearance = {
  theme: 'stripe', // 'stripe' | 'night' | 'flat'
  variables: {
    colorPrimary: '#5b3df5',
    colorBackground: '#ffffff',
    colorText: '#1a1a2e',
    colorDanger: '#e5484d',
    fontFamily: 'Inter, system-ui, sans-serif',
    borderRadius: '10px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': { boxShadow: 'none', border: '1px solid #dcdce5' },
    '.Input:focus': { border: '1px solid #5b3df5', boxShadow: '0 0 0 3px rgba(91,61,245,.15)' },
    '.Tab--selected': { borderColor: '#5b3df5' },
  },
};

const $ = (id) => document.getElementById(id);
let stripe, elements, products;

function showMessage(text) {
  $('message').textContent = text || '';
}

function setLoading(loading) {
  $('submit').disabled = loading;
  $('button-text').textContent = loading ? 'Processando…' : 'Pagar';
}

function formatMoney(value, currency) {
  return new Intl.NumberFormat(navigator.language || 'pt-BR', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(value);
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro no servidor');
  return data;
}

function renderSummary(currency) {
  let total = 0;
  $('items').innerHTML = '';
  for (const { id, quantity } of cart) {
    const p = products[id];
    const line = p.prices[currency] * quantity;
    total += line;
    const li = document.createElement('li');
    li.innerHTML = `<span>${p.name} × ${quantity}</span><span>${formatMoney(line, currency)}</span>`;
    $('items').appendChild(li);
  }
  $('total').textContent = formatMoney(total, currency);
}

async function refreshAmount() {
  const currency = $('currency').value;
  renderSummary(currency);
  const { amount } = await postJSON('/quote', { items: cart, currency });
  // Atualiza os métodos disponíveis conforme a nova moeda (ex.: Pix/boleto só em BRL, iDEAL só em EUR…)
  elements.update({ amount, currency });
}

async function createIntentAndConfirm() {
  const billing = {};
  if ($('name').value) billing.name = $('name').value;
  if ($('email').value) billing.email = $('email').value;

  const { clientSecret } = await postJSON('/create-payment-intent', {
    items: cart,
    currency: $('currency').value,
    email: $('email').value,
    name: $('name').value,
  });

  const { error } = await stripe.confirmPayment({
    elements,
    clientSecret,
    confirmParams: {
      return_url: `${location.origin}/complete.html`,
      payment_method_data: { billing_details: billing },
    },
  });

  // Só chega aqui se houver erro imediato; no sucesso o cliente é redirecionado.
  if (error) throw error;
}

async function init() {
  const config = await fetch('/config').then((r) => r.json());
  products = config.products;
  stripe = Stripe(config.publishableKey);

  const currency = $('currency').value;
  const { amount } = await postJSON('/quote', { items: cart, currency });
  renderSummary(currency);

  // Fluxo "deferred intent": o Payment Element é montado antes de existir o PaymentIntent,
  // o que permite trocar moeda/valor livremente.
  elements = stripe.elements({
    mode: 'payment',
    amount,
    currency,
    appearance,
    locale: 'auto',
  });

  // Todos os métodos de pagamento ativos no Dashboard aparecem aqui automaticamente.
  const paymentElement = elements.create('payment', {
    layout: { type: 'tabs', defaultCollapsed: false }, // ou 'accordion'
  });
  paymentElement.mount('#payment-element');
  paymentElement.on('ready', () => { $('submit').disabled = false; });

  // Botões de carteira (Apple Pay, Google Pay, Link, PayPal, Amazon Pay, Klarna…)
  const expressCheckout = elements.create('expressCheckout');
  expressCheckout.mount('#express-checkout');
  expressCheckout.on('confirm', async () => {
    const { error: submitError } = await elements.submit();
    if (submitError) return showMessage(submitError.message);
    try {
      await createIntentAndConfirm();
    } catch (err) {
      showMessage(err.message);
    }
  });

  $('currency').addEventListener('change', () => refreshAmount().catch((e) => showMessage(e.message)));

  $('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showMessage('');
    setLoading(true);
    try {
      const { error: submitError } = await elements.submit(); // valida o formulário
      if (submitError) throw submitError;
      await createIntentAndConfirm();
    } catch (err) {
      showMessage(err.message);
      setLoading(false);
    }
  });
}

init().catch((err) => showMessage(err.message));
