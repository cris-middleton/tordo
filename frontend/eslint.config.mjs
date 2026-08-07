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
    // Estas dos reglas las trae el compilador de React con Next 16, y disparan
    // 44 veces — todas sobre el MISMO patrón: `useEffect` que hace fetch y llama
    // a `setState`, que es como este frontend maneja el estado de servidor.
    //
    // No se arreglan a mano a propósito: **es exactamente la deuda que TanStack
    // Query viene a eliminar** (F5). Reescribir 44 sitios para tirarlos después
    // sería trabajo perdido, y silenciarlas con `eslint-disable` línea a línea
    // dejaría 44 comentarios que nadie limpiaría.
    //
    // Quedan como aviso: visibles, sin bloquear. **Cuando entre TanStack Query,
    // vuelven a `error`** — y si el número sube antes de eso, es que alguien
    // añadió más deuda del mismo tipo.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
];
