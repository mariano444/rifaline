import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export function handleOptions(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

export function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function adminClient() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
}

export function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generatePrize() {
  return randomInt(10, 50) * 100000;
}

export function generateCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[randomInt(0, chars.length - 1)]).join('');
}

export function calcTotal(qty: number) {
  if (qty <= 2) return qty * 2500;
  if (qty <= 4) return qty * 2000;
  return qty * 1400;
}

export function timeLabel() {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const NAME_POOL: Array<[string, string]> = [
  ['Valentina', 'Rios'], ['Facundo', 'Aguirre'], ['Micaela', 'Vargas'], ['Rodrigo', 'Medina'],
  ['Luciana', 'Peralta'], ['Gonzalo', 'Ibanez'], ['Florencia', 'Coria'], ['Ezequiel', 'Acosta'],
  ['Mariela', 'Suarez'], ['Bruno', 'Ferreyra'], ['Antonella', 'Cabrera'], ['Matias', 'Romero'],
  ['Camila', 'Torres'], ['Nicolas', 'Herrera'], ['Agustina', 'Gutierrez'], ['Sebastian', 'Molina'],
  ['Julieta', 'Sosa'], ['Maximiliano', 'Ruiz'], ['Rocio', 'Fernandez'], ['Leandro', 'Garcia'],
  ['Sofia', 'Lopez'], ['Diego', 'Martinez'], ['Natalia', 'Gonzalez'], ['Pablo', 'Rodriguez'],
  ['Carla', 'Perez'], ['Tomas', 'Sanchez'], ['Vanesa', 'Ramirez'], ['Fernando', 'Cruz'],
  ['Celeste', 'Flores'], ['Ignacio', 'Moreno'], ['Paola', 'Jimenez'], ['Marcos', 'Alvarez'],
  ['Victoria', 'Rojas'], ['Cristian', 'Diaz'], ['Alejandra', 'Reyes'], ['Lucas', 'Torres'],
  ['Valeria', 'Nunez'], ['Andres', 'Castro'], ['Gimena', 'Ortega'], ['Hernan', 'Vega'],
  ['Noelia', 'Mendez'], ['Claudio', 'Ramos'], ['Melisa', 'Delgado'], ['Ariel', 'Santos'],
  ['Karina', 'Campos'], ['Walter', 'Rios'], ['Estela', 'Blanco'], ['Eduardo', 'Navarro'],
  ['Lorena', 'Fuentes'], ['Gabriel', 'Herrera'], ['Daniela', 'Vidal'], ['Santiago', 'Paredes'],
  ['Mariana', 'Guerrero'], ['Ricardo', 'Salinas'], ['Claudia', 'Medina'], ['Alberto', 'Benitez'],
  ['Veronica', 'Avila'], ['Gaston', 'Espinosa'], ['Sandra', 'Bravo'], ['Rafael', 'Cardenas'],
  ['Adriana', 'Aguilar'], ['Gustavo', 'Mendoza'], ['Rosa', 'Villareal'], ['Jorge', 'Barros'],
  ['Silvana', 'Caceres'], ['Hugo', 'Carrillo'], ['Nadia', 'Montes'], ['Federico', 'Miranda'],
  ['Elizabeth', 'Leal'], ['Martin', 'Sandoval'], ['Betina', 'Palacios'], ['Leonardo', 'Heredia'],
  ['Griselda', 'Solis'], ['Emilio', 'Salas'], ['Pamela', 'Zamora'], ['Julio', 'Vasquez'],
  ['Estefani', 'Galindo'], ['Ramiro', 'Iglesias'], ['Patricia', 'Correa'], ['Carlos', 'Arias'],
  ['Mercedes', 'Bautista'], ['Hector', 'Tapia'], ['Adrian', 'Delgadillo'], ['Julia', 'Porras'],
  ['Renata', 'Cifuentes'], ['Damian', 'Segura'], ['Belen', 'Cisneros'], ['Rolando', 'Escobar'],
  ['Nancy', 'Gomez'], ['Mario', 'Zelaya'], ['Alicia', 'Aguero'], ['Juan', 'Leiva'],
];

export const PROVINCES = [
  { prov: 'Buenos Aires', locs: ['La Plata', 'Mar del Plata', 'Bahia Blanca', 'Quilmes', 'Lanus'] },
  { prov: 'CABA', locs: ['Palermo', 'Caballito', 'Recoleta', 'Belgrano', 'Almagro'] },
  { prov: 'Cordoba', locs: ['Cordoba Capital', 'Villa Maria', 'Rio Cuarto', 'San Francisco'] },
  { prov: 'Santa Fe', locs: ['Rosario', 'Santa Fe Capital', 'Rafaela', 'Venado Tuerto'] },
  { prov: 'Mendoza', locs: ['Mendoza Capital', 'Godoy Cruz', 'San Rafael', 'Las Heras'] },
  { prov: 'Tucuman', locs: ['San Miguel de Tucuman', 'Tafi Viejo', 'Concepcion'] },
  { prov: 'Salta', locs: ['Salta Capital', 'Oran', 'Tartagal'] },
  { prov: 'Entre Rios', locs: ['Parana', 'Concordia', 'Gualeguaychu'] },
  { prov: 'Chaco', locs: ['Resistencia', 'Sanez Pena', 'Villa Angela'] },
  { prov: 'Neuquen', locs: ['Neuquen Capital', 'Plottier', 'Cutral Co'] },
  { prov: 'Jujuy', locs: ['San Salvador de Jujuy', 'Perico', 'Libertador'] },
  { prov: 'Misiones', locs: ['Posadas', 'Obera', 'Eldorado'] },
];

export const REVIEWS = [
  'Ojala me toque esta vez',
  'Todo muy transparente, me da confianza',
  'Primera vez que participo',
  'Vamos que se puede',
  'Muy serio todo, lo recomiendo',
  'Excelente iniciativa',
  '',
  '',
  '',
];

export function buildDemoParticipants(totalNumbers: number) {
  const shuffledNames = shuffle(NAME_POOL);
  const numberPool = shuffle(Array.from({ length: 300 }, (_, index) => index + 1)).slice(0, totalNumbers);
  const participants = [];
  let index = 0;
  let nameIndex = 0;

  while (index < numberPool.length) {
    const [nombre, apellido] = shuffledNames[nameIndex % shuffledNames.length];
    const province = PROVINCES[randomInt(0, PROVINCES.length - 1)];
    const qty = Math.min(randomInt(1, 4), numberPool.length - index);
    const numeros = numberPool.slice(index, index + qty).sort((a, b) => a - b);
    index += qty;
    nameIndex += 1;
    participants.push({
      nombre,
      apellido,
      telefono: null,
      provincia: province.prov,
      localidad: province.locs[randomInt(0, province.locs.length - 1)],
      metodo_pago: 'Galio Pay',
      resena: REVIEWS[randomInt(0, REVIEWS.length - 1)],
      hora_reg: `${String(randomInt(8, 21)).padStart(2, '0')}:${String(randomInt(0, 59)).padStart(2, '0')}`,
      es_demo: true,
      total_pagado: calcTotal(numeros.length),
      numeros,
    });
  }

  return participants;
}

export async function registerApprovedOrder(supabase: ReturnType<typeof adminClient>, order: any) {
  if (order.participant_id) {
    return order.participant_id;
  }

  const { data: alreadyTaken, error: takenError } = await supabase
    .from('numeros_asignados')
    .select('numero')
    .eq('sorteo_id', order.sorteo_id)
    .in('numero', order.numbers || []);

  if (takenError) throw takenError;
  if ((alreadyTaken || []).length > 0) {
    await supabase
      .from('payment_orders')
      .update({
        status: 'failed',
        error_message: 'Los numeros ya fueron asignados a otro pago aprobado.',
      })
      .eq('id', order.id);
    throw new Error('Los numeros ya fueron asignados a otro pago aprobado.');
  }

  const payload = order.participant_payload;
  const participantInsert = {
    sorteo_id: order.sorteo_id,
    nombre: payload.nombre,
    apellido: payload.apellido,
    telefono: payload.telefono,
    provincia: payload.provincia,
    localidad: payload.localidad,
    metodo_pago: payload.metodo_pago || 'Galio Pay',
    resena: payload.resena || '',
    hora_reg: payload.hora_reg || timeLabel(),
    es_demo: false,
    total_pagado: order.amount,
  };

  const { data: participant, error: participantError } = await supabase
    .from('participantes')
    .insert(participantInsert)
    .select()
    .single();

  if (participantError) throw participantError;

  const numberRows = (order.numbers || []).map((numero: number) => ({
    sorteo_id: order.sorteo_id,
    participante_id: participant.id,
    numero,
  }));

  const { error: numberError } = await supabase.from('numeros_asignados').insert(numberRows);
  if (numberError) throw numberError;

  const { error: updateOrderError } = await supabase
    .from('payment_orders')
    .update({
      participant_id: participant.id,
      paid_at: new Date().toISOString(),
    })
    .eq('id', order.id);

  if (updateOrderError) throw updateOrderError;

  return participant.id;
}

export async function fetchCurrentState(supabase: ReturnType<typeof adminClient>) {
  let { data: raffle, error } = await supabase
    .from('sorteos')
    .select('*')
    .in('estado', ['activo', 'sorteando'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (!raffle) {
    const realSlots = randomInt(20, 40);
    const prize = generatePrize();
    const secretCode = generateCode();
    const sorteoKey = `sorteo_${Date.now()}`;

    const { data: created, error: createError } = await supabase
      .from('sorteos')
      .insert({
        sorteo_key: sorteoKey,
        premio: prize,
        secret_code: secretCode,
        slots_reales: realSlots,
      })
      .select()
      .single();

    if (createError) throw createError;
    raffle = created;

    const demos = buildDemoParticipants(300 - realSlots);
    const participantRows = demos.map(({ numeros, ...participant }) => ({
      ...participant,
      sorteo_id: raffle.id,
    }));
    const { data: insertedParticipants, error: insertParticipantsError } = await supabase
      .from('participantes')
      .insert(participantRows)
      .select();

    if (insertParticipantsError) throw insertParticipantsError;

    const numberRows = insertedParticipants.flatMap((participant: any, index: number) =>
      demos[index].numeros.map((numero: number) => ({
        sorteo_id: raffle.id,
        participante_id: participant.id,
        numero,
      }))
    );

    const { error: insertNumbersError } = await supabase.from('numeros_asignados').insert(numberRows);
    if (insertNumbersError) throw insertNumbersError;
  }

  const { data: participants, error: participantsError } = await supabase
    .from('v_participantes_con_numeros')
    .select('*')
    .eq('sorteo_id', raffle.id)
    .order('created_at', { ascending: true });

  if (participantsError) throw participantsError;

  const { data: winners, error: winnersError } = await supabase
    .from('v_historial_ganadores')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (winnersError) throw winnersError;

  const { data: currentWinner } = await supabase
    .from('ganadores')
    .select('*')
    .eq('sorteo_id', raffle.id)
    .maybeSingle();

  return { raffle, participants, winners, currentWinner };
}
