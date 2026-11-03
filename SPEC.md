# ESPECIFICACIÓN v1.1 — Museo Espacial Interactivo (Beta)

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
  - **Hombros:** oscilación vertical para detectar caminar.
  - **Manos:** landmarks para volante, cursor, pellizco, aplauso y señalar.

**Estado actual:** el código base compila y la escena renderiza. El seguimiento en vivo no está verificado todavía (ver sección 14).

## 3. Calibración

- Se realiza una sola vez, al iniciar el juego.
- Instrucción en pantalla: “Mira al frente con la cabeza quieta y las manos relajadas.”
- **Captura:**
  - Roll neutral de la cabeza (0°, mirando al frente).
  - Altura neutral de hombros.
  - Posición neutral de las manos.
- Se guarda en el perfil del jugador.
- Botón “Recalibrar” en el menú de opciones.

## 4. Esquema general de control

| Acción | Método |
| --- | --- |
| Caminar en el museo | Oscilación de hombros (caminar en el sitio) |
| Girar la vista en el museo | Inclinar la cabeza hacia un lado |
| Señalar vitrina | Apuntar con el dedo índice |
| Iniciar inmersión | Aplaudir |
| Conducir LRV | Volante gestual con ambas manos |
| Avanzar LRV | Oscilación de hombros (caminar en el sitio) |
| Avanzar Perseverance | Inclinar una mano hacia arriba |
| Retroceder Perseverance | Inclinar una mano hacia abajo |
| Girar Perseverance | Inclinar la cabeza hacia un lado |
| Seleccionar objetivo científico | Cursor con una mano + pellizco |
| Recoger muestra (Apollo 17) | Golpe con una mano + agarre con la otra |
| Volver al museo | Aplaudir |

**Regla:** la cabeza siempre mira al frente. El giro se detecta como inclinación lateral (roll). Umbral por defecto: 15°, configurable.

## 5. Detección de gestos

### 5.1 Caminar (oscilación de hombros)

- Se mide la oscilación vertical de los hombros a lo largo del tiempo.
- Cada ciclo completo cuenta como un paso.
- La velocidad es proporcional a la cadencia de pasos, con un máximo configurable.
- Si no hay oscilación durante 0.5 s, el jugador se considera detenido.
- Oscilaciones menores que el umbral se ignoran (evita falsos positivos al respirar).

### 5.2 Aplauso

- Se detecta cuando las dos manos se juntan (distancia entre muñecas o palmas bajo un umbral).
- Cooldown de 1.5 s para evitar doble disparo.
- Dispara la inmersión (museo → Luna o Marte) o el regreso al museo.

### 5.3 Señalar (dedo índice)

- Rayo desde el hombro hasta la punta del índice.
- Vitrina seleccionada tras 1.5 s de intersección. Mientras tanto se resalta.

### 5.4 Pellizco

- Distancia entre pulgar e índice bajo un umbral.
- Confirma la selección científica en Perseverance.

### 5.5 Avatar espejo

- Las manos del avatar replican las manos reales con todos sus gestos.
- Si las manos no se ven en la webcam, el avatar oculta las manos. No congela la última pose.

## 6. Pérdida de seguimiento

| Situación | Comportamiento |
| --- | --- |
| Pérdida de cabeza en Perseverance | El rover desacelera gradualmente en 1–2 s |
| Pérdida de manos en LRV | El volante queda en el último ángulo y el vehículo desacelera gradualmente |
| Cara o cuerpo fuera de encuadre | El movimiento se congela. El juego no se pausa |
| Hombros sin oscilación | El jugador se considera detenido |

Al regresar el seguimiento, la acción continúa sin reinicio.

## 7. Museo

### 7.1 Escena

- Museo con vitrinas. Cada vitrina contiene un artefacto (LRV, Perseverance y otros).
- El mentor está físicamente presente en el museo.

### 7.2 Flujo de un artefacto

1. El jugador camina en el museo (oscilación de hombros).
2. Gira la vista inclinando la cabeza.
3. Señala una vitrina con el índice durante 1.5 s. La vitrina se resalta.
4. El mentor explica el artefacto (voz y subtítulos, máximo 30 s).
5. El jugador aplaude para entrar a la inmersión.
6. Aparece en la escena correspondiente:
   - Vitrina del LRV → Luna, junto al LRV.
   - Vitrina de Perseverance → Marte, solo con Perseverance visible.
7. Comienza la misión.

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
- Avance: oscilación de hombros (caminar en el sitio).
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
  - El avance se hace moviendo los brazos como si caminara: se detecta la oscilación de muñecas y codos y se convierte en avance, con la misma lógica que los hombros.
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
- Velocidad máxima de caminata.
- Idioma (español / inglés).
- Recalibrar.
- Modo de movilidad limitada (deshabilitado, “Próximamente”).

## 14. Estado de implementación

- [x] Proyecto Vite + TypeScript con Three.js.
- [x] Compilación (`npm run build`) sin errores.
- [x] Escena base renderiza.
- [x] Página `/debug/` carga la webcam y arranca MediaPipe.
- [ ] Seguimiento en vivo verificado con cámara real. *(Pendiente: la carga del modelo de cuerpo se queda en “Cargando modelo de cuerpo (hombros)…”.)*
- [ ] Museo y navegación.
- [ ] Misión lunar.
- [ ] Misión marciana.
- [ ] Mentor y voz.
- [ ] Publicación.
