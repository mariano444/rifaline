import { adminClient, calcTotal, env, fetchCurrentState, handleOptions, json } from '../_shared/helpers.ts';

function buildReferenceId() {
  return `orden-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function parsePaymentLinkId(url: string) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const body = await req.json();
    const participant = body.participant || {};
    const numeros = Array.isArray(body.numeros) ? body.numeros.map(Number).sort((a: number, b: number) => a - b) : [];
    const totalPagado = Number(body.totalPagado || 0);
    const returnUrl = body.returnUrl || null;

    if (!body.sorteoId) return json({ error: 'Missing sorteoId' }, 400);
    if (!participant.nombre || !participant.apellido || !participant.telefono || !participant.provincia || !participant.localidad) {
      return json({ error: 'Missing participant data' }, 400);
    }
    if (!numeros.length) return json({ error: 'Debe seleccionar al menos un numero' }, 400);

    const expectedAmount = calcTotal(numeros.length);
    if (expectedAmount !== totalPagado) {
      return json({ error: 'El monto no coincide con la cantidad de numeros elegidos' }, 400);
    }

    const supabase = adminClient();
    const state = await fetchCurrentState(supabase);
    if (state.raffle.id !== body.sorteoId || state.raffle.estado !== 'activo') {
      return json({ error: 'El sorteo activo cambio. Recarga la pagina.' }, 409);
    }

    const { data: takenRows, error: takenError } = await supabase
      .from('numeros_asignados')
      .select('numero')
      .eq('sorteo_id', body.sorteoId)
      .in('numero', numeros);

    if (takenError) throw takenError;
    if ((takenRows || []).length > 0) {
      return json({ error: 'Uno o mas numeros ya fueron vendidos. Elige otros.' }, 409);
    }

    const referenceId = buildReferenceId();
    const successUrl = returnUrl ? `${returnUrl}?payment=success&ref=${encodeURIComponent(referenceId)}` : undefined;
    const failureUrl = returnUrl ? `${returnUrl}?payment=failure&ref=${encodeURIComponent(referenceId)}` : undefined;

    const payload = {
      items: [
        {
          title: `Numeros`,
          quantity: 1,
          unitPrice: totalPagado,
          currencyId: 'ARS',
        },
      ],
      referenceId,
      // Force live payments for production checkouts.
      sandbox: false,
      notificationUrl: Deno.env.get('GALIO_WEBHOOK_URL') || undefined,
      backUrl: successUrl || failureUrl ? { success: successUrl, failure: failureUrl } : undefined,
    };

    const orderInsert = {
      reference_id: referenceId,
      sorteo_id: body.sorteoId,
      participant_payload: {
        ...participant,
        metodo_pago: 'Galio Pay',
      },
      numbers: numeros,
      amount: totalPagado,
      currency: 'ARS',
      status: 'pending',
    };

    const { data: order, error: insertOrderError } = await supabase
      .from('payment_orders')
      .insert(orderInsert)
      .select()
      .single();

    if (insertOrderError) throw insertOrderError;

    const galioResponse = await fetch('https://pay.galio.app/api/payment-links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env('GALIO_API_KEY')}`,
        'x-client-id': env('GALIO_CLIENT_ID'),
      },
      body: JSON.stringify(payload),
    });

    const galioJson = await galioResponse.json();
    if (!galioResponse.ok) {
      await supabase
        .from('payment_orders')
        .update({ status: 'failed', error_message: galioJson.error || 'Error creando link de pago', galio_response: galioJson })
        .eq('id', order.id);
      return json({ error: galioJson.error || 'No se pudo crear el link de pago' }, 400);
    }

    const paymentLinkId = parsePaymentLinkId(galioJson.url);
    const { error: updateOrderError } = await supabase
      .from('payment_orders')
      .update({
        payment_link_id: paymentLinkId,
        payment_link_url: galioJson.url,
        proof_token: galioJson.proofToken || null,
        galio_response: galioJson,
      })
      .eq('id', order.id);

    if (updateOrderError) throw updateOrderError;

    return json({
      referenceId,
      paymentUrl: galioJson.url,
    });
  } catch (error) {
    return json({ error: error.message || 'create-payment-link failed' }, 500);
  }
});
