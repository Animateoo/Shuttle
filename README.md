# Shuttle

ExtensiÃ³n CEP para **Adobe Illustrator** y **Adobe Photoshop** que permite enviar y recibir contenido entre ambas aplicaciones con un solo clic, manteniendo posiciÃ³n, tamaÃ±o y â€” cuando es posible â€” texto editable.

---

## Â¿Para quÃ© sirve?

Shuttle acelera el flujo de trabajo entre vector (Illustrator) y composiciÃ³n (Photoshop):

- **Push** â€” EnvÃ­a la selecciÃ³n actual a la otra aplicaciÃ³n.
- **Pull** â€” Trae la selecciÃ³n desde la otra aplicaciÃ³n hacia la app donde estÃ¡s.
- **Switch** â€” Cambia el foco a Illustrator o Photoshop (la otra app debe estar instalada).

### Comportamiento principal

| DirecciÃ³n | QuÃ© hace |
|-----------|----------|
| **Illustrator â†’ Photoshop** | Exporta la selecciÃ³n a un archivo `.ai` temporal y lo coloca en Photoshop como **Smart Object vinculado**, respetando tamaÃ±o y posiciÃ³n respecto al artboard. |
| **Photoshop â†’ Illustrator** | EnvÃ­a capas/selecciÃ³n como vectores, imÃ¡genes o formas segÃºn el tipo de contenido. |

### Opciones incluidas (siempre activas)

- **Keep Position** â€” Conserva la posiciÃ³n relativa al artboard/canvas.
- **Editable Text** â€” Cuando el contenido lo permite, el texto llega editable en Illustrator.

---

## Requisitos

- **Adobe Illustrator** CC 2014 o posterior
- **Adobe Photoshop** CC 2014 o posterior
- Ambas aplicaciones deben tener Shuttle instalado
- Para transferencias en tiempo real, conviene tener **Illustrator y Photoshop abiertos** a la vez

---

## InstalaciÃ³n

### OpciÃ³n 1 â€” Instalador ZXP (recomendado)

1. Descarga `Shuttle.zxp` desde [Releases](https://github.com/Animateoo/Shuttle/releases) o compÃ­lalo desde este repositorio.
2. Instálalo con un **instalador ZXP** compatible (por ejemplo ExManCmd).
3. Reinicia Illustrator y Photoshop.
4. Abre el panel **Shuttle** en cada aplicaciÃ³n (ver abajo).

### OpciÃ³n 2 â€” InstalaciÃ³n manual (desarrollo)

1. Copia la carpeta `Shuttle` en:

   **Windows**
   ```
   C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\Shuttle
   ```

   **macOS**
   ```
   /Library/Application Support/Adobe/CEP/extensions/Shuttle
   ```

2. Si la extensiÃ³n no aparece, activa el modo debug de CEP en el registro (Windows) o en `defaults` (macOS):  
   `PlayerDebugMode = 1` para la versiÃ³n de CSXS que use tu Creative Cloud.

3. Reinicia las aplicaciones de Adobe.

---

## CÃ³mo abrir el panel

**Illustrator**  
`Ventana â†’ Extensiones â†’ Shuttle`

**Photoshop**  
`Plugins â†’ Shuttle`  
o  
`Ventana â†’ Extensiones (Legacy) â†’ Shuttle`

---

## CÃ³mo se usa

1. Abre **Illustrator** y **Photoshop** con Shuttle cargado en ambos.
2. Selecciona el contenido que quieres transferir (capa, grupo, forma, etc.).
3. Usa los botones del panel:

| BotÃ³n | AcciÃ³n |
|-------|--------|
| â†‘ **Push** | EnvÃ­a la selecciÃ³n a la otra app y cambia el foco automÃ¡ticamente. |
| â†“ **Pull** | Pide a la otra app que envÃ­e su selecciÃ³n hacia donde estÃ¡s ahora. |
| **Ai / Ps** | Solo cambia a la otra aplicaciÃ³n sin transferir. |
| **Debug** | Abre la consola de diagnÃ³stico (logs, Deep Scan, copiar errores). |

### Ejemplo tÃ­pico (AI â†’ PS)

1. En Illustrator, selecciona un logo o ilustraciÃ³n sobre tu artboard.
2. Clic en **Push**.
3. Photoshop recibe un **Smart Object vinculado** en la posiciÃ³n y escala correctas.
4. Los archivos de enlace se guardan en:  
   `Documentos\ShuttleLinks\` (Windows) / `Documents/ShuttleLinks/` (macOS).

### Ejemplo tÃ­pico (PS â†’ AI)

1. En Photoshop, selecciona la capa o capas que quieres enviar.
2. Clic en **Push**.
3. En Illustrator aparece el contenido importado, con posiciÃ³n alineada cuando aplica.

> **Nota:** Si no hay nada seleccionado, el panel mostrarÃ¡ *"Nothing selected"*.

---

## SoluciÃ³n de problemas

- **No aparece el panel** â€” Revisa la instalaciÃ³n, reinicia la app y confirma `PlayerDebugMode` si usas una build sin firmar.
- **Push no hace nada** â€” AsegÃºrate de tener selecciÃ³n activa y que la otra aplicaciÃ³n estÃ© abierta.
- **Errores de importaciÃ³n** â€” Abre **Debug** â†’ **Deep Scan** y copia el log con el botÃ³n ðŸ“‹.

---

## Estructura del proyecto

```
Shuttle/
â”œâ”€â”€ CSXS/manifest.xml   # Manifest CEP 12
â”œâ”€â”€ html/index.html     # Panel UI
â”œâ”€â”€ js/shuttle.js       # LÃ³gica del panel y Vulcan
â”œâ”€â”€ jsx/shuttle.jsx     # Scripts ExtendScript (AI + PS)
â”œâ”€â”€ css/shuttle.css
â””â”€â”€ img/                # Iconos del panel
```

---

## Licencia

Consulta los archivos `LICENSE` (MIT) y `CUSTOM_LICENSE` incluidos en esta carpeta.

---

## CrÃ©ditos

Desarrollado por **Animateoo** Â· [github.com/Animateoo/Shuttle](https://github.com/Animateoo/Shuttle)

---


## Uso y Contribuciones

Este plugin es gratuito y ha sido desarrollado por Mateo Crespo (Animateo).

Puedes:

* Utilizar el plugin en proyectos personales y comerciales.
* Revisar y aprender del código fuente.
* Reportar errores y sugerir mejoras.
* Compartir optimizaciones, correcciones o nuevas funciones con el autor.

No está permitido:

* Vender este plugin o versiones derivadas del mismo.
* Redistribuir versiones modificadas como un producto independiente.
* Eliminar los créditos del autor original.
* Publicar versiones modificadas sin autorización previa.

Si realizas mejoras o correcciones, te agradecería que las compartieras para evaluarlas e incorporarlas a la versión oficial, beneficiando a toda la comunidad.

Autor: Mateo Crespo (Animateo)
