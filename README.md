# Shuttle
<img width="292" height="86" alt="Captura de pantalla 2026-07-04 014930" src="https://github.com/user-attachments/assets/87521adc-21ac-4d42-9eeb-ce48be2b04c3" />

Extensión CEP para **Adobe Illustrator** y **Adobe Photoshop** que permite enviar y recibir contenido entre ambas aplicaciones con un solo clic, manteniendo posición, tamaño y — cuando es posible — texto editable.

---

## ¿Para qué sirve?

Shuttle acelera el flujo de trabajo entre vector (Illustrator) y composición (Photoshop):

- **Push** — Envía la selección actual a la otra aplicación.
- **Pull** — Trae la selección desde la otra aplicación hacia la app donde estás.
- **Switch** — Cambia el foco a Illustrator o Photoshop (la otra app debe estar instalada).

### Comportamiento principal

| Dirección | Qué hace |
|-----------|----------|
| **Illustrator → Photoshop** | Exporta la selección a un archivo `.ai` temporal y lo coloca en Photoshop como **Smart Object vinculado**, respetando tamaño y posición respecto al artboard. |
| **Photoshop → Illustrator** | Envía capas/selección como vectores, imágenes o formas según el tipo de contenido. |

### Opciones incluidas (siempre activas)

- **Keep Position** — Conserva la posición relativa al artboard/canvas.
- **Editable Text** — Cuando el contenido lo permite, el texto llega editable en Illustrator.

---

## Requisitos

- **Adobe Illustrator** CC 2014 o posterior
- **Adobe Photoshop** CC 2014 o posterior
- Ambas aplicaciones deben tener Shuttle instalado
- Para transferencias en tiempo real, conviene tener **Illustrator y Photoshop abiertos** a la vez

---

## Instalación

### Opción 1 — Instalador ZXP (recomendado)

1. Descarga `Shuttle.zxp` desde [Releases](https://github.com/Animateoo/Shuttle/releases) o compílalo desde este repositorio.
2. Instálalo con **[ZXP Installer](https://aescripts.com/learn/zxp-installer/)** o **ExManCmd**.
3. Reinicia Illustrator y Photoshop.
4. Abre el panel **Shuttle** en cada aplicación (ver abajo).

### Opción 2 — Instalación manual (desarrollo)

1. Copia la carpeta `Shuttle` en:

   **Windows**
   ```
   C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\Shuttle
   ```

   **macOS**
   ```
   /Library/Application Support/Adobe/CEP/extensions/Shuttle
   ```

2. Si la extensión no aparece, activa el modo debug de CEP en el registro (Windows) o en `defaults` (macOS):  
   `PlayerDebugMode = 1` para la versión de CSXS que use tu Creative Cloud.

3. Reinicia las aplicaciones de Adobe.

---

## Cómo abrir el panel

**Illustrator**  
`Ventana → Extensiones → Shuttle`

**Photoshop**  
`Plugins → Shuttle`  
o  
`Ventana → Extensiones (Legacy) → Shuttle`

---

## Cómo se usa

1. Abre **Illustrator** y **Photoshop** con Shuttle cargado en ambos.
2. Selecciona el contenido que quieres transferir (capa, grupo, forma, etc.).
3. Usa los botones del panel:

| Botón | Acción |
|-------|--------|
| ↑ **Push** | Envía la selección a la otra app y cambia el foco automáticamente. |
| ↓ **Pull** | Pide a la otra app que envíe su selección hacia donde estás ahora. |
| **Ai / Ps** | Solo cambia a la otra aplicación sin transferir. |
| **Debug** | Abre la consola de diagnóstico (logs, Deep Scan, copiar errores). |

### Ejemplo típico (AI → PS)

1. En Illustrator, selecciona un logo o ilustración sobre tu artboard.
2. Clic en **Push**.
3. Photoshop recibe un **Smart Object vinculado** en la posición y escala correctas.
4. Los archivos de enlace se guardan en:  
   `Documentos\ShuttleLinks\` (Windows) / `Documents/ShuttleLinks/` (macOS).

### Ejemplo típico (PS → AI)

1. En Photoshop, selecciona la capa o capas que quieres enviar.
2. Clic en **Push**.
3. En Illustrator aparece el contenido importado, con posición alineada cuando aplica.

> **Nota:** Si no hay nada seleccionado, el panel mostrará *"Nothing selected"*.

---

## Solución de problemas

- **No aparece el panel** — Revisa la instalación, reinicia la app y confirma `PlayerDebugMode` si usas una build sin firmar.
- **Push no hace nada** — Asegúrate de tener selección activa y que la otra aplicación esté abierta.
- **Errores de importación** — Abre **Debug** → **Deep Scan** y copia el log con el botón 📋.

---

## Estructura del proyecto

```
Shuttle/
├── CSXS/manifest.xml   # Manifest CEP 12
├── html/index.html     # Panel UI
├── js/shuttle.js       # Lógica del panel y Vulcan
├── jsx/shuttle.jsx     # Scripts ExtendScript (AI + PS)
├── css/shuttle.css
└── img/                # Iconos del panel
```

---

## Licencia

Este proyecto incluye dos documentos de licencia:

* **`LICENSE`** — Licencia MIT estándar.
* **`CUSTOM_LICENSE`** — Términos adicionales de uso y redistribución del autor.

---

## Uso y Contribuciones

Este plugin es gratuito y ha sido desarrollado por Mateo Crespo (Animateo).

Puedes:

* Utilizar el plugin en proyectos personales y comerciales.
* Proponer optimizaciones o nuevas funciones.
* Reportar errores y sugerir mejoras.
* Compartir optimizaciones, correcciones o nuevas funciones con el autor.

No está permitido:

* Vender este plugin o versiones derivadas del mismo.
* Redistribuir versiones modificadas como un producto independiente.
* Eliminar los créditos del autor original.
* Publicar versiones modificadas sin autorización previa.

Si identificas una mejora, corrección o optimización, por favor comunícate con el autor para revisarla e incorporarla a la versión oficial.

Autor: Mateo Crespo (Animateo)
