import { createServer } from "node:http";

// Synthetic acceptance content only. No accounts, remote assets or real data.
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Capture acceptance fixture</title><style>
* { box-sizing:border-box } body { margin:0; background:#faf8f2; color:#252b25; font:18px system-ui; } main { max-width:980px; margin:auto; padding:36px; } h1 { font-size:48px; line-height:1.1; } .cta { display:inline-block; background:#252b25; color:#252b25; padding:18px 28px; border-radius:30px; } .panel { height:110px; background:#efe6fe; border-left:12px solid #6834a7; margin:24px 0; } @media(max-width:500px){ main { padding:20px } h1 { font-size:36px } }
</style><main><h1>Field notes on a quiet city</h1><p>An intentionally defective capture fixture, not a quality benchmark.</p><a class="cta" href="#letter">Get the letter</a><div class="panel" aria-label="Purple diagnostic panel"></div><a href="#letter">Read the city story</a><section id="letter"><h2>Newsletter signup</h2><p>Story links should not lead here. This fixture has no form, tracking or submission.</p></section></main></html>`;
const server = createServer((_request, response) => {
  response.writeHead(200, {
    "content-type": "text/html",
    "cache-control": "no-store",
  });
  response.end(html);
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address && typeof address !== "string")
    console.log(`http://127.0.0.1:${address.port}/`);
});
const stop = () => {
  server.closeAllConnections();
  server.close(() => process.exit(0));
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
