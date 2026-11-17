import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CheckKey, CheckStore, OftCheckRow, OftPathwayRow } from '@/lib/check/cache';
import type { CheckResult } from '@/types/domain';

// Klien Supabase sisi server (service role) untuk menulis cache Check. Kunci service role
// hanya dipakai di modul server-only ini dan tidak pernah dikirim ke klien.
// Catatan: `src/types/db.ts` (hasil `supabase gen types`) belum ada karena Supabase lokal
// belum pernah dijalankan; sampai itu ada, bentuk baris diketik lewat OftCheckRow/OftPathwayRow.

export function createServiceClient(config: { url: string; serviceRoleKey: string }): SupabaseClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createCheckStore(client: SupabaseClient): CheckStore {
  return {
    async latest(key: CheckKey): Promise<CheckResult | null> {
      const { data, error } = await client
        .from('oft_checks')
        .select('raw')
        .eq('network', key.network)
        .eq('chain_key', key.chain)
        .eq('address', key.address.toLowerCase())
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Supabase oft_checks read failed: ${error.message}`);
      return (data?.raw as CheckResult | undefined) ?? null;
    },

    async insert(row: OftCheckRow, pathways: Array<Omit<OftPathwayRow, 'check_id'>>): Promise<void> {
      const { data, error } = await client.from('oft_checks').insert(row).select('id').single();
      if (error) throw new Error(`Supabase oft_checks insert failed: ${error.message}`);
      if (pathways.length === 0) return;
      const checkId = (data as { id: string }).id;
      const { error: pathwayError } = await client
        .from('oft_pathways')
        .insert(pathways.map((pathway) => ({ ...pathway, check_id: checkId })));
      if (pathwayError) throw new Error(`Supabase oft_pathways insert failed: ${pathwayError.message}`);
    },
  };
}
