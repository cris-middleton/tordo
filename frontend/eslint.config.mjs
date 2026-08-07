// Configuración plana de ESLint 9.
//
// Dos cosas cambiaron a la vez al subir a Next 16:
//
// - **`next lint` desapareció.** El script `lint` pasa a invocar `eslint`
//   directamente; si no, Next interpreta "lint" como un directorio y falla con
//   "Invalid project directory provided".
// - **ESLint 9 abandonó `.eslintrc`.** `eslint-config-next@16` ya exporta
//   configuración plana como array, así que no hace falta el puente
//   `FlatCompat` que sí necesitan otros paquetes.
//
// `core-web-vitals` es exactamente lo que había en el `.eslintrc.json` anterior:
// las reglas de Next más las de rendimiento que Google mide.
import coreWebVitals from 'eslint-config-next/core-web-vitals';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'out/**', 'coverage/**'] },
  ...coreWebVitals,
  {
    // Estas dos reglas las trae el compilador de React con Next 16. Al subir
    // desde Next 14 dispararon 49 veces, todas sobre el mismo patrón: `useEffect`
    // que hace fetch y llama a `setState`.
    //
    // Estuvieron en `warn` mientras duró la migración a TanStack Query, para no
    // bloquear con 49 errores lo que era deuda conocida. **Ya está migrado, así
    // que vuelven a `error`**: a partir de aquí, cualquiera nuevo es deuda nueva
    // y para el PR.
    //
    // Si necesitas una excepción, ponla en la LÍNEA con su motivo — hay tres en
    // todo el frontend y cada una explica por qué es un efecto legítimo:
    // inicializar desde la URL, sincronizar un formulario con datos que llegan
    // después, y arrancar la sesión.
    rules: {
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/immutability': 'error',
    },
  },
];
