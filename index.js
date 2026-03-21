// index.js
require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Configuración CORS (permite peticiones desde cualquier origen durante pruebas)
app.use(cors({
  origin: '*',               // Cambiar después por tu dominio de Vercel
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://tusitio.vercel.app';
const BASIC_PRICE_ID = process.env.BASIC_PRICE_ID;

// Endpoint para crear sesión de pago
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

// Webhook para recibir eventos de Stripe
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    // Aquí puedes registrar al cliente en Google Sheets, base de datos, etc.
    if (SHEETS_WEBHOOK_URL) {
      try {
        await axios.post(SHEETS_WEBHOOK_URL, {
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

// Endpoint de prueba para verificar que el servidor está activo
app.get('/', (req, res) => {
  res.send('AutoFlow backend funcionando');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
