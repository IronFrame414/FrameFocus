import { createClient } from '@/lib/supabase-browser';

// S128 Part F — choose a project's cover. ONE write path for desktop and /m (PARITY): the
// set_project_cover RPC, which checks the role, that the file is a photo on THIS project, and
// never touches files.client_visible.
export async function setProjectCover(
  projectId: string,
  fileId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await createClient().rpc('set_project_cover', {
    p_project_id: projectId,
    p_file_id: fileId,
  });
  return error ? { success: false, error: error.message } : { success: true };
}
