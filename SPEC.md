# ESPECIFICACIÓN v1.2 — Museo Espacial Interactivo (Beta)

## 0. Propósito

Proyecto educativo y narrativo en una página web pública. El jugador recorre un museo, elige artefactos históricos y vive dos misiones simuladas: el LRV de Apollo 17 en la Luna y Perseverance en Marte. Aprende sobre el hardware que dejamos en otros mundos y la ciencia que hizo.

- **Apollo 17 (Luna):** el LRV quedó en la Luna en 1972. Es un artefacto inactivo.
- **Perseverance (Marte):** rover activo desde 2021 en el cráter Jezero. Se presenta como explorador en curso, no como artefacto abandonado.

**Principio:** la precisión histórica es obligatoria. Las interacciones pueden simplificarse, pero nunca se presenta como hecho histórico algo que no ocurrió.

## 1. Plataforma y stack

- **Tipo:** página web pública, sin backend. Todo corre en el navegador.
- **Build:** Vite + TypeScript.
- **3D:** Three.js.
- **Seguimiento corporal:** `@mediapipe/tasks-vision` (cara, pose y manos) desde la webcam.
- **Audio:** Web Speech API (`speechSynthesis`) en la primera versión. La capa de audio debe quedar desacoplada para cambiarla a archivos grabados después.
- **Persistencia:** `localStorage` por ahora.
- **Publicación:** hosting estático (Netlify), con HTTPS obligatorio para la webcam.
- **Modelos:** formato `.glb` en `public/models/`.
- **Rutas:**
  - `/` — juego.
  - `/debug/` — página de depuración del seguimiento (solo desarrollo).

## 2. Seguimiento corporal

- Se usa la webcam del computador. Sin hardware adicional.
- La precisión es limitada, así que zonas neutrales, umbrales y sensibilidades son configurables.
- **Detección:**
  - **Cara:** roll de la cabeza (inclinación lateral) y cabeceo (subir o bajar la cabeza, desde la matriz de pose de la cara). El yaw (girar la cara) no cuenta.
  - **Rodillas:** altura relativa respecto a la cadera, para detectar caminar (sección 5.1).
  - **Hombros:** solo referencia de postura. No se usan para caminar.
  - **Manos:** landmarks para volante, cursor, pellizco, aplauso y señalar.

**Estado actual:** el código base compila y la escena renderiza. El seguimiento de cara, cuerpo y manos está verificado con cámara real. La detección de caminar por rodillas está implementada, pero sus umbrales aún no se han validado (ver sección 14).

### 2.1 Requisito de encuadre

- Al iniciar el juego, y antes de calibrar, las rodillas (landmarks 25 y 26 de pose) deben tener visibilidad mayor a 0.5.
- Mientras no se cumpla, el juego no avanza ni calibra. En pantalla se muestra la instrucción que corresponde:
  - **“Retrocede”:** el cuerpo está demasiado cerca. Se detecta cuando una rodilla visible toca el borde inferior del encuadre (y > 0.97), o cuando las rodillas quedan estimadas fuera de la imagen (y > 1).
  - **“Acércate”:** el cuerpo está demasiado lejos o no se ven las rodillas.
  - **Correcto:** ambas rodillas visibles y dentro del encuadre. Se avanza.
- Estados posibles: `ok`, `retroceder`, `acercarse`. Implementado en `src/tracking/framing.ts`.

## 3. Calibración

- Se realiza una sola vez, al iniciar el juego.
- Instrucción en pantalla: “Mira al frente con la cabeza quieta y las manos relajadas.”
- **Captura:**
  - Roll neutral de la cabeza (0°, mirando al frente).
  - Cabeceo neutral de la cabeza (mirando al frente).
  - Altura neutral de hombros (solo referencia de postura; no se usa para caminar).
  - Posición neutral de las manos.
- Se guarda en el perfil del jugador.
- Botón “Recalibrar” en el menú de opciones.

## 4. Esquema general de control

| Acción | Método |
| --- | --- |
| Caminar en el museo | Subir las rodillas (caminar en el sitio) |
| Girar la vista en el museo | Inclinar la cabeza hacia un lado |
| Mirar arriba o abajo en el museo | Subir o bajar la cabeza (límite ±35°) |
| Señalar vitrina | Cursor con el dedo índice (por defecto). El rayo desde el hombro queda como opción |
| Iniciar inmersión | Aplaudir |
| Desplegar LRV (Apollo 17) | Mantener la tecla E 3 s, en los dos modos de control (aún no tiene gesto) |
| Conducir LRV | Volante gestual con ambas manos |
| Avanzar LRV | Subir las rodillas (caminar en el sitio) |
| Avanzar Perseverance | Inclinar una mano hacia arriba |
| Retroceder Perseverance | Inclinar una mano hacia abajo |
| Girar Perseverance | Inclinar la cabeza hacia un lado |
| Seleccionar objetivo científico | Cursor con una mano + pellizco |
| Recoger muestra (Apollo 17) | Golpe con una mano + agarre con la otra |
| Volver al museo | Aplaudir |

**Regla (giro proporcional):** la cabeza siempre mira al frente. El giro se detecta como inclinación lateral (roll), y el mirar arriba o abajo como cabeceo (pitch), con la misma regla y la misma zona muerta y sensibilidad. La velocidad de giro es proporcional a la inclinación:

- Velocidad (°/s) = (|inclinación| − zona muerta) × sensibilidad.
- Zona muerta por defecto: **3°**. Dentro de ±3° no gira nada.
- Sensibilidad por defecto: **0.6** (rango 0.2–1.0, en opciones).
- Velocidad máxima de giro por defecto: **60°/s**. Nunca se supera.
- Inclinación pequeña = giro lento; inclinación grande = giro más rápido.
- Aplica a la cámara del museo y, en Perseverance, al rover (sección 9.2; pendiente de implementar).

**Regla (caminata proporcional):** la velocidad de avance es proporcional a la cadencia de pasos (pasos por segundo), no a un valor fijo. Velocidad objetivo = min(velocidad máxima, distancia por paso × cadencia). Un paso lento avanza despacio y caminar más rápido avanza más.

- Velocidad máxima por defecto: **1.2 m/s** (configurable).
- Aceleración y frenado graduales de **0.5 s**.

## 5. Detección de gestos

### 5.1 Caminar (alternancia de piernas)

- Señal = `y(rodilla izquierda) − y(rodilla derecha)`, con los landmarks 25 y 26 de Pose. Al restar, se cancela el movimiento de todo el cuerpo al acercarse o alejarse.
- Suavizado: media móvil corta de 4 muestras.
- Amplitud = valor absoluto del pico, en % de la altura del cuerpo (extensión vertical de los landmarks visibles). Amplitud mínima por defecto **4 %**, configurable entre **1 % y 15 %** en `/debug/`.
- Un paso = un pico (máximo o mínimo local de la señal) con amplitud ≥ amplitud mínima y **signo opuesto** al del último paso contado. Así cada paso alterna pierna. Los picos que no cumplen se ignoran.
- Visibilidad: si alguna rodilla tiene visibilidad < 0.5, el fotograma no cuenta, la señal se corta y el estado muestra **“rodilla no visible”**.
- No hay calibración neutral.
- Si no hay pasos durante 0.5 s, el jugador se considera detenido.
- `/debug/` muestra la señal en vivo, los picos (verde: contaron; gris: rechazados), la línea de amplitud mínima, el contador de pasos y la amplitud del último pico.

### 5.2 Aplauso

- Se detecta cuando las dos manos se juntan (distancia entre muñecas o palmas bajo un umbral).
- Cooldown de 1.5 s para evitar doble disparo.
- Dispara la inmersión (museo → Luna o Marte) o el regreso al museo.

### 5.3 Señalar (dedo índice)

- Método por defecto: **cursor**. Un círculo sigue la punta del índice (landmark 8) de la mano que señala.
  - Coordenadas con espejo horizontal. Escala: el 60 % central del encuadre cubre la pantalla entera.
  - Filtro exponencial para suavizar (factor 0.3 por defecto). Si la mano no se ve, el cursor se queda en su última posición, atenuado, y no señala ninguna vitrina.
- Opción alternativa: **rayo** desde el hombro hasta la punta del índice.
- Vitrina seleccionada tras 1.5 s de intersección (cursor sobre la vitrina, o rayo). Mientras tanto se resalta.

### 5.4 Pellizco

- Distancia entre pulgar e índice bajo un umbral.
- Confirma la selección científica en Perseverance.

### 5.5 Avatar espejo

- Las manos del avatar replican las manos reales con todos sus gestos.
- Pérdida momentánea de la mano: la mano se queda en su última posición y pose. Desaparece solo tras `tiempoOcultarManoS` segundos sin detección (1 s por defecto, configurable). Al reaparecer aparece donde la detecta la cámara; solo se desliza si el salto es menor que `umbralSaltoManoM` (0,05 m por defecto).

## 6. Pérdida de seguimiento

| Situación | Comportamiento |
| --- | --- |
| Pérdida de cabeza en Perseverance | El rover desacelera gradualmente en 1–2 s |
| Pérdida de manos en LRV | El volante queda en el último ángulo y el vehículo desacelera gradualmente |
| Cara o cuerpo fuera de encuadre | El movimiento se congela. El juego no se pausa |
| Rodillas perdidas durante el juego | El movimiento se congela, igual que cara o cuerpo fuera de encuadre. El juego no se pausa |
| Rodillas sin pasos durante 0.5 s | El jugador se considera detenido |

Al regresar el seguimiento, la acción continúa sin reinicio.

## 7. Museo

Parte visual: ver spec-visual-museo.md.

### 7.1 Escena

- Museo con vitrinas. Cada vitrina contiene un artefacto (LRV, Perseverance y otros).
- El mentor está físicamente presente en el museo: flota siempre delante del jugador, a unos 2 m y un poco a la derecha del centro de la pantalla (para no tapar las vitrinas), a altura fija. Lo sigue al caminar y girar con un resorte suave (retraso corto, inclinación hacia donde se mueve), se acerca si hay una vitrina, la pared o la peana del cohete central en su sitio, y no aparece solo al señalar. Mientras habla gesticula sin parar con los brazos; los gestos del guion tienen prioridad sobre los de relleno.

### 7.2 Flujo de un artefacto

1. El jugador camina en el museo (subiendo las rodillas).
2. Gira la vista inclinando la cabeza.
3. Señala una vitrina con el índice durante 1.5 s. La vitrina se resalta.
4. El mentor empieza a hablar la explicación de la vitrina. Habla frase a frase, y cada frase aparece como subtítulo mientras suena.
5. Cuando termina la última frase, aparece el texto “Aplaude para entrar (o pulsa espacio)”.
6. El jugador aplaude o pulsa espacio. Se entra a la escena con fundido de 0.6 s:
   - Vitrina del LRV → presentación del LRV (sección 7.4) y, al terminar, Luna, junto al LRV.
   - Vitrina de Perseverance → Marte, solo con Perseverance visible.
7. Comienza la misión.

**Reglas del flujo:**

- **La explicación siempre termina.** Ningún evento la interrumpe: moverse, girar la cabeza, caminar, perder la cara o las manos, cambiar el método de señalar, pulsar otra tecla. La voz no se corta; el movimiento solo mueve la cámara.
- **Durante la explicación, no se acepta ninguna selección nueva ni aplauso.** Si el jugador señala otra vitrina mientras habla, esa selección se ignora hasta que termine la voz.
- **Explicación por frases.** El texto se divide en frases. Se reproduce una frase y, al terminar (evento `onend`), pasa a la siguiente. Así Chrome no corta frases largas. Las referencias de cada `SpeechSynthesisUtterance` se guardan en un arreglo mientras dura la explicación, para que el navegador no las elimine.
- **Respaldo sin voz.** Si no hay voces disponibles o la síntesis falla, los subtítulos se muestran igual y cada frase avanza con un temporizador de 15 caracteres por segundo. El flujo nunca se queda trabado. Si una frase con voz no envía su evento de fin, avanza tras su duración de respaldo más 5 s.
- **Aviso al terminar.** Cuando termina la última frase, aparece el aviso “Aplaude para entrar”. Este aviso no depende de dónde está el jugador ni hacia dónde mira.
- **Entrada.** Al aplaudir o pulsar espacio después del aviso, se entra a la escena de la vitrina seleccionada. No se comprueba la posición del jugador, la dirección de la cámara ni si la vitrina está en pantalla. Un aplauso durante la explicación no hace nada.
- **Selección bloqueada hasta entrar.** Desde que se selecciona una vitrina hasta que se entra, la selección no cambia. La vitrina sigue resaltada.
- La barra espaciadora funciona en todo el flujo como respaldo del aplauso.
- En la escena, el texto de la sesión anterior (“misión en construcción”) se mantiene.
- Para volver al museo, aplaude o pulsa espacio (sección 7.3). Después, el jugador puede señalar otra vitrina y empezar una nueva explicación.

### 7.4 Presentación del LRV

Animación corta e informativa entre la vitrina del LRV y la misión lunar. Guion y máquina de estados en `src/game/presentacionLRV.ts`; escena en `src/visual/presentacionLRV.ts`; rótulos y textos en pantalla en `src/ui/presentacionUi.ts`.

- **Cuándo:** al aplaudir o pulsar espacio tras la explicación de la vitrina del LRV (la explicación y el aviso “Aplaude para entrar” no cambian). Al terminar, aparece “Estás listo para la misión”, el narrador lo dice y se entra a la Luna con el fundido de siempre. La misión es la misma de antes.
- **Contenido:** solo el LRV (el mismo modelo que se conduce, desplegado y cargado). Sin astronautas, personas ni sus sombras. Suelo de regolito gris, cielo negro con el Sol, la Tierra y las estrellas de la escena lunar, un solo Sol con sombras duras y el mismo render que la misión.
- **Narrador:** la voz del mentor (el robot del museo), con la misma síntesis y el mismo catálogo de audio grabado. Una frase por tramo; cada tramo dura su mínimo o lo que tarde su frase, lo que sea mayor, así la imagen y los subtítulos no se desfasan. Si la voz nunca avisa del final, el tramo sigue a los 20 s de su mínimo.
- **Cámara sincronizada con la frase:** cada plano empieza en la palabra que lo pide. En `es.json` y `en.json`, las frases `pres_*` llevan marcas `{@id}` justo antes de esa palabra (no se ven ni se dicen; `src/audio/guion.ts`). El guion de cada tramo (`anclas`, tomas y marcas en `src/game/presentacionLRV.ts`) está escrito en segundos “nominales” (lo que dura la frase en español) y el reloj (`RelojNarrado`) los lleva al tiempo real: cada ancla coincide con su palabra cuando la voz la dice, las que aún no han sonado se prevén con el ritmo de la voz (caracteres por segundo, medido en las frases anteriores o, con audio grabado, tomado de sus tiempos) y el último instante del guion cae en el final de la frase. Así el movimiento se estira o se encoge por idioma y por voz. Una marca que un idioma no tiene (p. ej. “Diseñadas para rodar por otro mundo” en inglés) se ignora con sus tomas y rótulos (`ancla` en `Toma` y `Marca`). Si la voz no avisa de una marca, el guion sigue su previsión. Además, la cámara respira siempre (`movimientoAmbiente`) y la última escena termina en un plano de revelación (el LRV entero y el terreno) que sigue, con una órbita lenta, bajo “Estás listo” (`TRAMO_LISTO`).
- **Subtítulos:** abajo, sincronizados con la voz. Se apagan y encienden con la tecla C o en Opciones (“Subtítulos en la animación del LRV”).
- **Saltar:** Enter, desde la segunda escena (la introducción siempre se ve). Salta a “Estás listo para la misión”. Durante la animación el museo no recibe entradas (ni moverse ni aplaudir).
- **Escenas, en orden** (guion de unos 126 s de narración en español, más la pausa entre frases y los fundidos; en inglés dura menos porque las frases son más cortas): introducción, peso con la tarjeta de la Tierra y la Luna, distancias, chasis, ruedas, electrónica y navegación (consola, giroscopio y odómetro, cámara y antenas con la Tierra en el cielo), energía con baterías y Mylar, mando y movimiento (vista dividida) y cierre en el suelo naranja del cráter Shorty, con fundidos de 0.5 s entre escenas. Cámara con ease-in-out (curva cúbica monótona entre tomas, sin paradas en cada una), nunca quieta mientras habla el narrador. Las piezas se resaltan con un contorno azul celeste y un rótulo en español que aparecen y se van en 0.5 s. Cada frase explica el porqué en pocas palabras.
- **Distancias:** vista desde arriba con dos trazos sobre el mismo terreno: el corto (“Caminando”) y el largo (“Con el LRV: 36 km (Apolo 17)”), que se dibuja más rápido. Esquemáticos, con la proporción de 3.45 km a 36 km (EVA-2 del Apolo 14, la más larga a pie, frente al LRV del Apolo 17; NSSDC). No son recorridos reales.
- **Mando y movimiento:** vista dividida: a la izquierda, el LRV desde arriba, que se mueve según el mando (adelante avanza, a un lado gira con el radio de giro de 3.1 m, atrás sin interruptor frena y con él retrocede); a la derecha, el primer plano del mando y su interruptor de marcha atrás. Después, el panel con “Potencia de tracción”, “Dirección” y “Habilitar tracción”. El LRV de esta escena se mueve a un máximo de 1.6 m/s adelante y 0.9 m/s atrás.
- **Datos:** NSSDC y Wikipedia (“Lunar Roving Vehicle”) y ALSJ, citados en `src/game/presentacionLRV.ts`. El mando en T: adelante avanza, a los lados gira y atrás frena; para la marcha atrás se activa un interruptor del mando antes de tirar hacia atrás (NSSDC). // VERIFICAR con el manual de operación del LRV. Las baterías iban en el chasis delantero. Navegación: giroscopio direccional y odómetro, sin GPS; mando con interruptor de marcha atrás; el LRV viajó plegado en el cuadrante 1 del LM (NSSDC). 36 km: NSSDC da 35.9 km conducidos en el Apolo 17 (SP-4029: 35.7 km). 460 lb y 76 lb: 210 kg de masa son unas 463 lb; las 76 lb en la Luna son una sexta parte y NASA no las cita directamente (// VERIFICAR). El rumbo del LRV respecto al Sol, la forma del marco interior de la rueda, el recorrido del mando y qué columnas del panel ocupa cada grupo de interruptores son del modelo (// VERIFICAR).
- **Sin escena 3D:** si no se puede montar, se pasa directo a “Estás listo para la misión” y a la Luna.

### 7.3 Regreso

- Al terminar la misión, el mentor (voz en off) pide aplaudir.
- El aplauso devuelve al jugador al museo.
- El mentor aparece físicamente y da una conclusión breve.

## 8. Misión lunar — Apollo 17

### 8.1 Escena

- Terreno lunar con el LRV plegado en la bahía del LM y una roca marcada con halo.
- Cámara en primera persona, con las manos del astronauta visibles.
- Halo azul celeste sobre la roca de Station 1, cerca de Steno Crater.
- Sitio: valle de Taurus-Littrow, junto al LM Challenger, 1 h después del inicio de la EVA-1 (12 dic. 1972, 00:54 UTC). Sol y Tierra según la tabla del ALSJ (Sol a 15.7° de altura y azimut 96.8°; Tierra a 45.3° y azimut 240.7°, gibosa al 68 %). Estrellas del catálogo Hipparcos en su posición real, muy tenues. Datos y fuentes en `src/visual/sitioApollo17.ts` y `src/visual/cielo.ts`.
- El jugador llega a pie: camina y mira como en el museo, sin atravesar el LM ni el LRV. Para subir, se acerca al LRV (3.2 m) y aplaude. Lejos del LRV, el aplauso no lo sienta y el mentor le pide acercarse.
- Despliegue del LRV: el LRV empieza plegado en la bahía del cuadrante suroeste del LM, con la parte de abajo del chasis hacia fuera, como viajó (ALSJ, NSSDC). Mientras está plegado o desplegándose no se puede subir ni conducir, y se muestra "Mantén E para desplegar el LRV". Mantener E llena un anillo en el centro de la pantalla en 3 s (`SEGUNDOS_MANTENER_DESPLEGAR`); soltarla antes lo vacía en 0.35 s sin desplegar nada. Con el anillo lleno, E queda bloqueada y se reproduce la secuencia real de Apollo 17 (117:26–117:48 GET, unos 21 min) acortada a 44.5 s: liberación con la anilla en D, inclinación con la cinta, a 45° se abre el chasis trasero y saltan sus ruedas, ruedas traseras al suelo y apertura del delantero a 73°, bajada del frente, retiro y alineación hacia el este, guardabarros, asientos y consola, encendido y prueba de manejo (marcha atrás para apartarse del LM, por fuera de la pata sur y un bucle hasta la posición de estacionamiento), y montaje de la LCRU, las antenas, la cámara y el geopallet. El mentor lo cuenta en seis frases. Fases, tiempos y fuentes en `src/visual/despliegueApollo17.ts`; el recorrido de la prueba de manejo y las medidas de la bahía son del modelo, no de una fuente.
- Sentado en el asiento del comandante (izquierdo, con el mando en T a la derecha), el giro de la cabeza o el ratón mueve solo la vista (hasta ±100° del rumbo).
- Simplificación de juego: la roca y su cráter de ~20 m están a ~45 m del LRV, no a los ~1.1 km reales de la estación 1. El LRV aparca apuntando a la roca. Los textos de la misión lo dicen.

### 8.2 Conducción

- Dirección: volante gestual con ambas manos. La cabeza no controla el LRV.
- Manos centradas = recto.
- Girar ambas manos izquierda o derecha = giro correspondiente.
- Zona neutral configurable.
- Avance: subir las rodillas (caminar en el sitio). El LRV avanza 2.25 veces lo caminado: a la velocidad máxima de caminata (1.2 m/s) va a 2.7 m/s, su velocidad máxima de diseño (6 mph).
- Al dejar de caminar, el vehículo se detiene.
- Ruedas: las cuatro eran direccionables y, en el modo normal, las traseras giraban en sentido contrario a las delanteras, con un radio de giro de 3.1 m (NSSDC). En el juego, el ángulo de las ruedas sigue al volante: Ackermann en los dos ejes, hasta 50° la rueda interior y ~22° la exterior. Sin manos, las ruedas se quedan en el último ángulo; al detenerse conservan el ángulo y dejan de rodar en unas décimas de segundo. Ruedan según la velocidad, en sentido contrario al retroceder.
- Bajarse: pellizco (pulgar e índice, sección 5.4) con las dos manos a la vez y los otros tres dedos extendidos, sostenido 0.4 s, con cooldown de 1.5 s; con teclado, la tecla B. Solo sentado y fuera del golpe y el agarre. El vehículo se detiene donde está y el jugador queda de pie junto al asiento del comandante. El LRV conserva su posición y la muestra, si ya se recogió. A pie, el aplauso junto al LRV vuelve a sentarlo; con la muestra recogida, el aplauso vuelve al museo.
- El LRV no atraviesa el LM ni la roca, y no se aleja más de 260 m del LM.

### 8.3 Recolección

1. Al llegar cerca de la roca resaltada, el jugador da un golpe con una mano (movimiento rápido hacia abajo).
2. Con la otra mano hace un gesto de agarre (pellizco o cierre de mano).
3. La muestra aparece en la mano del astronauta.
4. La misión termina.
5. El mentor felicita (voz y subtítulos) y pide aplaudir para volver al museo.

### 8.4 Error

- Si el jugador regresa sin recoger la muestra correcta, vuelve al museo sin sanción.
- El mentor dice algo como: “Estuviste cerca. Vuelve cuando quieras intentarlo.”

### 8.5 Inactividad

- Si el jugador no interactúa durante mucho tiempo, no pasa nada. No hay pistas automáticas.

### 8.6 Precisión histórica

- Los astronautas de Apollo usaron martillos, pinzas y palas. No se usa pico.
- Golpear y recoger es una simplificación interactiva, no la secuencia exacta de gestos reales.
- No se inventan números de catálogo ni se identifica el fragmento como muestra específica sin verificarlo.

### 8.8 Cinemática final: el despegue

- Al recoger la muestra, el mentor dice "Misión cumplida" y explica el suelo y el LRV. Al terminar esa frase empieza una cinemática de ~40 s sin música, con textos abajo a la izquierda que el mentor lee en voz alta. Si la voz dura más que el hueco de su texto, la imagen se detiene en ese plano hasta que termina la frase (como mucho 15 s).
- Tomas: acercamiento al LRV y a su cámara de TV con los dos astronautas junto a la escalera del LM; plano fijo de la cámara de TV (aspecto de transmisión de los años 70: grano, viñeta, color apagado) con el encendido del motor de ascenso, la llama tenue y la lluvia de restos; seguimiento con la cámara inclinándose y sobreexponiéndose hasta que el módulo es un punto de luz; vista desde el módulo de ascenso, hacia abajo y atrás, con la bandera, el LRV solo y sus huellas; plano final del LRV solo en el valle, con la cámara subiendo y la sombra alargándose; fundido a negro.
- Datos: el LRV queda aparcado en su posición final vista por LRO (128 m al este-sureste del LM) con la cámara hacia el LM; la cámara la manejaba un operador en Houston. La llama del motor de ascenso es casi invisible en el vacío, así que se dibuja tenue. Aproximado (VERIFICAR): posición de la bandera, subida vertical de ~10 s y giro de ~52° hacia el oeste. La bajada del Sol en el plano final es un recurso visual, no un dato.
- Tiempos y textos en `src/game/cinematicaDespegue.json` (se ajustan sin tocar el código). Lógica en `src/game/cinematicaDespegue.ts`, escena en `src/visual/despegueLM.ts`, capa de pantalla en `src/ui/cinematicaUi.ts`.
- Botón "Omitir" (o Enter): pasa directo al final. Si se recarga la página a mitad, tras elegir el control se vuelve a la Luna y la cinemática sigue donde estaba (localStorage `museo-espacial:cinematica-despegue:v1`).
- Al terminar, modo libre: el módulo de ascenso ya no está, el jugador queda a pie detrás del LRV y puede caminar y mirar; el aplauso vuelve al museo (con teclado, mantener E). Las huellas del LRV en la Luna se dibujan desde que se conduce.

### 8.7 Modo de movilidad limitada — deshabilitado en beta

- En el menú aparece en gris con la etiqueta “Próximamente”.
- Cuando se active en una versión futura:
  - El avance se hace moviendo los brazos como si caminara: se detecta la oscilación de muñecas y codos y se convierte en avance, con una lógica análoga a la de las rodillas.
  - El LRV avanza hasta quedar cerca de la roca y se detiene solo.
- Detrás de un flag desactivado en el código.
- Pendiente: si la dirección sigue con volante o se automatiza.

## 9. Misión marciana — Perseverance

### 9.1 Escena

- Terreno marciano del cráter Jezero.
- Solo aparece Perseverance.
- Cámara tres cuartos elevada, según la referencia visual de la v0.4:
  - No cenital.
  - No a nivel del suelo detrás del rover.
  - Muestra la parte superior y un costado.
- El rover ocupa una parte importante de la pantalla, con zoom moderado.
- Sigue al rover suavemente, sin vibraciones ni movimientos bruscos.

### 9.2 Conducción

- Avance: mano inclinada hacia arriba. Retroceso: hacia abajo. Mano neutral = detenido.
- Aceleración y frenado graduales.
- Dirección: roll de la cabeza.
- El jugador elige qué mano usa para avance y retroceso.
- Pérdida de seguimiento: desaceleración gradual (sección 6).

### 9.3 Selección científica

- La otra mano controla un cursor en pantalla.
- El jugador apunta al objetivo científico. El halo lo resalta.
- Pellizco para confirmar.
- El brazo robótico ejecuta la secuencia simplificada de perforación y almacenamiento (animación automática).
- El jugador no controla las articulaciones del brazo.

### 9.4 Final

- Tras confirmar, el mentor felicita y pide aplaudir para volver al museo.

## 10. Halo azul celeste (todas las misiones)

- Color y brillo constantes. No pulsa ni cambia de color.
- Rodea el objetivo sin ocultar su forma ni textura.
- Visible hasta completar la acción. En la Luna se ve desde la llegada hasta recoger la muestra.
- No ilumina objetos ajenos a la actividad.

## 11. Mentor

- **Museo:** presencia física. Explica el artefacto y da la conclusión.
- **Misiones:** solo voz en off y subtítulos.
- **Idioma:** bilingüe. El jugador elige español o inglés en opciones.
- **Personalidad:** amigable, curioso, inteligente, ligeramente divertido.
- **Extensión:** explicaciones breves. No interrumpe las actividades.
- **Voz:** generada por ahora (Web Speech API). Decisión sobre voz grabada pendiente.
- **Textos:** en `src/i18n/es.json` y `en.json`. El español se revisa antes de traducir.

## 12. Guardado

Por jugador se guarda:

- Calibración de cabeza, hombros y manos.
- Misiones completadas.
- Configuración del menú (sensibilidades, idioma).

No se guardan muestras recogidas como progreso.

## 13. Opciones (menú)

- Sensibilidad de giro de cabeza.
- Zona neutral de cabeza.
- Sensibilidad del volante del LRV.
- Velocidad máxima de caminata (1.2 m/s por defecto).
- Distancia por paso (0.4 m por defecto) y tiempo de aceleración hasta la velocidad máxima (0.5 s por defecto).
- Método de señalar: cursor con el dedo índice (por defecto) o rayo desde el hombro.
- Mano que señala (derecha por defecto), sensibilidad del cursor (1.0) y suavizado del cursor (0.3).
- Tamaño de la mano (1.25 por defecto, rango 0.6–2.0): escala las longitudes; el grosor no cambia.
- Ajuste de modelo de mano (casilla, apagada por defecto): la pose de la mano sale de ajustar un modelo articulado (24 parámetros, límites anatómicos de HAND_JOINT_LIMITS en `src/visual/manoModelo.ts`) a los landmarks, en vez de reconstruirla frame a frame.
- Separación entre manos (0 m por defecto, rango 0–0.6 m, paso 0.01 m): separación total entre las dos manos del avatar. Cada mano se desplaza la mitad hacia su lado (solo en x). Se aplica en vivo y se guarda en localStorage.
- Segundos sin ver la mano antes de que desaparezca (1 s) y salto máximo para deslizarse al reaparecer (0,05 m).
- Topes de las articulaciones de la mano (grados, mín y máx por parámetro), con botón de restaurar.
- Control: cámara (gestos) o teclado y ratón. Se elige en la pantalla de inicio y se guarda en localStorage (`museo-espacial:control:v1`). El botón “Cambiar control” vuelve a la pantalla de inicio. El mapeo de teclas está en spec-visual-museo.md, sección 9.1.
- Idioma (español / inglés).
- Subtítulos en la animación del LRV (activados por defecto; también con la tecla C durante la animación).
- Recalibrar.
- Modo de movilidad limitada (deshabilitado, “Próximamente”).

## 14. Estado de implementación

- [x] Proyecto Vite + TypeScript con Three.js.
- [x] Compilación (`npm run build`) sin errores.
- [x] Escena base renderiza.
- [x] Página `/debug/` carga la webcam y arranca MediaPipe.
- [x] Seguimiento de cara verificado con cámara real.
- [x] Seguimiento de cuerpo verificado con cámara real.
- [x] Seguimiento de manos verificado con cámara real.
- [x] Módulo de encuadre (`src/tracking/framing.ts`) mostrado en `/debug/`. Todavía no bloquea el inicio del juego, porque el juego aún no existe.
- [x] Caminar por rodillas implementado (`src/tracking/metrics.ts`) y visible en `/debug/`.
- [ ] Umbrales de caminar por rodillas validados con cámara real.
- [x] Pantalla de inicio con elección de control; la elección persiste al recargar. Si la cámara falla, se ofrece el modo teclado (verificado en Chrome sin webcam).
- [x] Modo teclado y ratón: W A S D, espacio (entrar y subir al LRV), E o clic izquierdo (señalar, golpear, agarrar con un segundo toque, y mantenida: desplegar, recoger y volver al museo), clic derecho y Esc. Verificado en Chrome sin interfaz: seleccionar la vitrina del LRV, entrar, sentarse, conducir hasta la roca, golpe, agarre y volver al museo. En modo teclado no se pide la cámara.
- [ ] Mirar con el ratón con pointer lock real en un navegador con ventana (la lógica se probó simulando la captura del ratón).
- [ ] Modo cámara después de separar la capa de entrada (`src/input/`): probado solo con la webcam simulada de Chrome (carga MediaPipe y pide encuadre). Falta probar calibración y gestos con cámara real.
- [ ] Manos como guantes de traje con fuelles (spec-visual-museo.md, sección 9): verificadas con manos sintéticas; falta verlas con cámara real.
- [ ] Museo y navegación.
- [ ] Misión lunar. Escena de Taurus-Littrow (LM, LRV, terreno, macizos, Sol, Tierra y estrellas), caminar a pie y subir al LRV: probado en Chrome sin interfaz con teclado, de la vitrina a la muestra y de vuelta al museo. Falta verlo en un navegador con ventana y con cámara real.
- [ ] Despliegue del LRV desde la bahía del LM (mantener E, anillo y animación por fases): probado en Chrome sin interfaz con teclado, de la llegada a la Luna a subirse al LRV desplegado, y la secuencia revisada en capturas. Falta verlo en un navegador con ventana y decidir un gesto para el modo cámara.
- [ ] Presentación del LRV entre la vitrina y la misión lunar (sección 7.4), con la cámara sincronizada con cada frase en español e inglés: guion probado con `node --test tests/presentacionLRV.test.ts` y tomas revisadas en capturas sin interfaz (`tests/capturas/presentacion/`). Falta verla en un navegador con ventana y con voz.
- [ ] Cinemática del despegue (sección 8.8): línea de tiempo probada con `node --test tests/cinematicaDespegue.test.ts`, tomas revisadas en capturas sin interfaz (`tests/capturas/despegue/`) y, en Chrome sin interfaz con teclado, reanudar tras recargar, Omitir y caminar en el modo libre. Falta verla en un navegador con ventana, con cámara real y llegando desde la recogida de la muestra.
- [ ] Misión marciana.
- [ ] Mentor y voz.
- [ ] Publicación.
