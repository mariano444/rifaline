import { adminClient, handleOptions, json } from '../_shared/helpers.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const { sorteoId, code } = await req.json();
    if (!sorteoId || !code) return json({ error: 'Missing sorteoId or code' }, 400);

    const supabase = adminClient();
    const { data: raffle, error: raffleError } = await supabase.from('sorteos').select('*').eq('id', sorteoId).single();
    if (raffleError) throw raffleError;

    if ((raffle.secret_code || '').toUpperCase() !== String(code).trim().toUpperCase()) {
      return json({ error: 'Codigo incorrecto' }, 400);
    }

    const now = new Date().toISOString();
    const { error: winnerError } = await supabase
      .from('ganadores')
      .update({ confirmado: true, confirmado_at: now })
      .eq('sorteo_id', sorteoId);

    if (winnerError) throw winnerError;

    const { error: raffleUpdateError } = await supabase
      .from('sorteos')
      .update({ estado: 'finalizado', finalizado_at: now })
      .eq('id', sorteoId);

    if (raffleUpdateError) throw raffleUpdateError;
    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || 'confirm-winner failed' }, 500);
  }
});
