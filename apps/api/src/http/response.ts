import type { ServerResponse } from "node:http";

export type JsonBody = Record<string, unknown> | unknown[];

export const sendJson = (
  response: ServerResponse,
  statusCode: number,
  body: JsonBody,
): void => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
};

export const sendEmpty = (response: ServerResponse, statusCode: number): void => {
  response.writeHead(statusCode);
  response.end();
};
