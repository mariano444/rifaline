import { adminClient, fetchCurrentState, handleOptions, json } from '../_shared/helpers.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const supabase = adminClient();
    const state = await fetchCurrentState(supabase);
    return json(state);
  } catch (error) {
    return json({ error: error.message || 'bootstrap failed' }, 500);
  }
});
