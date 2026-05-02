import { adminClient, handleOptions, json, registerApprovedOrder } from '../_shared/helpers.ts';

function extractReference(payload: any) {
  return payload.referenceId || payload.reference_id || payload.data?.referenceId || payload.data?.reference_id || null;
}

function extractStatus(payload: any) {
  return payload.status || payload.data?.status || payload.payment?.status || null;
}

function extractPaymentId(payload: any) {
  return payload.paymentId || payload.payment_id || payload.data?.paymentId || payload.data?.payment_id || payload.payment?.id || null;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const payload = await req.json();
    const referenceId = extractReference(payload);
    if (!referenceId) return json({ ok: true, ignored: true });

    const supabase = adminClient();
    const { data: order, error } = await supabase
      .from('payment_orders')
      .select('*')
      .eq('reference_id', referenceId)
      .maybeSingle();

    if (error) throw error;
    if (!order) return json({ ok: true, ignored: true });

    const status = extractStatus(payload) || order.status;
    const paymentId = extractPaymentId(payload) || order.payment_id;

    const { data: updatedOrder, error: updateError } = await supabase
      .from('payment_orders')
      .update({
        status,
        payment_id: paymentId,
        galio_response: payload,
        paid_at: status === 'approved' ? new Date().toISOString() : order.paid_at,
      })
      .eq('id', order.id)
      .select()
      .single();

    if (updateError) throw updateError;

    if (updatedOrder.status === 'approved' && !updatedOrder.participant_id) {
      await registerApprovedOrder(supabase, updatedOrder);
    }

    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || 'galio-webhook failed' }, 500);
  }
});
