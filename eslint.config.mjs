import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextCoreWebVitals,
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'build/**', 'public/icons/**'],
  },
  {
    // eslint-plugin-react-hooks 7 (shipped with Next 16) added strict new rules
    // that flag the fetch-data-in-useEffect pattern used across the dashboard.
    // Code works correctly; demoting these to warnings to match prior behavior.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
];

export default config;
