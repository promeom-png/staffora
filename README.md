# 👨‍🍳 Staffore

**Staffore** es una herramienta inteligente de gestión de cuadrantes y optimización de personal diseñada específicamente para el sector de la restauración. Permite generar horarios eficientes, controlar costes de personal y asegurar el cumplimiento de normativas de descanso mediante Inteligencia Artificial.

## 🚀 Características Principales

- **Asistente de Configuración Inteligente:** Define turnos (Mañana, Tarde, Partidos), días de cierre, objetivos de ventas y reglas de descanso en pocos pasos.
- **Generación Automática de Cuadrantes:** Algoritmo optimizado que distribuye descansos (regla 70/30) y turnos de forma equitativa.
- **Restricción de Descanso Mínimo:** Implementación estricta de la regla "No M tras T" (un turno de Mañana no puede seguir a uno de Tarde) para garantizar el bienestar del equipo.
- **Análisis con IA (Gemini):** Evaluación en tiempo real de la eficiencia de costes, detección de sobrecargas y sugerencias de mejora personalizadas.
- **Control de Costes de Personal:** Cálculo automático del porcentaje de coste sobre ventas para mantener la rentabilidad del negocio.
- **Importación de Datos:** Carga masiva de empleados mediante archivos Excel (.xlsx, .csv).
- **Interfaz Moderna y Responsiva:** Diseñada con Tailwind CSS y animaciones fluidas para una experiencia de usuario premium.

## 🛠️ Tecnologías Utilizadas

- **Frontend:** React 19 + TypeScript
- **Estilos:** Tailwind CSS 4
- **Animaciones:** Motion (Framer Motion)
- **Iconos:** Lucide React
- **Gráficos:** Recharts
- **IA:** Google Gemini API (@google/genai)
- **Utilidades:** date-fns, xlsx, clsx, tailwind-merge

## 📦 Instalación y Configuración

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/tu-usuario/staffora.git
   cd staffora
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno:**
   Crea un archivo `.env` en la raíz del proyecto y añade tu clave de API de Gemini:
   ```env
   VITE_GEMINI_API_KEY=tu_clave_aqui
   ```

4. **Iniciar el servidor de desarrollo:**
   ```bash
   npm run dev
   ```

## 📖 Cómo Funciona

1. **Setup:** Al iniciar, completa los 3 pasos del asistente para definir las reglas de tu restaurante y añadir a tu equipo.
2. **Generar:** Haz clic en "Generar Cuadrante" para obtener una propuesta automática basada en tus reglas.
3. **Editar:** Puedes cambiar cualquier turno haciendo clic sobre él. El sistema te avisará visualmente si rompes alguna regla de descanso.
4. **Analizar:** Usa el botón "Analizar con IA" para recibir un informe detallado sobre la eficiencia de tu planificación.

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.

---
Desarrollado con ❤️ para el sector de la hostelería.
