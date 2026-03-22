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
