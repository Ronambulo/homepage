// Next llama a esto una vez al arrancar el servidor: pone en marcha el bot de Telegram de Kero (lib/kerobot.js).
// Sin token guardado no hace nada (espera a que lo pongas en Editar → Conexiones).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startBot } = await import("./lib/kerobot");
  startBot();
}
