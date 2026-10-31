/** TEMP DIAGNOSTIC: Web-style handler returning a Response, on the default (Node) runtime. */
export const config = {
  maxDuration: 10,
};

export default async function handler(req) {
  return new Response(
    JSON.stringify({
      style: 'web-response',
      ok: true,
      method: req.method,
      node: process.version,
      blobEnvKeys: Object.keys(process.env).filter(function (k) {
        return /BLOB/i.test(k);
      }),
      tokenLength: (process.env.BLOB_READ_WRITE_TOKEN || '').length,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
