require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Configuración CORS
app.use(cors({
  origin: '*',               // Cambia después por tu dominio de Netlify
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Inicializa Stripe con la clave secreta
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const BASIC_PRICE_ID = process.env.BASIC_PRICE_ID;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://tusitio.vercel.app';

// La ruta /webhook DEBE ir antes de express.json()
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  console.log('=== WEBHOOK RECIBIDO ===');
  console.log('Headers stripe-signature:', req.headers['stripe-signature']);
  console.log('Body type:', typeof req.body);
  console.log('Body is Buffer?', Buffer.isBuffer(req.body));
  console.log('Secret (first 10 chars):', process.env.STRIPE_WEBHOOK_SECRET?.substring(0, 10));
  console.log('Secret length:', process.env.STRIPE_WEBHOOK_SECRET?.length);

  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log('Webhook verificado correctamente. Evento:', event.type);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('Checkout completado. Email:', session.customer_email);
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

app.get('/', (req, res) => res.send('AutoFlow backend funcionando'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
