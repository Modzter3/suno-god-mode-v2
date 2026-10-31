/** TEMP DIAGNOSTIC: classic Node (req, res) handler — proves whether the Node runtime answers at all. */
export const config = {
  maxDuration: 10,
};

export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      style: 'node-res-end',
      ok: true,
      method: req.method,
      node: process.version,
      blobEnvKeys: Object.keys(process.env).filter(function (k) {
        return /BLOB/i.test(k);
      }),
      tokenLength: (process.env.BLOB_READ_WRITE_TOKEN || '').length,
    }),
  );
}
