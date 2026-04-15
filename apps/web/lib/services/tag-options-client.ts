import { createClient } from '@/lib/supabase-browser';
import type { TagOption, TagCategory } from '@/lib/services/tag-options';

export type { TagOption, TagCategory };

export async function createTag(input: {
  name: string;
  category: TagCategory;
  sort_order?: number;
}): Promise<TagOption | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tag_options')
    .insert({
      name: input.name,
      category: input.category,
      sort_order: input.sort_order ?? 0,
    })
    .select()
    .single();
  if (error) return null;
  return data as TagOption;
}

export async function updateTag(
  id: string,
  patch: { name?: string; sort_order?: number }
): Promise<TagOption | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tag_options')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) return null;
  return data as TagOption;
}

export async function deactivateTag(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('tag_options')
    .update({ is_active: false })
    .eq('id', id);
  return !error;
}

export async function reactivateTag(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('tag_options')
    .update({ is_active: true })
    .eq('id', id);
  return !error;
}