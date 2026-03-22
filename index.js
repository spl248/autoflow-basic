// index.js – AutoFlow Pack Básico (con entrega automática de plantilla)
require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const axios = require('axios');
const cors = require('cors');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');

const app = express();

// Configuración CORS (permite peticiones desde cualquier origen durante pruebas)
app.use(cors({
  origin: '*',               // Cambia después por tu dominio de Netlify
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Inicializa Stripe con la clave secreta
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const BASIC_PRICE_ID = process.env.BASIC_PRICE_ID;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://tusitio.vercel.app';

// ------------------ WEBHOOK (debe ir ANTES de express.json()) ------------------
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  console.log('=== WEBHOOK RECIBIDO ===');
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
    const customerEmail = session.customer_details?.email || session.customer_email || 'email no disponible';
    console.log('Checkout completado. Email:', customerEmail);

    // 1. Guardar en tu hoja de control (Google Sheets)
    if (process.env.SHEETS_WEBHOOK_URL) {
      try {
        await axios.post(process.env.SHEETS_WEBHOOK_URL, {
          email: customerEmail,
          plan: 'basic',
          status: 'active',
          session_id: session.id
        });
        console.log('Cliente registrado en hoja de control:', customerEmail);
      } catch (err) {
        console.error('Error al notificar a Sheets:', err.message);
      }
    }

    // 2. Crear copia de la plantilla y enviar email al cliente
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.TEMPLATE_SHEET_ID) {
      try {
        const auth = new google.auth.GoogleAuth({
          credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
          scopes: ['https://www.googleapis.com/auth/drive.file']
        });

        const drive = google.drive({ version: 'v3', auth });

        // Copiar la plantilla
        const copy = await drive.files.copy({
          fileId: process.env.TEMPLATE_SHEET_ID,
          requestBody: {
            name: `AutoFlow - ${customerEmail}`,
            parents: ['root'] // puedes cambiar a una carpeta específica si lo prefieres
          }
        });

        const newSheetUrl = `https://docs.google.com/spreadsheets/d/${copy.data.id}/edit`;

        // Configurar transporte de email (Gmail)
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });

        // Enviar email con el enlace
        await transporter.sendMail({
          from: `"AutoFlow" <${process.env.EMAIL_USER}>`,
          to: customerEmail,
          subject: '¡Tu Pack Básico de AutoFlow está listo!',
          html: `
            <h1>¡Gracias por contratar AutoFlow!</h1>
            <p>Tu sistema de automatización ya está activo. Accede a tu hoja personalizada aquí:</p>
            <a href="${newSheetUrl}" target="_blank">${newSheetUrl}</a>
            <p>Cuando la abras, autoriza los permisos (solo la primera vez) y ya podrás usar todas las funcionalidades:</p>
            <ul>
              <li><strong>Captura de leads:</strong> usa el webhook que encontrarás en Extensiones → Apps Script → getWebhookUrl()</li>
              <li><strong>Agenda inteligente:</strong> añade eventos en la pestaña Agenda y se crearán automáticamente en tu Google Calendar.</li>
              <li><strong>Facturación recurrente:</strong> añade facturas en la pestaña Facturas y se generarán PDFs y se enviarán por email.</li>
            </ul>
            <p>Si tienes dudas, responde a este email. ¡Disfruta de tu nuevo asistente automatizado!</p>
          `
        });

        console.log(`Plantilla creada y email enviado a ${customerEmail}`);
      } catch (err) {
        console.error('Error al crear plantilla o enviar email:', err.message);
      }
    } else {
      console.warn('Faltan variables GOOGLE_SERVICE_ACCOUNT_JSON o TEMPLATE_SHEET_ID');
    }
  }

  res.json({ received: true });
});

// ------------------ PARA EL RESTO DE RUTAS, USAMOS JSON NORMAL ------------------
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

// Ruta raíz para comprobar que el servidor está activo
app.get('/', (req, res) => res.send('AutoFlow backend funcionando'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
