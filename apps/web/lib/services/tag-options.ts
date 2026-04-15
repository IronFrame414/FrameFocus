import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

type TagOptionRow = Database['public']['Tables']['tag_options']['Row'];

export type TagCategory = 'trade' | 'stage' | 'area' | 'condition' | 'documentation';

export type TagOption = Omit<TagOptionRow, 'category'> & {
  category: TagCategory;
};

export async function getActiveTags(): Promise<TagOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tag_options')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) return [];
  return data ?? [];
}

export async function getAllTags(): Promise<TagOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tag_options')
    .select('*')
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) return [];
  return data ?? [];
}
