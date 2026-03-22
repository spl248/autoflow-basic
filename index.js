require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Configuración CORS (para todas las rutas)
app.use(cors({
  origin: '*',               // Cambiar después por tu dominio de Netlify
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Esta ruta DEBE ir ANTES de express.json()
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  try {
    // Usamos req.body directamente (es un Buffer)
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (process.env.SHEETS_WEBHOOK_URL) {
      try {
        await axios.post(process.env.SHEETS_WEBHOOK_URL, {
          email: session.customer_email,
          plan: 'basic',
          status: 'active',
          session_id: session.id
        });
        console.log('Cliente registrado en Sheets:', session.customer_email);
      } catch (err) {
        console.error('Error al notificar a Sheets:', err.message);
      }
    }
  }

  res.json({ received: true });
});

// Para el resto de rutas, usamos JSON normal
app.use(express.json());

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const BASIC_PRICE_ID = process.env.BASIC_PRICE_ID;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://tusitio.vercel.app';

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
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => res.send('AutoFlow backend funcionando'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
