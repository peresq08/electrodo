# Electrodo · laboratorio de fusing

Guía técnica e interactiva del proceso de **fusing (hot staking)** de terminales de cobre con alambre magneto esmaltado.

**Qué incluye**

- **Simulador electro-térmico 2D** del corte del gancho: potencial eléctrico y conducción de calor por diferencias finitas, resistividad que cambia con la temperatura, retiro del esmalte, unión de interfaces y fusión del cobre. Corre en el navegador (Web Worker).
- **Mapa de ventana de proceso** HEAT × WELD para 2 y 3 alambres y con electrodo gastado. Son 270 corridas precalculadas con el mismo simulador (`data/ventana.json`).
- **Editor de pulso** con energía I²t y la regla E-10.
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
js/modules.js        resto de módulos interactivos
data/ventana.json    mapas de ventana precalculados
```

Para regenerar los mapas de ventana, carga `js/sim-core.js` en Node con `require` y corre `run()` sobre la rejilla de HEAT × WELD. La función `verdict()` clasifica cada resultado.

## Importante

- **Modelo educativo.** La física es real, pero los factores de contacto y de pérdida 3D están ajustados para reproducir tendencias observadas; no están medidos. Úsalo para entender y comparar escenarios, no para fijar parámetros de producción sin validar en la máquina.
- El repositorio es **público**. No agregues dibujos, números de parte, datos de producción ni información interna de ninguna empresa.
