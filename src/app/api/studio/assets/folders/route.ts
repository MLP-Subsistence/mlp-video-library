import { ok, requireStudioApiUser, studioRoute } from "@/lib/studio/access";
import { listOriginalAssetFolders } from "@/lib/studio/asset-folders";

export const GET = studioRoute(async () => {
  await requireStudioApiUser();
  return ok({ folders: await listOriginalAssetFolders() });
});
