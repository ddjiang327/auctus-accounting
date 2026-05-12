import handler from "../[...path].mjs";

export default async function v1Handler(request, response) {
  request.url = request.url?.replace(/^\/api\/v1(?=\/|[?]|$)/, "/v1") ?? "/v1";
  await handler(request, response);
}
