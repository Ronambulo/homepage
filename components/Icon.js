import { guessIcon } from "@/lib/defaults";

// Icono minimalista: máscara sobre /icons/<nombre>.svg, hereda el color del texto.
export default function Icon({ link, name, size = 16, style }) {
  const n = name || guessIcon(link);
  const src = `url(/icons/${n}.svg)`;
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block", width: size, height: size, flex: "none", background: "currentColor",
        WebkitMask: `${src} center / contain no-repeat`, mask: `${src} center / contain no-repeat`, ...style,
      }}
    />
  );
}
