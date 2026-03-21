require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const axios = require('axios');

const app = express();
app.use(express.json());

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://tusitio.vercel.app';
const BASIC_PRICE_ID = process.env.BASIC_PRICE_ID;

app.post('/create-checkout', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: BASIC_PRICE_ID, quantity: 1 }],
      mode: 'subscription',
      success_url: `${FRONTEND_URL}/success`,
      cancel_url: `${FRONTEND_URL}/cancel`,
    });
    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (SHEETS_WEBHOOK_URL) {
      await axios.post(SHEETS_WEBHOOK_URL, {
        email: session.customer_email,
        plan: 'basic',
        status: 'active'
      }).catch(err => console.error('Error al notificar sheets:', err.message));
    }
  }
  res.json({ received: true });
});

app.get('/', (req, res) => res.send('AutoFlow backend funcionando'));

app.listen(3000, () => console.log('Server running on port 3000'));
