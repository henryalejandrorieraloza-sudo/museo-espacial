# Especificación visual del museo (low poly)

Fuente: entrevista con Henry (/interview). Alcance: solo la parte visual del museo. Controles, misiones, tracking y la lógica de la mano no cambian.

## 0. Precedencia

- Las capturas de `referencia/` inspiran formas, objetos y colores de acento. No son una especificación.
- Ante cualquier conflicto, gana este documento: ambiente claro, luz plana, sin figuras humanas, robot azul flotante con sonrisa fija, sin plataformas flotantes.

## 1. Estilo general
- Low poly con caras facetadas y sombreado plano.
- Ambiente claro y limpio: paredes gris claro y blanco. Los acentos de color van en vitrinas, pedestales, robot y decoración.
- Paleta de referencia (morados, rosas, turquesas, naranjas cálidos) solo en detalles y acentos, no en superficies grandes.
- Iluminación plana: sin sombras proyectadas. Luz ambiental y resaltados de color. Las luces emisivas (anillos, luz interior) sí están permitidas.
- Mucho detalle en paneles, tubos, botones y pantallas, sin sobrecargar el rendimiento.

## 2. Rendimiento
- Objetivo: 30 FPS fijos en el museo.
- Si el detalle compite con el seguimiento corporal, reducir detalle antes que bajar FPS.

## 3. Vitrinas de artefactos
- Forma: cubo de cristal transparente con marco delgado.
- Pedestal iluminado: anillo de luz en el suelo que marca el artefacto.
- Luz interior: cada cubo tiene luz desde dentro, con un color propio por artefacto.
- Vitrina del LRV (Apollo 17) y vitrina de Perseverance van una al lado de la otra, con aspecto vistoso y distinto entre sí.
- Dentro de cada vitrina: modelo completo del artefacto (ruedas, antenas, paneles).
- Los artefactos son inactivos en su vitrina (el LRV es un artefacto de 1972). Perseverance se presenta como explorador en curso, según SPEC.md sección 0.

## 4. Cápsulas de laboratorio
- Cápsulas de cristal con trajes de astronauta vacíos dentro (sin persona).
- No hay figuras humanas en ningún lugar del museo.
- Los trajes de astronauta aparecen solo en vitrinas o cápsulas.

## 5. Robot-mentor
- Forma: compacta, como la imagen de referencia (cuerpo redondeado, visor oscuro, brazos cortos, sin piernas).
- Color: todo azul (cuerpo, brazos y visor). Ojos y sonrisa en tono claro, como la imagen.
- Movimiento: flota. Sube y baja suave y gira hacia el jugador cuando habla.
- Expresión: sonrisa fija. Los ojos no cambian según el momento.
- Tamaño: compacto, similar a la imagen de referencia.

## 6. Decoración
- Planetas en exhibición: esferas facetadas de colores sólidos.
- Rocas en vitrinas pequeñas: muestras de laboratorio facetadas.
- Antenas y torres de comunicación en una esquina del museo.
- No incluir plataformas flotantes.

## 7. Transición museo a misión
- Fundido a negro de aproximadamente un segundo, y luego aparece la escena nueva.

## 8. Subtítulos del mentor
- Texto flotante, sin caja de fondo.
- Texto con contorno para legibilidad sobre cualquier fondo.
- Ubicado cerca del robot.

## 9. Mano 3D
- Se dibuja como malla sólida low poly, no como huesos sueltos.
- Color: beige, como los huesos actuales.
- Sombreado plano.
- Los ángulos, topes, offset de reposo y lógica de desaparición ya confirmados no cambian.

## 10. Pendientes (no cubiertos en la entrevista)
- Escenas de Apollo 17 y Perseverance: su detalle visual va en otra entrevista.
- Halo azul celeste: se mantiene según SPEC.md sección 9.
- Textura de piso y techo: se define en la implementación, siguiendo las capturas de referencia.
- Conflicto a confirmar: la paleta de referencia es oscura con neón, mientras que el ambiente elegido es claro. Se aplicó el ambiente claro, con la paleta solo en acentos.

## 11. Reglas de trabajo para Claude Code
- Sin dependencias nuevas. Si la librería actual no alcanza para el estilo, avisar antes de cambiar nada.
- No importar modelos de packs de terceros. Construir la geometría en el código.
- Sin commit hasta que Henry confirme. Un commit por elemento: paredes y luces, vitrinas, artefactos, cápsulas, robot, decoración, transición, subtítulos, mano en malla.
- No ejecutar comandos de sistema fuera del build y las pruebas.
