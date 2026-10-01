<p align="center"><img src="docs/kero.png" alt="Kero" width="160"></p>

<h1 align="center">Homepage</h1>

<p align="center">
  Página de inicio para tu servidor casero: tus apps, tus datos de un vistazo y <b>Kero</b>, un compañero que vive en la página.
</p>

<p align="center">
  <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-000?logo=nextdotjs">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca?logo=react">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white">
  <img alt="Licencia MIT" src="https://img.shields.io/badge/licencia-MIT-a7dcb8">
</p>

---

## Qué tiene

- **Accesos a tus apps** con icono, orden por arrastre y comprobación de si responden.
- **Buscador** (Google, DuckDuckGo, Bing o Brave).
- **Widgets** que se activan desde el panel:

  | Widget | Qué muestra |
  |---|---|
  | Patrimonio | Patrimonio neto, ahorro del ciclo e inversiones (FinanceMaster) |
  | Servicios | Qué apps responden ahora y su disponibilidad en 30 días |
  | Clima | Tiempo actual y previsión de varios días (Open-Meteo, sin clave) |
  | Tareas | Lista rápida guardada en el navegador |
  | Servidor | CPU, memoria, disco y temperaturas de la máquina (y de ZimaOS si lo tienes) |
  | Calendario | Próximos eventos de un calendario iCal |
  | GitHub | Contribuciones, PRs, issues y CI |
  | DiscoPanel | Servidores de Minecraft y jugadores conectados |
  | Immich | Fotos y vídeos de hoy y total de la biblioteca |
  | Casa | Home Assistant: temperatura, caldera y Roomba |

- **Temas** (Grafito, Bosque, Ámbar, Índigo, Malva) y fondo propio.
- **Alertas**: servicio caído, temperatura de CPU o discos y disco lleno, con umbrales configurables.
- **Panel `/admin`** para editarlo todo sin tocar archivos, con copia de seguridad completa (exportar e importar).

## Kero

Kero es una mancha con ojos que pasea por la parte de abajo de la página. No lleva nada puesto: solo es él.

- **Se fija en lo que haces**: comenta los widgets al pasar el ratón, reacciona a las alertas y se pone rojo si algo falla.
- **Recordatorios y temporizadores**, escribiéndole:
  - «recuérdame mañana a las 9 llamar al dentista»
  - «pon un temporizador de 10 minutos»
  - «recuérdame todos los lunes a las 9 sacar la basura» · «cada 2 horas beber agua»

  Avisa con un tilín, una burbuja y una notificación si la pestaña está en segundo plano. El aviso se puede posponer (+10 min, +1 h).
- **Contesta sobre tus datos sin IA**: «¿qué tengo el viernes?», «¿qué tiempo hará mañana?», «¿está caído Plex?», «¿cuántas tareas me quedan?».
- **Resumen del día** en la primera visita: agenda, lluvia, tareas y recordatorios.
- **Se acuerda de ti**: «¡cuánto tiempo!» si llevas días sin entrar, fechas especiales, tu cumpleaños si se lo cuentas.
- **El tiempo en su cuerpo**: al pasar por el widget del clima se moja, tirita, suda o mira las estrellas según el tiempo que haga.
- **Duerme** de noche (y sueña con lo que tienes pendiente), se echa siestas y se deja arrastrar y lanzar.
- **IA opcional** con un modelo de [Open WebUI](https://openwebui.com/) / Ollama (doble clic para hablar). Puede buscar en internet con SearXNG o la búsqueda de Open WebUI.

Todo se ajusta en `/admin` o con clic derecho sobre él: nombre, color, tamaño, por dónde se mueve, cuánto habla y cada comportamiento.

## Instalación con Docker

```bash
cp .env.example .env
```

Edita `.env` y pon tu `ADMIN_PASSWORD`. Luego, para construir la imagen en local:

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

O, en el servidor, con la imagen publicada en `ghcr.io`:

```bash
docker compose up -d
```

- Inicio: http://localhost:3000 · Panel: http://localhost:3000/admin
- En CasaOS, usa el volumen `/DATA/AppData/homepage/data:/data`.

### Variables de entorno

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` | `3000` | Puerto publicado (compose de desarrollo) |
| `ADMIN_PASSWORD` | — | Contraseña de `/admin`. Sin ella el panel queda abierto: úsalo solo en tu LAN |
| `COOKIE_SECURE` | `0` | Ponlo a `1` si sirves la página por HTTPS |
| `DATA_DIR` | `./data` | Carpeta de datos (en Docker, `/data`) |

### Datos

Todo vive en la carpeta de datos:

- `config.json`: enlaces, widgets, apariencia, alertas y ajustes de Kero (con copias en `backups/`).
- `secrets.json`: tokens y contraseñas de las integraciones. Las peticiones a esos servicios se hacen desde el servidor.
- `background.*`: el fondo subido.

La copia de seguridad del panel incluye los secretos: guárdala en un sitio seguro.

## Desarrollo

```bash
npm install
npm run dev
```

```bash
npm test
```

Los tests (`node --test`) cubren la lógica pura de Kero: fechas en lenguaje natural, órdenes, recordatorios repetidos, respuestas, resumen del día, saludos y el tiempo.

### Estructura

```
app/                 páginas (/ y /admin) y rutas de la API
components/          Home, Admin, widgets y Companion (Kero)
components/lunares/  motor de Kero: animación, comportamientos, charla, menú, efectos y sonido
lib/                 configuración, secretos, widgets del servidor, búsqueda web
lib/lunares/         lógica pura de Kero (sin React), probada con tests
test/                tests de lib/lunares
legacy/              la versión estática anterior
```

## Licencia

[MIT](LICENSE) © Enrique Rodríguez del Real
