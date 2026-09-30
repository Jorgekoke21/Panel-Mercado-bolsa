# MarketRadar — Visual System · Financial Brutalism

Un ecosistema, tres productos, un ADN visual.

| Producto | Registro | Comparte | No comparte |
|---|---|---|---|
| Academia Trading / Leer el Gráfico | Neo-brutalismo educativo | Tinta negra, paleta, bordes 2px, sombras offset, bloques de color | Luckiest Guy en titulares, personajes, fondos de color a pantalla completa |
| Bots Trading | Neo-brutalismo comercial | Botones con borde y sombra, franjas de color en KPI, barra de métricas oscura | Hero ilustrado, marquee, tono de venta |
| **MarketRadar** | **Neo-brutalismo financiero** | Lo anterior, reducido y disciplinado | — |

Implementación: `src/app/globals.css` (tokens), `src/components/ui/styles.ts` (recetas), `src/components/ui/*` (primitivas).
Referencias visuales: `docs/design/references/`. Galería viva: `/dev/ui` (solo desarrollo).

## 1. Principios

1. **La marca vive en el marco; los datos, dentro.** Bordes negros, sombras y color fuerte son de contenedores, botones y estados. Filas, celdas, ejes y valores se mantienen sobrios.
2. **Papel fuera, terminal dentro.** Shell, navegación, tablas y tarjetas: crema/papel. Gráficos, heatmaps y visualizaciones: navy (`.mr-data`).
3. **El color significa algo.** Amarillo = importante/seleccionado. Morado = lo produjo la IA. Nunca decoración.
4. **Una implementación por patrón.** Un Panel, una receta de pestañas, una de segmentados, una de botones.
5. **Densidad con respiración.** Solo valores de la escala de espaciado.

## 2. Arquitectura de tokens

Tres capas en `globals.css`:

1. **Identidad** (`:root { --mr-* }`): shell claro.
2. **Superficie de datos** (`.mr-data`, también `[data-theme="dark"]`): redefine los *mismos* tokens en navy. Cualquier componente dentro de `.mr-data` se vuelve oscuro sin variantes.
3. **Tailwind** (`@theme inline`): lo que usan los componentes (`bg-surface`, `text-fg`, `border-border-brand`, `shadow-brut-1`, `rounded-card`, `font-display`…).

Ningún componente escribe hex. Los gráficos (lightweight-charts) leen tokens con `getComputedStyle(container)`, así respetan la superficie en la que están.

## 3. Paleta

### Ecosistema (valores oficiales del CSS de Academia/Bots, `--bots-*`)

| Token | Hex | Utilidad |
|---|---|---|
| `--mr-ink` | `#0b0b0b` | `text-ink`, `bg-ink` |
| `--mr-paper` | `#fffaf0` | `bg-paper` |
| `--mr-cream` | `#fff4df` | fondo del shell |
| `--mr-brand-yellow` | `#ffc620` | `bg-brand-yellow` |
| `--mr-brand-purple` | `#7737f5` | `bg-brand-purple` |
| `--mr-brand-pink` | `#f46cc4` | `bg-brand-pink` |
| `--mr-brand-green` | `#6dea72` | `bg-brand-green` |
| `--mr-brand-blue` | `#20aaf4` | `bg-brand-blue` |
| `--mr-brand-cyan` | `#64d7fa` | `bg-brand-cyan` |
| `--mr-brand-orange` | `#ff9f1c` | `bg-brand-orange` |
| `--mr-brand-red` | `#ff5a5f` | `bg-brand-red` |

Tintes suaves: `--mr-{yellow,purple,pink,green,blue,orange}-soft`.

### Superficie de datos (navy)

`#071421` fondo · `#0b1a29` superficie · `#102337` elevada · `#1f3347` separador.

### Relleno vs texto

Los colores de marca son **rellenos**. Sobre papel no dan contraste AA como texto, así que el texto usa tokens propios:

| Rol | Papel | Navy (`.mr-data`) |
|---|---|---|
| `text-positive` | `#147a36` | `#4fd67e` |
| `text-negative` | `#c42a31` | `#ff6b70` |
| `text-warning` | `#a44e00` | `#ffb454` |
| `text-link` (info/enlaces) | `#0a6ba3` | cian `#64d7fa` |
| `text-ai` / `text-inferred` | `#5b2bd1` | `#b494ff` |
| `text-synthetic` | `#0a7896` | cian |
| `text-news` | `#b0287f` | `#ff9bd8` |

`accent` = amarillo de marca (relleno de selección). **No** se usa como color de texto: los enlaces son `text-link`.

## 4. Reglas semánticas

| Color | Significa | Se usa en |
|---|---|---|
| Amarillo | Marca, selección, importancia | Pestaña/segmento activo, CTA primario, entidad principal en gráficos, confianza/importancia de eventos, sección Mercados |
| Azul/cian | Información, dato, técnico, interacción | Enlaces, foco, CALCULADO/SINTÉTICO, EMA 20/50, sección Técnico |
| Verde | Resultado positivo | Subidas, impacto positivo, REAL/OFICIAL |
| Rojo | Caída, deterioro, error | Bajadas, impacto negativo, errores |
| Morado | IA, inferencia | Pestaña IA, paneles IA, INFERIDO/IA |
| Rosa | Editorial | Paneles de noticias y contexto global |
| Naranja | Aviso, en desarrollo | PARCIAL, EN DESARROLLO, EMA 200 |
| Gris | Neutral | Metadatos, SIN DATOS |

El color de sección entra como **franja superior de 4px** (`<Panel tone>` / `<MetricCard tone>`), icono o estado activo. Nunca paneles completos.

## 5. Tipografía

| Rol | Fuente | Uso |
|---|---|---|
| Wordmark | Luckiest Guy (`font-brand`) | Solo "MARKETRADAR". Hilo directo con Academia/Bots. |
| Display | Bricolage Grotesque, eje óptico (`font-display`) | Títulos de página (S&P 500, Industriales, Apple Inc., Pulso global), precio en la ficha, titulares de eventos |
| Interfaz y cifras | Inter | Todo lo demás |

- JetBrains Mono se retiró. `font-mono` sigue existiendo por compatibilidad pero apunta a Inter con `tabular-nums`: las cifras se alinean sin parecer código.
- `.num`, `table`, `[data-num]` y `.font-mono` activan `tabular-nums`.
- Escala: página 26/800 · sección 13.5–18/700 · valor KPI 17/700 · cuerpo 13 · secundario 11.5–12 · eyebrow 10–10.5/700 mayúsculas.
- Mayúsculas solo en eyebrows, cabeceras de tabla y badges.

## 6. Bordes, radios y sombras

| Nivel | Clase | Uso |
|---|---|---|
| 1 · Estructural | `border-2 border-border-brand` | Panel, tarjetas, cabeceras de entidad, contenedores de gráfico, grupos del heatmap |
| 2 · Interno | `border-border` (1px) | Filas, separadores, cabecera interna del panel |
| 3 · Énfasis | 2px + `shadow-brut-1/2` | Botones, pestaña activa, desplegable de búsqueda, tarjeta de evento en hover |

Radios: `rounded-chip` 3px · `rounded-ctl` 5px · `rounded-card` 8px.
Sombras (duras, sin blur): `shadow-brut-1` 2px · `shadow-brut-2` 3px · `.mr-press` añade la respuesta a la pulsación (translate + sombra reducida).
Las tarjetas de datos **no** llevan sombra.

## 7. Componentes

| Pieza | Dónde | Notas |
|---|---|---|
| `Panel` | `ui/panel.tsx` | BaseCard. Props nuevas: `tone` (franja de sección) y `surface="data"` (cuerpo navy) |
| `MetricCard` | `market/metric-card.tsx` | Borde estructural, valor 17/700, `tone` opcional |
| `Badge` | `ui/badge.tsx` | Variante nueva `news`; `official` pasa a verde |
| `TabNav` | `ui/tab-nav.tsx` | Bloque amarillo con borde y sombra; `tone: "ai"` → morado |
| `buttonClass` | `ui/styles.ts` | primary · secondary · ghost · ai · positive · danger |
| `segmentGroupClass` / `segmentItemClass` | `ui/styles.ts` | Periodos, SINTÉTICO/REAL, Anual/Trimestral (antes 4 copias) |
| `tabListClass` / `tabItemClass` | `ui/styles.ts` | Pestañas de ficha y de Pulso global (antes 2 estilos) |
| `inputClass`, `chipLinkClass` | `ui/styles.ts` | Formularios y chips enlazables |

Iconos: **Lucide** (`lucide-react`), trazo 1.75–2, 16–18px. No mezclar con emoji ni otras librerías.

## 8. Gráficos

- Siempre en `.mr-data` con borde de tinta 2px.
- Tokens: `--mr-chart-bg/grid/axis/text/up/down`.
- Velas: verde/rojo de datos; volumen al 40%.
- EMA 20 azul · EMA 50 cian · EMA 200 naranja (por id del overlay, no por posición).
- Comparativas: 1.ª línea (entidad principal) amarilla y más gruesa · azul · cian · blanco hueso (benchmark).

## 9. Heatmap

Superficie navy. Grupos con contorno de tinta 2px; celdas con separación fina. Escala de 7 tramos apagados (`--mr-heat-*`). Hover: contorno amarillo.

## 10. Tablas

Filas de 30px, separador 1px, cabecera eyebrow, cifras a la derecha con Inter tabular, hover con `surface-hover`, sin zebra. Sobre papel por defecto.

## 11. Navegación y shell

- **Sidebar**: crema, separador de tinta 2px, bloque amarillo con el wordmark. Activo: barra de 3px amarilla, fondo tintado y negrita. Funciones futuras con chip `P3`/`P4`.
- **Barra superior**: 56px, buscador protagonista (borde 2px, icono Lucide, atajo `/`), estado de datos, idioma.

## 12. Noticias e IA

- Tarjeta de evento: borde estructural, titular en display, confianza en amarillo, EN DESARROLLO en naranja, sombra offset en hover.
- Paneles de noticias con franja rosa; paneles de IA con franja morada y badge IA/INFERIDO obligatorio.

## 13. Accesibilidad

- Nunca solo rojo/verde: signo, flecha y `aria-label` (ya existentes).
- Texto semántico con contraste AA sobre papel (tokens separados de los rellenos).
- Foco visible azul (`text-link`), 2px con separación.
- `prefers-reduced-motion` desactiva la animación de pulsación.

## 14. Do / Don't

| Do | Don't |
|---|---|
| `border-2 border-border-brand` en el panel, 1px en las filas | Borde negro en cada celda |
| Sombra en botones y tarjetas editoriales | Sombra en cada KPI |
| `<Panel tone="news">` | Panel entero rosa |
| `text-link` para enlaces | `text-accent` (el amarillo no es texto) |
| Luckiest Guy en el wordmark | Luckiest Guy en "Capitalización bursátil" |
| `font-display` en títulos de página | `font-display` en celdas |
| `segmentItemClass(active)` | Otra copia del control segmentado |
| Marcar un dato como SIN DATOS | Inventarlo para rellenar el diseño |

## 15. Por qué es el mismo universo

Sin mirar el logo: la tinta `#0b0b0b` contorneando cada bloque, la sombra dura en botones y pestaña activa, el amarillo `#ffc620` como estado seleccionado (igual que la lección activa en Academia), las franjas superiores de color en los KPI (como las métricas de Bots), los mismos colores con los mismos significados, el wordmark en Luckiest Guy y el shell de papel.

Y sigue siendo un SaaS financiero porque los datos viven en navy sin ilustraciones, la interfaz es Inter tabular, los radios son rectos, la sombra se reserva a lo interactivo y el color nunca decora.
