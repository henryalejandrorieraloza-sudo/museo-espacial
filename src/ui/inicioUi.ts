// Pantalla de inicio "The Museum of Stars": portada con un remolino de estelas de estrellas y, en la misma página,
// tres pasos: nombre del viajero → idioma → control (cámara o teclado). Al elegir el control empieza el museo.
// Si la cámara falla, se vuelve a mostrar solo el paso del control con el error encima.

import { cargarNombre, guardarNombre, LARGO_MAX_NOMBRE, limpiarNombre, type ModoControl } from '../game/opciones';
import { fijarIdioma, idioma, t, type ClaveTexto, type Idioma } from '../i18n';
import { crearRemolinoEstelar } from './remolinoEstelar';
import { requireEl } from './dom';

export interface DatosViajero {
  nombre: string;
  modo: ModoControl;
}

export interface InicioUi {
  /** Recorrido completo: portada → nombre → idioma → control. `preferido` sale marcado como "la última vez". */
  bienvenida(preferido: ModoControl | null): Promise<DatosViajero>;
  /** Solo el paso del control, con `error` encima (por ejemplo, si la cámara falló). */
  elegir(preferido: ModoControl, error?: string): Promise<ModoControl>;
}

/** Duración del fundido al salir de la pantalla de inicio (ms). Igual que la transición de `.inicio` en juego.css. */
const FUNDIDO_SALIDA_MS = 700;

type Paso = 'portada' | 'nombre' | 'idioma' | 'control';

const CONTROLES: { modo: ModoControl; titulo: ClaveTexto; descripcion: ClaveTexto; icono: string }[] = [
  {
    modo: 'camara',
    titulo: 'inicio_control_camara',
    descripcion: 'inicio_control_camara_desc',
    icono:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="4.5" r="2"/><path d="M12 7v6m0 0-3 7m3-7 3 7M7 10l5-2 5 2"/></svg>',
  },
  {
    modo: 'teclado',
    titulo: 'inicio_control_teclado',
    descripcion: 'inicio_control_teclado_desc',
    icono:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h1m3 0h1m3 0h1m3 0h1M6 14h12"/></svg>',
  },
];

const IDIOMAS: { codigo: Idioma; nombre: ClaveTexto }[] = [
  { codigo: 'es', nombre: 'inicio_idioma_es' },
  { codigo: 'en', nombre: 'inicio_idioma_en' },
];

function crear<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  hijos: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...hijos);
  return el;
}

export function crearInicioUi(): InicioUi {
  const seccion = requireEl('inicio');
  const lienzo = crear('canvas', { class: 'inicio-remolino', 'aria-hidden': 'true' });
  const contenido = crear('div', { class: 'inicio-contenido' });
  seccion.replaceChildren(lienzo, crear('div', { class: 'inicio-velo', 'aria-hidden': 'true' }), contenido);
  const fondo = crearRemolinoEstelar(lienzo);

  let nombre = cargarNombre();
  let preferido: ModoControl | null = null;
  let mensajeError = '';
  /**
   * Con false (al volver por un fallo de cámara) el paso del control no tiene botón "Atrás" ni la etiqueta
   * "La última vez": la opción marcada es la que se sugiere, no la de la partida anterior.
   */
  let recorridoCompleto = true;
  let alElegirControl: (modo: ModoControl) => void = () => {};

  function mostrar(): void {
    seccion.classList.remove('inicio--saliendo');
    seccion.hidden = false;
    fondo.iniciar();
  }

  function ocultar(): Promise<void> {
    seccion.classList.add('inicio--saliendo');
    fondo.acelerar(2);
    return new Promise((resolver) => {
      window.setTimeout(() => {
        seccion.hidden = true;
        fondo.detener();
        resolver();
      }, FUNDIDO_SALIDA_MS);
    });
  }

  function cabecera(n: number, atras?: Paso): HTMLElement {
    const fila = crear('div', { class: 'inicio-cabecera' });
    if (atras) {
      const boton = crear('button', { type: 'button', class: 'inicio-atras' }, [`← ${t('inicio_atras')}`]);
      boton.addEventListener('click', () => irA(atras));
      fila.append(boton);
    } else {
      fila.append(crear('span'));
    }
    const puntos = crear('span', { class: 'inicio-puntos', 'aria-label': t('inicio_paso', { n: String(n) }) });
    for (let i = 1; i <= 3; i++) puntos.append(crear('i', { class: i <= n ? 'activo' : '' }));
    fila.append(puntos);
    return fila;
  }

  function pasoPortada(): HTMLElement {
    const boton = crear('button', { type: 'button', class: 'inicio-cta' }, [
      t('inicio_cta'),
      crear('span', { class: 'inicio-cta-flecha', 'aria-hidden': 'true' }, ['→']),
    ]);
    boton.addEventListener('click', () => irA('nombre'));
    return crear('div', { class: 'inicio-paso inicio-portada' }, [
      crear('p', { class: 'inicio-antetitulo' }, [t('inicio_antetitulo')]),
      crear('h1', { class: 'inicio-titulo' }, [t('inicio_titulo')]),
      crear('p', { class: 'inicio-lema' }, [t('inicio_lema')]),
      boton,
      crear('p', { class: 'inicio-pista' }, [t('inicio_cta_pista')]),
    ]);
  }

  function pasoNombre(): HTMLElement {
    const entrada = crear('input', {
      type: 'text',
      class: 'inicio-entrada',
      maxlength: String(LARGO_MAX_NOMBRE),
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: t('inicio_nombre_placeholder'),
      'aria-label': t('inicio_nombre_pregunta'),
    });
    entrada.value = nombre;
    const continuar = crear('button', { type: 'submit', class: 'inicio-cta' }, [
      t('inicio_continuar'),
      crear('span', { class: 'inicio-cta-flecha', 'aria-hidden': 'true' }, ['→']),
    ]);
    const actualizar = (): void => {
      continuar.disabled = limpiarNombre(entrada.value) === '';
    };
    entrada.addEventListener('input', actualizar);
    actualizar();
    const formulario = crear('form', { class: 'inicio-formulario' }, [entrada, continuar]);
    formulario.addEventListener('submit', (e) => {
      e.preventDefault();
      const limpio = limpiarNombre(entrada.value);
      if (!limpio) return;
      nombre = limpio;
      guardarNombre(nombre);
      irA('idioma');
    });
    return crear('div', { class: 'inicio-paso' }, [
      cabecera(1, 'portada'),
      crear('h2', { class: 'inicio-pregunta' }, [t('inicio_nombre_pregunta')]),
      formulario,
    ]);
  }

  function pasoIdioma(): HTMLElement {
    const botones = IDIOMAS.map(({ codigo, nombre: clave }) => {
      const boton = crear('button', { type: 'button', class: 'inicio-opcion inicio-opcion--idioma', lang: codigo }, [
        crear('strong', {}, [t(clave)]),
      ]);
      if (codigo === idioma()) boton.classList.add('marcada');
      boton.addEventListener('click', () => {
        fijarIdioma(codigo);
        irA('control');
      });
      return boton;
    });
    return crear('div', { class: 'inicio-paso' }, [
      cabecera(2, 'nombre'),
      crear('h2', { class: 'inicio-pregunta' }, [t('inicio_idioma_pregunta', { nombre })]),
      crear('div', { class: 'inicio-opciones inicio-opciones--dos' }, botones),
    ]);
  }

  function pasoControl(): HTMLElement {
    const botones = CONTROLES.map(({ modo, titulo, descripcion, icono }) => {
      const icon = crear('span', { class: 'inicio-icono' });
      icon.innerHTML = icono;
      const texto = crear('span', { class: 'inicio-opcion-texto' }, [
        crear('strong', {}, [t(titulo)]),
        crear('small', {}, [t(descripcion)]),
      ]);
      if (modo === preferido && recorridoCompleto) texto.prepend(crear('em', { class: 'inicio-etiqueta' }, [t('inicio_control_ultimo')]));
      const boton = crear('button', { type: 'button', class: 'inicio-opcion' }, [icon, texto]);
      if (modo === preferido) boton.classList.add('marcada');
      boton.addEventListener('click', () => alElegirControl(modo));
      return boton;
    });
    const hijos: HTMLElement[] = [
      cabecera(3, recorridoCompleto ? 'idioma' : undefined),
      crear('h2', { class: 'inicio-pregunta' }, [t('inicio_elige')]),
    ];
    if (mensajeError) hijos.push(crear('p', { class: 'inicio-error', role: 'alert' }, [mensajeError]));
    hijos.push(crear('div', { class: 'inicio-opciones' }, botones));
    return crear('div', { class: 'inicio-paso' }, hijos);
  }

  const PASOS: Record<Paso, () => HTMLElement> = {
    portada: pasoPortada,
    nombre: pasoNombre,
    idioma: pasoIdioma,
    control: pasoControl,
  };
  let pasoActual: Paso | null = null;

  /** Pinta el paso con los textos del idioma activo y lleva el foco a su primer control. */
  function irA(paso: Paso): void {
    if (pasoActual !== null && paso !== pasoActual) fondo.acelerar();
    pasoActual = paso;
    seccion.classList.toggle('inicio--pasos', paso !== 'portada');
    const el = PASOS[paso]();
    contenido.replaceChildren(el);
    const foco =
      el.querySelector<HTMLElement>('input') ??
      el.querySelector<HTMLElement>('.inicio-opcion.marcada') ??
      el.querySelector<HTMLElement>('.inicio-cta, .inicio-opcion');
    foco?.focus({ preventScroll: true });
  }

  return {
    bienvenida(control) {
      preferido = control;
      mensajeError = '';
      recorridoCompleto = true;
      mostrar();
      pasoActual = null;
      irA('portada');
      return new Promise((resolver) => {
        alElegirControl = (modo) => {
          alElegirControl = () => {};
          void ocultar().then(() => resolver({ nombre, modo }));
        };
      });
    },
    elegir(control, error) {
      preferido = control;
      mensajeError = error ?? '';
      recorridoCompleto = false;
      mostrar();
      pasoActual = null;
      irA('control');
      return new Promise((resolver) => {
        alElegirControl = (modo) => {
          alElegirControl = () => {};
          void ocultar().then(() => resolver(modo));
        };
      });
    },
  };
}
