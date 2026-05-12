import handler from "./[...path].mjs";

export default async function router(request, response) {
  const url = new URL(request.url ?? "/", "https://auctus-api.vercel.app");
  const path = url.searchParams.get("path");
  if (path) {
    const query = new URLSearchParams(url.searchParams);
    query.delete("path");
    const search = query.toString();
    request.url = `${path}${search ? `?${search}` : ""}`;
  }

  await handler(request, response);
}
