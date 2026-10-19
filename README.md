# Electrodo · laboratorio de fusing

Guía técnica e interactiva del proceso de **fusing (hot staking)** de terminales de cobre con alambre magneto esmaltado.

**Qué incluye**

- **Simulador electro-térmico 2D** del corte del gancho: potencial eléctrico y conducción de calor por diferencias finitas, resistividad que cambia con la temperatura, retiro del esmalte, unión de interfaces y fusión del cobre. Corre en el navegador (Web Worker).
  - Programa de pulsos capturado en una réplica editable de las pantallas SCHEDULE (1) y (2): WE1/WE2/WE3, COOL1/COOL2, PULSATION/INTERVAL y CTRL (SCD/PWR/VLT) en cada pulso.
  - Menús colapsables de terminal y electrodo, con vista 3D rotable de la geometría. Geometría ajustable: posición del electrodo a lo largo del gancho, largo y ancho de cara, cavidad, espesor de la terminal, largo del gancho, calibre AWG y de 1 a 4 alambres.
- **Mapa de ventana de proceso** HEAT × WELD (3.0–5.6 kA × 200–600 ms) para 2 alambres, 3 alambres y 3 alambres con electrodo gastado. Son 729 corridas precalculadas (`data/ventana.json`). El mapa se calibra con tus datos y muestra tus corridas encima.
- **Editor del programa de pulsos** con I²t por pulso y las reglas E-10.
- **Varios pulsos:** estrategias (precalentamiento, post-calentamiento, pulsación, VLT + SCD, pulsos de 0.5 kA) comparadas a igual energía y a igual resultado (`data/pulsos.json`).
- **Asistente de DOE:**
  1. terminal;
  2. punto de partida;
  3. plan aleatorizado;
  4. captura de resultados (en el navegador, con importación y exportación CSV);
  5. calibración del modelo, regresión cuadrática con p-valores y recomendación.
- **Presupuesto térmico** (Q = m·c·ΔT, eficiencia, longitud de difusión).
- **Modos de control** (SCD, PWR, VLT y los seis modos del CTRL) frente a cambios de resistencia.
- **Electrodo:** mecánica de la huella o cavidad, control por posición contra fuerza, simulador de vida con cuatro estrategias y electrodo de cara angosta.
- **Barra de tierra:** calentamiento del cuello por material y sección.
- **Controlador:** pantallas SCHEDULE (1), SCHEDULE (2) y MONITOR en las que puedes hacer clic, funciones de calidad y códigos de error.
- **Método:** cómo escoger parámetros, experimentos y plan de reacción.

## Publicar con GitHub Pages

1. En el repositorio entra a **Settings → Pages**.
2. En *Build and deployment* elige **Source: Deploy from a branch**.
3. Escoge la rama **main** y la carpeta **/ (root)**, y guarda.
4. En uno o dos minutos la página queda publicada en `https://<usuario>.github.io/electrodo/`.

Para verla en tu equipo, sirve la carpeta con un servidor local, porque el Worker y el JSON no cargan si abres el archivo directamente:

```bash
python -m http.server 8000
# abrir http://localhost:8000
```

## Estructura

```
index.html           página
css/style.css        estilos (tema claro/oscuro)
js/sim-core.js       modelo físico (también corre en Node)
js/sim-worker.js     ejecuta el modelo fuera del hilo principal
js/app.js            interfaz del simulador
js/charts.js         gráficas SVG sin dependencias
js/pulse-ui.js       editor del programa de pulsos
js/strategies.js     estrategias de varios pulsos (navegador y Node)
js/calib.js          calibración guardada en el navegador
js/wizard.js         asistente de DOE
js/geo3d.js          vista 3D de la geometría (three.js)
vendor/three/        three.js 0.160 (licencia MIT), incluido para no depender de un CDN
js/modules.js        resto de módulos interactivos
data/ventana.json    mapas de ventana precalculados
data/pulsos.json     comparación de estrategias precalculada
```

Para regenerar los mapas de ventana, carga `js/sim-core.js` en Node con `require` y corre `run()` sobre la rejilla de HEAT × WELD. La función `verdict()` clasifica cada resultado.

## Importante

- **Modelo educativo.** La física es real, pero los factores de contacto y de pérdida 3D están ajustados para reproducir tendencias observadas; no están medidos. Úsalo para entender y comparar escenarios, no para fijar parámetros de producción sin validar en la máquina.
- Los resultados que captures en el asistente se guardan **solo en tu navegador** (localStorage); no se suben a ningún servidor. Exporta el CSV para respaldarlos.
- El repositorio es **público**. No agregues dibujos, números de parte, datos de producción ni información interna de ninguna empresa.
