import { redirect } from "next/navigation";

export default async function LegacyResourceRedirect({
  params,
  searchParams
}: {
  params: Promise<{ language: string; format: string; category: string }>;
  searchParams: Promise<{ resource?: string }>;
}) {
  const [{ language, format }, query] = await Promise.all([params, searchParams]);
  const selected = query.resource ? `?resource=${encodeURIComponent(query.resource)}` : "";
  redirect(`/resources/${language}/${format}${selected}`);
}
