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
  - **Cara:** roll de la cabeza (inclinación lateral). El yaw (girar la cara) no cuenta.
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
  - Altura neutral de hombros (solo referencia de postura; no se usa para caminar).
  - Posición neutral de las manos.
- Se guarda en el perfil del jugador.
- Botón “Recalibrar” en el menú de opciones.

## 4. Esquema general de control

| Acción | Método |
| --- | --- |
| Caminar en el museo | Subir las rodillas (caminar en el sitio) |
| Girar la vista en el museo | Inclinar la cabeza hacia un lado |
| Señalar vitrina | Cursor con el dedo índice (por defecto). El rayo desde el hombro queda como opción |
| Iniciar inmersión | Aplaudir |
| Conducir LRV | Volante gestual con ambas manos |
| Avanzar LRV | Subir las rodillas (caminar en el sitio) |
| Avanzar Perseverance | Inclinar una mano hacia arriba |
| Retroceder Perseverance | Inclinar una mano hacia abajo |
| Girar Perseverance | Inclinar la cabeza hacia un lado |
| Seleccionar objetivo científico | Cursor con una mano + pellizco |
| Recoger muestra (Apollo 17) | Golpe con una mano + agarre con la otra |
| Volver al museo | Aplaudir |

**Regla (giro proporcional):** la cabeza siempre mira al frente. El giro se detecta como inclinación lateral (roll). La velocidad de giro es proporcional a la inclinación:

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
- El mentor está físicamente presente en el museo.

### 7.2 Flujo de un artefacto

1. El jugador camina en el museo (subiendo las rodillas).
2. Gira la vista inclinando la cabeza.
3. Señala una vitrina con el índice durante 1.5 s. La vitrina se resalta.
4. El mentor empieza a hablar la explicación de la vitrina. Habla frase a frase, y cada frase aparece como subtítulo mientras suena.
5. Cuando termina la última frase, aparece el texto “Aplaude para entrar (o pulsa espacio)”.
6. El jugador aplaude o pulsa espacio. Se entra a la escena con fundido de 0.6 s:
   - Vitrina del LRV → Luna, junto al LRV.
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

### 7.3 Regreso

- Al terminar la misión, el mentor (voz en off) pide aplaudir.
- El aplauso devuelve al jugador al museo.
- El mentor aparece físicamente y da una conclusión breve.

## 8. Misión lunar — Apollo 17

### 8.1 Escena

- Terreno lunar con el LRV estacionado y una roca marcada con halo.
- Cámara en primera persona, con las manos del astronauta visibles.
- Halo azul celeste sobre la roca de Station 1, cerca de Steno Crater.

### 8.2 Conducción

- Dirección: volante gestual con ambas manos. La cabeza no controla el LRV.
- Manos centradas = recto.
- Girar ambas manos izquierda o derecha = giro correspondiente.
- Zona neutral configurable.
- Avance: subir las rodillas (caminar en el sitio).
- Al dejar de caminar, el vehículo se detiene.

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
- Visible hasta completar la acción.
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
- Idioma (español / inglés).
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
- [ ] Museo y navegación.
- [ ] Misión lunar.
- [ ] Misión marciana.
- [ ] Mentor y voz.
- [ ] Publicación.
