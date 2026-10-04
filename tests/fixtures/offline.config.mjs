// Match Cloudflare's compressed static response header in the production preview.
export default {
  preview: { headers: { Vary: 'Accept-Encoding' } },
  plugins: [{
    name: 'cloudflare-clean-html-url',
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url === '/index.html') { response.writeHead(302, { Location: '/' }); response.end(); }
        else next();
      });
    },
  }],
};
