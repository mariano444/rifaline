import { adminClient, handleOptions, json } from '../_shared/helpers.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const { sorteoId } = await req.json();
    if (!sorteoId) return json({ error: 'Missing sorteoId' }, 400);

    const supabase = adminClient();
    const { data: existingWinner } = await supabase.from('ganadores').select('*').eq('sorteo_id', sorteoId).maybeSingle();
    if (existingWinner) return json({ winner: existingWinner });

    const { data: raffle, error: raffleError } = await supabase.from('sorteos').select('*').eq('id', sorteoId).single();
    if (raffleError) throw raffleError;
    if (raffle.estado !== 'activo') return json({ error: 'El sorteo ya no esta activo' }, 409);

    const { data: numbers, error: numbersError } = await supabase
      .from('numeros_asignados')
      .select('numero, participante_id')
      .eq('sorteo_id', sorteoId);

    if (numbersError) throw numbersError;
    if ((numbers || []).length < Number(raffle.total_numeros)) {
      return json({ error: 'Todavia quedan numeros sin vender' }, 409);
    }

    const selected = numbers[Math.floor(Math.random() * numbers.length)];
    const { data: participant, error: participantError } = await supabase
      .from('participantes')
      .select('*')
      .eq('id', selected.participante_id)
      .single();

    if (participantError) throw participantError;

    await supabase
      .from('sorteos')
      .update({ estado: 'sorteando', sorteado_at: new Date().toISOString() })
      .eq('id', sorteoId);

    const { data: winner, error: winnerError } = await supabase
      .from('ganadores')
      .insert({
        sorteo_id: sorteoId,
        participante_id: participant.id,
        numero_ganador: selected.numero,
        nombre: `${participant.nombre} ${participant.apellido}`,
        localidad: `${participant.provincia} · ${participant.localidad}`,
        telefono: participant.telefono,
        premio: raffle.premio,
      })
      .select()
      .single();

    if (winnerError) throw winnerError;
    return json({ winner });
  } catch (error) {
    return json({ error: error.message || 'draw-winner failed' }, 500);
  }
});
