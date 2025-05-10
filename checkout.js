async function checkout() {
  if (cart.length === 0) {
    alert('Ihr Warenkorb ist leer. Bitte fügen Sie Artikel hinzu, bevor Sie zur Kasse gehen.');
    return;
  }

  const email = document.getElementById('checkoutEmail').value;
  const name = document.getElementById('checkoutName').value;
  const street = document.getElementById('checkoutStreet').value;
  const city = document.getElementById('checkoutCity').value;
  const postal = document.getElementById('checkoutPostal').value;
  const country = document.getElementById('checkoutCountry').value;
  const cardNumber = document.getElementById('cardNumber').value;
  const cardExpiry = document.getElementById('cardExpiry').value;
  const cardCvc = document.getElementById('cardCvc').value;

  if (!email || !name || !street || !city || !postal || !country || !cardNumber || !cardExpiry || !cardCvc) {
    alert('Bitte füllen Sie alle Felder aus');
    return;
  }

  const address = { street, city, postal, country };
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  const gelatoApiKey = document.getElementById('gelatoApiInput').value;
  const iban = document.getElementById('payoutIban').value;
  const bic = document.getElementById('payoutBic').value;
  const frequency = document.getElementById('payoutFrequency').value;
  const dayOfWeek = document.getElementById('payoutDayOfWeek').value;
  const dayOfMonth = document.getElementById('payoutDayOfMonth').value;

  if (!iban || !bic) {
    alert('Bitte geben Sie IBAN und BIC im Admin-Dashboard unter Auszahlungseinstellungen ein.');
    return;
  }

  if (!gelatoApiKey) {
    alert('Bitte geben Sie den Gelato API-Schlüssel im Admin-Dashboard ein.');
    return;
  }

  try {
    // Stripe-Zahlungsabwicklung
    const stripe = Stripe('pk_test_your_stripe_publishable_key');
    const { paymentIntent, error } = await stripe.confirmCardPayment(
      await createPaymentIntent(total, 'eur', email),
      {
        payment_method: {
          card: {
            number: cardNumber,
            exp_month: parseInt(cardExpiry.split('/')[0]),
            exp_year: parseInt(cardExpiry.split('/')[1]),
            cvc: cardCvc,
          },
          billing_details: { name, email, address },
        },
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    // Bestellung erstellen
    const order = {
      id: `order_${Date.now()}`,
      items: cart,
      customer: { email, name },
      shippingAddress: address,
      total,
      paymentIntentId: paymentIntent.id,
      createdAt: new Date().toISOString(),
    };
    orders.push(order);

    // Gelato-Bestellung senden
    const gelatoOrder = {
      orderReferenceId: order.id,
      items: cart.map(item => ({
        productUid: item.gelatoId,
        quantity: 1,
        designId: item.name.includes('Fuchs') ? 'fuchs_design' : 'default_design',
      })),
      shippingAddress: {
        firstName: name.split(' ')[0],
        lastName: name.split(' ').slice(1).join(' ') || ' ',
        addressLine1: street,
        city,
        postalCode: postal,
        country,
        email,
      },
      customer: { email, firstName: name.split(' ')[0], lastName: name.split(' ').slice(1).join(' ') || ' ' },
    };

    const gelatoResponse = await fetch('https://api.gelato.com/v2/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': gelatoApiKey,
      },
      body: JSON.stringify(gelatoOrder),
    });

    if (!gelatoResponse.ok) {
      throw new Error('Fehler beim Senden der Bestellung an Gelato');
    }

    // Auszahlungsplanung
    const nextPayoutDate = calculateNextPayoutDate(frequency, dayOfWeek, dayOfMonth);
    const payout = {
      amount: total,
      currency: 'EUR',
      destination: { iban, bic },
      scheduledDate: nextPayoutDate,
      source: paymentIntent.id,
    };

    console.log('Auszahlung geplant:', payout);

    // Rechnung erstellen
    const invoice = `
      <div style="background-color: #0A0B1A; color: #E2E8F0; padding: 20px; font-family: 'Poppins', sans-serif; border: 1px solid #6B46C1; border-radius: 8px;">
        <h2 style="color: #00D4FF;">Rechnung - Bestellung ${order.id}</h2>
        <p><strong>Bestell-ID:</strong> ${order.id}</p>
        <p><strong>Kunde:</strong> ${name} (${email})</p>
        <p><strong>Lieferadresse:</strong> ${street}, ${city}, ${postal}, ${country}</p>
        <p><strong>Bestellte Artikel:</strong></p>
        <ul>
          ${order.items.map(item => `<li>${item.name} (Produkt-ID: ${item.gelatoId}) - €${item.price.toFixed(2)}</li>`).join('')}
        </ul>
        <p><strong>Gesamt:</strong> €${total.toFixed(2)}</p>
        <p><strong>Zahlungsstatus:</strong> Bezahlt (Zahlungs-ID: ${paymentIntent.id})</p>
        <p><strong>Bestelldatum:</strong> ${new Date(order.createdAt).toLocaleDateString('de-DE')}</p>
        <p style="color: #00D4FF;">Vielen Dank für Ihre Bestellung!</p>
      </div>
    `;

    // Rechnung per E-Mail senden
    await sendEmail(email, 'Ihre Bestellung - Rechnung', invoice);

    // Bestellbestätigung
    alert('Zahlung erfolgreich! Ihre Bestellung wurde an Gelato gesendet. Die Rechnung wurde an Ihre E-Mail-Adresse gesendet.');
    cart = [];
    updateCartCount();
    updateCartDisplay();
    updateOrders();
    updateAnalytics();
    closeModal('checkoutModal');
  } catch (error) {
    console.error('Checkout-Fehler:', error);
    alert('Zahlung fehlgeschlagen. Bitte überprüfen Sie die eingegebenen Daten.');
  }
}

async function createPaymentIntent(amount, currency, email) {
  const response = await fetch('/api/create-payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amount * 100, currency, email }),
  });
  const { clientSecret } = await response.json();
  return clientSecret;
}

async function sendEmail(to, subject, htmlContent) {
  console.log(`Sende E-Mail an ${to}:`, { subject, htmlContent });
  // Für echte Implementierung: Verwenden Sie eine E-Mail-API wie SendGrid oder AWS SES
  // Beispiel:
  // await fetch('https://api.sendgrid.com/v3/mail/send', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${sendgridApiKey}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     personalizations: [{ to: [{ email: to }] }],
  //     from: { email: 'shop@example.com' },
  //     subject,
  //     content: [{ type: 'text/html', value: htmlContent }],
  //   }),
  // });
}

function calculateNextPayoutDate(frequency, dayOfWeek, dayOfMonth) {
  const today = new Date();
  let nextPayoutDate = new Date(today);

  if (frequency === 'weekly') {
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDayIndex = daysOfWeek.indexOf(dayOfWeek);
    const currentDayIndex = today.getDay();
    let daysUntilNext = (targetDayIndex - currentDayIndex + 7) % 7;
    if (daysUntilNext === 0) daysUntilNext = 7;
    nextPayoutDate.setDate(today.getDate() + daysUntilNext);
  } else if (frequency === 'monthly') {
    const targetDay = parseInt(dayOfMonth);
    nextPayoutDate = new Date(today.getFullYear(), today.getMonth(), targetDay);
    if (nextPayoutDate < today) {
      nextPayoutDate.setMonth(nextPayoutDate.getMonth() + 1);
    }
    const lastFriday = getLastFridayBeforeDate(nextPayoutDate.getFullYear(), nextPayoutDate.getMonth() + 1, targetDay);
    nextPayoutDate.setDate(lastFriday);
  }

  return nextPayoutDate.toISOString().split('T')[0];
}

function getLastFridayBeforeDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  let dayOfWeek = date.getDay();
  if (dayOfWeek !== 5) {
    const daysToSubtract = (dayOfWeek < 5 ? dayOfWeek + 2 : dayOfWeek - 5);
    date.setDate(day - daysToSubtract);
  }
  return date.getDate();
}
