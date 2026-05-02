import { adminClient, env, handleOptions, json, registerApprovedOrder } from '../_shared/helpers.ts';

async function syncWithGalio(order: any) {
  let nextStatus = order.status;
  let paymentId = order.payment_id;
  let errorMessage = order.error_message || null;
  let responsePayload: any = order.galio_response || {};

  if (order.payment_link_id && order.proof_token) {
    const linkResponse = await fetch(
      `https://pay.galio.app/api/payment-links/${order.payment_link_id}?proof=${encodeURIComponent(order.proof_token)}`
    );
    const linkJson = await linkResponse.json();
    responsePayload = { ...responsePayload, paymentLink: linkJson };
    if (linkResponse.ok) {
      nextStatus = linkJson.status || nextStatus;
      paymentId = linkJson.paymentId || paymentId;
    }
  }

  if (paymentId) {
    const paymentResponse = await fetch(`https://pay.galio.app/api/payments/${paymentId}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env('GALIO_API_KEY')}`,
        'x-client-id': env('GALIO_CLIENT_ID'),
      },
    });
    const paymentJson = await paymentResponse.json();
    responsePayload = { ...responsePayload, payment: paymentJson };
    if (paymentResponse.ok) {
      nextStatus = paymentJson.status || nextStatus;
    } else {
      errorMessage = paymentJson.error || errorMessage;
    }
  }

  const normalized =
    ['approved'].includes(nextStatus)
      ? 'approved'
      : ['pending', 'created', 'processing', 'authorized', 'open'].includes(nextStatus)
        ? 'pending'
        : ['cancelled', 'canceled', 'expired'].includes(nextStatus)
          ? 'cancelled'
          : ['refunded'].includes(nextStatus)
            ? 'refunded'
            : 'failed';

  return {
    status: normalized,
    payment_id: paymentId,
    error_message: errorMessage,
    galio_response: responsePayload,
  };
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const { referenceId } = await req.json();
    if (!referenceId) return json({ error: 'Missing referenceId' }, 400);

    const supabase = adminClient();
    const { data: order, error } = await supabase
      .from('payment_orders')
      .select('*')
      .eq('reference_id', referenceId)
      .single();

    if (error) throw error;

    const synced = await syncWithGalio(order);
    const { data: updatedOrder, error: updateError } = await supabase
      .from('payment_orders')
      .update(synced)
      .eq('id', order.id)
      .select()
      .single();

    if (updateError) throw updateError;

    if (updatedOrder.status === 'approved' && !updatedOrder.participant_id) {
      await registerApprovedOrder(supabase, updatedOrder);
    }

    const { data: finalOrder, error: finalError } = await supabase
      .from('payment_orders')
      .select('*')
      .eq('id', order.id)
      .single();

    if (finalError) throw finalError;
    return json({ order: finalOrder });
  } catch (error) {
    return json({ error: error.message || 'payment-status failed' }, 500);
  }
});
