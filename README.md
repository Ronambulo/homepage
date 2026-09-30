# Homepage

Página de inicio minimalista (Next.js) con panel de edición en `/admin`.

## Docker

```bash
cp .env.example .env      # pon tu ADMIN_PASSWORD
docker compose -f docker-compose.dev.yml up -d --build   # build local; en el servidor: docker-compose.yml (imagen de ghcr.io)
```

- Inicio: http://localhost:3000 · Panel: http://localhost:3000/admin
- Configuración y fondo subido: volumen `/data` (`config.json`, `background.*`).
- En CasaOS, sustituye el volumen por `/DATA/AppData/homepage/data:/data`.
- Sin `ADMIN_PASSWORD` el panel es abierto (solo LAN). Con HTTPS, `COOKIE_SECURE=1`.

## Desarrollo

```bash
npm install
npm run dev
```

`legacy/index.html` es la versión estática anterior.
