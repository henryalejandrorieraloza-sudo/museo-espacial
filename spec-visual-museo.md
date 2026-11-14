# Especificación visual del museo (low poly)

Fuente: entrevista con Henry (/interview). Alcance: solo la parte visual del museo. Controles, misiones, tracking y la lógica de la mano no cambian.

## 0. Precedencia

- Las capturas de `referencia/` marcan el estilo: formas, color, luz y densidad de detalle. Son inspiración; no se copian piezas de ellas.
- Ante cualquier conflicto, gana este documento: sin figuras humanas, robot azul flotante con sonrisa fija, sin plataformas flotantes (la pasarela va sobre columnas), y objetos históricos con su color real.
- Cambio del 4 de noviembre de 2026: Henry sustituye el ambiente claro con luz plana por el estilo oscuro, vivo y con luces de color de las referencias.

## 1. Estilo general
- Low poly con caras facetadas y sombreado plano. Paneles biselados, costuras entre placas, ventilaciones y tuberías. Rugosidad 0.6–0.9 y metalicidad 0.1–0.3 (el cristal va sin iluminar).
- Arquitectura en púrpuras y violetas, con cobre y rojo ladrillo. Dorado y ámbar en la luz principal. Cian brillante en tiras de luz, hologramas y bordes de vitrina. Nada de grises planos ni materiales por defecto.
- **Fidelidad histórica:** el cobre y el ladrillo solo van en arquitectura y mobiliario. El LRV, Perseverance, los trajes, los cohetes y los planetas conservan formas y colores cercanos a los reales; la luz puede teñirlos, pero sus materiales no se pintan con la paleta. La paleta y los colores históricos están separados en `src/visual/paleta.ts` (`ARQ` e `HIST`).
- Iluminación: luz direccional ámbar, relleno hemisférico púrpura y contorno cian. Sin sombras proyectadas. Luces neutras en vitrinas y cápsulas, para que los objetos se vean de su color. Luz neutra de corto alcance en la cámara, para que el guante se vea blanco y legible.
- Ambiente: niebla púrpura y, por los ventanales, nebulosa púrpura y verde, asteroides, un sol y una gigante gaseosa decorativos.
- Bloom suave por umbral: solo florecen los materiales emisivos. Nada de esto se aplica en las misiones, que conservan su aspecto propio.

## 2. Rendimiento
- Objetivo: 30 FPS fijos en el museo.
- Si el detalle compite con el seguimiento corporal, reducir detalle antes que bajar FPS.
- Lo estático se fusiona por material (una llamada de dibujo por tipo) y los asteroides usan `InstancedMesh`. La nebulosa se pinta una vez en un cubemap. Render del museo: resolución limitada a 1.25×, MSAA 2× y bloom a un cuarto de resolución. Estos valores están al inicio de `src/visual/ambiente.ts`.

## 3. Sala
- Rotonda de 32 m de diámetro con 24 caras. Pasarela a 5.2 m de altura, sobre columnas y sin acceso para el jugador. **Paredes negras** (decisión de Henry del 14 de noviembre de 2026): lisas y sin nada encima: ni pantallas LED, ni estrellas, ni carteles, ni rótulos, ni puertas, ni zócalo.
- **Planetario visto desde dentro:** el techo es una cúpula facetada negra, sin luces, focos ni estrellas (decisión de Henry del 14 de noviembre de 2026: el techo y lo que cuelga de él no llevan luces, y la sala queda en penumbra; la luz viene de los planetas, los hologramas y las líneas del suelo). De ella cuelga un sistema solar con los ocho planetas en su orden real y color aproximado y, entre ellos, una cascada de unos 33 planetas decorativos inventados (no representan cuerpos reales y no llevan rótulos), como la de la foto de referencia de Henry del 14 de noviembre de 2026. Todos brillan con suavidad, con un halo tenue de su color, y el más grande de varios estilos alumbra la sala con una luz puntual apenas perceptible de su color. **Jerarquía de luces** (decisión de Henry del 14 de noviembre de 2026): las de los objetos expuestos (vitrinas, hologramas, cápsulas) son las más intensas de la sala, y las de los planetas son tenues, lo justo para alumbrar un poco. Tamaños y órbitas no están a escala.
- La cúpula es baja a propósito: con cabeceo de ±35° y 60° de campo vertical, la vista llega a 65° sobre el horizonte.
- El jugador camina hasta 15 m del centro y no puede atravesar la peana del Saturn V central. Las misiones conservan su límite anterior.

## 4. Vitrinas de artefactos
- Forma: cubo de cristal de 3.5 m con bordes cian y luz interior neutra, para que el artefacto se vea de su color.
- Pedestal octogonal con anillo de color propio: cian en el LRV y ámbar en Perseverance.
- Vitrina del LRV (Apollo 17) y vitrina de Perseverance van una al lado de la otra, a unos 9 m del inicio.
- Dentro de cada vitrina: modelo del artefacto a tamaño real aproximado. El cursor prueba contra un volumen invisible, no contra cada pieza.
- Los artefactos son inactivos en su vitrina (el LRV es un artefacto de 1972). Perseverance se presenta como explorador en curso, según SPEC.md sección 0.

## 4.1 Cápsulas de laboratorio
- Cápsulas de cristal con trajes A7LB vacíos dentro (sin persona): blancos, con visor dorado. El del comandante lleva franjas rojas.
- No hay figuras humanas en ningún lugar del museo.
- Los trajes de astronauta aparecen solo en vitrinas o cápsulas.
- **Excepción (aprobada por Henry el 8 de noviembre de 2026):** las manos del jugador en primera persona son guantes de traje (sección 9). No son una figura humana ni un traje completo.

## 5. Robot-mentor
- Forma: compacta, como la imagen de referencia (cuerpo redondeado, visor oscuro, brazos cortos, sin piernas).
- Color: todo azul (cuerpo, brazos y visor). Ojos y sonrisa en tono claro, como la imagen.
- Movimiento: flota. Sube y baja suave y gira hacia el jugador cuando habla.
- Expresión: sonrisa fija. Los ojos no cambian según el momento.
- Tamaño: compacto, similar a la imagen de referencia.

## 6. Decoración
- Saturn V (Apollo 17) y Atlas V 541 (Perseverance) a la misma escala 1:13, sobre peanas con anillo. La torre de cobre de al lado es mobiliario, no una réplica.
- Globos de la Luna y Marte sobre peanas, con colores aproximados a los reales.
- Rocas en vitrinas pequeñas: muestras facetadas sin identificar, no piezas de catálogo.
- Consolas de laboratorio con hologramas y gráficas abstractas, sin datos reales.
- Una torre de comunicaciones junto a la pared, cajas de equipo y el Saturn V central (1:10) sobre una peana oscura con barandilla de cristal, sin luz en la base: ni anillos LED ni resplandor en el suelo (decisión de Henry del 14 de noviembre de 2026).
- No incluir plataformas flotantes.

## 7. Transición museo a misión
- Fundido a negro de aproximadamente un segundo, y luego aparece la escena nueva.

## 8. Subtítulos del mentor
- Texto flotante, sin caja de fondo.
- Texto con contorno para legibilidad sobre cualquier fondo.
- Ubicado cerca del robot.

## 9. Mano 3D
- Se dibuja como guante de traje espacial low poly: malla sólida, no huesos sueltos. Todo se genera en código (`src/visual/guante.ts`), sin texturas ni modelos externos.
- Forma facetada (referencia low poly), conservando el diseño de guante: tela blanco hueso (#e9e6df), panel palmar #d9d5cc, bandas grises (#9aa0a6). Material con `flatShading`, normales por cara y un tono ligeramente distinto por cara según su orientación. Sin `DoubleSide`.
- Malla cerrada: palma, cuña tenar, dedos y puño forman una malla sin aristas abiertas y con todas las caras hacia afuera, en las dos manos (un único constructor con la lateralidad como parámetro; la palma izquierda invierte el orden de los vértices de cada cara en vez de reflejarse con escala negativa).
- Dedos: cada dedo es un tubo hexagonal cerrado, generado en cada fotograma desde su MCP (`actualizarDedos`). Cada unión es un anillo compartido por los dos tramos (inglete), así el codo no deja huecos. El radio fijo en metros (`RADIO_SEGMENTO`) se afina de 1.0 a 0.75 hasta la punta, cortada casi plana con un bisel pequeño.
- Bandas: caras de color metal del propio tubo, una por unión y con el mismo largo en todos los dedos, generadas con el mismo bucle (`CADENAS_DEDO`): MCP, PIP y DIP en los cuatro dedos largos y MCP e IP en el pulgar (su CMC queda dentro de la cuña): 4 × 3 + 2 = 14.
- Palma (dinámica, `actualizarPalma`): su anillo superior se coloca sobre los 4 MCP reales (dos vértices por MCP, a ±12,5 mm: el dedo nace en su punto medio) y los MCP nunca se mueven. Los anillos intermedios salen de la plantilla en el marco local de la palma, a lo sumo 0,12 anchos más allá de los MCP (`LIMITE_LATERAL_PALMA`). El anillo de la muñeca es el del cuello del puño: comparten sus 8 vértices.
- Pulgar: dos tramos que salen de la cuña tenar (de la muñeca a su MCP). El anillo final de la cuña es el primer anillo del pulgar (mismos vértices).
- Puño: manga octogonal con una franja azul y otra roja, anillo de cierre metálico biselado y cuello. En el dorso, un emblema circular genérico (dos prismas hexagonales cerrados, rojo y azul), sin logos de agencias ni misiones.
- Color: la constante `GUANTE_ESTILO` elige el estilo (`"blanco"` por defecto o `"plata"`).
- Rendimiento: 690 triángulos por mano (1.380 las dos) y 4 llamadas de dibujo por mano (presupuesto: 400 a 700 por mano).
- Las longitudes de hueso siguen siendo `HAND_BONE_LENGTHS`, y los ángulos, topes, tamaño constante (muñeca a `HAND_FIXED_DISTANCE`), separación y lógica de desaparición ya confirmados no cambian. El grosor no escala con el Tamaño de la mano: con Tamaño 0,6 los dedos vecinos se solapan.
- Capturas de comprobación: `tests/capturas/manos/` (escena de captura, antes y después, y `geometria.ts` (malla cerrada, vértices compartidos, límites de la palma, bandas, separación) y `comprobar.ts`, que verifica que ningún dedo atraviesa la palma y que el pulgar queda a la izquierda con la palma de frente).

## 9.1 Control de entrada
- Al abrir el juego, una pantalla de inicio muestra el título, las dos formas de control y el botón "Empezar". La elección se guarda en `localStorage` (`museo-espacial:control:v1`) y se puede cambiar en Opciones con "Cambiar control", que vuelve a la pantalla de inicio.
- **Cámara (gestos):** la de siempre (SPEC.md secciones 4 y 5). Si la webcam o MediaPipe fallan, la pantalla de inicio vuelve con un mensaje y el modo teclado marcado.
- **Teclado y ratón:** no se pide la cámara ni se carga MediaPipe, y las manos 3D no se muestran. Una mira fija en el centro de la pantalla hace de cursor.
- Las dos fuentes producen la misma lectura (`src/input/fuente.ts`): aplauso, señalar, giro y cabeceo, caminata, pellizco, golpe y volante. `game/museo.ts` y las misiones no saben de qué fuente viene cada acción.

| Tecla | Acción | Equivale a |
| --- | --- | --- |
| W / S | Caminar hacia delante / atrás. Misma velocidad máxima y aceleración que en Opciones | Subir las rodillas |
| A / D | Paso lateral en el museo. En el LRV, volante a la izquierda / derecha | Volante gestual (en el LRV) |
| Ratón | Mirar (pointer lock: clic en la escena para capturarlo) | Inclinar y cabecear la cabeza |
| Espacio | Aplaudir: entrar a la misión o volver al museo | Aplauso |
| E o clic izquierdo (mantener) | Señalar la vitrina del centro de la pantalla; 1.5 s la selecciona. En la Luna, golpe | Dedo índice; golpe con la mano |
| F o clic derecho | Pellizco y agarre | Pellizco |
| B | Bajarse del LRV (misión lunar) | Pellizco sostenido con las dos manos |
| Esc | Abrir o cerrar Opciones. Soltar el ratón también abre Opciones | — |

- Con teclado, los textos de ayuda y las frases del mentor en la Luna nombran la tecla en vez del gesto.

## 10. Escena lunar (Apollo 17)
- El LM y el LRV siguen el lenguaje del museo: low poly, caras facetadas, sombreado plano y los lotes de `paleta.ts`. El LRV lleva más detalle que el resto (decisión de Henry, 11 de noviembre de 2026), sin cambiar de estilo: ruedas de malla tejida con chevrones, aros y buje; guardabarros con extensiones; bastidor con bisagras; asientos de cintas; mantas térmicas de beta cloth blanco (sin oro: el Kapton dorado es del LM); antenas con varillas y hélice; cables; y polvo gris en la parte baja. Cada rueda va en su propio grupo para girar con la dirección y rodar.
- El suelo busca parecerse a las fotos de superficie de Apollo 17: lomas y cráteres con normales suaves (sin facetas), regolito con grano, hoyitos y motas por píxel (`regolito.ts`), y decenas de miles de rocas instanciadas con tamaños en ley de potencia, medio enterradas y facetadas. Más allá del suelo, un solo relieve lejano facetado (low poly) rodea el valle: colinas bajas en todo el horizonte que unen el suelo con los macizos, y los macizos con faldas, contrafuertes, cumbres, collados y barrancos. Las crestas son estilizadas (los macizos reales son más redondeados); las alturas de `sitioApollo17.ts` son el máximo. Suelo, rocas y macizos son mates y reflejan con la ley de Lommel-Seeliger en vez de Lambert: el suelo lejano no se oscurece hacia el horizonte y el contraste lo ponen las sombras.
- Objetos históricos con colores de `HIST` (LM con Kapton ámbar, ámbar oscuro, amarillo, negro y plata; etapa de ascenso gris). La luz los tiñe, pero no se pintan con la paleta del museo.
- Luz: sol direccional casi blanco con sombras duras (las únicas sombras proyectadas del juego), relleno gris desde abajo (la luz que rebota en el suelo; el cielo es negro) y cian solo en el halo. Bloom solo en el disco solar (umbral más alto que en el museo, para que las piezas al sol no brillen como emisivas). Sin niebla.
- Cielo negro, Tierra pequeña (1.9°) y fija, Sol bajo en el este y estrellas reales muy tenues. Horizonte cercano por la curvatura (~2.4 km), con crestas, cráteres y los macizos detrás.
- Suelo en gris casi neutro, con manchas algo más oscuras y material más claro alrededor de los cráteres frescos. El suelo naranja de Shorty (estación 4) no se dibuja: está a ~7 km, más allá del horizonte, y estaba enterrado bajo la capa gris (Schmitt lo destapó con una zanja).
- Sin figuras humanas ni mentor físico.
- Render en dos pasadas: lo lejano (cielo y macizos) y lo cercano encima, con su propia profundidad.

## 11. Pendientes (no cubiertos en la entrevista)
- Escena de Perseverance: su detalle visual va en otra entrevista.
- Halo azul celeste: se mantiene según SPEC.md sección 9.

## 12. Reglas de trabajo para Claude Code
- Sin dependencias nuevas. Si la librería actual no alcanza para el estilo, avisar antes de cambiar nada.
- No importar modelos de packs de terceros. Construir la geometría en el código.
- Sin commit hasta que Henry confirme. Un commit por elemento: paredes y luces, vitrinas, artefactos, cápsulas, robot, decoración, transición, subtítulos, mano en malla.
- No ejecutar comandos de sistema fuera del build y las pruebas.
