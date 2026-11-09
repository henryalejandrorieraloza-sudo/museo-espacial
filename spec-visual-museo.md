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
- Rotonda de 32 m de diámetro con 24 caras. Pasarela a 5.2 m de altura, sobre columnas y sin acceso para el jugador. Ventanales de 5.7 a 10.5 m.
- **Planetario visto desde dentro:** el techo es una cúpula facetada con estrellas (decorativas, sin constelaciones reales). De ella cuelga un sistema solar con los ocho planetas en su orden real y color aproximado. Tamaños y órbitas no están a escala.
- La cúpula es baja a propósito: con cabeceo de ±35° y 60° de campo vertical, la vista llega a 65° sobre el horizonte.
- El jugador camina hasta 15 m del centro y no puede atravesar el proyector central. Las misiones conservan su límite anterior.

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
- Una torre de comunicaciones junto a la pared, cajas de equipo y proyector central.
- No incluir plataformas flotantes.

## 7. Transición museo a misión
- Fundido a negro de aproximadamente un segundo, y luego aparece la escena nueva.

## 8. Subtítulos del mentor
- Texto flotante, sin caja de fondo.
- Texto con contorno para legibilidad sobre cualquier fondo.
- Ubicado cerca del robot.

## 9. Mano 3D
- Se dibuja como guante de traje espacial low poly: malla sólida, no huesos sueltos. Todo se genera en código (`src/visual/guante.ts`), sin texturas ni modelos externos.
- Palma presurizada con un pliegue sutil y una costura junto a los nudillos.
- Cada dedo tiene tres segmentos. En cada articulación (nudillo, PIP y DIP; MCP e IP del pulgar) hay un fuelle de 5 costillas metálicas que sobresalen un poco. Puntas algo más gruesas y redondeadas.
- Muñeca: manga, dos tiras de color, anillo de cierre grande y anillo metálico. En el dorso de la manga, un parche genérico (cuadrado redondeado con un círculo rojo y otro azul), sin logos de agencias ni de misiones.
- Color: la constante `GUANTE_ESTILO` elige el estilo. `"blanco"` (por defecto): tela blanco hueso (#e9e6df) y fuelles, costuras y anillo en gris metálico (#9aa0a6). `"plata"`: plateado metálico con puntas negras.
- Sombreado plano.
- Rendimiento: las dos manos suman 7.200 triángulos y 10 llamadas de dibujo (presupuesto: 8.000). Las piezas se mueven con transformaciones; la geometría se crea una sola vez.
- Los fuelles y anillos son solo decoración. Las longitudes de hueso siguen siendo `HAND_BONE_LENGTHS`, y los ángulos, topes, tamaño constante, separación y lógica de desaparición ya confirmados no cambian.

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
| Esc | Abrir o cerrar Opciones. Soltar el ratón también abre Opciones | — |

- Con teclado, los textos de ayuda y las frases del mentor en la Luna nombran la tecla en vez del gesto.

## 10. Pendientes (no cubiertos en la entrevista)
- Escenas de Apollo 17 y Perseverance: su detalle visual va en otra entrevista.
- Halo azul celeste: se mantiene según SPEC.md sección 9.

## 11. Reglas de trabajo para Claude Code
- Sin dependencias nuevas. Si la librería actual no alcanza para el estilo, avisar antes de cambiar nada.
- No importar modelos de packs de terceros. Construir la geometría en el código.
- Sin commit hasta que Henry confirme. Un commit por elemento: paredes y luces, vitrinas, artefactos, cápsulas, robot, decoración, transición, subtítulos, mano en malla.
- No ejecutar comandos de sistema fuera del build y las pruebas.
